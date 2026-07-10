import { Events, Message } from 'discord.js';
import { DetectionRepository } from '../repositories/detectionRepository.js';
import { GuildSettingsRepository } from '../repositories/guildSettingsRepository.js';
import { DetectionService } from '../services/detectionService.js';
import { downloadImage, isProcessableImageAttachment } from '../services/imageDownloader.js';
import { sendDetectionLog } from '../services/logService.js';
import { sha256 } from '../services/hashService.js';
import { logger } from '../utils/logger.js';

const detectionService = new DetectionService();
const guildSettings = new GuildSettingsRepository();
const detections = new DetectionRepository();

export const messageCreate = {
  name: Events.MessageCreate,
  async execute(message: Message) {
    if (!message.guildId || message.author.bot || message.attachments.size === 0) return;
    logger.info({ guildId: message.guildId, channelId: message.channelId, messageId: message.id, attachmentCount: message.attachments.size, authorId: message.author.id }, 'message with attachments received');
    const images = [...message.attachments.values()].filter(isProcessableImageAttachment);
    if (images.length === 0) {
      logger.info({ guildId: message.guildId, channelId: message.channelId, messageId: message.id, attachmentCount: message.attachments.size }, 'message attachments did not include a processable image');
      return;
    }
    logger.info({ guildId: message.guildId, channelId: message.channelId, messageId: message.id, imageCount: images.length }, 'processing image attachments');
    const settings = guildSettings.get(message.guildId);
    for (const attachment of images) {
      try {
        logger.info({ guildId: message.guildId, channelId: message.channelId, messageId: message.id, attachmentId: attachment.id, filename: attachment.name, size: attachment.size, contentType: attachment.contentType }, 'downloading image attachment');
        const image = await downloadImage(attachment);
        const digest = sha256(image.buffer);
        logger.info({ guildId: message.guildId, channelId: message.channelId, messageId: message.id, attachmentId: attachment.id, filename: image.filename, bytes: image.buffer.length, sha256: digest }, 'image attachment downloaded');
        const result = await detectionService.analyze(image.buffer, image.filename, message.guildId, message.id, digest);
        logger.info({ guildId: message.guildId, channelId: message.channelId, messageId: message.id, attachmentId: attachment.id, filename: image.filename, action: result.action, decisionMethod: result.decision_method, matchedSpamImageId: result.matched_spam_image_id, sha256Match: result.sha256_match, phashDistance: result.phash_distance, aiSimilarity: result.ai_similarity }, 'image analysis completed');
        const shouldDelete = result.action === 'delete' && settings.auto_delete_enabled === 1;
        let autoDeleted = false;
        let handling = result.action === 'review' ? '管理者レビュー待ちです' : '許可しました';
        if (result.action === 'delete') {
          if (shouldDelete) {
            try {
              await message.delete();
              autoDeleted = true;
              handling = '自動削除しました';
              logger.info({ guildId: message.guildId, channelId: message.channelId, messageId: message.id, attachmentId: attachment.id }, 'spam message auto-deleted');
            } catch (error) {
              handling = '削除を試みましたが失敗しました。Bot の権限を確認してください。';
              logger.warn({ error, messageId: message.id }, 'failed to delete message');
            }
          } else {
            handling = '削除判定ですが自動削除は無効です';
          }
        }
        const eventId = detections.create({ guild_id: message.guildId, channel_id: message.channelId, message_id: message.id, user_id: message.author.id, sha256: digest, decision_method: result.decision_method, confidence_level: result.confidence_level, phash_distance: result.phash_distance, ai_similarity: result.ai_similarity, matched_spam_image_id: result.matched_spam_image_id, final_decision: result.action, auto_deleted: autoDeleted ? 1 : 0, metadata_json: JSON.stringify({ attachmentId: attachment.id, filename: image.filename, error: result.error }) });
        logger.info({ guildId: message.guildId, channelId: message.channelId, messageId: message.id, attachmentId: attachment.id, detectionEventId: eventId, action: result.action, handling, autoDeleted, logChannelId: settings.log_channel_id ?? null }, 'image moderation decision recorded');
        if (result.action !== 'allow') await sendDetectionLog(message, result, image.buffer, eventId, settings.log_channel_id, handling);
        else logger.info({ guildId: message.guildId, channelId: message.channelId, messageId: message.id, attachmentId: attachment.id, detectionEventId: eventId }, 'image allowed; detection log not sent');
      } catch (error) {
        logger.error({ error, messageId: message.id, attachmentId: attachment.id }, 'image processing failed');
      }
    }
  }
};
