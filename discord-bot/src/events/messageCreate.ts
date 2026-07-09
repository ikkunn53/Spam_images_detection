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
    const images = [...message.attachments.values()].filter(isProcessableImageAttachment);
    if (images.length === 0) return;
    const settings = guildSettings.get(message.guildId);
    for (const attachment of images) {
      try {
        const image = await downloadImage(attachment);
        const digest = sha256(image.buffer);
        const result = await detectionService.analyze(image.buffer, image.filename, message.guildId, message.id, digest);
        const shouldDelete = result.action === 'delete' && settings.auto_delete_enabled === 1;
        if (shouldDelete) await message.delete().catch((error) => logger.warn({ error, messageId: message.id }, 'failed to delete message'));
        const eventId = detections.create({ guild_id: message.guildId, channel_id: message.channelId, message_id: message.id, user_id: message.author.id, sha256: digest, decision_method: result.decision_method, confidence_level: result.confidence_level, phash_distance: result.phash_distance, ai_similarity: result.ai_similarity, matched_spam_image_id: result.matched_spam_image_id, final_decision: result.action, auto_deleted: shouldDelete ? 1 : 0, metadata_json: JSON.stringify({ attachmentId: attachment.id, filename: image.filename, error: result.error }) });
        if (result.action !== 'allow') await sendDetectionLog(message, result, image.buffer, eventId, settings.log_channel_id);
      } catch (error) {
        logger.error({ error, messageId: message.id, attachmentId: attachment.id }, 'image processing failed');
      }
    }
  }
};
