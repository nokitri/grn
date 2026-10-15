import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EFFECTS, EVOLUTIONS, xpToNext, createProgress, gainXp, rollChoices, applyChoice, stats, effectsFor } from '../js/upgrades.js';
const seq = (...xs) => () => xs.length > 1 ? xs.shift() : xs[0];
const effect = (p, target, name, rank = 1) => { for (let i = 0; i < rank; i++) applyChoice(p, { kind: 'fx', target, name }); };
test('xp curve and multi-level pickups', () => {
  assert.equal(xpToNext(1), 5); assert.equal(xpToNext(2), 6); assert.equal(xpToNext(10), 26);
  const p = createProgress(['kick', 'arp']); assert.equal(gainXp(p, 12), 2); assert.equal(p.level, 3); assert.equal(p.xp, 1);
});
test('chosen starter is the only initial voice; new runs have clean effects', () => {
  const p = createProgress(['kick', 'arp'], 'arp');
  assert.deepEqual([...p.voices], [['arp', 1]]); effect(p, 'arp', 'delay');
  const fresh = createProgress(['kick', 'arp'], 'arp'); assert.equal(effectsFor(fresh, 'arp').size, 0);
});
test('effects change only the named instrument', () => {
  const p = createProgress(['kick', 'arp']); applyChoice(p, { kind: 'voice', name: 'arp' });
  effect(p, 'arp', 'reverb', 2); effect(p, 'arp', 'unison', 3); effect(p, 'kick', 'distortion');
  assert.equal(stats(p, 'arp').area, 1.3); assert.equal(stats(p, 'arp').extraShots, 2); assert.equal(stats(p, 'arp').damage, 1);
  assert.equal(stats(p, 'kick').area, 1); assert.equal(stats(p, 'kick').damage, 1.1); assert.equal(effectsFor(p, 'kick').has('unison'), false);
});
test('evolution requires its own voice effect, not another instrument’s', () => {
  const p = createProgress(['kick', 'arp']); p.voices.set('arp', 5); effect(p, 'kick', 'delay');
  assert.ok(!rollChoices(p, () => 0).some(c => c.kind === 'evolve'));
  applyChoice(p, { kind: 'evolve', name: 'arp' }); assert.equal(p.evolved.has('arp'), false);
  effect(p, 'arp', 'delay');
  assert.ok(rollChoices(p, () => 0).some(c => c.kind === 'evolve' && c.name === 'arp'));
  applyChoice(p, { kind: 'evolve', name: 'arp' }); assert.equal(p.evolved.has('arp'), true);
});
test('all evolution recipes work on their own channels', () => {
  for (const [name, recipe] of Object.entries(EVOLUTIONS)) {
    const p = createProgress([name], name); p.voices.set(name, 5); effect(p, name, recipe.fx);
    assert.equal(rollChoices(p, () => 0)[0].to, recipe.to);
  }
});
test('offers combine voice and targeted effect choices without duplicates or locked voices', () => {
  const p = createProgress(['kick', 'arp']);
  for (let i = 0; i < 100; i++) {
    const cards = rollChoices(p, Math.random);
    assert.ok(cards.some(c => c.kind === 'voice' || c.kind === 'voiceUp'));
    assert.ok(cards.some(c => c.kind === 'fx'));
    assert.equal(new Set(cards.map(c => `${c.kind}:${c.name}:${c.target}`)).size, cards.length);
    for (const c of cards) {
      if (c.kind === 'voice') assert.equal(c.name, 'arp');
      if (c.kind === 'fx') assert.equal(c.target, 'kick');
    }
  }
});
test('max ranks, full loadouts, and invalid targets are protected', () => {
  const p = createProgress(['kick', 'arp', 'bass', 'lead', 'pad', 'hats', 'analyzer']);
  for (const n of p.pool.slice(1, 6)) applyChoice(p, { kind: 'voice', name: n });
  applyChoice(p, { kind: 'voice', name: 'analyzer' }); assert.equal(p.voices.size, 6);
  for (let i = 0; i < 9; i++) { applyChoice(p, { kind: 'voiceUp', name: 'kick' }); effect(p, 'kick', 'reverb'); }
  assert.equal(p.voices.get('kick'), 5); assert.equal(effectsFor(p, 'kick').get('reverb'), 5);
  effect(p, 'unknown', 'delay'); assert.equal(p.voiceEffects.has('unknown'), false);
  for (let i = 0; i < 50; i++) for (const c of rollChoices(p, Math.random)) {
    assert.notEqual(c.kind, 'voice'); assert.ok(!(c.kind === 'voiceUp' && c.name === 'kick'));
    assert.ok(!(c.target === 'kick' && c.name === 'reverb'));
  }
});
test('exhausted pool heals; low harmony offers recovery when a slot is available', () => {
  const p = createProgress(['kick']); p.voices.set('kick', 5); p.evolved.add('kick');
  assert.ok(rollChoices(p, () => 0, .4).some(c => c.kind === 'heal'));
  for (const name of EFFECTS) effect(p, 'kick', name, 5);
  assert.deepEqual(rollChoices(p, Math.random), [{ kind: 'heal' }]);
});
test('choices are reproducible with seeded randomness', () => {
  const p = createProgress(['kick', 'arp']);
  assert.deepEqual(rollChoices(p, seq(.1, .5, .9, .3)), rollChoices(p, seq(.1, .5, .9, .3)));
});
