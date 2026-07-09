import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from './hashService.js';
test('sha256 calculates a stable digest', () => { assert.equal(sha256(Buffer.from('spam')), '4e388ab32b10dc8dbc7e28144f552830adc74787c1e2c0824032078a79f227fb'); });
