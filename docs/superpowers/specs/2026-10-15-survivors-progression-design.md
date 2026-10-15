# grn v2 — survivors progression design

Builds on `2026-10-15-trance-roguelike-design.md`. Where they conflict, this spec wins.

## Intent
Make grn play like Vampire Survivors: XP, level-ups with pick-1-of-3 upgrades, evolutions, a 15-minute run with a win state. Music moves from trance to techno as tempo climbs. Passives are **audio effects** that change both the sound and the weapons.

**Success:** a run feels like a DJ set that escalates; upgrades are audible; a full 15-minute run is beatable and fun.

## Changes from v1
- BPM is no longer fixed (was 138).
- Cycle is breakdown 4 / build 4 / drop 16 = 24 bars (was 8/4/16).
- Voice orbs removed; voices come only from level-up picks.
- Unlock rules replaced (see Meta).
- Run has a win state at 15:00.

## Tempo
- `bpmAt(seconds) = round(128 + 42 * min(1, seconds / 900))`.
- Applied only at the start of each drop (tempo steps ≈ +2.5 BPM, ~17 steps per run).
- Clock: `setBpm(bpm)` takes effect at the next bar boundary; step count and timing stay continuous.
- Lookahead 0.15s.
- Clock is the single source of musical position: `clock.position() -> {step, bar, beatFrac}`. Nothing computes bar from `time / stepDur`.

## Cycle
- Breakdown (4 bars): breather, light enemies, gems pull toward player.
- Build (4 bars): riser, snare roll, enemies held at edges (as v1).
- Drop (16 bars): swarm; density scales with run time.
- **Final drop:** first drop starting at or after 15:00 is the final drop with a large swarm. Surviving it = win ("> set complete"). Harmony 0 at any time = loss ("> harmony lost").

## XP and levels
- Every kill drops an XP gem; gems within magnet radius (base 80px) pull to player.
- XP to next level: `ceil(5 * 1.2^(level-1))`.
- Level-up: gameplay pauses; music keeps playing, lowpassed to ~600Hz. Pick 1 of 3 cards. Picking resumes play and restores the filter.
- Multiple level-ups queue; each shows its own pick.

## Upgrade pool
- Card kinds: new voice, voice level-up, new effect, effect level-up, evolution.
- Caps: 6 voices, 6 effects, each level 1–5. Never offer maxed or capped-out items.
- If fewer than 3 valid cards exist, offer what exists; if none, grant +20% harmony instead.
- `rollChoices(state, rng)` is pure and deterministic given rng.

## Effects (passives, apply to all voices)

| Effect | Sound (lvl 1→5) | Stat per level |
|---|---|---|
| Reverb | send 0.1 → 0.5 | +15% area (ring/field/spark radius, bolt hit size) |
| Delay | send 0.1 → 0.4, 1/8 note, feedback 0.3 | each shot echoes once 1/8 later at 40% dmg (+10%/lvl) |
| Distortion | drive 1 → 8 | +10% damage |
| Unison | +1 detuned osc per 2 levels | +1 projectile per note at lvl 1, 3, 5, fanned |
| Filter | resonance up, brighter cutoff | +12% projectile speed and range |
| Sidechain | duck depth 0.3 → 0.1 | +15% bonus damage for shots fired on kick steps |

(Compressor/knockback dropped — six effects pair with six evolutions.)

**Audio chain:** per voice: WaveShaper (distortion) → lowpass (filter) → dry + sends → duck. One shared ConvolverNode reverb (generated noise-decay impulse, ≤ 2s) and one shared delay (DelayNode + feedback) — per-voice send levels only. Delay time follows BPM, updated at each tempo step.

## Evolutions
- Eligible: voice at level 5 **and** its paired effect at level ≥ 1.
- When eligible, one card in the next pick is the evolution.
- Evolving swaps the voice's patch, pattern and weapon; keeps its slot; plays riser + screen flash.

| Evolution | Pair | Change |
|---|---|---|
| Acid Arp | Arp + Delay | resonant squelch patch; bolts spiral and echo |
| Hardkick | Kick + Distortion | distorted kick; ring shatters into 8 shards |
| Rolling Bass | Bass + Sidechain | 16th roll; pierce shot every note |
| Hoover | Lead + Unison | detuned pitch-dip lead; wide sweeping beam |
| Wash | Pad + Reverb | big reverb pad; field doubles radius and freezes enemies 1s |
| Shaker Storm | Hats + Filter | filtered shakers; sparks home on nearest enemy |

## Meta
- Start pool for voice cards: kick, arp. Starting loadout: kick level 1.
- Unlocks (by run result): bass — reach 5:00; lead — reach 10:00; pad — win a run; hats — reach any evolution. Saved with best time (seconds survived) replacing best drops.
- Save remains sanitized on load (known names only).

## HUD
- XP bar along the top edge; run timer `mm:ss`; current BPM small under the timer.
- Level-up panel: three bordered cards (nc17 bubble style), each with name, kind, level `n→n+1`, one-line effect. Select by click/tap or keys 1–3.

## Files
- `clock.js`: `setBpm`, `stepDur()`, `position()`, lookahead 0.15.
- `phase.js`: 24-bar cycle, `bpmAt`, final-drop flag.
- `audio.js`: per-voice FX chain, shared reverb/delay, `setFx(levels)`, evolution patches, BPM-synced delay.
- `voices.js`: evolved voice defs.
- `upgrades.js` (new): effect table, evolution table, XP curve, `rollChoices`.
- `main.js`: remove orbs; gems + magnet; level-up pause/pick wired to existing pause; use `clock.position()`; win state; HUD.
- `save.js`: new unlock rules, best time.
- `index.html`: level-up panel, HUD elements.

## Testing
- Clock: tempo change at bar boundary keeps step count and timing continuous; tight at 170 BPM.
- Phase: `bpmAt(0)=128`, `bpmAt(900)=170`; BPM changes only at drop start; final drop flagged after 15:00.
- Upgrades: never offers maxed items; evolution only when eligible; caps respected; deterministic with seeded rng; fallback when pool empty.
- XP curve values.
- Save: new unlock rules; old-format save loads without crashing.
- Manual: full 15-minute run on desktop; listen with all six effects maxed; phone frame rate with reverb.

## Out of scope
Character selection, shops/gold, map/stage variety, more than six evolutions, settings menu.
