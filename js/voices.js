import { chordAt } from './clock.js';

// n hits spread evenly over 16 steps
const spread = n => { const p = Array(16).fill(false); for (let i = 0; i < n; i++) p[Math.floor(i * 16 / n)] = true; return p; };
const steps = list => { const p = Array(16).fill(false); list.forEach(i => p[i] = true); return p; };
const voice = (patch, weapon, base, pattern, note) =>
  ({ patch, weapon, pattern, note, damage: l => base * (1 + 0.35 * (l - 1)) });
const root = (s, bar) => chordAt(bar)[0];

export const VOICES = {
  kick: voice('kick', 'ring', 3, () => steps([0, 4, 8, 12]), root),
  // level 4+: octave spread
  arp: voice('arp', 'bolt', 1, l => spread([4, 6, 8, 12, 16][l - 1]),
    (s, bar, l) => chordAt(bar)[s % 3] + (l >= 4 && s & 2 ? 12 : 0) + 12),
  bass: voice('bass', 'pierce', 4, l => steps([2, 6, 10, 14, 3, 11, 7, 15].slice(0, l + 3)), (s, bar) => root(s, bar) - 12),
  lead: voice('lead', 'beam', 2, l => spread([2, 3, 4, 6, 8][l - 1]), (s, bar) => chordAt(bar)[(s >> 2) % 3] + 12),
  pad: voice('pad', 'field', 0.5, l => spread(l), (s, bar) => chordAt(bar)[s % 3]),
  hats: voice('hats', 'spark', 1, l => l < 3 ? steps([2, 6, 10, 14]) : spread([8, 12, 16][l - 3]), root),
};

