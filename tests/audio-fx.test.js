import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fxParams } from '../js/audio.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const all = n => ({ reverb: n, delay: n, distortion: n, unison: n, filter: n, sidechain: n });

test('level 0 / missing levels are neutral', () => {
  for (const p of [fxParams({}), fxParams(all(0))]) {
    assert.equal(p.reverb, 0); assert.equal(p.delay, 0); assert.equal(p.distort, false);
    assert.equal(p.q, 1); assert.equal(p.cutoff, 20000); assert.equal(p.unison, 0); assert.equal(p.duck, 0.3);
  }
});
test('level 1 and 5 map to spec values', () => {
  const a = fxParams(all(1)), b = fxParams({ ...all(5), duck: 0.1 });
  near(a.reverb, .1); near(a.delay, .1); near(a.drive, 1); near(a.q, 3); assert.equal(a.distort, true);
  near(b.reverb, .5); near(b.delay, .4); near(b.drive, 8); near(b.q, 11); assert.equal(b.duck, 0.1);
  assert.ok(b.cutoff > a.cutoff);
});
