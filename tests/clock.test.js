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
test('setBpm applies at the next bar boundary', () => {
  const ac = { currentTime: 0 }, durs = [];
  const c = createClock(ac, (s, t, d) => durs.push([s, d]));
  c.start(); c.tick(); c.setBpm(170);
  for (let i = 0; i < 400; i++) { ac.currentTime += 0.05; c.tick(); }
  const at = s => durs.find(x => x[0] === s)[1];
  assert.equal(at(15), 60 / 128 / 4);
  assert.equal(at(16), 60 / 170 / 4);
});
test('steps stay contiguous across a tempo change', () => {
  const ac = { currentTime: 0 }, got = [];
  const c = createClock(ac, s => got.push(s)); c.start();
  for (let i = 0; i < 100; i++) { if (i === 40) c.setBpm(150); ac.currentTime += 0.05; c.tick(); }
  got.forEach((s, i) => assert.equal(s, i));
});
test('position reports bar after a stall', () => {
  const ac = { currentTime: 0 }; const c = createClock(ac, () => {}); c.start(); c.tick();
  ac.currentTime = 30; c.tick();
  assert.equal(c.position().bar, Math.floor(c.position().step / 16));
  assert.ok(c.position().step > 200);
});
test('setKey transposes chords and the scale, and resets', async () => {
  const { setKey, keyScale } = await import('../js/clock.js');
  setKey(2);
  assert.deepEqual(chordAt(0).map(n => n % 12), [11, 2, 6]); // B minor
  assert.equal(keyScale()[0] % 12, 11);
  setKey(14); assert.deepEqual(chordAt(0).map(n => n % 12), [11, 2, 6]); // wraps to an octave
  setKey(0); assert.deepEqual(chordAt(0).map(n => n % 12), [9, 0, 4]);
});
