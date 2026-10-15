import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentDistance, ringTouches } from '../js/combat.js';
test('fast projectiles hit targets crossed between frames', () => {
  assert.equal(segmentDistance(15, 0, 0, 0, 30, 0), 0);
  assert.equal(segmentDistance(15, 20, 0, 0, 30, 0), 20);
  assert.equal(segmentDistance(40, 0, 0, 0, 30, 0), 10);
  assert.equal(segmentDistance(3, 4, 0, 0, 0, 0), 5);
});
test('expanding rings hit across frame gaps and include the enemy radius', () => {
  assert.equal(ringTouches(50, 65, 40, 10), true);
  assert.equal(ringTouches(75, 65, 40, 10), true);
  assert.equal(ringTouches(100, 65, 40, 10), false);
  assert.equal(ringTouches(10, 65, 40, 10), false);
});
