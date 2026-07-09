import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from './hashService.js';
test('sha256 calculates a stable digest', () => { assert.equal(sha256(Buffer.from('spam')), '94a2f3e5dd19337f2511cdf8b4bf90709c3d7752db5982c724cc3b37a954ff6b'); });
