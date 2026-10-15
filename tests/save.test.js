import test from 'node:test';
import assert from 'node:assert/strict';
import { load, save, checkUnlocks } from '../js/save.js';

const D = { unlocked: ['kick', 'arp'], best: 0, vinyl: 0, ranks: {}, start: 'kick' };
test('defaults on corrupt or missing data', () => {
  assert.deepEqual(load({ getItem: () => '{nope', setItem() {} }), D);
  assert.deepEqual(load({ getItem() { throw new Error(); } }), D);
  assert.deepEqual(load(undefined), D);
});
test('round trip', () => {
  const m = {}; const s = { getItem: k => m[k] ?? null, setItem: (k, v) => m[k] = v };
  save(s, { unlocked: ['kick', 'arp', 'bass'], best: 4 });
  assert.equal(load(s).best, 4);
  save({ setItem() { throw new Error(); } }, D); save(undefined, D);
});
test('v2 unlocks', () => {
  assert.deepEqual(checkUnlocks({ unlocked: ['kick','arp'] }, { seconds: 610, won: false, evolved: 0 }), ['bass','lead','analyzer']);
  assert.deepEqual(checkUnlocks({ unlocked: ['kick','arp'] }, { seconds: 900, won: true, evolved: 1 }), ['bass','lead','pad','hats','analyzer']);
});
test('unlock boundaries', () => {
  const u = s => checkUnlocks({ unlocked: ['kick','arp'] }, { seconds: s, won: false, evolved: 0 });
  assert.deepEqual(u(299), []); assert.deepEqual(u(300), ['bass']);
  assert.deepEqual(u(599), ['bass','analyzer']); assert.deepEqual(u(600), ['bass','lead','analyzer']);
});
test('v1 save still loads', () => {
  const s = { getItem: () => JSON.stringify({ unlocked: ['kick','arp','bass'], best: 4 }) };
  assert.deepEqual(load(s), { unlocked: ['kick','arp','bass'], best: 4, vinyl: 0, ranks: {}, start: 'kick' });
});
test('load sanitizes unlocked and best', () => {
  const s = v => ({ getItem: () => JSON.stringify(v) });
  assert.deepEqual(load(s({ unlocked: ['arp', 'bass', 'bass', '<b>x</b>'], best: 2 })), { unlocked: ['kick', 'arp', 'bass'], best: 2, vinyl: 0, ranks: {}, start: 'kick' });
  assert.deepEqual(load(s({ unlocked: [], best: -1 })), D);
});
test('analyzer unlocks at 7:30', async () => {
  const { checkUnlocks } = await import('../js/save.js');
  const base = { unlocked: ['kick', 'arp', 'bass'] };
  assert.ok(!checkUnlocks(base, { seconds: 449, won: false, evolved: 0 }).includes('analyzer'));
  assert.ok(checkUnlocks(base, { seconds: 450, won: false, evolved: 0 }).includes('analyzer'));
});
