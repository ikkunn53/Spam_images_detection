import test from 'node:test';
import assert from 'node:assert/strict';
import type { Attachment } from 'discord.js';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { downloadImageFromUrl, isProcessableImageAttachment } from './imageDownloader.js';

test('downloads real images directly and through redirects with Node.js global dispatcher', async () => {
  // Initialize Node's built-in HTTP client before using the separately installed undici.
  const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } }).png().toBuffer();
  const server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: '/image' });
      res.end();
    } else if (req.url === '/loop') {
      res.writeHead(302, { location: '/loop' });
      res.end();
    } else {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(image);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const response = await fetch(`${base}/image`);
    await response.arrayBuffer();
    for (const route of ['/image', '/redirect']) {
      const result = await downloadImageFromUrl(`${base}${route}`, 'test.png');
      assert.deepEqual(result.buffer, image);
      assert.equal(result.contentType, 'image/png');
    }
    await assert.rejects(downloadImageFromUrl(`${base}/loop`));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

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
