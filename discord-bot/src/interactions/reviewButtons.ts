import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { config } from '../config/env.js';
import { DetectionRepository, DetectionEvent } from '../repositories/detectionRepository.js';
import { isProcessableImageAttachment } from '../services/imageDownloader.js';
import { registerSpamImageAttachment, registerSpamImageUrl } from '../services/spamImageRegistrationService.js';
import { logger } from '../utils/logger.js';

const detections = new DetectionRepository();
const actionMap: Record<string, string> = { confirm: 'spam_confirmed', false_positive: 'false_positive', register: 'register_spam_image' };
const actionLabels: Record<string, string> = { spam_confirmed: 'スパム確定', false_positive: '誤検知', register_spam_image: 'スパムとして登録' };

const falsePositiveReportButtons = (detectionEventId: number) => new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder().setCustomId(`fp_report:yes:${detectionEventId}`).setLabel('報告する').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId(`fp_report:no:${detectionEventId}`).setLabel('報告しない').setStyle(ButtonStyle.Secondary)
);

const deleteDetectedMessage = async (interaction: ButtonInteraction, event: DetectionEvent): Promise<string> => {
  if (event.auto_deleted === 1) return '元メッセージは既に自動削除済みです。';
  try {
    const channel = await interaction.client.channels.fetch(event.channel_id);
    if (!channel?.isTextBased() || !('messages' in channel)) return '元チャンネルを取得できないため、元メッセージは削除できませんでした。';
    const message = await channel.messages.fetch(event.message_id);
    await message.delete();
    return '元メッセージを削除しました。';
  } catch (error) {
    logger.warn({ error, detectionEventId: event.id, actorUserId: interaction.user.id }, 'failed to delete reviewed spam message');
    return '元メッセージの削除に失敗しました。Bot の権限またはメッセージの存在を確認してください。';
  }
};

const registerEvidenceImage = async (interaction: ButtonInteraction, event: DetectionEvent): Promise<{ registered: boolean; message: string }> => {
  const message = await interaction.message.fetch().catch(() => interaction.message);
  const attachment = [...message.attachments.values()].find(isProcessableImageAttachment);
  const fields = {
    guild_id: event.guild_id,
    registered_by_user_id: interaction.user.id,
    category: 'review_button',
    notes: `registered from detection_event_id=${event.id}`
  };
  try {
    if (attachment) {
      const result = await registerSpamImageAttachment(attachment, fields);
      logger.info({ detectionEventId: event.id, actorUserId: interaction.user.id, attachmentId: attachment.id, filename: attachment.name, contentType: attachment.contentType, result: result.aiResult, localPath: result.localPath }, 'review evidence attachment registered as spam');
      return { registered: true, message: `スパム画像として登録しました: ${JSON.stringify(result.aiResult)}\nBot保存先: ${result.localPath}` };
    }

    for (const [index, embed] of message.embeds.entries()) {
      const imageUrl = embed.image?.url ?? embed.thumbnail?.url;
      if (!imageUrl) continue;
      const result = await registerSpamImageUrl(imageUrl, `review-evidence-${event.id}-${index + 1}.png`, fields);
      logger.info({ detectionEventId: event.id, actorUserId: interaction.user.id, embedIndex: index, imageUrl, result: result.aiResult, localPath: result.localPath }, 'review evidence embed image registered as spam');
      return { registered: true, message: `スパム画像として登録しました: ${JSON.stringify(result.aiResult)}\nBot保存先: ${result.localPath}` };
    }

    return { registered: false, message: `ログ添付画像を登録用画像として取得できませんでした。attachments=${message.attachments.size}, embeds=${message.embeds.length}` };
  } catch (error) {
    logger.warn({ error, detectionEventId: event.id, actorUserId: interaction.user.id }, 'failed to register review evidence image');
    return { registered: false, message: 'スパム画像登録に失敗しました。画像の取得または AI Service の状態を確認してください。' };
  }
};

const reviewedEmbeds = (interaction: ButtonInteraction, action: string, resultText: string) => {
  const reviewedBy = `${interaction.user.tag} (${interaction.user.id})`;
  const reviewValue = `${actionLabels[action] ?? action}\n${resultText}\nby ${reviewedBy}`;
  if (interaction.message.embeds.length === 0) return [];
  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .addFields({ name: 'レビュー結果', value: reviewValue.slice(0, 1024) })
    .setFooter({ text: '処理済み' });
  return [embed];
};

