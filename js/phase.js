export const CYCLE_BARS = 28;

export function phaseAt(bar) {
  const cycle = Math.floor(bar / CYCLE_BARS);
  const b = bar - cycle * CYCLE_BARS;
  if (b < 8) return { name: 'breakdown', cycle, barInPhase: b };
  if (b < 12) return { name: 'build', cycle, barInPhase: b - 8 };
  return { name: 'drop', cycle, barInPhase: b - 12 };
}

export function createRun() {
  return {
    harmony: 1,
    drops: 0,
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
