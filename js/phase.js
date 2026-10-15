export const CYCLE_BARS = 24;
export const RUN_SECONDS = 900;
export const bpmAt = s => Math.round(128 + 42 * Math.min(1, s / RUN_SECONDS));

export function phaseAt(bar) {
  const cycle = Math.floor(bar / CYCLE_BARS);
  const b = bar - cycle * CYCLE_BARS;
  if (b < 4) return { name: 'breakdown', cycle, barInPhase: b };
  if (b < 8) return { name: 'build', cycle, barInPhase: b - 4 };
  return { name: 'drop', cycle, barInPhase: b - 8 };
}

export function createRun() {
  return {
    harmony: 1,
    drops: 0,
    elapsed: 0,
    won: false,
    over: false,
    hit(amount) {
      if (this.over) return false;
      this.harmony = Math.max(0, this.harmony - amount);
      if (this.harmony > 0) return false;
      this.over = true;
      return true;
    },
  };
}
