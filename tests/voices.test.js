import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VOICES } from '../js/voices.js';

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
test('density rules and starter loadout', () => {
  for (let l = 1; l <= 5; l++) {
    assert.deepEqual(VOICES.kick.pattern(l).flatMap((b, i) => b ? [i] : []), [0, 4, 8, 12]);
    assert.equal(VOICES.arp.pattern(l).filter(Boolean).length, [4, 6, 8, 12, 16][l - 1]);
    for (const [n, v] of Object.entries(VOICES)) if (n !== "kick") assert.ok(v.pattern(l).filter(Boolean).length >= l);
  }
  assert.deepEqual(VOICES.bass.pattern(1).flatMap((b, i) => b ? [i] : []), [2, 6, 10, 14]);
  assert.equal(VOICES.bass.pattern(5).filter(Boolean).length, 8);
  assert.equal(VOICES.arp.damage(3), VOICES.arp.damage(1) * 1.7);
});
import { EVOLVED, voiceDef } from '../js/voices.js';
import { EVOLUTIONS } from '../js/upgrades.js';
test('evolved voices stay in A minor', () => {
  const key = new Set([9,11,0,2,4,5,7]);
  assert.equal(Object.keys(EVOLVED).length, 6);
  for (const v of Object.values(EVOLVED)) for (let l = 1; l <= 5; l++)
    for (let bar = 0; bar < 8; bar++) for (let s = 0; s < 16; s++)
      assert.ok(key.has(v.note(s, bar, l) % 12));
  assert.equal(EVOLVED.rolling.pattern(5).filter(Boolean).length, 16);
  assert.deepEqual(EVOLVED.acid.pattern(5), VOICES.arp.pattern(5));
});
test('voiceDef returns evolved def only when evolved', () => {
  for (const [name, e] of Object.entries(EVOLUTIONS)) {
    assert.equal(voiceDef(name, { evolved: new Set() }), VOICES[name]);
    assert.equal(voiceDef(name, { evolved: new Set([name]) }), EVOLVED[e.to]);
  }
});
test('analyzer voice fires on quarters at level 1 and densifies', () => {
  assert.equal(VOICES.analyzer.weapon, 'spectrum');
  assert.deepEqual(VOICES.analyzer.pattern(1).flatMap((b, i) => b ? [i] : []), [0, 4, 8, 12]);
  assert.equal(VOICES.analyzer.pattern(5).filter(Boolean).length, 16);
});
