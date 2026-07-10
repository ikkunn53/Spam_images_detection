import { ApplicationCommandType, ContextMenuCommandBuilder, Message, MessageContextMenuCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import path from 'node:path';
import { isProcessableImageAttachment } from '../services/imageDownloader.js';
import { registerSpamImageAttachment, registerSpamImageUrl, SpamImageRegistrationResult } from '../services/spamImageRegistrationService.js';
import { logger } from '../utils/logger.js';

type RegistrationTarget =
  | { kind: 'attachment'; id: string; label: string; register: () => Promise<SpamImageRegistrationResult> }
  | { kind: 'embed'; id: string; label: string; register: () => Promise<SpamImageRegistrationResult> };

const filenameFromUrl = (url: string, fallback: string): string => {
  try {
    const parsed = new URL(url);
    const base = path.basename(parsed.pathname);
    return base && base !== '/' ? base : fallback;
  } catch {
    return fallback;
  }
};

const fetchFullTargetMessage = async (interaction: MessageContextMenuCommandInteraction): Promise<Message> => {
  const channel = interaction.channel;
  if (channel?.isTextBased() && 'messages' in channel) {
    return channel.messages.fetch(interaction.targetMessage.id).catch(() => interaction.targetMessage);
  }
  return interaction.targetMessage;
};

const registrationTargets = (message: Message, interaction: MessageContextMenuCommandInteraction): RegistrationTarget[] => {
  const fields = {
    guild_id: interaction.guildId ?? '',
    registered_by_user_id: interaction.user.id,
    category: 'message_context_menu'
  };
  const targets: RegistrationTarget[] = [...message.attachments.values()].filter(isProcessableImageAttachment).map((attachment) => ({
    kind: 'attachment' as const,
    id: attachment.id,
    label: attachment.name ?? attachment.id,
    register: () => registerSpamImageAttachment(attachment, {
      ...fields,
      notes: `registered from message_id=${message.id} attachment_id=${attachment.id}`
    })
  }));

  const seenEmbedUrls = new Set<string>();
  for (const [index, embed] of message.embeds.entries()) {
    for (const [type, url] of [['image', embed.image?.url], ['thumbnail', embed.thumbnail?.url]] as const) {
      if (!url || seenEmbedUrls.has(url)) continue;
      seenEmbedUrls.add(url);
      const label = filenameFromUrl(url, `embed-${index + 1}-${type}.png`);
      targets.push({
        kind: 'embed',
        id: `${index}:${type}`,
        label,
        register: () => registerSpamImageUrl(url, label, {
          ...fields,
          notes: `registered from message_id=${message.id} embed_${type}_index=${index}`
        })
      });
    }
  }
  return targets;
};

export const registerSpamMessageCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('このメッセージの画像をスパム登録')
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction: MessageContextMenuCommandInteraction) {
    const message = await fetchFullTargetMessage(interaction);
    const targets = registrationTargets(message, interaction);
    if (targets.length === 0) {
      await interaction.reply({ content: `このメッセージに登録可能な添付画像または埋め込み画像がありません。attachments=${message.attachments.size}, embeds=${message.embeds.length}`, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const successes: string[] = [];
    const failures: string[] = [];
    for (const target of targets) {
      try {
        const registered = await target.register();
        successes.push(`${target.label}: sha256=${registered.digest}`);
      } catch (error) {
        logger.warn({ error, guildId: interaction.guildId, messageId: message.id, targetKind: target.kind, targetId: target.id }, 'failed to register message image as spam image');
        failures.push(target.label);
      }
    }

    if (failures.length === 0) {
      await interaction.editReply(targets.length === 1 ? '登録できました！' : `${successes.length}枚の画像を登録できました！`);
      return;
    }
    await interaction.editReply(`登録できました: ${successes.length}枚 / 失敗: ${failures.length}枚`);
  }
};
