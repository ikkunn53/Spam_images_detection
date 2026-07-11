import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, Message } from 'discord.js';
import { AnalysisResult } from './aiClient.js';
import path from 'node:path';
import { logger } from '../utils/logger.js';

const imagePreviewFilename = (filename?: string | null): string => {
  const base = filename ? path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_') : '';
  if (/\.(png|jpe?g|webp|gif)$/i.test(base)) return `evidence-${base}`;
  return 'evidence-image.png';
};

export const sendDetectionLog = async (message: Message, result: AnalysisResult, image: Buffer, detectionEventId: number, logChannelId?: string | null, handling?: string, evidenceFilename?: string | null): Promise<void> => {
  if (!logChannelId) {
    logger.info({ guildId: message.guildId, messageId: message.id, detectionEventId }, 'detection log channel is not configured; skipping Discord log');
    return;
  }
  const channel = await message.client.channels.fetch(logChannelId).catch((error) => {
    logger.warn({ error, guildId: message.guildId, messageId: message.id, detectionEventId, logChannelId }, 'failed to fetch detection log channel');
    return null;
  });
  if (!channel || channel.type !== ChannelType.GuildText) {
    logger.warn({ guildId: message.guildId, messageId: message.id, detectionEventId, logChannelId, channelType: channel?.type }, 'detection log channel is unavailable or not a text channel');
    return;
  }
  const attachmentName = imagePreviewFilename(evidenceFilename);
  const embedTitle = result.action === 'delete' ? 'スパムを削除しました' : 'スパムの疑いあり';
  const embed = new EmbedBuilder()
    .setTitle(embedTitle)
    .setColor(result.action === 'delete' ? 0xff3333 : 0xffcc00)
    .addFields(
      { name: 'サーバー名', value: message.guild?.name ?? 'unknown' },
      { name: 'チャンネル名', value: ('name' in message.channel ? message.channel.name : null) ?? 'unknown' },
      { name: 'チャンネルID', value: message.channelId },
      { name: 'スパムを投稿したユーザー', value: `${message.author.tag} (${message.author.id})` },
      { name: '対応', value: handling ?? (result.action === 'delete' ? '削除判定です' : '管理者レビュー待ちです') },
      { name: '本文', value: message.content?.slice(0, 1000) || '(なし)' }
    )
    .setImage(`attachment://${attachmentName}`)
    .setTimestamp(message.createdAt);
  const buttons = result.action === 'delete'
    ? [
      new ButtonBuilder().setCustomId(`review:confirm:${detectionEventId}`).setLabel('スパム確定').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`review:false_positive:${detectionEventId}`).setLabel('誤検知').setStyle(ButtonStyle.Secondary)
    ]
    : [
      new ButtonBuilder().setCustomId(`review:register:${detectionEventId}`).setLabel('スパムとして登録').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`review:false_positive:${detectionEventId}`).setLabel('誤検知').setStyle(ButtonStyle.Secondary)
    ];
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
  await channel.send({ embeds: [embed], files: [new AttachmentBuilder(image, { name: attachmentName })], components: [row] });
  logger.info({ guildId: message.guildId, messageId: message.id, detectionEventId, logChannelId, action: result.action, handling }, 'detection log sent');
};
