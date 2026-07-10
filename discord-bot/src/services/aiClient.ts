import { File, FormData, request } from 'undici';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

export type AnalysisResult = { is_spam: boolean; action: 'delete' | 'review' | 'allow'; confidence_level: 'high' | 'medium' | 'low'; decision_method: string; sha256_match: boolean; phash_distance: number | null; ai_similarity: number | null; matched_spam_image_id: number | null; error?: string };

export class AiClient {
  private failures = 0;
  private circuitOpenUntil = 0;
  async analyze(buffer: Buffer, filename: string, fields: Record<string, string>): Promise<AnalysisResult | null> {
    if (Date.now() < this.circuitOpenUntil) {
      logger.warn({ circuitOpenUntil: this.circuitOpenUntil }, 'AI service circuit is open; skipping analysis request');
      return null;
    }
    const form = new FormData();
    form.set('file', new File([buffer], filename));
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    try {
      const res = await request(`${config.aiServiceUrl}/v1/analyze`, { method: 'POST', body: form, bodyTimeout: config.aiBodyTimeoutMs, headersTimeout: config.aiHeadersTimeoutMs });
      if (res.statusCode >= 400) {
        const body = await res.body.text();
        throw new Error(`AI service analysis failed: ${res.statusCode} ${body}`);
      }
      const json = await res.body.json() as AnalysisResult;
      if (!['delete', 'review', 'allow'].includes(json.action)) throw new Error(`AI service returned invalid action: ${String(json.action)}`);
      this.failures = 0;
      logger.info({ statusCode: res.statusCode, action: json.action, decisionMethod: json.decision_method, matchedSpamImageId: json.matched_spam_image_id }, 'AI analysis response received');
      return json;
    } catch (error) {
      this.failures += 1;
      if (this.failures >= 3) this.circuitOpenUntil = Date.now() + 60_000;
      logger.warn({ error, failures: this.failures, circuitOpenUntil: this.circuitOpenUntil || null }, 'AI analysis request failed');
      return null;
    }
  }
  async registerSpamImage(buffer: Buffer, filename: string, fields: Record<string, string>): Promise<unknown> {
    const form = new FormData();
    form.set('file', new File([buffer], filename));
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    const res = await request(`${config.aiServiceUrl}/v1/spam-images`, { method: 'POST', body: form, bodyTimeout: config.aiBodyTimeoutMs, headersTimeout: config.aiHeadersTimeoutMs });
    if (res.statusCode >= 400) throw new Error(`AI service registration failed: ${res.statusCode}`);
    const json = await res.body.json();
    logger.info({ statusCode: res.statusCode, result: json }, 'spam image registration response received');
    return json;
  }
}
