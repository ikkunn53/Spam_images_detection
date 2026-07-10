import { ApplicationCommandType, ContextMenuCommandBuilder, MessageContextMenuCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { isProcessableImageAttachment } from '../services/imageDownloader.js';
import { registerSpamImageAttachment } from '../services/spamImageRegistrationService.js';
import { logger } from '../utils/logger.js';

export const registerSpamMessageCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('このメッセージの画像をスパム登録')
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction: MessageContextMenuCommandInteraction) {
    const images = [...interaction.targetMessage.attachments.values()].filter(isProcessableImageAttachment);
    if (images.length === 0) {
      await interaction.reply({ content: 'このメッセージに登録可能な画像添付がありません。', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const successes: string[] = [];
    const failures: string[] = [];
    for (const attachment of images) {
      try {
        const registered = await registerSpamImageAttachment(attachment, {
          guild_id: interaction.guildId ?? '',
          registered_by_user_id: interaction.user.id,
          category: 'message_context_menu',
          notes: `registered from message_id=${interaction.targetMessage.id} attachment_id=${attachment.id}`
        });
        successes.push(`${attachment.name ?? attachment.id}: sha256=${registered.digest}`);
      } catch (error) {
        logger.warn({ error, guildId: interaction.guildId, messageId: interaction.targetMessage.id, attachmentId: attachment.id }, 'failed to register message attachment as spam image');
        failures.push(`${attachment.name ?? attachment.id}`);
      }
    }

    const lines = [`登録対象: ${images.length}枚`, `成功: ${successes.length}枚`, ...successes.map((item) => `- ${item}`)];
    if (failures.length > 0) lines.push(`失敗: ${failures.length}枚`, ...failures.map((item) => `- ${item}`));
    await interaction.editReply(lines.join('\n').slice(0, 1900));
  }
};
