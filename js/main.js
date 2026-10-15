import { createClock, setKey, keyScale } from './clock.js';
import { createRun, phaseAt, bpmAt, RUN_SECONDS } from './phase.js';
import { createAudio } from './audio.js';
import { voiceDef } from './voices.js';
import { createProgress, gainXp, xpToNext, rollChoices, applyChoice, stats, effectsFor, EVOLUTIONS } from './upgrades.js';
import { ENEMIES, spawnWave, spawnReinforcements, recycleEnemy, makeEnemy, advanceEnemy, makeElite, ENEMY_COLORS } from './enemies.js';
import { readMove, onPause, clearInput, takeDash, requestDash } from './input.js';
import { load, save, checkUnlocks } from './save.js';
import { createDraw } from './draw.js';
import { SHOP, cost, buy, vinylFor, bonuses } from './shop.js';
import { rollPowerup } from './world.js';
import { segmentDistance, ringTouches } from './combat.js';
const c = document.getElementById('game'), g = c.getContext('2d'), d = createDraw(g);
const start = document.getElementById('start'), pauseEl = document.getElementById('pause'), results = document.getElementById('results'), hud = document.getElementById('hud');
const levelup = document.getElementById('levelup'), cardsEl = document.getElementById('cards');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const player = { x: 0, y: 0, r: 10, speed: 240 };
const cam = { x: 0, y: 0, z: 1, punch: 0 }; // world → screen: centred on cam, scaled by z
const P = '#70efd2', A = '#ff887e', GRID = '#2a6471';
const view = () => [w / cam.z, h / cam.z, cam.x - w / 2 / cam.z, cam.y - h / 2 / cam.z]; // view size + top-left in world
let store; try { store = localStorage; } catch {} // access itself can throw
const data = load(store);
let w, h, ac, clock, run, audio, progress, levelsPending = 0, paused = false, picking = false, pickBars = 0, cards = [], last = 0;
let endedAt = 0, lastPhase = null, cycle = 0, invuln = 0, gameOver = false, finalDrop = false;
const enemies = [], shots = [], queue = [], gems = [], hostile = [];
const dir = { x: 0, y: -1 }, beamDir = { x: 0, y: -1 }; // last move direction; beam eases toward it
const pickups = [], tracks = new Map();
let kills = 0, elites = 0, dashCooldown = 0, dashTime = 0, lastHud = 0;
let dashDir = { x: 0, y: -1 };
let volume = .55; try { const v = Number(store?.getItem('grn-volume')); if (store?.getItem('grn-volume') !== null && Number.isFinite(v)) volume = Math.max(0, Math.min(1, v)); } catch {}
const buff = { stutter: 0, double: 0, sweep: 0, magnet: 0, bomb: false }; // seconds left
let keyStep = 0;
let bon = bonuses({}), rerolls = 0, revive = false; // meta-shop buffs for this run
const spec = new Uint8Array(64); // live spectrum, refreshed each frame
const specAt = a => spec[Math.floor(((a + Math.PI) / (2 * Math.PI)) * 32) % 32]; // angle → bin of the low half
function track(name) {
  if (!tracks.has(name)) {
    const channel = createAudio(ac, audio.master); channel.master.gain.value = 0.8;
    channel.setFx({ ...Object.fromEntries(effectsFor(progress, name)), duck: stats(progress, name).duck }, ac.currentTime);
    channel.detune(1 - run.harmony); channel.setTempo(clock.bpm(), ac.currentTime);
    channel.setFilter(picking ? .25 : lastPhase === 'drop' ? 1 : .35, ac.currentTime);
    tracks.set(name, channel);
  }
  return tracks.get(name);
}
function filterAll(value, time) { audio.setFilter(value, time); for (const ch of tracks.values()) ch.setFilter(value, time); }
function detuneAll() { for (const ch of tracks.values()) ch.detune(1 - run.harmony); }
function notify(text) {
  const el = document.getElementById('notice'); el.textContent = text;
  el.classList.add('show'); clearTimeout(notify.timer); notify.timer = setTimeout(() => el.classList.remove('show'), 3200);
}
function powerup(type) {
  notify({ stutter: 'STUTTER · enemies frozen for one bar', double: 'DOUBLE TIME · attacks repeat', bomb: 'DROP BOMB · clears the screen on the next beat', magnet: 'MAGNET · collect the whole floor', sweep: 'FILTER SWEEP · hits slow enemies', encore: 'ENCORE · +25% harmony' }[type]);
  const bar = 16 * clock.stepDur(), now = ac.currentTime;
  if (type === 'stutter') buff.stutter = bar;
  else if (type === 'double') buff.double = 4 * bar;
  else if (type === 'bomb') buff.bomb = true;
  else if (type === 'magnet') buff.magnet = 1;
  else if (type === 'sweep') { buff.sweep = 4 * bar; for (let k = 0; k <= 8; k++) filterAll(0.15 + 0.85 * k / 8, now + k * bar / 2); }
  else { run.harmony = Math.min(1, run.harmony + 0.25); detuneAll(); audio.play('pad', keyScale()[0] + 12, now, { dur: 2, vel: 0.4 }); }
}

