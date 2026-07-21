import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.DATABASE_PATH = 'data/test-spam-timeout.sqlite';

test('requires three or more qualifying messages before a timeout is applied', async () => {
  fs.mkdirSync('data', { recursive: true });
  const { shouldApplySpamTimeout, SPAM_TIMEOUT_NOTIFICATION } = await import('./spamTimeoutService.js');
  assert.equal(shouldApplySpamTimeout(2), false);
  assert.equal(shouldApplySpamTimeout(3), true);
  assert.equal(shouldApplySpamTimeout(4), true);
  assert.equal(SPAM_TIMEOUT_NOTIFICATION, 'スパム検知されたため、一時的なタイムアウト処置が実行されました。\n誤検知の場合はサーバー管理者にお問い合わせください');
});

test('counts distinct delete and review messages for the same user', async () => {
  const { db } = await import('../repositories/database.js');
  const { DetectionRepository } = await import('../repositories/detectionRepository.js');
  db.prepare('DELETE FROM detection_events').run();
  const insert = db.prepare(`INSERT INTO detection_events (guild_id, channel_id, message_id, user_id, final_decision, auto_deleted)
    VALUES (?, 'channel', ?, ?, ?, 0)`);
  insert.run('guild', 'delete-message', 'user', 'delete');
  insert.run('guild', 'review-message', 'user', 'review');
  insert.run('guild', 'review-message', 'user', 'review');
  insert.run('guild', 'allowed-message', 'user', 'allow');
  insert.run('guild', 'other-user-message', 'other-user', 'delete');

  const repository = new DetectionRepository();
  assert.equal(repository.countRecentSpamOrReviewMessages('guild', 'user'), 2);
  assert.equal(repository.countRecentSpamOrReviewMessages('guild', 'other-user'), 1);
});

test('notifies only the timed out user by direct message', async () => {
  const { applySpamTimeoutIfNeeded, SPAM_TIMEOUT_DURATION_MS, SPAM_TIMEOUT_NOTIFICATION } = await import('./spamTimeoutService.js');
  let timeoutDuration: number | undefined;
  let notification: unknown;
  const timedOut = await applySpamTimeoutIfNeeded({
    guildId: 'guild',
    channelId: 'spam-channel',
    author: { id: 'user', send: async (payload: unknown) => { notification = payload; } },
    member: { moderatable: true, timeout: async (duration: number) => { timeoutDuration = duration; } }
  } as never, { countRecentSpamOrReviewMessages: () => 3 } as never);

  assert.equal(timedOut, true);
  assert.equal(timeoutDuration, SPAM_TIMEOUT_DURATION_MS);
  assert.deepEqual(notification, { content: SPAM_TIMEOUT_NOTIFICATION });
});
