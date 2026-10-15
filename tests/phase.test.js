import test from 'node:test';
import assert from 'node:assert/strict';
import { phaseAt, createRun, bpmAt, RUN_SECONDS } from '../js/phase.js';

test('24-bar cycle', () => {
  assert.equal(phaseAt(3).name, 'breakdown');
  assert.deepEqual(phaseAt(4), { name: 'build', cycle: 0, barInPhase: 0 });
  assert.deepEqual(phaseAt(8), { name: 'drop', cycle: 0, barInPhase: 0 });
  assert.deepEqual(phaseAt(24), { name: 'breakdown', cycle: 1, barInPhase: 0 });
});
test('tempo curve', () => {
  assert.equal(bpmAt(0), 128); assert.equal(bpmAt(450), 149);
  assert.equal(bpmAt(900), 170); assert.equal(bpmAt(5000), 170);
  assert.equal(RUN_SECONDS, 900);
});
test('run starts unwon at 0s', () => {
  const r = createRun();
  assert.equal(r.elapsed, 0); assert.equal(r.won, false);
});
test('run ends exactly once', () => {
  const r = createRun();
  assert.equal(r.hit(0.6), false);
  assert.equal(r.hit(0.6), true);
  assert.equal(r.hit(0.6), false);
  assert.equal(r.over, true); assert.equal(r.harmony, 0);
});
