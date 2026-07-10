import test from 'node:test';
import assert from 'node:assert/strict';
import type { Attachment } from 'discord.js';
import { isProcessableImageAttachment } from './imageDownloader.js';

const attachment = (name: string, contentType: string | null, size = 1024, width: number | null = null, height: number | null = null): Attachment => ({ name, contentType, size, width, height }) as Attachment;

test('image attachments with missing content-type are processable when extension is supported', () => {
  assert.equal(isProcessableImageAttachment(attachment('spam.png', null)), true);
});

test('unsupported extensions are rejected even when content-type is missing', () => {
  assert.equal(isProcessableImageAttachment(attachment('spam.txt', null)), false);
});

test('image attachments are processable when Discord omits filename extension but provides image metadata', () => {
  assert.equal(isProcessableImageAttachment(attachment('unknown', null, 1024, 320, 480)), true);
});

test('image attachments are processable when content-type is supported even without extension', () => {
  assert.equal(isProcessableImageAttachment(attachment('unknown', 'image/png')), true);
});