function onPhase(phase, time) {
  if (lastPhase === 'drop') { run.drops++; if (finalDrop && !run.over) { run.won = true; endRun(); return; } }
  if (phase === 'breakdown') {
    enemies.push(...spawnWave('breakdown', cycle, ...view()));
    filterAll(0.2, time);
  } else if (phase === 'build') {
    enemies.push(...spawnWave('build', cycle, ...view()));
    audio.riser(time, clock.stepDur() * 64);
  } else {
    keyStep++; setKey(2 * keyStep);
    if (cycle > 0 && cycle % 2 === 0) { enemies.push(makeElite(cycle, ...view())); notify('ELITE INCOMING · break its signal for a supply drop'); }
    if (finalDrop) enemies.push(...spawnWave('drop', cycle, ...view()), ...spawnWave('drop', cycle, ...view()));
    if (!still) cam.punch = 0.15;
    for (const e of enemies) e.held = false;
    filterAll(1, time);
  }
}

function onStep(step, time, dur) {
  const s = step % 16, bar = Math.floor(step / 16);
  if (picking && s === 0) pickBars++; // game bars freeze while picking; music bars keep going
  const p = phaseAt(bar - pickBars), phase = p.name;
  if (picking) { playVoices(s, bar, phase, dur, time); return; }
  cycle = p.cycle;
  if (phase !== lastPhase) { onPhase(phase, time); lastPhase = phase; }
  if (gameOver) return;
  if (s === 0) enemies.push(...spawnReinforcements(phase, cycle, enemies.length, ...view()));
  if (phase === 'build') {
    const b = p.barInPhase;
    if (b === 3 && s === 0) { clock.setBpm(bpmAt(run.elapsed)); audio.setTempo(bpmAt(run.elapsed), time + 16 * dur); for (const ch of tracks.values()) ch.setTempo(bpmAt(run.elapsed), time + 16 * dur); finalDrop = run.elapsed >= RUN_SECONDS; } // lands on the drop's first bar
    if (s % (b < 2 ? 4 : b === 2 ? 2 : 1) === 0) audio.snare(time);
    filterAll(0.2 + 0.8 * (b * 16 + s) / 64, time);
  }
  for (const [v, level, name] of playVoices(s, bar, phase, dur, time)) queue.push({ time, v, level, name, step: s });
  if (buff.bomb && s % 4 === 0) { // drop bomb goes off on the next kick: clears the screen
    buff.bomb = false; d.kickFlash(); if (!still) cam.punch = 0.2;
    const [vw, vh, ox, oy] = view();
    for (const e of enemies) if (e.x > ox && e.x < ox + vw && e.y > oy && e.y < oy + vh) e.hp = 0;
  }
}

function playVoices(s, bar, phase, dur, time) {
  const fired = [];
  if (buff.stutter > 0 && s % 2) return fired; // stutter: 1/8 gate
  if (s % 4 === 0) for (const name of progress.voices.keys()) if (name !== 'kick') track(name).duckAt(time);
  for (const [name, level] of progress.voices) {
    const v = voiceDef(name, progress);
    if (!v.pattern(level)[s]) continue;
    const channel = track(name);
    if (name === 'kick') channel.kick(time, v.patch === 'hardkick');
    else channel.play(v.patch, v.note(s, bar, level), time, { dur: name === 'pad' ? dur * 16 : dur, vel: 0.3 * (phase === 'drop' ? 1 : 0.4) });
    fired.push([v, level, name]);
  }
  return fired;
}

function fire(o) {
  const { v, level, step } = o, st = stats(progress, o.name), x = player.x, y = player.y;
  if (buff.double > 0 && !o.echo) { queue.push({ ...o, time: o.time + clock.stepDur(), echo: true }); queue.sort((p, q) => p.time - q.time); }
  const dmg = bon.damage * v.damage(level) * (st.damage + (lastPhase === 'drop' ? st.kickBonus : 0)) * (o.mult || 1);
  const shot = (vx, vy, life, kind, fx) => shots.push({ x, y, vx, vy, dmg: dmg * (['ring', 'beam', 'field', 'spectrum'].includes(kind) ? 1 + .25 * st.extraShots : 1), life, kind, level, area: st.area, range: st.speed, ...fx });
  const fan = (vx, vy, life, kind, fx) => { // projectiles: velocity scaled, extra copies at ±12°, ±24°...
    for (let k = 0; k <= st.extraShots; k++) {
      const a = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 15, c = Math.cos(a), sn = Math.sin(a);
      shot((vx * c - vy * sn) * st.speed, (vx * sn + vy * c) * st.speed, life, kind, fx);
    }
  };
  const W = v.weapon;
  if ((st.echo || W === 'acidBolt') && !o.echo) { queue.push({ ...o, time: o.time + 2 * clock.stepDur(), mult: st.echo || 0.5, echo: true }); queue.sort((p, q) => p.time - q.time); }
  if ((W === 'ring' || W === 'shatterRing') && lastPhase === 'drop' && !o.echo) d.kickFlash();
  const aim = speed => {
    let t = null, d = Infinity;
    for (const e of enemies) { const q = (e.x - x) ** 2 + (e.y - y) ** 2; if (q < d) { d = q; t = e; } }
    const dx = t ? t.x - x : dir.x, dy = t ? t.y - y : dir.y, n = Math.hypot(dx, dy) || 1;
    return [dx / n * speed, dy / n * speed];
  };
  // evolved weapons are the base kind plus a flag: curve, shatter, wide, wash, homing
  if (W === 'bolt' || W === 'acidBolt') fan(...aim(600), 0.8, 'bolt', { curve: W === 'acidBolt' });
  else if (W === 'pierce') fan(...aim(250), 2, 'pierce');
  else if (W === 'beam' || W === 'hooverBeam') shot(beamDir.x, beamDir.y, 0.1, 'beam', { wide: W === 'hooverBeam' }); // vx,vy = unit heading
  else if (W === 'spark' || W === 'homingSpark') for (let i = 0; i < 8; i++) fan(Math.cos(i * Math.PI / 4) * 400, Math.sin(i * Math.PI / 4) * 400, 0.3, 'spark', { homing: W === 'homingSpark' });
  else if (W === 'ring' || W === 'shatterRing') shot(0, 0, 0.25, 'ring', { shatter: W === 'shatterRing' }); // centred on player
  else if (W === 'spectrum') shot(0, 0, 0.15, 'spectrum'); // spikes = live spectrum, centred on player
  else shot(0, 0, 1, 'field', { wash: W === 'washField' });
}

