import { VOICES } from './voices.js';
const KEY = 'grn', DEFAULT = () => ({ unlocked: ['kick', 'arp'], best: 0 });
const RULES = [['bass', s => s.seconds >= 300], ['lead', s => s.seconds >= 600], ['pad', s => s.won], ['hats', s => s.evolved >= 1]];

export function load(storage) {
  try {
    const d = JSON.parse(storage.getItem(KEY));
    if (Array.isArray(d.unlocked) && Number.isFinite(d.best) && d.best >= 0) return { unlocked: [...new Set(['kick', 'arp', ...d.unlocked.filter(n => Object.hasOwn(VOICES, n))])], best: d.best };
  } catch {}
  return DEFAULT();
}

export function save(storage, data) { try { storage.setItem(KEY, JSON.stringify(data)); } catch {} }

export const checkUnlocks = (data, stats) => RULES.filter(([n, ok]) => !data.unlocked.includes(n) && ok(stats)).map(r => r[0]);
