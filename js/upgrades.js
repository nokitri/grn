// Pure upgrade logic: no DOM, deterministic given rng.
export const EFFECTS = ['reverb', 'delay', 'distortion', 'unison', 'filter', 'sidechain'];
export const EVOLUTIONS = {
  arp: { fx: 'delay', to: 'acid' }, kick: { fx: 'distortion', to: 'hardkick' },
  bass: { fx: 'sidechain', to: 'rolling' }, lead: { fx: 'unison', to: 'hoover' },
  pad: { fx: 'reverb', to: 'wash' }, hats: { fx: 'filter', to: 'shaker' },
};
const MAX = 5, CAP = 6;

export const xpToNext = level => Math.ceil(5 * 1.2 ** (level - 1));

export function createProgress(pool) {
  return { level: 1, xp: 0, voices: new Map([['kick', 1]]), effects: new Map(), evolved: new Set(), pool };
}

export function gainXp(p, amount) {
  p.xp += amount;
  let gained = 0;
  while (p.xp >= xpToNext(p.level)) { p.xp -= xpToNext(p.level); p.level++; gained++; }
  return gained;
}

export function rollChoices(p, rng) {
  const evos = [], rest = [];
  for (const [name, lv] of p.voices) {
    if (p.evolved.has(name)) continue;
    const e = EVOLUTIONS[name];
    if (lv >= MAX && e && (p.effects.get(e.fx) || 0) >= 1) evos.push({ kind: 'evolve', name, from: lv, to: e.to });
    else if (lv < MAX) rest.push({ kind: 'voiceUp', name, from: lv, to: lv + 1 });
  }
  if (p.voices.size < CAP) for (const name of p.pool) if (!p.voices.has(name)) rest.push({ kind: 'voice', name, from: 0, to: 1 });
  for (const name of EFFECTS) {
    const lv = p.effects.get(name) || 0;
    if (lv >= MAX) continue;
    if (lv > 0) rest.push({ kind: 'fxUp', name, from: lv, to: lv + 1 });
    else if (p.effects.size < CAP) rest.push({ kind: 'fx', name, from: 0, to: 1 });
  }
  const draw = a => a.splice(Math.min(a.length - 1, Math.floor(rng() * a.length)), 1)[0];
  const out = evos.length ? [draw(evos)] : [];
  while (out.length < 3 && rest.length) out.push(draw(rest));
  return out.length ? out : [{ kind: 'heal' }];
}

export function applyChoice(p, c) {
  if (c.kind === 'voice') p.voices.set(c.name, 1);
  else if (c.kind === 'voiceUp') p.voices.set(c.name, (p.voices.get(c.name) || 0) + 1);
  else if (c.kind === 'fx') p.effects.set(c.name, 1);
  else if (c.kind === 'fxUp') p.effects.set(c.name, (p.effects.get(c.name) || 0) + 1);
  else if (c.kind === 'evolve') p.evolved.add(c.name);
}

export function stats(p) {
  const e = n => p.effects.get(n) || 0, d = e('delay');
  return {
    area: 1 + .15 * e('reverb'), damage: 1 + .10 * e('distortion'), speed: 1 + .12 * e('filter'),
    extraShots: [0, 1, 1, 2, 2, 3][e('unison')], echo: d ? .4 + .1 * (d - 1) : 0,
    kickBonus: .15 * e('sidechain'), duck: Math.max(.1, .3 - .05 * e('sidechain')),
  };
}
