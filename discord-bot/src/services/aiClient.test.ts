import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AiClient } from './aiClient.js';
import { config } from '../config/env.js';

test('AI registration sends authentication and multipart bytes; errors do not prevent retries', async () => {
  const original = { url: config.aiServiceUrl, token: config.aiAdminToken };
  let calls = 0;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    assert.equal(req.headers['x-admin-token'], 'test-only');
    assert.match(String(req.headers['content-type']), /multipart\/form-data; boundary=/);
    const body = Buffer.concat(chunks).toString();
    assert.ok(body.includes('image-bytes'));
    assert.ok(body.includes('name="guild_id"'));
    calls++;
    res.writeHead(calls === 1 ? 401 : 200, { 'content-type': 'application/json' });
    res.end(calls === 1 ? '{"detail":"unauthorized"}' : '{"spam_image_id":12}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  config.aiServiceUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  config.aiAdminToken = 'test-only';
  try {
    const ai = new AiClient();
    await assert.rejects(ai.registerSpamImage(Buffer.from('image-bytes'), 'x.png', { guild_id: 'g' }), /401/);
    assert.deepEqual(await ai.registerSpamImage(Buffer.from('image-bytes'), 'x.png', { guild_id: 'g' }), { spam_image_id: 12 });
  } finally {
    config.aiServiceUrl = original.url;
    config.aiAdminToken = original.token;
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
