# grn — trance roguelike design

## Intent
An audiovisual roguelike: arena survivor crossed with calm exploration. Voices you collect are both instrument layers and auto-weapons, so the build is the track. Trance-themed; the game loop is a breakdown → build → drop cycle. Styled like `nc17/index.html` (black CRT, phosphor pink `#ff4fd8`, glow, trails, glitch jitter, raw-oscillator blips). Lives as a static web page next to nc17/numnuts/mandawla; Godot later only if needed.

**Success:** fun for several runs, sounds like trance, looks like it belongs on nc17, runs on desktop and phone.

## Platform
- Static site, vanilla JS ES modules, canvas 2D + Web Audio. No dependencies, no build. GitHub Pages hostable.
- Input: WASD/arrows on desktop; touch drag (relative to first touch point) on phone. Esc / two-finger tap pauses.
- Tap/click start screen (required to unlock audio on iOS).
- `prefers-reduced-motion`: no shake/flash, shorter trails.

## Core loop
- **Clock:** 138 BPM fixed, 16 steps/bar, lookahead scheduler. Emits `step(n, time)`; audio, weapons, enemy pulses and background all read from it.
- **Key:** A minor, chords i–VI–III–VII, 2 bars each. All voices quantized to scale.
- **Cycle:**
  - **Breakdown (8 bars):** pad/arp only, filtered drone, few drifting enemies, voice orbs spawn. Touch orb = new voice or level up.
  - **Build (4 bars):** noise riser, snare roll 1/4→1/8→1/16, filter sweep. Enemies gather at edges (held). Visuals tighten.
  - **Drop (16 bars):** four-on-the-floor kick, sidechain pump, all voices full. Swarm released.
  - Difficulty scales per cycle via enemy count/HP and unlocked types (not tempo).
- **Harmony (HP):** ring around player. Hits detune voices and drop notes. At zero, music collapses to noise → results screen (score = drops survived, unlocks earned).

## Voices
One object = synth patch + step pattern + weapon + visual. On each pattern step: play note and fire.

| Voice | Sound | Weapon |
|---|---|---|
| Kick (starter) | sine-drop kick, drops only | shockwave ring each beat, short range |
| Arp (starter) | square 1/16 arpeggio | small fast bolts at nearest enemy |
| Bass | offbeat saw | slow heavy piercing shot |
| Supersaw lead | detuned saw melody | beam sweeping toward heading |
| Pad | soft chord, long notes | slowing field around player |
| Hats | noise ticks | radial sparks |

- **Levels 1–5:** denser pattern (e.g. arp 4→16 notes/bar, then octave spread), more damage, extra visual layer (trail/echo/symmetry) from level 3.
- Mix: per-voice filter, everything sidechained to kick.

## Meta-progression
- Start pool: Kick, Arp. Milestones unlock Bass, Lead, Pad, Hats (e.g. reach drop 3; max 3 voices in one run; etc.).
- Saved in `localStorage` (wrapped in try/catch; game works if unavailable). Also stores best score.

## Enemies
Pink glowing line-art shapes; each a small spec (shape, movement, HP, beat reaction).

| Enemy | Look | Behavior |
|---|---|---|
| Drifter | spinning triangle | wanders toward player; also in breakdowns |
| Pulser | circle swelling on kick | lunges on each beat |
| Chain | 5–8 linked dots | sine-snake path |
| Splitter | hexagon | splits into 3 Drifters on death |
| Shard (drop 4+) | spiky star | keeps distance, slow off-beat shots |

Death: line-fragment burst + in-key blip quantized to next 1/16.

## Visuals
- Single canvas, monochrome glow line art, no sprites.
- Phosphor trails via translucent black fill each frame (as nc17).
- Background: concentric polygons breathing with chord; tighten in build; kick flash + camera jolt in drop.
- Per-drop hue shift (pink→magenta→violet) via canvas `hue-rotate`.
- UI: nc17 font, `> ` headings, bordered bubble-style panels for start/pause/results.
- Phone perf: `shadowBlur` is costly; fall back to fewer glow passes if frame time is high.

## Files
```
index.html     page, CSS (nc17 style), canvas, screens
js/main.js     boot, input, game loop, phase state machine
js/clock.js    lookahead scheduler, step events, chord/scale
js/audio.js    synth patches, sidechain, riser/snare roll, blips
js/voices.js   voice defs: pattern, patch, weapon, levels
js/enemies.js  enemy defs, spawning, beat reactions
js/draw.js     trails, background, particles, hue shift
js/save.js     localStorage unlocks + best score
```
Data flow: `clock` → `step` → voices (audio + fire) / enemies (pulse) / draw (breathe). `main` owns state and the phase machine (breakdown → build → drop).

## Testing
- `clock.js` and scale/chord math: small assert self-check (steps per bar, notes in key).
- `save.js`: round-trip check with missing/corrupt storage.
- Manual: play runs on desktop and phone; listen for mud with 6 voices maxed; check frame rate.

## Out of scope (v1)
Boss/finale, controller support, settings menu beyond mute, desktop packaging.
