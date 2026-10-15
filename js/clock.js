export const STEPS_PER_BAR = 16;
export const SCALE = [45, 47, 48, 50, 52, 53, 55];
const ROOTS = [0, 5, 2, 6]; // scale degrees: i, VI, III, VII
export const midiToHz = m => 440 * 2 ** ((m - 69) / 12);
export function chordAt(bar) {
  const d = ROOTS[Math.floor(bar / 2) % 4];
  return [0, 2, 4].map(i => SCALE[(d + i) % 7] + 12 * Math.floor((d + i) / 7));
}
export function createClock(ac, onStep) {
  let step = 0, next = 0, on = false, cur = 128, pending = 128, dur = 60 / 128 / 4, anchors = [];
  return {
    start() { step = 0; next = ac.currentTime + 0.05; on = true; cur = pending = 128; dur = 60 / 128 / 4; anchors = []; },
    stop() { on = false; },
    setBpm(b) { pending = b; }, // applied at the next unscheduled bar start
    bpm: () => cur,
    stepDur: () => dur,
    position() {
      const a = anchors.findLast(x => x.time <= ac.currentTime) || anchors[0] || { step: 0, time: ac.currentTime, dur };
      const f = a.step + Math.max(0, (ac.currentTime - a.time) / a.dur), s = Math.floor(f);
      return { step: s, bar: Math.floor(s / STEPS_PER_BAR), beatFrac: (f / 4) % 1 };
    },
    tick() {
      if (!on) return;
      if (next < ac.currentTime - 0.05) { // stalled: skip backlog, keep step count aligned
        const skip = Math.ceil((ac.currentTime - next) / dur);
        step += skip; next += skip * dur;
      }
      while (next < ac.currentTime + 0.15) {
        if (step % STEPS_PER_BAR === 0) {
          cur = pending; dur = 60 / cur / 4;
          anchors.push({ step, time: next, dur }); if (anchors.length > 4) anchors.shift();
        }
        onStep(step++, next, dur); next += dur;
      }
    },
  };
}
