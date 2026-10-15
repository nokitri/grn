# grn v2 Survivors Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn grn into a 15-minute Vampire Survivors-style run: XP gems, pick-1-of-3 level-ups, audio-effect passives that also buff weapons, six evolutions, and tempo rising 128→170 BPM at each drop.

**Architecture:** The clock becomes the only source of musical position and supports tempo changes at bar boundaries. A new DOM-free `upgrades.js` owns the effect/evolution tables, XP curve, stat math and card rolling, so all progression logic is unit-tested in Node. `main.js` wires gems, the level-up pick screen and stats into the existing loop; `audio.js` gains one shared FX chain.

**Tech Stack:** Vanilla ES modules, canvas 2D, Web Audio. `npm test` = `node --test "tests/*.test.js"` (Node 24).

**Spec:** `docs/superpowers/specs/2026-10-15-survivors-progression-design.md` (v1 spec `2026-10-15-trance-roguelike-design.md` still applies where v2 is silent).

## Global Constraints

- No dependencies, no build step; static-host runnable.
- `bpmAt(seconds) = round(128 + 42 * min(1, seconds / 900))`, applied only at the start of each drop.
- Cycle: breakdown 4 bars → build 4 → drop 16 (24 bars).
- Clock lookahead 0.15s. Nothing outside `clock.js` computes musical position from `time / stepDur`.
- XP to next level: `ceil(5 * 1.2^(level-1))`. Gem magnet radius base 80px.
- Caps: 6 voices, 6 effects, levels 1–5. Starting loadout: kick level 1. Voice card pool starts as kick, arp + unlocked voices.
- Run timer counts game time only (excludes Esc pause and level-up screens). 15:00 → next drop is the final drop; surviving it = win.
- Level-up pick: gameplay frozen, music keeps playing lowpassed to ~600Hz; AudioContext is NOT suspended (unlike Esc pause).
- Style: nc17 tokens (`#050505`, `#ff4fd8`, VT323, `> ` headings, bubble panels). `prefers-reduced-motion`: no flash/shake.
- Modules imported by tests must not touch `window`/`document` at import.
- `localStorage` access stays guarded; save load sanitized to known names.

## Review Focus

- Level-up while an Esc pause or tab-hide happens: pausing must not resume gameplay behind the pick panel, and picking must not unsuspend a paused AudioContext. Manual check in Task 5.
- Several level-ups from one big gem pickup: each shows its own pick, in order, none lost. Test in Task 3 (`gainXp` returns level count) + manual in Task 5.
- Tempo change while the tab was hidden (clock stall skip): step count and bar stay aligned after `setBpm`. Test in Task 1.
- Old v1 save (`{unlocked, best: <drops>}`) loads without crashing. Test in Task 8.
- Card pool exhausted (everything maxed): pick grants +20% harmony instead of a blank panel. Test in Task 3.

## Rulings carried into the plan

- Effects apply to all voices, so the FX chain is **one shared chain** on the voice bus (not one per voice). Same sound, fewer nodes. The spec's per-voice wording is satisfied because every voice passes through it.
- Kick goes through distortion and the reverb/delay sends but not the duck (as v1).

---

### Task 1: Tempo-capable clock

**Files:**
- Modify: `js/clock.js`, `js/main.js` (callers of `stepDur`), `js/voices.js` if it imports `stepDur`
- Test: `tests/clock.test.js`

**Interfaces:**
- Produces: `createClock(ac, onStep) -> { start(), stop(), tick(), setBpm(bpm), bpm(), stepDur(), position() }`. `position() -> { step, bar, beatFrac }` for `ac.currentTime` (`step` = last step whose time ≤ now; `beatFrac` 0..1 within the current beat). Initial BPM 128. `setBpm` takes effect at the first not-yet-scheduled step that starts a bar (`step % 16 === 0`). Lookahead 0.15. Exported constant `stepDur` and `BPM` are removed; `STEPS_PER_BAR`, `SCALE`, `chordAt`, `midiToHz` unchanged.
- `onStep(step, time, dur)` gains a third argument: the step duration in effect for that step.

