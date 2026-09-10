import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

test('removes a newly saved import file when AI registration fails', async () => {
  const importDir = await mkdtemp(path.join(os.tmpdir(), 'spam-registration-'));
  process.env.SPAM_IMAGE_IMPORT_DIR = importDir;
  const { registerDownloadedSpamImage } = await import('./spamImageRegistrationService.js');
  const image = { buffer: Buffer.from('new image'), contentType: 'image/png', filename: 'image.png' };

  await assert.rejects(
    registerDownloadedSpamImage(image, { guild_id: 'guild', registered_by_user_id: 'user' }, {
      registerSpamImage: async () => { throw new Error('AI unavailable'); }
    }),
    /AI unavailable/
  );

  const digest = crypto.createHash('sha256').update(image.buffer).digest('hex');
  const expectedPath = path.join(importDir, `${digest}.png`);
  await assert.rejects(readFile(expectedPath), { code: 'ENOENT' });
  await rm(importDir, { recursive: true, force: true });
});

test('does not remove a pre-existing import file when a retry fails', async () => {
  const { registerDownloadedSpamImage } = await import('./spamImageRegistrationService.js');
  const image = { buffer: Buffer.from('existing image'), contentType: 'image/png', filename: 'image.png' };
  const successfulClient = { registerSpamImage: async () => ({ spam_image_id: 1 }) };
  const first = await registerDownloadedSpamImage(image, { guild_id: 'guild', registered_by_user_id: 'user' }, successfulClient);

  await assert.rejects(registerDownloadedSpamImage(image, { guild_id: 'guild', registered_by_user_id: 'user' }, {
    registerSpamImage: async () => { throw new Error('retry failed'); }
  }));

  assert.deepEqual(await readFile(first.localPath), image.buffer);
  await rm(path.dirname(first.localPath), { recursive: true, force: true });
});
