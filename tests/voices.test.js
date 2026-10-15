import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VOICES, createLoadout } from '../js/voices.js';

test('arp density grows with level', () => {
  assert.equal(VOICES.arp.pattern(1).filter(Boolean).length, 4);
  assert.equal(VOICES.arp.pattern(5).filter(Boolean).length, 16);
});
test('every voice note is in A minor', () => {
  const key = new Set([9,11,0,2,4,5,7]);
  for (const v of Object.values(VOICES)) for (let l = 1; l <= 5; l++)
    for (let bar = 0; bar < 8; bar++) for (let s = 0; s < 16; s++)
      assert.ok(key.has(v.note(s, bar, l) % 12));
});
test('loadout caps at 5', () => {
  const lo = createLoadout(); for (let i = 0; i < 9; i++) lo.add('arp');
  assert.equal(lo.voices.get('arp'), 5);
});
test('density rules and starter loadout', () => {
  for (let l = 1; l <= 5; l++) {
    assert.deepEqual(VOICES.kick.pattern(l).flatMap((b, i) => b ? [i] : []), [0, 4, 8, 12]);
    assert.equal(VOICES.arp.pattern(l).filter(Boolean).length, [4, 6, 8, 12, 16][l - 1]);
    for (const [n, v] of Object.entries(VOICES)) if (n !== "kick") assert.ok(v.pattern(l).filter(Boolean).length >= l);
  }
  assert.deepEqual(VOICES.bass.pattern(1).flatMap((b, i) => b ? [i] : []), [2, 6, 10, 14]);
  assert.equal(VOICES.bass.pattern(5).filter(Boolean).length, 8);
  assert.equal(VOICES.arp.damage(3), VOICES.arp.damage(1) * 1.7);
  assert.deepEqual([...createLoadout().voices], [['kick', 1], ['arp', 1]]);
});
