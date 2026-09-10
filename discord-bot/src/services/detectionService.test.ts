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
  matched_spam_image_id: null,
  analyzed_image_sha256: 'same-sha'
};

const deleteResult: AnalysisResult = {
  is_spam: true,
  action: 'delete',
  confidence_level: 'high',
  decision_method: 'sha256',
  sha256_match: true,
  phash_distance: 0,
  ai_similarity: null,
  matched_spam_image_id: 1,
  analyzed_image_sha256: 'same-sha'
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

test('AI unavailable fallback retains the locally calculated image digest', async () => {
  const { DetectionService } = await import('./detectionService.js');
  const service = new DetectionService(
    { findActiveBySha256: () => undefined } as never,
    { analyze: async () => null } as never
  );

  const result = await service.analyze(Buffer.from('image'), 'image.png', 'guild', 'message', 'local-sha');

  assert.equal(result.action, 'review');
  assert.equal(result.decision_method, 'fallback_ai_unavailable');
  assert.equal(result.analyzed_image_sha256, 'local-sha');
});
