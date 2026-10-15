import test from 'node:test';
import assert from 'node:assert/strict';
import { load, save, checkUnlocks } from '../js/save.js';

const D = { unlocked: ['kick', 'arp'], best: 0 };
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
test('unlocks', () => {
  assert.deepEqual(checkUnlocks({ unlocked: ['kick', 'arp'] }, { drops: 3, maxedVoices: 0 }), ['bass', 'pad']);
  assert.deepEqual(checkUnlocks({ unlocked: ['kick', 'arp', 'bass'] }, { drops: 1, maxedVoices: 3 }), ['hats', 'lead']);
});
