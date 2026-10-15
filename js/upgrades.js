// Each instrument owns its effects. Cards carry an explicit target voice.
export const EFFECTS = ['reverb', 'delay', 'distortion', 'unison', 'filter', 'sidechain'];
export const EVOLUTIONS = {
  arp: { fx: 'delay', to: 'acid' }, kick: { fx: 'distortion', to: 'hardkick' },
  bass: { fx: 'sidechain', to: 'rolling' }, lead: { fx: 'unison', to: 'hoover' },
  pad: { fx: 'reverb', to: 'wash' }, hats: { fx: 'filter', to: 'shaker' },
};
export const xpToNext = level => Math.ceil(5 * 1.2 ** (level - 1));
export function createProgress(pool, starter = 'kick') {
  return { level: 1, xp: 0, voices: new Map([[starter, 1]]), voiceEffects: new Map(), evolved: new Set(), pool };
}
export function effectsFor(p, voice) { return p.voiceEffects.get(voice) || new Map(); }
export function gainXp(p, amount) {
  p.xp += amount; let gained = 0;
  while (p.xp >= xpToNext(p.level)) { p.xp -= xpToNext(p.level); p.level++; gained++; }
  return gained;
}
export function rollChoices(p, rng, harmony = 1) {
  const evos = [], voices = [], effects = [];
  for (const [name, lv] of p.voices) {
    const e = EVOLUTIONS[name], fx = effectsFor(p, name);
    if (!p.evolved.has(name)) {
      if (lv >= 5 && e && (fx.get(e.fx) || 0) >= 1) evos.push({ kind: 'evolve', name, from: lv, to: e.to });
      else if (lv < 5) voices.push({ kind: 'voiceUp', name, from: lv, to: lv + 1 });
    }
    for (const effect of EFFECTS) {
      const rank = fx.get(effect) || 0;
      if (rank < 5) effects.push({ kind: rank ? 'fxUp' : 'fx', name: effect, target: name, from: rank, to: rank + 1 });
    }
  }
  if (p.voices.size < 6) for (const name of p.pool) if (!p.voices.has(name)) voices.push({ kind: 'voice', name, from: 0, to: 1 });
  const draw = a => a.splice(Math.min(a.length - 1, Math.floor(rng() * a.length)), 1)[0];
  const out = [];
  if (evos.length) out.push(draw(evos));
  if (voices.length) out.push(draw(voices));
  if (effects.length) out.push(draw(effects));
  const rest = [...evos, ...voices, ...effects];
  if (harmony < 0.65 && out.length < 3) out.push({ kind: 'heal' });
  while (out.length < 3 && rest.length) out.push(draw(rest));
  return out.length ? out : [{ kind: 'heal' }];
}
export function applyChoice(p, c) {
  if (c.kind === 'voice' && p.pool.includes(c.name) && !p.voices.has(c.name) && p.voices.size < 6) p.voices.set(c.name, 1);
  else if (c.kind === 'voiceUp' && p.voices.has(c.name)) p.voices.set(c.name, Math.min(5, p.voices.get(c.name) + 1));
  else if ((c.kind === 'fx' || c.kind === 'fxUp') && p.voices.has(c.target) && EFFECTS.includes(c.name)) {
    if (!p.voiceEffects.has(c.target)) p.voiceEffects.set(c.target, new Map());
    const fx = p.voiceEffects.get(c.target); fx.set(c.name, Math.min(5, (fx.get(c.name) || 0) + 1));
  } else if (c.kind === 'evolve') {
    const e = EVOLUTIONS[c.name];
    if (e && p.voices.get(c.name) === 5 && effectsFor(p, c.name).get(e.fx) >= 1) p.evolved.add(c.name);
  }
}
export function stats(p, voice) {
  const fx = effectsFor(p, voice), e = n => fx.get(n) || 0, d = e('delay');
  return {
    area: 1 + .15 * e('reverb'), damage: 1 + .10 * e('distortion'), speed: 1 + .12 * e('filter'),
    extraShots: [0, 1, 1, 2, 2, 3][e('unison')], echo: d ? .4 + .1 * (d - 1) : 0,
    kickBonus: .15 * e('sidechain'), duck: Math.max(.1, .3 - .05 * e('sidechain')),
  };
}
