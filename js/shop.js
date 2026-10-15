// Meta shop: permanent buffs bought with vinyl earned across runs.
export const SHOP = {
  headroom: { max: 5, base: 15, label: '+10% max harmony' },
  groove: { max: 5, base: 15, label: '+5% move speed' },
  reach: { max: 5, base: 10, label: '+15% magnet radius' },
  gain: { max: 5, base: 20, label: '+5% damage' },
  crate: { max: 3, base: 25, label: '+1 card reroll per run' },
  opening: { max: 1, base: 60, label: 'start with a second voice' },
  encore: { max: 1, base: 120, label: 'revive once at 50% harmony' },
};

export const cost = (key, rank) => SHOP[key].base * (rank + 1);
export const vinylFor = ({ seconds, drops, won }) => Math.floor(seconds / 30) + 2 * drops + (won ? 25 : 0);

export function buy(data, key) {
  const item = SHOP[key], rank = data.ranks[key] || 0;
  if (!item || rank >= item.max || data.vinyl < cost(key, rank)) return false;
  data.vinyl -= cost(key, rank); data.ranks[key] = rank + 1;
  return true;
}

export function cleanRanks(r) {
  const out = {};
  for (const [k, v] of Object.entries(r || {})) if (Object.hasOwn(SHOP, k) && Number.isFinite(v) && v >= 1) out[k] = Math.min(SHOP[k].max, Math.floor(v));
  return out;
}

export function bonuses(r) {
  const n = k => r[k] || 0, round = x => Math.round(x * 100) / 100;
  return {
    harmony: round(1 + 0.1 * n('headroom')), speed: round(1 + 0.05 * n('groove')), magnet: round(1 + 0.15 * n('reach')),
    damage: round(1 + 0.05 * n('gain')), rerolls: n('crate'), opening: n('opening') > 0, revive: n('encore') > 0,
  };
}