- [ ] **Step 1: Failing tests** (add; update existing tests that imported `stepDur`)

```js
test('setBpm applies at the next bar boundary', () => {
  const ac = { currentTime: 0 }, durs = [];
  const c = createClock(ac, (s, t, d) => durs.push([s, d]));
  c.start(); c.tick(); c.setBpm(170); // step 0 already scheduled → applies from step 16
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
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement. Keep the stall-skip rule from v1, using the current step duration. Record `[step, time]` of the latest scheduled bar start so `position()` can compute from it.
- [ ] **Step 4:** Replace every `stepDur` use in `main.js` with `clock.stepDur()` or the `dur` argument, and every `time / stepDur` bar computation with `clock.position()`. `grep -n "stepDur" js/` must show only `clock.js` and `clock.stepDur()` calls.
- [ ] **Step 5:** `npm test` → PASS; `node --check js/main.js`.
- [ ] **Step 6:** Commit `feat: tempo-capable clock`.

### Task 2: Cycle, tempo curve, final drop

**Files:**
- Modify: `js/phase.js`, `js/main.js`
- Test: `tests/phase.test.js`

**Interfaces:**
- Consumes: `clock.setBpm`.
- Produces: `CYCLE_BARS = 24`; `phaseAt(bar)` with breakdown 0–3, build 4–7, drop 8–23; `bpmAt(seconds) -> number`; `RUN_SECONDS = 900`. `createRun()` gains `elapsed: 0` (game seconds) and `won: false`.
- `main.js`: keep `run.elapsed += dt` only while gameplay is live. On drop start: `clock.setBpm(bpmAt(run.elapsed))`; if `run.elapsed >= RUN_SECONDS`, mark this drop final (`finalDrop = true`) and spawn wave ×2. When a final drop ends with harmony > 0: `run.won = true`, end run like game over but results read `> set complete`.

- [ ] **Step 1: Failing tests**

```js
test('24-bar cycle', () => {
  assert.equal(phaseAt(3).name, 'breakdown');
  assert.deepEqual(phaseAt(4), { name: 'build', cycle: 0, barInPhase: 0 });
  assert.deepEqual(phaseAt(8), { name: 'drop', cycle: 0, barInPhase: 0 });
  assert.deepEqual(phaseAt(24), { name: 'breakdown', cycle: 1, barInPhase: 0 });
});
test('tempo curve', () => {
  assert.equal(bpmAt(0), 128); assert.equal(bpmAt(450), 149);
  assert.equal(bpmAt(900), 170); assert.equal(bpmAt(5000), 170);
});
```
Replace the v1 phase tests that assumed 28 bars.

- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** Implement phase.js + main.js wiring. **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: 24-bar cycle, rising tempo, final drop`.

### Task 3: Upgrades module (pure logic)

**Files:**
- Create: `js/upgrades.js`, `tests/upgrades.test.js`