const fieldR = s => 120 * s.area * s.range * (s.wash ? 2 : 1);
const ringR = s => (20 + (0.25 - s.life) * 400) * s.area * s.range;
function damage(s, e, dt) {
  const dx = e.x - s.x, dy = e.y - s.y, d = Math.hypot(dx, dy);
  if (s.kind === 'field') { if (d < fieldR(s)) { e.slow = 0.5; e.hp -= s.dmg * dt; if (s.wash) e.frozen = 1; } return; }
  if (s.kind === 'spectrum') {
    if (!s.hit?.has(e) && d < (30 + specAt(Math.atan2(dy, dx)) * 0.5) * s.area * s.range + e.r) { e.hp -= s.dmg; (s.hit ||= new Set()).add(e); }
    return;
  }
  if (s.kind === 'beam') {
    const along = Math.max(0, Math.min(300 * s.area * s.range, dx * s.vx + dy * s.vy));
    if (Math.hypot(dx - s.vx * along, dy - s.vy * along) < e.r * (s.wide ? 3 : 1)) e.hp -= s.dmg * dt * 10; // ~dmg over its 0.1s life
    return;
  }
  if (s.life <= 0 || s.hit?.has(e)) return;
  if (!(s.kind === 'ring' ? ringTouches(d, ringR(s), ringR({ ...s, life: s.previousLife ?? s.life }), e.r) : segmentDistance(e.x, e.y, s.px ?? s.x, s.py ?? s.y, s.x, s.y) < e.r + 3 * s.area)) return;
  e.hp -= s.dmg;
  if (buff.sweep > 0) e.sweepT = 2;
  if (s.kind === 'bolt' || s.kind === 'spark') s.life = 0; else (s.hit ||= new Set()).add(e); // ring/pierce: once per enemy
}

function updateShots(dt) {
  while (queue.length && ac.currentTime >= queue[0].time) fire(queue.shift());
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; s.previousLife = s.life; s.px = s.x; s.py = s.y; s.life -= dt;
    if (s.life <= 0) {
      shots.splice(i, 1);
      if (s.shatter) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, r = ringR({ life: 0, area: s.area, range: s.range }); shots.push({ ...s, shatter: false, kind: 'spark', life: 0.3, x: s.x + Math.cos(a) * r, y: s.y + Math.sin(a) * r, vx: Math.cos(a) * 400, vy: Math.sin(a) * 400, px: undefined, py: undefined, hit: null }); }
      continue;
    }
    if (s.curve || s.homing) { // acid: spiral at 180°/s; shaker: turn toward nearest enemy at up to 360°/s
      let turn = Math.PI * dt;
      if (s.homing) {
        let t = null, best = Infinity;
        for (const e of enemies) { const q = (e.x - s.x) ** 2 + (e.y - s.y) ** 2; if (q < best) { best = q; t = e; } }
        if (!t) turn = 0;
        else { const diff = Math.atan2(t.y - s.y, t.x - s.x) - Math.atan2(s.vy, s.vx), wrap = Math.atan2(Math.sin(diff), Math.cos(diff)); turn = Math.max(-2 * Math.PI * dt, Math.min(2 * Math.PI * dt, wrap)); }
      }
      const c = Math.cos(turn), sn = Math.sin(turn), vx = s.vx; s.vx = vx * c - s.vy * sn; s.vy = vx * sn + s.vy * c;
    }
    if (s.kind === 'beam' || s.kind === 'ring' || s.kind === 'field' || s.kind === 'spectrum') { s.x = player.x; s.y = player.y; }
    else { s.x += s.vx * dt; s.y += s.vy * dt; }
    if (s.kind === 'beam') {
      const a = s.wide ? Math.PI / 6 * Math.sin(run.elapsed * 4) : 0, c = Math.cos(a), sn = Math.sin(a); // hoover sweeps ±30°
      s.vx = beamDir.x * c - beamDir.y * sn; s.vy = beamDir.x * sn + beamDir.y * c;
    }
  }
}

