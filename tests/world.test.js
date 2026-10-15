import test from 'node:test'; import assert from 'node:assert/strict';
import { CHUNK, chunkObjects, pillarUp, pushOut, POWERUPS, rollPowerup, ZONES } from '../js/world.js';

test('chunks are deterministic and stay inside their chunk', () => {
  assert.deepEqual(chunkObjects(3, -2), chunkObjects(3, -2));
  for (const o of chunkObjects(3, -2).pillars) {
    assert.ok(o.x >= 3 * CHUNK && o.x < 4 * CHUNK);
    assert.ok(o.y >= -2 * CHUNK && o.y < -1 * CHUNK);
  }
});
test('origin chunk is clear so the player never spawns inside a pillar', () => {
  assert.equal(chunkObjects(0, 0).pillars.length, 0);
});
test('pillars alternate on half beats', () => {
  assert.equal(pillarUp({ beat: 0 }, 0), true);
  assert.equal(pillarUp({ beat: 0 }, 2), false);
  assert.equal(pillarUp({ beat: 1 }, 2), true);
  assert.equal(pillarUp({ beat: 1 }, 4), false);
});
test('pushOut moves a body outside a circle, leaves it alone otherwise', () => {
  const b = { x: 5, y: 0, r: 10 }; pushOut(b, { x: 0, y: 0, r: 20 });
  assert.ok(Math.abs(Math.hypot(b.x, b.y) - 30) < 1e-9);
  const far = { x: 100, y: 0, r: 10 }; pushOut(far, { x: 0, y: 0, r: 20 }); assert.equal(far.x, 100);
});
test('powerups', () => {
  assert.deepEqual(POWERUPS, ['stutter', 'double', 'bomb', 'magnet', 'sweep', 'encore']);
  assert.equal(rollPowerup(() => 0), 'stutter');
  assert.equal(rollPowerup(() => 0.999), 'encore');
  assert.deepEqual(ZONES, ['reverb', 'strobe', 'mud']);
});
