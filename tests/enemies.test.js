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