function hurt() {
  if (invuln > 0 || dashTime > 0 || gameOver) return;
  invuln = 1;
  let over = run.hit(0.1 / bon.harmony); // headroom: more max harmony = smaller hits
  if (over && revive) { revive = false; over = false; run.over = false; run.harmony = 0.5; if (!still) cam.punch = 0.2; d.kickFlash(); } // second encore
  detuneAll();
  if (over) endRun();
}

function endRun() {
  if (gameOver) return;
  clearInput();
  clock.stop(); picking = false; levelup.hidden = true; audio.master.gain.cancelScheduledValues(ac.currentTime); audio.master.gain.setValueAtTime(audio.master.gain.value, ac.currentTime); audio.master.gain.linearRampToValueAtTime(0, ac.currentTime + 0.1); gameOver = true; endedAt = performance.now(); showResults();
}

const mmss = s => { s = Math.floor(s); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

function showResults() {
  const fresh = checkUnlocks(data, { seconds: run.elapsed, won: run.won, evolved: progress.evolved.size });
  const earned = vinylFor({ seconds: run.elapsed, drops: run.drops, won: run.won });
  data.unlocked.push(...fresh); data.best = Math.max(data.best, Math.floor(run.elapsed)); data.vinyl += earned; save(store, data);
  results.replaceChildren();
  const add = (tag, text) => results.append(Object.assign(document.createElement(tag), { textContent: text }));
  add('h2', run.won ? 'set complete' : 'harmony lost');
  add('p', 'time survived: ' + mmss(run.elapsed)); add('p', 'level: ' + progress.level); add('p', 'best: ' + mmss(data.best));
  if (fresh.length) add('p', 'unlocked: ' + fresh.join(', '));
  add('p', `${kills} enemies cleared · ${elites} elites defeated`);
  add('p', 'vinyl +' + earned);
  const shop = document.createElement('div'); shop.id = 'shop'; results.append(shop); renderShop();
  const againButton = document.createElement('button'); againButton.className = 'primary'; againButton.textContent = 'Play another set'; againButton.onclick = reset; results.append(againButton);
  againButton.focus();
  results.hidden = false;
}

function renderShop() { // buttons buy ranks; opening-track owners also pick their starting voice
  const shop = document.getElementById('shop'); shop.replaceChildren();
  const btn = (text, on, disabled) => shop.append(Object.assign(document.createElement('button'), { type: 'button', className: 'buy', textContent: text, disabled, onclick: on }));
  shop.append(Object.assign(document.createElement('h3'), { textContent: 'shop · ' + data.vinyl + ' vinyl' }));
  for (const [k, it] of Object.entries(SHOP)) {
    const rank = data.ranks[k] || 0, maxed = rank >= it.max;
    btn(k + ' ' + rank + '/' + it.max + ' · ' + it.label + (maxed ? '' : ' · ' + cost(k, rank)), () => { if (buy(data, k)) { save(store, data); renderShop(); } }, maxed || data.vinyl < cost(k, rank));
  }
  for (const v of data.unlocked) btn((data.start === v ? '▶ ' : '') + 'start with ' + v, () => { data.start = v; save(store, data); renderShop(); }, false);
}

function updateEnemies(dt) {
  for (const e of enemies) { e.sweepT = Math.max(0, (e.sweepT || 0) - dt); e.slow = e.sweepT > 0 ? .5 : 1; }
  for (const s of shots) for (const e of enemies) damage(s, e, dt);
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i], def = ENEMIES[e.type];
    if (e.hp <= 0) {
      enemies.splice(i, 1);
      d.burst(e.x, e.y, still ? 4 : 8);
      kills++;
      if (e.elite) { elites++; pickups.push({ x: e.x, y: e.y, type: 'encore' }, { x: e.x + 28, y: e.y, type: 'magnet' }); notify('ELITE CLEARED · collect your supplies'); }
      else if (kills % 12 === 0) pickups.push({ x: e.x, y: e.y, type: rollPowerup(Math.random) });
      gems.push({ x: e.x, y: e.y, xp: e.xp });
      def.onDeath?.(e, (type, x, y) => enemies.push({ ...makeEnemy(type, x, y, cycle), xp: 2 })); // splitter children
      continue;
    }
    if (!(buff.stutter > 0)) hostile.push(...advanceEnemy(e, player, dt));
    recycleEnemy(e, ...view());
    if (!e.held && Math.hypot(e.x - player.x, e.y - player.y) < e.r + player.r) hurt();
    if (gameOver) return;
  }
  for (let i = hostile.length - 1; i >= 0; i--) {
    const b = hostile[i]; if (buff.stutter > 0) continue;
    const px = b.x, py = b.y; b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (segmentDistance(player.x, player.y, px, py, b.x, b.y) < player.r + (b.r || 3)) { hurt(); b.life = 0; }
    if (b.life <= 0) hostile.splice(i, 1);
    if (gameOver) return;
  }
  for (let i = pickups.length - 1; i >= 0; i--) if (Math.hypot(pickups[i].x - player.x, pickups[i].y - player.y) < player.r + 12) powerup(pickups.splice(i, 1)[0].type);
  const magnet = buff.magnet > 0 ? Infinity : (lastPhase === 'breakdown' ? 260 : 130) * bon.magnet;
  for (let i = gems.length - 1; i >= 0; i--) {
    const q = gems[i], dx = player.x - q.x, dy = player.y - q.y, dist = Math.hypot(dx, dy);
    if (dist < player.r + 4) { levelsPending += gainXp(progress, q.xp); gems.splice(i, 1); }
    else if (dist > 3 * Math.max(w, h)) gems.splice(i, 1); // far behind: drop it so gems can't pile up
    else if (dist < magnet) { const step = Math.min(dist, 480 * dt); q.x += dx / dist * step; q.y += dy / dist * step; }
  }
}

