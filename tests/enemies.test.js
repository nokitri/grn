import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnWave, ENEMIES } from '../js/enemies.js';

const types = (cycle, n = 30) => new Set(Array.from({ length: n }, () => spawnWave('drop', cycle, 800, 600)).flat().map(e => e.type));

test('unlock by cycle', () => {
  assert.ok(!types(0).has('chain'));
  assert.ok(types(1).has('chain'));
  assert.ok(!types(2).has('shard'));
  assert.ok(types(3).has('shard'));
});

test('counts', () => {
  assert.equal(spawnWave('breakdown', 2, 800, 600).length, 3);
  assert.equal(spawnWave('drop', 0, 800, 600).length, 12);
  assert.equal(spawnWave('drop', 2, 800, 600).length, 24);
  assert.ok(spawnWave('build', 0, 800, 600).every(e => e.held));
});

test('hp scaling', () => {
  for (const k in ENEMIES) assert.equal(ENEMIES[k].hp(4), ENEMIES[k].hp(0) * 2);
  const e = spawnWave('breakdown', 4, 800, 600)[0];
  assert.equal(e.hp, ENEMIES.drifter.hp(0) * 2);
});

test('waves and reinforcements enter fully outside translated and zoomed views', async () => {
  const { spawnReinforcements } = await import('../js/enemies.js');
  for (const [w, h, ox, oy] of [[800, 600, 0, 0], [400, 900, -1200, 600], [1600, 1200, 3000, -4000]]) {
    for (let side = 0; side < 4; side++) {
      const values = [0.5, (side + 0.5) / 4, 0]; let i = 0;
      const rng = () => values[i++ % values.length];
      for (const phase of ['breakdown', 'build', 'drop']) {
        const arrivals = [...spawnWave(phase, 3, w, h, ox, oy, rng), ...spawnReinforcements(phase, 3, 0, w, h, ox, oy, rng)];
        for (const e of arrivals) assert.ok(e.x + e.r < ox || e.x - e.r > ox + w || e.y + e.r < oy || e.y - e.r > oy + h);
      }
    }
  }
});

test('reinforcements sustain pressure, scale by phase, and respect population budget', async () => {
  const { spawnReinforcements } = await import('../js/enemies.js');
  const arrive = (phase, cycle, population = 0) => spawnReinforcements(phase, cycle, population, 800, 600);
  assert.ok(arrive('breakdown', 0).length > 0);
  assert.ok(arrive('drop', 0).length > arrive('build', 0).length);
  assert.ok(arrive('drop', 3).length > arrive('drop', 0).length);
  assert.ok(arrive('build', 2).every(e => !e.held));
  let population = 0;
  for (let bar = 0; bar < 100; bar++) population += arrive('drop', 4, population).length;
  assert.equal(population, 240);
  assert.equal(arrive('drop', 4, 239).length, 1);
  assert.equal(arrive('drop', 4, 260).length, 0);
  assert.ok(arrive('drop', 4, 230).length > 0);
});

test('recycling preserves visible enemies and redistributes distant enemies without stale trails', async () => {
  const { recycleEnemy, makeEnemy } = await import('../js/enemies.js');
  const e = makeEnemy('chain', 500, 350, 2);
  assert.equal(recycleEnemy(e, 800, 600, 100, 50), false);
  assert.equal(e.x, 500);
  e.x = -300; e.trail = [{ x: 500, y: 350 }]; e.hp = 2;
  assert.equal(recycleEnemy(e, 800, 600, 100, 50, () => 0.9), true);
  assert.ok(e.x - e.r > 900);
  assert.deepEqual(e.trail, []);
  assert.equal(e.hp, 2);
  assert.equal(recycleEnemy(e, 800, 600, 100, 50), false);
  e.x = -1000; e.held = true;
  assert.equal(recycleEnemy(e, 800, 600, 100, 50), false);
});
