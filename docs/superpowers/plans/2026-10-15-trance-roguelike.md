# grn Trance Roguelike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser roguelike where collected voices are both trance instrument layers and auto-weapons, cycling breakdown → build → drop.

**Architecture:** Static page, vanilla ES modules. One lookahead beat clock emits steps; voices, enemies and drawing all react to it. Pure logic (scale, phases, patterns, saves) is DOM-free and tested in Node; audio/canvas are verified by playing.

**Tech Stack:** HTML, canvas 2D, Web Audio, ES modules. Node (no deps) only to run `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-15-trance-roguelike-design.md`

## Global Constraints

- No dependencies, no build step. Must run from a static host (GitHub Pages) and `npx serve`/any static server.
- 138 BPM fixed, 16 steps/bar, A minor, chords i–VI–III–VII at 2 bars each.
- Cycle: breakdown 8 bars → build 4 bars → drop 16 bars.
- Style from `C:/Users/nokit/Documents/GitHub/nc17/index.html`: bg `#050505`, fg `#ff4fd8`, glow via `shadowBlur`, trails via `rgba(5,5,5,.18)` fill, `> ` heading prefix, same font as nc17 (copy its `@font-face`/font-family from that file's `<style>`).
- `prefers-reduced-motion`: no shake/flash, shorter trails.
- `localStorage` access wrapped in try/catch; game works without it.
- Modules imported by tests must not touch `window`/`document` at import time.

## Review Focus

- Tab hidden then refocused: clock must not burst-schedule a backlog of steps (skip to now). Test in Task 2.
- Corrupt/foreign JSON in localStorage: load returns defaults, never throws. Test in Task 8.
- Window resize / phone rotation mid-run: canvas resizes, player clamped inside arena. Manual check in Task 4.
- Audio never unlocked (user hits keys before clicking, iOS): game waits on start screen; no AudioContext before a gesture. Manual check in Task 1.
- Harmony hits zero during build or drop: run ends once, results shown once, clock stopped. Test in Task 3.

---

### Task 1: Page shell, style, start screen

**Files:**
- Create: `index.html`, `js/main.js`, `package.json`

**Interfaces:**
- Produces: `index.html` with `<canvas id="game">`, panels `#start`, `#pause`, `#results` (hidden via `hidden` attr). `main.js` loaded as `type="module"`. `package.json` = `{"type":"module","private":true,"scripts":{"test":"node --test tests/"}}`.

- [ ] **Step 1:** Write `index.html`: full-viewport canvas, nc17 CSS tokens/font/glow, bubble-style bordered panels. `#start` reads `> grn` and "tap / click to start".
- [ ] **Step 2:** `main.js`: on first `pointerdown`/`keydown` while `#start` visible, create `AudioContext`, hide `#start`, start a rAF loop that only paints the trail fade. Resize canvas with devicePixelRatio like nc17's `size()`.
- [ ] **Step 3:** Verify: serve the folder, open it. Black screen with pink start panel; click hides panel; no console errors; no AudioContext warning before click.
- [ ] **Step 4:** Commit `feat: page shell and start screen`.

### Task 2: Beat clock and music theory

**Files:**
- Create: `js/clock.js`, `tests/clock.test.js`

**Interfaces:**
- Produces:
  - `BPM = 138`, `STEPS_PER_BAR = 16`, `stepDur = 60 / BPM / 4`
  - `SCALE` = A natural minor MIDI from A2: `[45,47,48,50,52,53,55]`
  - `chordAt(bar: number) -> number[]` — triad (3 MIDI notes) for chord index `Math.floor(bar/2) % 4` of i–VI–III–VII (Am, F, C, G)
  - `midiToHz(m: number) -> number`
  - `createClock(ac: AudioContext-like {currentTime}, onStep: (step: number, time: number) => void) -> { start(), stop(), tick() }` — `tick()` called each frame schedules every step whose time < `ac.currentTime + 0.1`. `step` counts from 0 globally.

- [ ] **Step 1: Write failing tests**

```js
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
```

- [ ] **Step 2:** `npm test` → FAIL (module missing).
- [ ] **Step 3:** Implement `js/clock.js`. Stall rule: if next step time < `currentTime - 0.05`, jump next step time to `currentTime` (keep step counter advancing by the skipped count so bar math stays aligned).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: beat clock and chord math`.

### Task 3: Phase machine and run state

**Files:**
- Create: `js/phase.js`, `tests/phase.test.js`

**Interfaces:**
- Produces:
  - `CYCLE_BARS = 28`; `phaseAt(bar) -> { name: 'breakdown'|'build'|'drop', cycle: number, barInPhase: number }` (breakdown bars 0–7, build 8–11, drop 12–27 of each cycle)
  - `createRun() -> { harmony: 1, drops: 0, over: false, hit(amount: number) -> boolean /* true only on the hit that ends the run */ }`

- [ ] **Step 1: Failing tests**

```js
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
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `js/phase.js`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: phase machine and run state`.

### Task 4: Player, input, harmony ring

**Files:**
- Modify: `js/main.js`
- Create: `js/input.js`

**Interfaces:**
- Consumes: `createClock`, `phaseAt`, `createRun`.
- Produces: `input.js` → `readMove() -> {x, y}` normalized to length ≤ 1 (WASD/arrows; touch drag relative to touchstart point, full speed at 60px). `onPause(cb)` for Esc and two-finger tap.
- `main.js` state: `player = {x, y, r: 10, speed: 240 /*px/s*/}`; game loop calls `clock.tick()`, moves player, clamps to canvas, draws player (small glowing diamond) and harmony ring (arc of `run.harmony * 2π`).

- [ ] **Step 1:** Implement `input.js` and wire into `main.js`; pause shows `#pause`, suspends `AudioContext`, stops clock ticking.
- [ ] **Step 2:** Verify on desktop and phone emulation (375×812): moves both ways, pause/resume works, rotate/resize keeps player in bounds.
- [ ] **Step 3:** Commit `feat: player movement and input`.

### Task 5: Audio engine

**Files:**
- Create: `js/audio.js`

**Interfaces:**
- Consumes: `midiToHz`.
- Produces: `createAudio(ac) -> { master, play(patch: string, midi: number, time: number, opts?: {dur?, vel?}), kick(time), riser(start, dur), snare(time), blip(midi, time), setFilter(0..1, time), detune(amount 0..1) }`.
- Patches: `'arp'` square, `'bass'` saw, `'lead'` 3 detuned saws (±12 cents), `'pad'` 2 saws slow attack 0.4s, `'hats'` highpassed noise burst 30ms. Kick = sine 150→45 Hz over 0.12s. Sidechain: `kick()` also ramps a shared `duck` GainNode (all non-kick voices route through it) to 0.3 and back to 1 over 0.2s. Master gain 0.5 → DynamicsCompressor → destination. `detune(a)` adds random ±(a·50) cents per note.

- [ ] **Step 1:** Implement `audio.js`. Add a temporary dev hook in `main.js`: on each clock step, kick on every 4th step, arp chord notes on every 2nd.
- [ ] **Step 2:** Verify by listening: steady 138 BPM, audible pumping, no clicks, no drift after 2 minutes, nothing plays before start click.
- [ ] **Step 3:** Remove dev hook. Commit `feat: synth patches and sidechain`.

### Task 6: Voices (instrument + weapon)

**Files:**
- Create: `js/voices.js`, `tests/voices.test.js`
- Modify: `js/main.js`

**Interfaces:**
- Consumes: `chordAt`, `SCALE`, audio API, `phaseAt`.
- Produces:
  - `VOICES` — object keyed `kick|arp|bass|lead|pad|hats`, each `{ patch, weapon: 'ring'|'bolt'|'pierce'|'beam'|'field'|'spark', pattern(level 1..5) -> boolean[16], note(step, bar, level) -> midi, damage(level) }`.
  - Density rules: arp hits per bar `[4,6,8,12,16][level-1]`; kick hits beats only (steps 0,4,8,12) at all levels, plays only in `drop`; bass offbeats (2,6,10,14) at level 1, adds 16ths to 8 at level 5; others ≥ level count.
  - `damage(level) = base * (1 + 0.35 * (level - 1))`.
  - `createLoadout() -> { voices: Map<name, level>, add(name) /* new at 1 or level+1, cap 5 */ }`; starter loadout: `kick` and `arp` at level 1.
  - `notesInKey`: every `note()` output `% 12` must be in A minor.
- `main.js`: on each step, for each voice whose pattern is true: `audio.play(...)` at `time` and queue weapon fire at `time` (fire when `ac.currentTime >= time`). Weapon behavior per spec table. Pad and hats only produce sound in breakdown at reduced vel; all voices full in drop.

- [ ] **Step 1: Failing tests**

```js
test('arp density grows with level', () => {
  assert.equal(VOICES.arp.pattern(1).filter(Boolean).length, 4);
  assert.equal(VOICES.arp.pattern(5).filter(Boolean).length, 16);
});
test('every voice note is in A minor', () => {
  const key = new Set([9,11,0,2,4,5,7]);
  for (const v of Object.values(VOICES)) for (let l = 1; l <= 5; l++)
    for (let bar = 0; bar < 8; bar++) for (let s = 0; s < 16; s++)
      assert.ok(key.has(v.note(s, bar, l) % 12));
});
test('loadout caps at 5', () => {
  const lo = createLoadout(); for (let i = 0; i < 9; i++) lo.add('arp');
  assert.equal(lo.voices.get('arp'), 5);
});
```

- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** Implement. **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Verify in browser: arp bolts fire in time with notes; kick ring only in drop.
- [ ] **Step 6:** Commit `feat: voices as instruments and weapons`.

### Task 7: Enemies, orbs, collisions, build/drop audio

**Files:**
- Create: `js/enemies.js`
- Modify: `js/main.js`

**Interfaces:**
- Consumes: `phaseAt`, `createRun`, audio API, loadout.
- Produces: `ENEMIES` keyed `drifter|pulser|chain|splitter|shard`, each `{ hp(cycle), speed, draw(g, e, t), onBeat?(e, player), onDeath?(e, spawn) }`; `spawnWave(phase, cycle, w, h) -> Enemy[]`. Unlock by cycle: drifter 0, pulser 0, chain 1, splitter 2, shard 3 (spec's "drop 4+"). HP scale `hp * (1 + 0.25 * cycle)`. Count per drop `12 + 6 * cycle`; breakdown `3`.
- Build phase: enemies spawn at edges and hold (speed 0) until drop bar 0. Audio: `riser` over 4 bars, snare steps quarter (bar 0–1), eighth (bar 2), sixteenth (bar 3); `setFilter` 0.2 → 1 across build.
- Orbs: 2 per breakdown at random positions, each names a voice from unlocked pool (Task 8; until then use `kick|arp|bass`); touching calls `loadout.add`.
- Collision: enemy touching player → `run.hit(0.1)` + 1s invulnerability; `audio.detune(1 - run.harmony)`. Death → particle burst + `audio.blip(note in key, next 16th time)`. `run.drops` increments when a drop phase ends.

- [ ] **Step 1:** Implement enemies and spawning; wire phase transitions.
- [ ] **Step 2:** Verify: full cycle plays breakdown → build (riser, held enemies) → drop (swarm). Getting hit detunes. Harmony 0 ends run once.
- [ ] **Step 3:** Commit `feat: enemies, orbs, build and drop`.

### Task 8: Save, unlocks, results screen

**Files:**
- Create: `js/save.js`, `tests/save.test.js`
- Modify: `js/main.js`, `index.html`

**Interfaces:**
- Produces:
  - `load(storage) -> { unlocked: string[], best: number }` default `{ unlocked: ['kick','arp'], best: 0 }`
  - `save(storage, data)` — swallows errors
  - `checkUnlocks(data, runStats: { drops: number, maxedVoices: number }) -> string[]` newly unlocked names. Rules: `bass` drops ≥ 1; `pad` drops ≥ 3; `hats` maxedVoices ≥ 1; `lead` maxedVoices ≥ 3.
  - `storage` param is `localStorage` in browser, a fake in tests.
- Results panel: `> harmony lost`, drops survived, best, newly unlocked voices, "tap to play again".

- [ ] **Step 1: Failing tests**

```js
test('defaults on corrupt or missing data', () => {
  const s = { getItem: () => '{nope', setItem() {} };
  assert.deepEqual(load(s), { unlocked: ['kick','arp'], best: 0 });
  assert.deepEqual(load({ getItem() { throw new Error(); } }), { unlocked: ['kick','arp'], best: 0 });
});
test('round trip', () => {
  const m = {}; const s = { getItem: k => m[k] ?? null, setItem: (k, v) => m[k] = v };
  save(s, { unlocked: ['kick','arp','bass'], best: 4 });
  assert.equal(load(s).best, 4);
});
test('unlocks', () => {
  assert.deepEqual(checkUnlocks({ unlocked: ['kick','arp'] }, { drops: 3, maxedVoices: 0 }), ['bass','pad']);
});
```

- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** Implement; orbs draw from `data.unlocked`. **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Verify: lose a run, results show; reload, unlocks persist; private window still playable.
- [ ] **Step 6:** Commit `feat: unlocks and results`.

### Task 9: Visual layer and polish

**Files:**
- Create: `js/draw.js`
- Modify: `js/main.js`

**Interfaces:**
- Produces: `createDraw(g) -> { fade(), background(t, phase, chordIndex, beatPulse), particles(dt), burst(x, y, n), kickFlash(), setHue(cycle) }`.
- Background: 5 concentric polygons (sides = 3 + chordIndex), radius breathes with beat; build: radii shrink 30% and rotation 3×; drop: kick flash (white-pink alpha 0.15) + camera jolt 4px. Hue: canvas CSS `filter: hue-rotate(cycle * 20deg)` capped at 60deg (pink → violet).
- Reduced motion: no flash/jolt, fade alpha 0.35.
- Perf fallback: if average frame time over 60 frames > 20ms, set `shadowBlur` to 0 on enemies/particles (keep on player).
- Voice visual layers at level ≥ 3: bolts leave trails, beam draws an echo copy, ring draws mirrored second ring.

- [ ] **Step 1:** Implement `draw.js`, move drawing out of `main.js`.
- [ ] **Step 2:** Verify desktop + phone emulation: looks like nc17, reduced-motion emulation removes flashes, frame rate holds.
- [ ] **Step 3:** `npm test` still PASS. Commit `feat: generative visuals`.
