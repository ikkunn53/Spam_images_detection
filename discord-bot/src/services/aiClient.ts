import { File, FormData, request } from 'undici';
import { config } from '../config/env.js';

export type AnalysisResult = { is_spam: boolean; action: 'delete' | 'review' | 'allow'; confidence_level: 'high' | 'medium' | 'low'; decision_method: string; sha256_match: boolean; phash_distance: number | null; ai_similarity: number | null; matched_spam_image_id: number | null; error?: string };

export class AiClient {
  private failures = 0;
  private circuitOpenUntil = 0;
  async analyze(buffer: Buffer, filename: string, fields: Record<string, string>): Promise<AnalysisResult | null> {
    if (Date.now() < this.circuitOpenUntil) return null;
    const form = new FormData();
    form.set('file', new File([buffer], filename));
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    try {
      const res = await request(`${config.aiServiceUrl}/v1/analyze`, { method: 'POST', body: form, bodyTimeout: 30_000, headersTimeout: 5_000 });
      if (res.statusCode >= 500) throw new Error(`AI service ${res.statusCode}`);
      const json = await res.body.json() as AnalysisResult;
      this.failures = 0;
      return json;
    } catch {
      this.failures += 1;
      if (this.failures >= 3) this.circuitOpenUntil = Date.now() + 60_000;
      return null;
    }
  }
  async registerSpamImage(buffer: Buffer, filename: string, fields: Record<string, string>): Promise<unknown> {
    const form = new FormData();
    form.set('file', new File([buffer], filename));
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    const res = await request(`${config.aiServiceUrl}/v1/spam-images`, { method: 'POST', body: form, bodyTimeout: 60_000, headersTimeout: 5_000 });
    if (res.statusCode >= 400) throw new Error(`AI service registration failed: ${res.statusCode}`);
    return res.body.json();
  }
}
