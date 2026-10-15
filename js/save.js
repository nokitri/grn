const KEY = 'grn', DEFAULT = () => ({ unlocked: ['kick', 'arp'], best: 0 });
const RULES = [['bass', s => s.drops >= 1], ['pad', s => s.drops >= 3], ['hats', s => s.maxedVoices >= 1], ['lead', s => s.maxedVoices >= 3]];

export function load(storage) {
  try {
    const d = JSON.parse(storage.getItem(KEY));
    if (Array.isArray(d.unlocked) && Number.isFinite(d.best)) return { unlocked: d.unlocked, best: d.best };
  } catch {}
  return DEFAULT();
}

export function save(storage, data) { try { storage.setItem(KEY, JSON.stringify(data)); } catch {} }

export const checkUnlocks = (data, stats) => RULES.filter(([n, ok]) => !data.unlocked.includes(n) && ok(stats)).map(r => r[0]);
