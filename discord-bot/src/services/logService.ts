import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, Message, MessageCreateOptions } from 'discord.js';
import { AnalysisResult } from './aiClient.js';
import path from 'node:path';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';


const sendEmbedToTextChannel = async (client: Client, channelId: string | null | undefined, payload: MessageCreateOptions, logContext: Record<string, unknown>): Promise<void> => {
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch((error) => {
    logger.warn({ error, channelId, ...logContext }, 'failed to fetch log channel');
    return null;
  });
  if (!channel || channel.type !== ChannelType.GuildText) {
    logger.warn({ channelId, channelType: channel?.type, ...logContext }, 'log channel is unavailable or not a text channel');
    return;
  }
  await channel.send(payload);
};

const uniqueChannelIds = (...channelIds: Array<string | null | undefined>): string[] => [...new Set(channelIds.filter((id): id is string => Boolean(id)))];

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
  const attachmentName = imagePreviewFilename(evidenceFilename);
  const embedTitle = result.action === 'delete' ? 'スパムを削除しました' : 'スパムの疑いあり';
  const matchedImageFields = result.matched_spam_image_id === null ? [] : [
    { name: '検知元スパム画像ID', value: String(result.matched_spam_image_id), inline: true },
    { name: '検知元スパム画像SHA-256', value: result.matched_spam_image_sha256 ?? 'n/a' }
  ];
  const embed = new EmbedBuilder()
    .setTitle(embedTitle)
    .setColor(result.action === 'delete' ? 0xff3333 : 0xffcc00)
    .addFields(
      { name: 'サーバー名', value: message.guild?.name ?? 'unknown' },
      { name: 'チャンネル名', value: ('name' in message.channel ? message.channel.name : null) ?? 'unknown' },
      { name: 'チャンネルID', value: message.channelId },
      { name: 'スパムを投稿したユーザー', value: `${message.author.tag} (${message.author.id})` },
      { name: '対応', value: handling ?? (result.action === 'delete' ? '削除判定です' : '管理者レビュー待ちです') },
      { name: '本文', value: message.content?.slice(0, 1000) || '(なし)' },
      ...matchedImageFields
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
  await sendEmbedToTextChannel(message.client, logChannelId, { embeds: [embed], files: [new AttachmentBuilder(image, { name: attachmentName })], components: [row] }, { guildId: message.guildId, messageId: message.id, detectionEventId, logChannelId });
  logger.info({ guildId: message.guildId, messageId: message.id, detectionEventId, logChannelId, action: result.action, handling }, 'detection log sent');
};

export const sendGlobalDetectionLog = async (message: Message, result: AnalysisResult, image: Buffer, detectionEventId: number, guildLogChannelId?: string | null, handling?: string, evidenceFilename?: string | null): Promise<void> => {
  if (!config.falsePositiveReportChannelId || config.falsePositiveReportChannelId === guildLogChannelId) return;
  await sendDetectionLog(message, result, image, detectionEventId, config.falsePositiveReportChannelId, handling, evidenceFilename);
};

export type SpamImageRegistrationLogInput = {
  client: Client;
  guildName?: string | null;
  guildId?: string | null;
  channelId?: string | null;
  registeredByUserId: string;
  image: Buffer;
  filename?: string | null;
  digest?: string | null;
  spamImageId?: number | string | null;
  source: string;
  guildLogChannelId?: string | null;
};

export const sendSpamImageRegistrationLog = async (input: SpamImageRegistrationLogInput): Promise<void> => {
  const attachmentName = imagePreviewFilename(input.filename);
  const embed = new EmbedBuilder()
    .setTitle('スパム画像を登録しました')
    .setColor(0x22c55e)
    .addFields(
      { name: '登録内容', value: '画像をスパム画像として登録しました。' },
      { name: '登録元', value: input.source, inline: true },
      { name: '登録ユーザーID', value: input.registeredByUserId, inline: true },
      { name: 'チャンネルID', value: input.channelId ?? 'n/a', inline: true },
      { name: 'サーバー', value: `${input.guildName ?? 'unknown'} (${input.guildId ?? 'n/a'})` },
      { name: '登録画像SHA-256', value: input.digest ?? 'n/a' },
      { name: 'スパム画像ID', value: input.spamImageId ? String(input.spamImageId) : 'n/a', inline: true }
    )
    .setImage(`attachment://${attachmentName}`)
    .setTimestamp(new Date());
  for (const channelId of uniqueChannelIds(input.guildLogChannelId, config.falsePositiveReportChannelId)) {
    await sendEmbedToTextChannel(input.client, channelId, { embeds: [embed], files: [new AttachmentBuilder(input.image, { name: attachmentName })] }, { guildId: input.guildId, channelId, source: input.source });
  }
};