**Interfaces:**
- Consumes: `VOICES` names from `voices.js`.
- Produces:
  - `EFFECTS = ['reverb','delay','distortion','unison','filter','sidechain']`
  - `EVOLUTIONS = { arp: {fx:'delay', to:'acid'}, kick: {fx:'distortion', to:'hardkick'}, bass: {fx:'sidechain', to:'rolling'}, lead: {fx:'unison', to:'hoover'}, pad: {fx:'reverb', to:'wash'}, hats: {fx:'filter', to:'shaker'} }`
  - `xpToNext(level) = Math.ceil(5 * 1.2 ** (level - 1))`
  - `createProgress(pool: string[]) -> { level: 1, xp: 0, voices: Map([['kick',1]]), effects: Map(), evolved: Set(), pool }`
  - `gainXp(p, amount) -> number` levels gained (may be > 1; carries remainder)
  - `rollChoices(p, rng) -> Card[]` up to 3 distinct cards. `Card = { kind: 'voice'|'voiceUp'|'fx'|'fxUp'|'evolve'|'heal', name, from, to }`. Rules: no maxed items; no new voice if 6 voices; no new effect if 6 effects; evolved voices never offered; if any evolution eligible (voice level 5, paired fx ≥ 1, not evolved) one card is that evolution; if no valid cards → `[{kind:'heal'}]`. Voice candidates only from `p.pool`. Uses `rng()` in [0,1) for all randomness.
  - `applyChoice(p, card)` mutates progress (`heal` is handled by caller).
  - `stats(p) -> { area, damage, speed, extraShots, echo, kickBonus, duck }` from effect levels: area `1 + .15*reverb`, damage `1 + .10*distortion`, speed `1 + .12*filter`, extraShots `[0,1,1,2,2,3][unison]`, echo `delay ? .4 + .1*(delay-1) : 0`, kickBonus `.15*sidechain`, duck `0.3 - .05*sidechain` (floor .1).

- [ ] **Step 1: Failing tests**

```js
const seq = (...xs) => () => xs.length > 1 ? xs.shift() : xs[0];
test('xp curve', () => { assert.equal(xpToNext(1), 5); assert.equal(xpToNext(2), 6); assert.equal(xpToNext(10), 26); });
test('gainXp handles multiple levels', () => {
  const p = createProgress(['kick','arp']); assert.equal(gainXp(p, 12), 2); assert.equal(p.level, 3); assert.equal(p.xp, 1);
});
test('never offers maxed or out-of-pool items', () => {
  const p = createProgress(['kick','arp']); p.voices.set('kick', 5);
  for (let i = 0; i < 50; i++) for (const c of rollChoices(p, Math.random)) {
    assert.ok(!(c.name === 'kick' && c.kind === 'voiceUp'));
    if (c.kind === 'voice') assert.equal(c.name, 'arp');
  }
});
test('evolution offered only when eligible', () => {
  const p = createProgress(['kick','arp']); p.voices.set('arp', 5);
  assert.ok(!rollChoices(p, Math.random).some(c => c.kind === 'evolve'));
  p.effects.set('delay', 1);
  assert.ok(rollChoices(p, Math.random).some(c => c.kind === 'evolve' && c.name === 'arp'));
});
test('caps respected', () => {
  const p = createProgress(['kick','arp']); for (const e of EFFECTS) p.effects.set(e, 1);
  for (let i = 0; i < 50; i++) assert.ok(!rollChoices(p, Math.random).some(c => c.kind === 'fx'));
});
test('exhausted pool heals', () => {
  const p = createProgress(['kick']); p.voices.set('kick', 5); p.evolved.add('kick');
  for (const e of EFFECTS) p.effects.set(e, 5);
  assert.deepEqual(rollChoices(p, Math.random), [{ kind: 'heal' }]);
});
test('deterministic with seeded rng', () => {
  const p = createProgress(['kick','arp']);
  assert.deepEqual(rollChoices(p, seq(.1,.5,.9,.3)), rollChoices(p, seq(.1,.5,.9,.3)));
});
test('stats', () => {
  const p = createProgress(['kick']); p.effects.set('reverb', 2); p.effects.set('unison', 3);
  const s = stats(p); assert.equal(s.area, 1.3); assert.equal(s.extraShots, 2); assert.equal(s.damage, 1);
});
```

- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** Implement. **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: upgrades, xp curve, card rolling`.

### Task 4: Gems and XP; remove orbs

**Files:**
- Modify: `js/main.js`, `js/voices.js`

**Interfaces:**
- Consumes: `createProgress`, `gainXp`.
- `voices.js`: delete `createLoadout`; its tests move to `upgrades.test.js` equivalents (Task 3 covers caps). `main.js` uses `progress.voices` everywhere `loadout.voices` was used.
- `main.js`: remove `orbs` (arrays, spawn, pickup, draw). On enemy death push gem `{x, y, xp: 1}` (Splitter children and Shard worth 2). Gems within 80px move toward player at 400px/s; touching collects → `levelsPending += gainXp(progress, gem.xp)`. Breakdown: magnet radius ×3. Draw gems as small glowing diamonds (r 4).
- XP bar: 3px bar across the top edge, width `xp / xpToNext(level)`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `npm test` → PASS; `grep -n "orb\|loadout" js/` → no matches.
- [ ] **Step 3:** Browser: kills drop gems, gems pull and collect, XP bar fills.
- [ ] **Step 4:** Commit `feat: xp gems replace orbs`.

### Task 5: Level-up pick screen

**Files:**
- Modify: `index.html`, `js/main.js`, `js/input.js` (keys 1–3 if routed there)

**Interfaces:**
- Consumes: `rollChoices`, `applyChoice`, `audio.setFilter`.
- `index.html`: `<div id="levelup" class="panel" hidden>` with `> level up` heading and a container for 3 `<button class="card">`; each card shows name, kind label (`new voice` / `voice` / `new fx` / `fx` / `evolve` / `heal`), `lvl n→n+1`, one-line description. Cards styled as nc17 bubbles; hover/focus inverts like nc17 track buttons.
- `main.js`: state `picking` (separate from `paused`). When `levelsPending > 0` and not picking/paused/gameOver: `picking = true`, roll cards with `Math.random`, show panel, `audio.setFilter(0.25, now)`. While picking: no movement, no enemy/shot updates, weapon queue cleared each step (voices still play — music continues), `run.elapsed` frozen. Choosing (click/tap or key 1–3): `applyChoice` (or heal `run.harmony = min(1, harmony + .2)`), `levelsPending--`, hide panel, restore filter for current phase, then reopen if more pending.
- Esc pause during picking: suspends audio and shows pause panel above; unpausing returns to the pick panel still open. Tab hide during picking does the same.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Browser: level-up pauses gameplay but music continues muffled; keys 1–3 and click work; picking two queued levels shows two panels; Esc during pick → resume returns to pick.
- [ ] **Step 3:** Commit `feat: level-up pick screen`.

### Task 6: Effects — sound and weapon stats

**Files:**
- Modify: `js/audio.js`, `js/main.js`

**Interfaces:**
- Consumes: `stats(progress)`, effect levels.
- `audio.js`: add to the per-run chain: `voice bus → WaveShaper (distortion) → resonant lowpass (filter) → duck → existing lowpass → bus`, plus sends from after the WaveShaper to one shared `ConvolverNode` (impulse: 1.8s stereo noise with exponential decay, generated once in `createAudio`) and one shared `DelayNode` (feedback 0.3), both returning into `bus`. Kick: through its own WaveShaper (same curve) then bus + sends. New API: `setFx(levels: {reverb, delay, distortion, unison, filter, sidechain}, time)` mapping per spec (reverb send `.1*lvl`, delay send `.08*lvl`, drive `1 + 1.75*lvl`, filter Q `1 + 2*lvl` and base cutoff up, duck depth from `stats().duck` passed in); `setTempo(bpm, time)` sets delay time to an 1/8 note. `play()` adds `floor(unison/2)` extra detuned oscillators (±10 cents each) when unison > 0. `newRun()` must rebuild the new nodes too (keep shared convolver buffer).
- `main.js`: call `audio.setFx` after each pick; `audio.setTempo` at each tempo change. In `fire()` apply stats: damage ×`damage` (plus `kickBonus` when step % 4 === 0), shot speed and life ×`speed`, ring/field/spark radius and bolt hit size ×`area`, `extraShots` extra bolt/pierce/spark copies fanned ±12° each, and if `echo > 0` queue a copy of the fire 1/8 note later at `dmg × echo`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Controller offline render check: with all effects at 5, peak < 1, no NaN; reverb tail audible after a note (RMS 0.5s after note end > 0.005).
- [ ] **Step 3:** Browser: picking reverb visibly enlarges ring; unison fans bolts; no errors.
- [ ] **Step 4:** `npm test` → PASS. Commit `feat: effects as passives`.

### Task 7: Evolutions

**Files:**
- Modify: `js/voices.js`, `js/audio.js`, `js/main.js`, `js/draw.js`
- Test: `tests/voices.test.js`

**Interfaces:**
- Consumes: `EVOLUTIONS`, `applyChoice` (evolve card adds name to `progress.evolved`).
- `voices.js`: add `EVOLVED = { acid, hardkick, rolling, hoover, wash, shaker }` with the same shape as `VOICES` entries; `voiceDef(name, progress) -> VOICES[name]` or `EVOLVED[EVOLUTIONS[name].to]` when evolved. Patterns per spec: rolling = all 16 steps; others keep the base voice's level-5 pattern. All notes in A minor.
- `audio.js` patches: `acid` (saw → resonant lowpass with per-note envelope sweep 300→3000Hz, Q 12), `hardkick` (kick through hard clip + tail), `rolling` (short saw bass), `hoover` (3 detuned saws, pitch dips −2 semitones over 80ms), `wash` (pad with 2s release), `shaker` (bandpassed noise 4–8kHz).
- Weapons: acid bolts curve (rotate velocity 180°/s) and always echo; hardkick ring spawns 8 shards outward at ring end; rolling = pierce every step; hoover beam 3× width and sweeps ±30° around heading; wash field radius ×2 and sets `e.frozen = 1s` (no movement); shaker sparks steer toward nearest enemy (turn rate 360°/s).
- Evolve moment: `audio.riser(now, 1 bar)` + `draw.kickFlash()` (skipped under reduced motion).
- Test: every `EVOLVED` voice's `note()` stays in A minor across levels/bars/steps; `voiceDef` returns evolved def only when evolved.

- [ ] **Step 1:** Write failing tests. **Step 2:** `npm test` → FAIL. **Step 3:** Implement. **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Browser: force an evolution via console (set progress state) and see/hear it; no errors.
- [ ] **Step 6:** Commit `feat: evolutions`.

### Task 8: HUD, win/loss results, unlocks

**Files:**
- Modify: `index.html`, `js/main.js`, `js/save.js`
- Test: `tests/save.test.js`

**Interfaces:**
- `save.js`: data `{ unlocked: string[], best: number /* seconds survived */ }`. `checkUnlocks(data, { seconds, won, evolved })` rules: bass `seconds >= 300`; lead `seconds >= 600`; pad `won`; hats `evolved >= 1`. Old saves load unchanged (a v1 `best` drop count just becomes a small seconds value).
- HUD: top-right `mm:ss` from `run.elapsed` and `NNN bpm` below it, VT323, pink glow.
- Results panel: `> set complete` or `> harmony lost`, time survived `mm:ss`, level reached, best time, newly unlocked, `tap to play again`.
- Pool for voice cards = `data.unlocked`.

- [ ] **Step 1: Failing tests**

```js
test('v2 unlocks', () => {
  assert.deepEqual(checkUnlocks({ unlocked: ['kick','arp'] }, { seconds: 610, won: false, evolved: 0 }), ['bass','lead']);
  assert.deepEqual(checkUnlocks({ unlocked: ['kick','arp'] }, { seconds: 900, won: true, evolved: 1 }), ['bass','lead','pad','hats']);
});
test('v1 save still loads', () => {
  const s = { getItem: () => JSON.stringify({ unlocked: ['kick','arp','bass'], best: 4 }) };
  assert.deepEqual(load(s), { unlocked: ['kick','arp','bass'], best: 4 });
});
```
Remove the v1 unlock-rule test.

- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** Implement. **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Browser: HUD shows time and bpm; bpm steps at a drop; dying shows results with time; reload keeps best time.
- [ ] **Step 6:** Commit `feat: hud, results, v2 unlocks`.
