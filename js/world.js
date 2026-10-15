// The endless field: objects come from a hash of the chunk coords, so nothing is stored but broken speakers.
export const CHUNK = 640;
export const POWERUPS = ['stutter', 'double', 'bomb', 'magnet', 'sweep', 'encore'];

function rng(cx, cy) { // mulberry32 seeded from the chunk coords
  let a = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function chunkObjects(cx, cy) {
  if (cx === 0 && cy === 0) return { pillars: [], speaker: null }; // spawn chunk stays clear
  const r = rng(cx, cy), at = () => [cx * CHUNK + 60 + r() * (CHUNK - 120), cy * CHUNK + 60 + r() * (CHUNK - 120)];
  const pillars = Array.from({ length: 1 + Math.floor(r() * 3) }, () => { const [x, y] = at(); return { x, y, r: 18 + r() * 14, beat: r() < 0.5 ? 0 : 1 }; });
  const [sx, sy] = at();
  return { pillars, speaker: r() < 0.6 ? { x: sx, y: sy, r: 14, id: `${cx},${cy}` } : null };
}

// beat 0 pillars stand on the kick half of each beat, beat 1 on the off half
export const pillarUp = (p, step) => Math.floor(step / 2) % 2 === p.beat;

export function pushOut(b, o) {
  const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy) || 1e-6, min = b.r + o.r;
  if (d < min) { b.x = o.x + dx / d * min; b.y = o.y + dy / d * min; }
}

export const rollPowerup = rnd => POWERUPS[Math.min(POWERUPS.length - 1, Math.floor(rnd() * POWERUPS.length))];
