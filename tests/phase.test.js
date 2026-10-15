import test from 'node:test';
import assert from 'node:assert/strict';
import { phaseAt, createRun } from '../js/phase.js';

test('phases', () => {
  assert.equal(phaseAt(0).name, 'breakdown');
  assert.equal(phaseAt(8).name, 'build');
  assert.deepEqual(phaseAt(12), { name: 'drop', cycle: 0, barInPhase: 0 });
  assert.deepEqual(phaseAt(28), { name: 'breakdown', cycle: 1, barInPhase: 0 });
});
test('run ends exactly once', () => {
  const r = createRun();
  assert.equal(r.hit(0.6), false);
  assert.equal(r.hit(0.6), true);
  assert.equal(r.hit(0.6), false);
  assert.equal(r.over, true); assert.equal(r.harmony, 0);
});