function drawShots() {
  for (const s of shots) {
    g.beginPath();
    const echo = s.level >= 3; // voice level 3+ adds a visual layer
    if (s.kind === 'ring') { g.arc(s.x, s.y, ringR(s), 0, 2 * Math.PI); if (echo) { const m = (20 + s.life * 400) * s.area * s.range; g.moveTo(s.x + m, s.y); g.arc(s.x, s.y, m, 0, 2 * Math.PI); } } // mirrored: contracts as the first expands
    else if (s.kind === 'field') { g.globalAlpha = s.life * 0.4; g.arc(s.x, s.y, fieldR(s), 0, 2 * Math.PI); }
    else if (s.kind === 'spectrum') for (let k = 0; k < 32; k++) { const a = -Math.PI + (k + 0.5) * Math.PI / 16, L = (30 + specAt(a) * 0.5) * s.area * s.range; g.moveTo(s.x + Math.cos(a) * 14, s.y + Math.sin(a) * 14); g.lineTo(s.x + Math.cos(a) * L, s.y + Math.sin(a) * L); }
    else if (s.kind === 'beam') { g.moveTo(s.x, s.y); g.lineTo(s.x + s.vx * 300 * s.area * s.range, s.y + s.vy * 300 * s.area * s.range); if (echo) { const ex = s.x - s.vy * 6, ey = s.y + s.vx * 6; g.moveTo(ex, ey); g.lineTo(ex + s.vx * 300 * s.area * s.range, ey + s.vy * 300 * s.area * s.range); } }
    else { const k = s.kind === 'pierce' ? 0.06 : s.kind === 'bolt' && echo ? 0.06 : 0.02; g.moveTo(s.x, s.y); g.lineTo(s.x - s.vx * k, s.y - s.vy * k); }
    if (s.wide) g.lineWidth = 9;
    g.stroke(); g.globalAlpha = 1; g.lineWidth = 3;
  }
}

const PICK_MARK = { stutter: '‖', double: '×2', bomb: '✱', magnet: 'U', sweep: '~', encore: '+' };
function drawObjects(t) {
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 16px monospace'; g.lineWidth = 2;
  g.globalAlpha = 1; g.shadowBlur = d.glow ? 12 : 0;
  g.strokeStyle = g.shadowColor = g.fillStyle = '#f4d88b';
  for (const q of pickups) { g.save(); g.translate(q.x, q.y); g.rotate(t); g.strokeRect(-11, -11, 22, 22); g.restore(); g.fillText(PICK_MARK[q.type], q.x, q.y + 1); }
  g.lineWidth = 2;
}

function drawWorld(t) {
  g.shadowBlur = d.glow ? 16 : 0; g.shadowColor = g.strokeStyle = g.fillStyle = A;
  for (const e of enemies) {
    g.strokeStyle = g.fillStyle = g.shadowColor = ENEMY_COLORS[e.type];
    g.lineWidth = e.elite ? 3 : 2;
    if (e.telegraph > 0) {
      g.save(); g.globalAlpha = .5; g.shadowBlur = 0; g.setLineDash([5, 8]);
      g.beginPath();
      if (e.type === 'sentinel') g.arc(e.x, e.y, e.r + 30 * (1 - e.telegraph), 0, Math.PI * 2);
      else { g.moveTo(e.x, e.y); g.lineTo(e.x + Math.cos(e.aim) * (e.type === 'pulser' ? 200 : 290), e.y + Math.sin(e.aim) * (e.type === 'pulser' ? 200 : 290)); }
      g.stroke(); g.restore();
    }
    ENEMIES[e.type].draw(g, e, t);
    if (e.elite) { g.fillStyle = '#293947'; g.fillRect(e.x - 24, e.y - e.r - 12, 48, 4); g.fillStyle = '#ffc67d'; g.fillRect(e.x - 24, e.y - e.r - 12, 48 * Math.max(0, e.hp / e.maxHp), 4); }
  }
  g.lineWidth = 2; g.fillStyle = g.shadowColor = '#ffbe8c';
  for (const b of hostile) { g.beginPath(); g.arc(b.x, b.y, b.r || 3, 0, 2 * Math.PI); g.fill(); }
  g.shadowColor = g.strokeStyle = g.fillStyle = P;
  for (const q of gems) { g.beginPath(); g.moveTo(q.x, q.y - 4); g.lineTo(q.x + 4, q.y); g.lineTo(q.x, q.y + 4); g.lineTo(q.x - 4, q.y); g.closePath(); g.fill(); }
}

function size() { const d = Math.min(2, devicePixelRatio || 1); w = c.clientWidth; h = c.clientHeight; c.width = w * d; c.height = h * d; g.setTransform(d, 0, 0, d, 0, 0); g.fillStyle = '#07101c'; g.fillRect(0, 0, w, h); }
addEventListener('resize', size); size();

