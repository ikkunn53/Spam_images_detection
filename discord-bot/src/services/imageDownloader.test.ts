import test from 'node:test';
import assert from 'node:assert/strict';
import type { Attachment } from 'discord.js';
import { isProcessableImageAttachment } from './imageDownloader.js';

const attachment = (name: string, contentType: string | null, size = 1024): Attachment => ({ name, contentType, size }) as Attachment;

test('image attachments with missing content-type are processable when extension is supported', () => {
  assert.equal(isProcessableImageAttachment(attachment('spam.png', null)), true);
});

test('unsupported extensions are rejected even when content-type is missing', () => {
  assert.equal(isProcessableImageAttachment(attachment('spam.txt', null)), false);
});
