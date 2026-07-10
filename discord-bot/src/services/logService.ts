import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, Message } from 'discord.js';
import { AnalysisResult } from './aiClient.js';

export const sendDetectionLog = async (message: Message, result: AnalysisResult, image: Buffer, detectionEventId: number, logChannelId?: string | null, handling?: string): Promise<void> => {
  if (!logChannelId) return;
  const channel = await message.client.channels.fetch(logChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;
  const embed = new EmbedBuilder()
    .setTitle('画像スパム検出ログ')
    .setColor(result.action === 'delete' ? 0xff3333 : 0xffcc00)
    .addFields(
      { name: 'Guild', value: `${message.guild?.name ?? 'unknown'} (${message.guildId})` },
      { name: 'Channel', value: `${'name' in message.channel ? message.channel.name : 'unknown'} (${message.channelId})` },
      { name: 'User', value: `${message.author.tag} (${message.author.id})` },
      { name: '判定', value: `${result.confidence_level} / ${result.decision_method} / action=${result.action}` },
      { name: '対応', value: handling ?? (result.action === 'delete' ? '削除判定です' : '管理者レビュー待ちです') },
      { name: '詳細', value: `sha=${result.sha256_match} pHash=${result.phash_distance ?? 'n/a'} AI=${result.ai_similarity ?? 'n/a'} match=${result.matched_spam_image_id ?? 'n/a'}` },
      { name: '本文', value: message.content?.slice(0, 1000) || '(なし)' }
    )
    .setTimestamp(message.createdAt);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`review:confirm:${detectionEventId}`).setLabel('スパム確定').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`review:false_positive:${detectionEventId}`).setLabel('誤検知').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`review:register:${detectionEventId}`).setLabel('スパム画像として登録').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`review:add_group:${detectionEventId}`).setLabel('類似画像グループへ追加').setStyle(ButtonStyle.Success)
  );
  await channel.send({ embeds: [embed], files: [new AttachmentBuilder(image, { name: 'evidence-image' })], components: [row] });
};
