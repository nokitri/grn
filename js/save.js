import { VOICES } from './voices.js';
import { cleanRanks } from './shop.js';
const KEY = 'grn', DEFAULT = () => ({ unlocked: ['kick', 'arp'], best: 0, vinyl: 0, ranks: {}, start: 'kick' });
const RULES = [['bass', s => s.seconds >= 300], ['lead', s => s.seconds >= 600], ['pad', s => s.won], ['hats', s => s.evolved >= 1], ['analyzer', s => s.seconds >= 450]];

export function load(storage) {
  try {
    const d = JSON.parse(storage.getItem(KEY));
    if (Array.isArray(d.unlocked) && Number.isFinite(d.best) && d.best >= 0) {
      const unlocked = [...new Set(['kick', 'arp', ...d.unlocked.filter(n => Object.hasOwn(VOICES, n))])];
      const vinyl = Number.isFinite(d.vinyl) && d.vinyl >= 0 ? Math.floor(d.vinyl) : 0; // older saves have none
      return { unlocked, best: d.best, vinyl, ranks: cleanRanks(d.ranks), start: unlocked.includes(d.start) ? d.start : 'kick' };
    }
  } catch {}
  return DEFAULT();
}

export function save(storage, data) { try { storage.setItem(KEY, JSON.stringify(data)); } catch {} }

export const checkUnlocks = (data, stats) => RULES.filter(([n, ok]) => !data.unlocked.includes(n) && ok(stats)).map(r => r[0]);
