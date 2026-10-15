import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EFFECTS, xpToNext, createProgress, gainXp, rollChoices, applyChoice, stats } from '../js/upgrades.js';

const seq = (...xs) => () => xs.length > 1 ? xs.shift() : xs[0];
test('xp curve', () => { assert.equal(xpToNext(1), 5); assert.equal(xpToNext(2), 6); assert.equal(xpToNext(10), 26); });
test('gainXp handles multiple levels', () => {
  const p = createProgress(['kick','arp']); assert.equal(gainXp(p, 12), 2); assert.equal(p.level, 3); assert.equal(p.xp, 1);
});
test('never offers maxed or out-of-pool items', () => {
  const p = createProgress(['kick','arp']); p.voices.set('kick', 5);
  for (let i = 0; i < 50; i++) for (const c of rollChoices(p, Math.random)) {
    assert.ok(!(c.name === 'kick' && c.kind === 'voiceUp'));
    if (c.kind === 'voice') assert.equal(c.name, 'arp');
  }
});
test('evolution offered only when eligible', () => {
  const p = createProgress(['kick','arp']); p.voices.set('arp', 5);
  assert.ok(!rollChoices(p, Math.random).some(c => c.kind === 'evolve'));
  p.effects.set('delay', 1);
  assert.ok(rollChoices(p, Math.random).some(c => c.kind === 'evolve' && c.name === 'arp'));
});
test('caps respected', () => {
  const p = createProgress(['kick','arp']); for (const e of EFFECTS) p.effects.set(e, 1);
  for (let i = 0; i < 50; i++) assert.ok(!rollChoices(p, Math.random).some(c => c.kind === 'fx'));
});
test('exhausted pool heals', () => {
  const p = createProgress(['kick']); p.voices.set('kick', 5); p.evolved.add('kick');
  for (const e of EFFECTS) p.effects.set(e, 5);
  assert.deepEqual(rollChoices(p, Math.random), [{ kind: 'heal' }]);
});
test('deterministic with seeded rng', () => {
  const p = createProgress(['kick','arp']);
  assert.deepEqual(rollChoices(p, seq(.1,.5,.9,.3)), rollChoices(p, seq(.1,.5,.9,.3)));
});
test('stats', () => {
  const p = createProgress(['kick']); p.effects.set('reverb', 2); p.effects.set('unison', 3);
  const s = stats(p); assert.equal(s.area, 1.3); assert.equal(s.extraShots, 2); assert.equal(s.damage, 1);
});
test('applyChoice and distinct cards', () => {
  const p = createProgress(['kick','arp']);
  for (let i = 0; i < 50; i++) {
    const cs = rollChoices(p, Math.random);
    assert.equal(new Set(cs.map(c => c.kind + c.name)).size, cs.length);
  }
  applyChoice(p, { kind: 'voice', name: 'arp' }); applyChoice(p, { kind: 'voiceUp', name: 'arp' });
  applyChoice(p, { kind: 'fx', name: 'delay' }); applyChoice(p, { kind: 'fxUp', name: 'delay' });
  applyChoice(p, { kind: 'evolve', name: 'arp', to: 'acid' });
  assert.equal(p.voices.get('arp'), 2); assert.equal(p.effects.get('delay'), 2); assert.ok(p.evolved.has('arp'));
});