const sendFalsePositiveReport = async (interaction: ButtonInteraction, event: DetectionEvent): Promise<string> => {
  if (!config.falsePositiveReportChannelId) return '誤検知報告チャンネルが未設定です。';
  try {
    const channel = await interaction.client.channels.fetch(config.falsePositiveReportChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) return '誤検知報告チャンネルが見つからないか、テキストチャンネルではありません。';
    const embed = new EmbedBuilder()
      .setTitle('画像スパム誤検知報告')
      .addFields(
        { name: 'Detection Event', value: String(event.id), inline: true },
        { name: 'Guild', value: event.guild_id, inline: true },
        { name: 'Channel', value: event.channel_id, inline: true },
        { name: 'Message', value: event.message_id, inline: true },
        { name: 'SHA-256', value: event.sha256 ?? 'n/a' },
        { name: '報告者', value: `${interaction.user.tag} (${interaction.user.id})` }
      )
      .setTimestamp(new Date());
    await channel.send({ embeds: [embed] });
    return '誤検知報告を送信しました。';
  } catch (error) {
    logger.warn({ error, detectionEventId: event.id, reportChannelId: config.falsePositiveReportChannelId }, 'failed to send false positive report');
    return '誤検知報告の送信に失敗しました。';
  }
};

const handleFalsePositiveReportButton = async (interaction: ButtonInteraction): Promise<boolean> => {
  if (!interaction.customId.startsWith('fp_report:')) return false;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({ content: 'この操作には Manage Messages 権限が必要です。', flags: MessageFlags.Ephemeral });
    return true;
  }
  const [, rawChoice, rawId] = interaction.customId.split(':');
  const detectionEventId = Number(rawId);
  const event = detections.findById(detectionEventId);
  if (!event || !Number.isInteger(detectionEventId)) {
    await interaction.update({ content: '検知イベントが見つかりませんでした。', components: [] });
    return true;
  }
  const result = rawChoice === 'yes' ? await sendFalsePositiveReport(interaction, event) : '誤検知報告は送信しませんでした。';
  await interaction.update({ content: result, components: [] });
  logger.info({ detectionEventId, choice: rawChoice, actorUserId: interaction.user.id, result }, 'false positive report choice processed');
  return true;
};

export const handleReviewButton = async (interaction: ButtonInteraction): Promise<boolean> => {
  if (await handleFalsePositiveReportButton(interaction)) return true;
  if (!interaction.customId.startsWith('review:')) return false;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({ content: 'この操作には Manage Messages 権限が必要です。', flags: MessageFlags.Ephemeral });
    return true;
  }
  const [, rawAction, rawId] = interaction.customId.split(':');
  const action = actionMap[rawAction];
  const detectionEventId = Number(rawId);
  const event = detections.findById(detectionEventId);
  if (!action || !Number.isInteger(detectionEventId) || !event) {
    await interaction.reply({ content: '不正なレビュー操作です。', flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferUpdate();
  let resultText = '処理しました。';
  if (action === 'register_spam_image') {
    const registration = await registerEvidenceImage(interaction, event);
    resultText = registration.registered ? `${registration.message}\n${await deleteDetectedMessage(interaction, event)}` : `${registration.message}\n登録に失敗したため、元メッセージは削除していません。`;
  } else if (action === 'spam_confirmed') resultText = await deleteDetectedMessage(interaction, event);
  else if (action === 'false_positive') resultText = '誤検知として記録しました。元メッセージは削除しません。';

  detections.addModerationAction(detectionEventId, action, interaction.user.id, resultText);
  await interaction.message.edit({ embeds: reviewedEmbeds(interaction, action, resultText), components: [] });
  if (action === 'false_positive') {
    await interaction.followUp({ content: '誤検知として記録しました。追加で報告チャンネルへ報告しますか？', components: [falsePositiveReportButtons(detectionEventId)], flags: MessageFlags.Ephemeral });
  } else {
    await interaction.followUp({ content: `処理済みとして記録しました: ${actionLabels[action] ?? action}\n${resultText}`, flags: MessageFlags.Ephemeral });
  }
  logger.info({ detectionEventId, action, actorUserId: interaction.user.id, resultText }, 'review action processed');
  return true;
};
