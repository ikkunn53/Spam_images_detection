import { GuildMember, Message } from 'discord.js';
import { DetectionRepository } from '../repositories/detectionRepository.js';
import { logger } from '../utils/logger.js';

export const SPAM_TIMEOUT_STRIKE_COUNT = 3;
export const SPAM_TIMEOUT_WINDOW_MINUTES = 10;
export const SPAM_TIMEOUT_DURATION_MS = 10 * 60 * 1000;
export const SPAM_TIMEOUT_NOTIFICATION = 'スパム検知されたため、一時的なタイムアウト処置が実行されました。\n誤検知の場合はサーバー管理者にお問い合わせください';

export const shouldApplySpamTimeout = (recentStrikeCount: number): boolean => recentStrikeCount >= SPAM_TIMEOUT_STRIKE_COUNT;

const getMember = async (message: Message): Promise<GuildMember | null> => {
  if (message.member) return message.member;
  if (!message.guild) return null;
  return message.guild.members.fetch(message.author.id).catch(() => null);
};

const notifyTimedOutUser = async (message: Message): Promise<void> => {
  try {
    await message.author.send({ content: SPAM_TIMEOUT_NOTIFICATION });
    logger.info({ guildId: message.guildId, channelId: message.channelId, userId: message.author.id }, 'sent spam timeout notification by direct message');
  } catch (error) {
    logger.warn({ error, guildId: message.guildId, channelId: message.channelId, userId: message.author.id }, 'failed to send spam timeout notification by direct message');
  }
};

export const applySpamTimeoutIfNeeded = async (message: Message, detections: DetectionRepository): Promise<boolean> => {
  if (!message.guildId) return false;

  const recentStrikeCount = detections.countRecentSpamOrReviewMessages(
    message.guildId,
    message.author.id,
    SPAM_TIMEOUT_WINDOW_MINUTES
  );
  if (!shouldApplySpamTimeout(recentStrikeCount)) return false;

  const member = await getMember(message);
  if (!member) {
    logger.warn({ guildId: message.guildId, userId: message.author.id, recentStrikeCount }, 'could not fetch member for spam timeout');
    return false;
  }
  if (!member.moderatable) {
    logger.warn({ guildId: message.guildId, userId: message.author.id, recentStrikeCount }, 'member cannot be timed out; check bot hierarchy and Moderate Members permission');
    return false;
  }

  try {
    await member.timeout(SPAM_TIMEOUT_DURATION_MS, `画像スパム検知または類似画像レビューが${SPAM_TIMEOUT_WINDOW_MINUTES}分間に${recentStrikeCount}回発生したため`);
    logger.info({ guildId: message.guildId, userId: message.author.id, recentStrikeCount, timeoutDurationMs: SPAM_TIMEOUT_DURATION_MS }, 'member timed out after repeated spam detections');
    await notifyTimedOutUser(message);
    return true;
  } catch (error) {
    logger.warn({ error, guildId: message.guildId, userId: message.author.id, recentStrikeCount }, 'failed to apply spam timeout');
    return false;
  }
};