function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
  if (levelsPending > 0 && !picking && !paused && !gameOver) openPick();
  if (!paused && !gameOver) clock.tick(); // music keeps going while picking
  const live = !paused && !gameOver && !picking;
  if (live) {
    run.elapsed += dt;
    for (const k of ['stutter', 'double', 'sweep', 'magnet']) buff[k] = Math.max(0, buff[k] - dt);
    const m = readMove();
    dashCooldown = Math.max(0, dashCooldown - dt); dashTime = Math.max(0, dashTime - dt);
    if (takeDash() && dashCooldown === 0) { dashTime = .2; dashCooldown = 3; const n = Math.hypot(m.x, m.y); dashDir = n ? { x: m.x / n, y: m.y / n } : { ...dir }; invuln = Math.max(invuln, .25); d.burst(player.x, player.y, 10); }

    if (m.x || m.y) { const n = Math.hypot(m.x, m.y); dir.x = m.x / n; dir.y = m.y / n; }
    const k = 1 - Math.exp(-dt * 6); beamDir.x += (dir.x - beamDir.x) * k; beamDir.y += (dir.y - beamDir.y) * k;
    const bn = Math.hypot(beamDir.x, beamDir.y) || 1; beamDir.x /= bn; beamDir.y /= bn;
    player.vx = dashTime > 0 ? dashDir.x * 850 : m.x * player.speed;
    player.vy = dashTime > 0 ? dashDir.y * 850 : m.y * player.speed;
    player.x += player.vx * dt; player.y += player.vy * dt;
    invuln -= dt;
    updateShots(dt); updateEnemies(dt);
    // camera: follow with lead toward heading, zoom out as the swarm grows, punch in on drops
    const ck = 1 - Math.exp(-dt * 4), lead = 60;
    cam.x += (player.x + dir.x * lead - cam.x) * ck; cam.y += (player.y + dir.y * lead - cam.y) * ck;
    cam.punch = Math.max(0, cam.punch - dt * 0.5);
    cam.z += (1 - Math.min(0.3, enemies.length / 1000) + cam.punch - cam.z) * ck;
  }
  d.fade();
  audio.analyser.getByteFrequencyData(spec);
  const pos = clock.position();
  d.background(t / 1000, lastPhase, Math.floor(pos.bar / 2) % 4, 1 - pos.beatFrac, (player.x - cam.x) * cam.z + w / 2, (player.y - cam.y) * cam.z + h / 2); // pulse 1 on each beat (kick step), decays over the beat
  const r = player.r;
  g.save(); g.translate(w / 2, h / 2); g.scale(cam.z, cam.z); g.translate(-cam.x, -cam.y);
  const [vw, vh, ox, oy] = view(), cell = 80; // world grid shows movement; spectrum floor comes later
  g.shadowBlur = 0; g.strokeStyle = GRID; g.lineWidth = 1;
  for (let x = Math.floor(ox / cell) * cell; x < ox + vw; x += cell) { // spectrum floor: each column lit by one bin
    g.globalAlpha = 0.05 + spec[((Math.round(x / cell) % 32) + 32) % 32] / 255 * 0.12; g.beginPath(); g.moveTo(x, oy); g.lineTo(x, oy + vh); g.stroke();
  }
  g.globalAlpha = 0.12 + 0.03 * (1 - pos.beatFrac); g.beginPath();
  for (let y = Math.floor(oy / cell) * cell; y < oy + vh; y += cell) { g.moveTo(ox, y); g.lineTo(ox + vw, y); }
  g.stroke(); g.globalAlpha = 1;
  drawObjects(t / 1000, pos);
  g.shadowColor = P; g.shadowBlur = 16; g.fillStyle = P; g.strokeStyle = P; g.lineWidth = 3;
  g.globalAlpha = invuln > 0 && !still && Math.floor(t / 80) % 2 ? 0.3 : 1; // blink while invulnerable
  g.beginPath(); g.moveTo(player.x, player.y - r); g.lineTo(player.x + r, player.y); g.lineTo(player.x, player.y + r); g.lineTo(player.x - r, player.y); g.fill();
  g.globalAlpha = 1;
  drawShots(); drawWorld(t / 1000); d.particles(live ? dt : 0);
  g.shadowBlur = 16; g.strokeStyle = P;
  g.beginPath(); g.arc(player.x, player.y, r + 10, -Math.PI / 2, -Math.PI / 2 + run.harmony * 2 * Math.PI); g.stroke();
  g.restore();
  g.shadowBlur = 0; g.fillStyle = P;
  g.fillRect(0, 0, w * progress.xp / xpToNext(progress.level), 3); // xp bar
  if (t - lastHud > 100) { renderHud(); lastHud = t; }
}

