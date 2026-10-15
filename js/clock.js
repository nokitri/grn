export const BPM = 138, STEPS_PER_BAR = 16, stepDur = 60 / BPM / 4;
export const SCALE = [45, 47, 48, 50, 52, 53, 55];
const ROOTS = [0, 5, 2, 6]; // scale degrees: i, VI, III, VII
export const midiToHz = m => 440 * 2 ** ((m - 69) / 12);
export function chordAt(bar) {
  const d = ROOTS[Math.floor(bar / 2) % 4];
  return [0, 2, 4].map(i => SCALE[(d + i) % 7] + 12 * Math.floor((d + i) / 7));
}
export function createClock(ac, onStep) {
  let step = 0, next = 0, on = false;
  return {
    start() { step = 0; next = ac.currentTime + 0.05; on = true; },
    stop() { on = false; },
    tick() {
      if (!on) return;
      if (next < ac.currentTime - 0.05) { // stalled: skip backlog, keep step count aligned
        const skip = Math.ceil((ac.currentTime - next) / stepDur);
        step += skip; next += skip * stepDur;
      }
      while (next < ac.currentTime + 0.1) { onStep(step++, next); next += stepDur; }
    },
  };
}
