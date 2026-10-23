import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('administrative commands reject missing permissions before processing images or settings', async () => {
  // A fresh nested directory also exercises automatic database parent creation.
  process.env.DATABASE_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'spam-permissions-')), 'nested', 'bot.sqlite');
  const { registerSpamImageCommand } = await import('./registerSpamImage.js');
  const { registerSpamMessageCommand } = await import('./registerSpamMessage.js');
  const { configureLogChannelCommand } = await import('./configureLogChannel.js');
  for (const command of [registerSpamImageCommand, registerSpamMessageCommand, configureLogChannelCommand]) {
    let replies = 0;
    await command.execute({
      guildId: '123', memberPermissions: { has: () => false },
      reply: async () => { replies++; },
      get options() { throw new Error('unauthorized options accessed'); },
      get targetMessage() { throw new Error('unauthorized message accessed'); }
    } as never);
    assert.equal(replies, 1);
  }
});
