import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPushable, parseDotenv } from './env.js';

test('names the server would refuse are reported, not silently dropped', () => {
  const vars = parseDotenv('API_KEY=1\napiKey=2\n_LEADING=3\nDB_URL=postgres://x\n');
  const r = checkPushable(vars);
  assert.deepEqual(r.invalidKeys, ['apiKey', '_LEADING']);
  assert.deepEqual(r.send.map((v) => v.key), ['API_KEY', 'DB_URL']);
});

test('masked secrets from env pull are never sent back', () => {
  const r = checkPushable(parseDotenv('STRIPE_KEY=sk****yz\nSHORT=****\nREAL=sk_live_abcdef\nSTARS=a***b\n'));
  assert.deepEqual(r.masked, ['STRIPE_KEY', 'SHORT']);
  assert.deepEqual(r.send.map((v) => v.key), ['REAL', 'STARS']);
});