function reset() {
  for (const a of [enemies, shots, queue, gems, hostile, pickups]) a.length = 0;
  keyStep = 0; setKey(0); Object.assign(buff, { stutter: 0, double: 0, sweep: 0, magnet: 0, bomb: false });
  d.clear(); d.setHue(0); audio.master.gain.cancelScheduledValues(ac.currentTime); audio.master.gain.setValueAtTime(volume, ac.currentTime); audio.newRun(); audio.setFx({}, ac.currentTime);
  for (const ch of tracks.values()) ch.dispose(); tracks.clear();
  run = createRun();
  progress = createProgress(data.unlocked, data.start || 'kick');
  bon = bonuses(data.ranks);
  if (bon.opening) progress.voices.set(data.start === 'kick' ? 'arp' : 'kick', 1);
  rerolls = 1 + bon.rerolls; revive = bon.revive; player.speed = 240 * bon.speed;
  levelsPending = 0; audio.detune(0); kills = elites = dashCooldown = dashTime = 0;
  paused = false; pauseEl.hidden = true; levelup.inert = false; clearInput(); ac.resume();
  dir.x = beamDir.x = 0; dir.y = beamDir.y = -1; player.vx = player.vy = 0;
  document.activeElement?.blur();

  lastPhase = null; cycle = 0; picking = false; pickBars = 0; levelup.hidden = true; invuln = 0; gameOver = false; finalDrop = false; results.hidden = true;
  player.x = player.y = 0; cam.x = cam.y = 0; cam.z = 1; cam.punch = 0;
  clock.start(); renderLoadout(); renderHud();
  notify('SURVIVE THE SET · collect diamonds to build your sound');
}

function begin() {
  if (start.hidden) return;
  ac = new AudioContext(); ac.resume(); audio = createAudio(ac);
  clock = createClock(ac, onStep); reset();
  start.hidden = true; hud.hidden = false; document.getElementById('toolbar').hidden = false;
  requestAnimationFrame(frame);
}
document.getElementById('play').addEventListener('click', begin);

const togglePause = () => {
  if (!run || gameOver) return;
  clearInput(); document.activeElement?.blur();
  paused = !paused; pauseEl.hidden = !paused; levelup.inert = paused;
  if (paused) { ac.suspend(); document.getElementById('resume').focus(); }
  else { ac.resume(); if (picking) cardsEl.querySelector('button')?.focus(); }
};
onPause(togglePause);
document.addEventListener('visibilitychange', () => { if (document.hidden && !paused) togglePause(); });

