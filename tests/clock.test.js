import test from 'node:test'; import assert from 'node:assert/strict';
import { chordAt, midiToHz, createClock, STEPS_PER_BAR } from '../js/clock.js';
test('chords cycle Am F C G every 2 bars', () => {
  assert.deepEqual(chordAt(0).map(n => n % 12), [9, 0, 4]);
  assert.deepEqual(chordAt(2).map(n => n % 12), [5, 9, 0]);
  assert.deepEqual(chordAt(8), chordAt(0));
});
test('A4 = 440', () => assert.equal(midiToHz(69), 440));
test('schedules steps within lookahead only', () => {
  const ac = { currentTime: 0 }, got = [];
  const c = createClock(ac, s => got.push(s)); c.start(); c.tick();
  assert.ok(got.length >= 1 && got.length <= 2);
});
test('after a long stall, skips backlog instead of bursting', () => {
  const ac = { currentTime: 0 }, got = [];
  const c = createClock(ac, s => got.push(s)); c.start(); c.tick();
  ac.currentTime = 30; got.length = 0; c.tick();
  assert.ok(got.length <= 2);
});
test('step counter stays aligned across a stall', () => {
  const ac = { currentTime: 0 }, got = [];
  const c = createClock(ac, s => got.push(s)); c.start(); c.tick();
  ac.currentTime = 30; got.length = 0; c.tick();
  assert.ok(got[0] > STEPS_PER_BAR);
});
