import test from 'node:test'; import assert from 'node:assert/strict';
import { SHOP, cost, buy, vinylFor, bonuses, cleanRanks } from '../js/shop.js';
import { load } from '../js/save.js';

test('vinyl: 1 per 30s survived, 2 per drop, 25 for a win', () => {
  assert.equal(vinylFor({ seconds: 59, drops: 0, won: false }), 1);
  assert.equal(vinylFor({ seconds: 900, drops: 20, won: true }), 30 + 40 + 25);
});
test('buy spends vinyl, refuses when broke or maxed', () => {
  const d = { vinyl: 100, ranks: {} };
  assert.equal(buy(d, 'gain'), true); assert.equal(d.ranks.gain, 1); assert.equal(d.vinyl, 100 - cost('gain', 0));
  const poor = { vinyl: 0, ranks: {} }; assert.equal(buy(poor, 'gain'), false); assert.equal(poor.ranks.gain, undefined);
  const maxed = { vinyl: 1e6, ranks: { encore: SHOP.encore.max } }; assert.equal(buy(maxed, 'encore'), false);
  assert.equal(buy({ vinyl: 1e6, ranks: {} }, 'nope'), false);
});
test('costs rise with rank', () => assert.ok(cost('headroom', 2) > cost('headroom', 0)));
test('bonuses from ranks', () => {
  const b = bonuses({ headroom: 2, groove: 1, reach: 3, gain: 4, crate: 2, opening: 1, encore: 1 });
  assert.equal(b.harmony, 1.2); assert.equal(b.speed, 1.05); assert.equal(b.magnet, 1.45); assert.equal(b.damage, 1.2);
  assert.equal(b.rerolls, 2); assert.equal(b.opening, true); assert.equal(b.revive, true);
  assert.deepEqual(bonuses({}), { harmony: 1, speed: 1, magnet: 1, damage: 1, rerolls: 0, opening: false, revive: false });
});
test('cleanRanks drops unknown keys and clamps', () => {
  assert.deepEqual(cleanRanks({ gain: 9, nope: 2, reach: -1, groove: 1.5 }), { gain: SHOP.gain.max, groove: 1 });
});
test('save keeps vinyl, ranks and start voice; old saves get defaults', () => {
  const s = v => ({ getItem: () => JSON.stringify(v) });
  assert.deepEqual(load(s({ unlocked: ['kick', 'arp', 'bass'], best: 4, vinyl: 12, ranks: { gain: 2 }, start: 'bass' })),
    { unlocked: ['kick', 'arp', 'bass'], best: 4, vinyl: 12, ranks: { gain: 2 }, start: 'bass' });
  assert.deepEqual(load(s({ unlocked: ['kick', 'arp'], best: 4 })), { unlocked: ['kick', 'arp'], best: 4, vinyl: 0, ranks: {}, start: 'kick' });
  assert.equal(load(s({ unlocked: ['kick', 'arp'], best: 4, start: 'lead' })).start, 'kick'); // not unlocked → kick
});