const DESCRIPTIONS = {
  kick: 'Beat-driven shockwaves. Protects your close range.', arp: 'Rapid bolts that seek the nearest enemy.', bass: 'Heavy pulses pierce through a crowd.', lead: 'A focused beam follows your movement.', pad: 'A sustained field slows nearby enemies.', hats: 'Eight-way sparks cover your flanks.', analyzer: 'Live spectrum spikes turn sound into damage.',
  acid: 'Spiraling bolts with a built-in echo.', hardkick: 'Shockwaves shatter into eight sparks.', rolling: 'Piercing bass fires every sixteenth note.', hoover: 'A wide beam sweeps across your path.', wash: 'Double-size field freezes enemies.', shaker: 'Sparks bend toward their targets.',
  reverb: '+15% weapon area per rank. Adds a reverb tail.', delay: 'Repeats attacks at 40–80% damage. Adds a synced echo.', distortion: '+10% damage per rank. Saturates this voice.', unison: 'Up to 3 extra projectiles; pulses and beams gain 25% strength per layer.', filter: '+12% projectile speed and weapon reach per rank. Opens the filter.', sidechain: '+15% damage during drops per rank. Pumps this voice to the beat.',
};
const KIND = { voice: 'NEW INSTRUMENT', voiceUp: 'VOICE UPGRADE', fx: 'INSERT EFFECT', fxUp: 'EFFECT UPGRADE', evolve: 'EVOLUTION', heal: 'RECOVERY' };
function cardHtml(c, i) {
  if (c.kind === 'heal') return `<span class="card-type">RECOVERY · ${i + 1}</span><b>Restore harmony</b><p>Recover 20% health and bring your instruments back into tune.</p><span class="card-foot">+20% harmony</span>`;
  const target = c.target ? `<span class="target">${c.target.toUpperCase()} CHANNEL</span>` : '';
  const evo = EVOLUTIONS[c.target || c.name];
  const hint = c.kind === 'evolve' ? DESCRIPTIONS[c.to] : DESCRIPTIONS[c.name];
  const recipe = evo && (c.name === evo.fx || c.kind === 'voiceUp') ? `<small>Evolution: ${c.target || c.name} V + ${evo.fx} → ${evo.to}</small>` : '';
  return `<span class="card-type">${KIND[c.kind]} · ${i + 1}</span>${target}<b>${c.kind === 'evolve' ? c.to : c.name}</b><p>${hint}</p>${recipe}<span class="card-foot">${c.kind === 'evolve' ? 'Transform your voice' : `Rank ${c.from} → ${c.to}`}</span>`;
}
function openPick() {
  picking = true; queue.length = 0; clearInput();
  cards = rollChoices(progress, Math.random, run.harmony);
  cardsEl.innerHTML = cards.map((c, i) => `<button class="card ${c.kind === 'evolve' ? 'evolution' : ''}" type="button" data-i="${i}">${cardHtml(c, i)}</button>`).join('');
  document.getElementById('pick-level').textContent = `LEVEL ${progress.level} · SHAPE YOUR SOUND`;
  document.getElementById('reroll').textContent = `Reroll · ${rerolls} left [R]`;
  document.getElementById('reroll').disabled = rerolls <= 0;
  levelup.hidden = false; filterAll(.25, ac.currentTime);
  cardsEl.querySelector('button').focus();
}
function choose(i) {
  const choice = cards[i];
  if (!picking || paused || gameOver || !choice) return;
  if (choice.kind === 'heal') { run.harmony = Math.min(1, run.harmony + .2); detuneAll(); }
  else applyChoice(progress, choice);
  if (choice.kind === 'evolve') { audio.riser(ac.currentTime, clock.stepDur() * 16); d.kickFlash(); }
  for (const name of progress.voices.keys()) track(name).setFx({ ...Object.fromEntries(effectsFor(progress, name)), duck: stats(progress, name).duck }, ac.currentTime);
  levelsPending--; picking = false; levelup.hidden = true; clearInput(); document.activeElement?.blur();
  invuln = Math.max(invuln, .6);
  filterAll(lastPhase === 'drop' ? 1 : .35, ac.currentTime); renderLoadout(); renderHud();
  if (levelsPending > 0) openPick();
}
const reroll = () => { if (picking && !paused && rerolls > 0) { rerolls--; openPick(); } };
cardsEl.addEventListener('click', e => { const b = e.target.closest('.card'); if (b) choose(+b.dataset.i); });
document.getElementById('reroll').onclick = reroll;
document.getElementById('resume').onclick = togglePause;
document.getElementById('pause-button').onclick = togglePause;
document.getElementById('dash-button').addEventListener('pointerdown', e => { e.preventDefault(); if (!paused && !picking && !gameOver) requestDash(); });
addEventListener('keydown', e => {
  if (e.target.matches?.('input, select')) return;
  if (!e.repeat && e.key >= '1' && e.key <= '3') choose(e.key - 1);
  if (!e.repeat && e.key.toLowerCase() === 'r') reroll();
});
function renderLoadout() {
  document.getElementById('loadout').innerHTML = [...progress.voices].map(([name, lv]) => {
    const fx = [...effectsFor(progress, name)].map(([n, l]) => `${n} ${l}`).join(' · ');
    return `<div class="track"><span class="track-name">${progress.evolved.has(name) ? EVOLUTIONS[name].to : name}<b>${'▰'.repeat(lv)}${'▱'.repeat(5 - lv)}</b></span><small>${fx || 'No effects · customize at level up'}</small></div>`;
  }).join('');
}
function renderHud() {
  document.getElementById('timer').textContent = mmss(run.elapsed);
  document.getElementById('tempo').textContent = `${clock.bpm()} BPM`;
  document.getElementById('phase').textContent = finalDrop ? 'FINAL DROP' : (lastPhase || 'breakdown').toUpperCase();
  document.getElementById('stage').textContent = `SET ${cycle + 1} / LEVEL ${progress.level}`;
  document.getElementById('health-value').textContent = `${Math.ceil(run.harmony * 100)}%`;
  document.getElementById('health-fill').style.width = `${run.harmony * 100}%`;
  document.getElementById('health-fill').classList.toggle('low', run.harmony < .3);
  document.getElementById('xp-fill').style.width = `${progress.xp / xpToNext(progress.level) * 100}%`;
  document.getElementById('xp-value').textContent = `${progress.xp} / ${xpToNext(progress.level)} XP`;
  document.getElementById('kills').textContent = `${kills} CLEARED`;
  document.getElementById('dash-button').textContent = dashCooldown > 0 ? `DASH ${dashCooldown.toFixed(1)}s` : 'DASH';
  document.getElementById('dash-button').disabled = dashCooldown > 0 || paused || picking || gameOver;
  document.getElementById('buffs').textContent = Object.entries(buff).filter(([, v]) => v > 0).map(([k, v]) => `${k.toUpperCase()} ${typeof v === 'number' ? v.toFixed(0) + 's' : 'READY'}`).join(' · ');
}
for (const slider of document.querySelectorAll('[data-volume]')) {
  slider.value = Math.round(volume * 100);
  slider.addEventListener('input', () => {
    volume = Number(slider.value) / 100;
    for (const other of document.querySelectorAll('[data-volume]')) other.value = slider.value;
    if (audio && !gameOver) audio.master.gain.setTargetAtTime(volume, ac.currentTime, .03);
    try { store?.setItem('grn-volume', String(volume)); } catch {}
  });
}
const starters = document.getElementById('starters');
function renderStarters() {
  starters.replaceChildren();
  for (const name of data.unlocked) {
    const button = document.createElement('button'); button.className = 'starter'; button.textContent = name;
    button.setAttribute('aria-pressed', String(data.start === name));
    button.onclick = () => { data.start = name; save(store, data); renderStarters(); };
    starters.append(button);
  }
}
renderStarters();

// Keep keyboard navigation inside the currently open dialog.
addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const panel = !pauseEl.hidden ? pauseEl : !levelup.hidden ? levelup : !results.hidden ? results : !start.hidden ? start : null;
  if (!panel) return;
  const focusable = [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
  if (!focusable.length) return;
  const first = focusable[0], last = focusable.at(-1), active = document.activeElement;
  if (e.shiftKey && (active === first || !panel.contains(active))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (active === last || !panel.contains(active))) { e.preventDefault(); first.focus(); }
});
