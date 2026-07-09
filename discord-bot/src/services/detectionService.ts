import { LRUCache } from 'lru-cache';
import { config } from '../config/env.js';
import { SpamImageRepository } from '../repositories/spamImageRepository.js';
import { AiClient, AnalysisResult } from './aiClient.js';

export class DetectionService {
  private cache = new LRUCache<string, AnalysisResult>({ max: 1000, ttl: config.cacheTtlMs });
  constructor(private spamImages = new SpamImageRepository(), private aiClient = new AiClient()) {}
  async analyze(buffer: Buffer, filename: string, guildId: string, messageId: string, sha: string): Promise<AnalysisResult> {
    const cached = this.cache.get(sha);
    if (cached) return cached;
    const shaMatch = this.spamImages.findActiveBySha256(sha);
    if (shaMatch) {
      const result: AnalysisResult = { is_spam: true, action: 'delete', confidence_level: 'high', decision_method: 'sha256', sha256_match: true, phash_distance: 0, ai_similarity: null, matched_spam_image_id: shaMatch.id };
      this.cache.set(sha, result);
      return result;
    }
    const ai = await this.aiClient.analyze(buffer, filename, { guild_id: guildId, message_id: messageId, sha256: sha });
    if (ai) {
      this.cache.set(sha, ai);
      return ai;
    }
    return { is_spam: false, action: 'review', confidence_level: 'medium', decision_method: 'fallback_ai_unavailable', sha256_match: false, phash_distance: null, ai_similarity: null, matched_spam_image_id: null, error: 'AI service unavailable; no auto delete performed' };
  }
}
