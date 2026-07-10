import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AnalysisResult } from './aiClient.js';

const allowResult: AnalysisResult = {
  is_spam: false,
  action: 'allow',
  confidence_level: 'low',
  decision_method: 'none',
  sha256_match: false,
  phash_distance: null,
  ai_similarity: null,
  matched_spam_image_id: null
};

const deleteResult: AnalysisResult = {
  is_spam: true,
  action: 'delete',
  confidence_level: 'high',
  decision_method: 'sha256',
  sha256_match: true,
  phash_distance: 0,
  ai_similarity: null,
  matched_spam_image_id: 1
};

test('allow results are not cached so later spam registrations can take effect', async () => {
  fs.mkdirSync('data', { recursive: true });
  process.env.DATABASE_PATH = 'data/test-detection.sqlite';
  const { DetectionService } = await import('./detectionService.js');
  let aiCalls = 0;
  const service = new DetectionService(
    { findActiveBySha256: () => undefined } as never,
    { analyze: async () => (++aiCalls === 1 ? allowResult : deleteResult) } as never
  );

  const first = await service.analyze(Buffer.from('image'), 'image.png', 'guild', 'message-1', 'same-sha');
  const second = await service.analyze(Buffer.from('image'), 'image.png', 'guild', 'message-2', 'same-sha');

  assert.equal(first.action, 'allow');
  assert.equal(second.action, 'delete');
  assert.equal(aiCalls, 2);
});
