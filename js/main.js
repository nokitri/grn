import { createClock, setKey, keyScale } from './clock.js';
import { createRun, phaseAt, bpmAt, RUN_SECONDS } from './phase.js';
import { createAudio } from './audio.js';
import { voiceDef } from './voices.js';
import { createProgress, gainXp, xpToNext, rollChoices, applyChoice, stats } from './upgrades.js';
import { ENEMIES, spawnWave, spawnReinforcements, recycleEnemy, makeEnemy } from './enemies.js';
import { readMove, onPause } from './input.js';
import { load, save, checkUnlocks } from './save.js';
import { createDraw } from './draw.js';
import { SHOP, cost, buy, vinylFor, bonuses } from './shop.js';
import { CHUNK, chunkObjects, pillarUp, pushOut, rollPowerup } from './world.js';
const c = document.getElementById('game'), g = c.getContext('2d'), d = createDraw(g);
const start = document.getElementById('start'), pauseEl = document.getElementById('pause'), results = document.getElementById('results'), hud = document.getElementById('hud');
const levelup = document.getElementById('levelup'), cardsEl = document.getElementById('cards');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const player = { x: 0, y: 0, r: 10, speed: 240 };
const cam = { x: 0, y: 0, z: 1, punch: 0 }; // world → screen: centred on cam, scaled by z
const P = '#ff4fd8', A = '#5ff2ff'; // player/shots vs enemies (two-tone; hue filter shifts both)
const view = () => [w / cam.z, h / cam.z, cam.x - w / 2 / cam.z, cam.y - h / 2 / cam.z]; // view size + top-left in world
let store; try { store = localStorage; } catch {} // access itself can throw
const data = load(store);
let w, h, ac, clock, run, audio, progress, levelsPending = 0, paused = false, picking = false, pickBars = 0, cards = [], last = 0;
let endedAt = 0, lastPhase = null, cycle = 0, invuln = 0, gameOver = false, finalDrop = false;
const enemies = [], shots = [], queue = [], gems = [], hostile = [];
const dir = { x: 0, y: -1 }, beamDir = { x: 0, y: -1 }; // last move direction; beam eases toward it
const broken = new Map(), pickups = []; // speaker id → hp left (0 = broken)
const buff = { stutter: 0, double: 0, sweep: 0, magnet: 0, bomb: false }; // seconds left
let objs = { pillars: [], speakers: [] }, keyStep = 0;
let bon = bonuses({}), rerolls = 0, revive = false; // meta-shop buffs for this run
const spec = new Uint8Array(64); // live spectrum, refreshed each frame
const specAt = a => spec[Math.floor(((a + Math.PI) / (2 * Math.PI)) * 32) % 32]; // angle → bin of the low half
function around() { // objects in the 3×3 chunks around the player
  const cx = Math.floor(player.x / CHUNK), cy = Math.floor(player.y / CHUNK), o = { pillars: [], speakers: [] };
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const k = chunkObjects(cx + i, cy + j); o.pillars.push(...k.pillars);
    if (k.speaker && broken.get(k.speaker.id) !== 0) o.speakers.push(k.speaker);
  }
  return o;
}
function powerup(type) {
  const bar = 16 * clock.stepDur(), now = ac.currentTime;
  if (type === 'stutter') buff.stutter = bar;
  else if (type === 'double') buff.double = 4 * bar;
  else if (type === 'bomb') buff.bomb = true;
  else if (type === 'magnet') buff.magnet = 1;
  else if (type === 'sweep') { buff.sweep = 4 * bar; for (let k = 0; k <= 8; k++) audio.setFilter(0.15 + 0.85 * k / 8, now + k * bar / 2); }
  else { run.harmony = Math.min(1, run.harmony + 0.25); audio.detune(1 - run.harmony); audio.play('pad', keyScale()[0] + 12, now, { dur: 2, vel: 0.4 }); }
}

function onPhase(phase, time) {
  if (lastPhase === 'drop') { run.drops++; if (finalDrop && !run.over) { run.won = true; endRun(); return; } }
  if (phase === 'breakdown') {
    enemies.push(...spawnWave('breakdown', cycle, ...view()));
    audio.setFilter(0.2, time);
  } else if (phase === 'build') {
    enemies.push(...spawnWave('build', cycle, ...view()));
    audio.riser(time, clock.stepDur() * 64);
  } else {
    keyStep++; setKey(2 * keyStep); d.setHue(keyStep * 40); // every drop: up a whole step, palette rotates
    if (finalDrop) enemies.push(...spawnWave('drop', cycle, ...view()), ...spawnWave('drop', cycle, ...view()));
    if (!still) cam.punch = 0.15;
    for (const e of enemies) e.held = false;
    audio.setFilter(1, time);
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
    if (b === 3 && s === 0) { clock.setBpm(bpmAt(run.elapsed)); audio.setTempo(bpmAt(run.elapsed), time + 16 * dur); finalDrop = run.elapsed >= RUN_SECONDS; } // lands on the drop's first bar
    if (s % (b < 2 ? 4 : b === 2 ? 2 : 1) === 0) audio.snare(time);
    audio.setFilter(0.2 + 0.8 * (b * 16 + s) / 64, time);
  }
  if (s % 2 === 0) for (const e of enemies) {
    const def = ENEMIES[e.type];
    if (e.held || !def.onBeat || (s % 4 === 0) !== (e.type !== 'shard')) continue; // shard fires on off-beats
    const shot = def.onBeat(e, player); if (shot) hostile.push(shot);
  }
  for (const [v, level] of playVoices(s, bar, phase, dur, time)) queue.push({ time, v, level, step: s });
  if (buff.bomb && s % 4 === 0) { // drop bomb goes off on the next kick: clears the screen
    buff.bomb = false; d.kickFlash(); if (!still) cam.punch = 0.2;
    const [vw, vh, ox, oy] = view();
    for (const e of enemies) if (e.x > ox && e.x < ox + vw && e.y > oy && e.y < oy + vh) e.hp = 0;
  }
}

function playVoices(s, bar, phase, dur, time) {
  const fired = [];
  if (buff.stutter > 0 && s % 2) return fired; // stutter: 1/8 gate
  for (const [name, level] of progress.voices) {
    const v = voiceDef(name, progress);
    if (!v.pattern(level)[s] || (name === 'kick' && phase !== 'drop')) continue;
    if (name === 'kick') audio.kick(time, v.patch === 'hardkick');
    else audio.play(v.patch, v.note(s, bar, level), time, { dur: name === 'pad' ? dur * 16 : dur, vel: 0.3 * (phase === 'drop' ? 1 : 0.4) });
    fired.push([v, level]);
  }
  return fired;
}

function fire(o) {
  const { v, level, step } = o, st = stats(progress), x = player.x, y = player.y;
  if (buff.double > 0 && !o.echo) { queue.push({ ...o, time: o.time + clock.stepDur(), echo: true }); queue.sort((p, q) => p.time - q.time); }
  const dmg = bon.damage * v.damage(level) * (st.damage + (step % 4 === 0 ? st.kickBonus : 0)) * (o.mult || 1);
  const shot = (vx, vy, life, kind, fx) => shots.push({ x, y, vx, vy, dmg, life, kind, level, area: st.area, ...fx });
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

const fieldR = s => 120 * s.area * (s.wash ? 2 : 1);
const ringR = s => (20 + (0.25 - s.life) * 400) * s.area;
function damage(s, e, dt) {
  const dx = e.x - s.x, dy = e.y - s.y, d = Math.hypot(dx, dy);
  if (s.kind === 'field') { if (d < fieldR(s)) { e.slow = 0.5; e.hp -= s.dmg * dt; if (s.wash) e.frozen = 1; } return; }
  if (s.kind === 'spectrum') {
    if (!s.hit?.has(e) && d < (30 + specAt(Math.atan2(dy, dx)) * 0.5) * s.area + e.r) { e.hp -= s.dmg; (s.hit ||= new Set()).add(e); }
    return;
  }
  if (s.kind === 'beam') {
    const along = Math.max(0, Math.min(300, dx * s.vx + dy * s.vy));
    if (Math.hypot(dx - s.vx * along, dy - s.vy * along) < e.r * (s.wide ? 3 : 1)) e.hp -= s.dmg * dt * 10; // ~dmg over its 0.1s life
    return;
  }
  if (s.life <= 0 || s.hit?.has(e)) return;
  if (!(s.kind === 'ring' ? Math.abs(d - ringR(s)) <= 8 : d < e.r * s.area)) return;
  e.hp -= s.dmg;
  if (buff.sweep > 0) e.sweepT = 2;
  if (s.kind === 'bolt' || s.kind === 'spark') s.life = 0; else (s.hit ||= new Set()).add(e); // ring/pierce: once per enemy
}

function updateShots(dt) {
  while (queue.length && ac.currentTime >= queue[0].time) fire(queue.shift());
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; s.life -= dt;
    if (s.life <= 0) {
      shots.splice(i, 1);
      if (s.shatter) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, r = ringR({ life: 0, area: s.area }); shots.push({ ...s, shatter: false, kind: 'spark', life: 0.3, x: s.x + Math.cos(a) * r, y: s.y + Math.sin(a) * r, vx: Math.cos(a) * 400, vy: Math.sin(a) * 400, hit: null }); }
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
  if (invuln > 0 || gameOver) return;
  invuln = 1;
  let over = run.hit(0.1 / bon.harmony); // headroom: more max harmony = smaller hits
  if (over && revive) { revive = false; over = false; run.over = false; run.harmony = 0.5; if (!still) cam.punch = 0.2; d.kickFlash(); } // second encore
  audio.detune(1 - run.harmony);
  if (over) endRun();
}

function endRun() {
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
  add('p', 'vinyl +' + earned);
  const shop = document.createElement('div'); shop.id = 'shop'; results.append(shop); renderShop();
  add('p', 'tap outside to play again');
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
  if (data.ranks.opening) for (const v of data.unlocked) btn((data.start === v ? '▶ ' : '') + 'start with ' + v, () => { data.start = v; save(store, data); renderShop(); }, false);
}

function updateEnemies(dt) {
  const up = objs.pillars.filter(p => pillarUp(p, clock.position().step)), solid = [...up, ...objs.speakers];
  for (const e of enemies) {
    e.sweepT = Math.max(0, (e.sweepT || 0) - dt);
    e.slow = e.sweepT > 0 ? 0.5 : 1;
  }
  for (const sp of objs.speakers) for (const s of shots) { // speakers break under fire and drop a powerup
    if (s.kind === 'beam' || s.kind === 'field' || s.life <= 0 || Math.hypot(s.x - sp.x, s.y - sp.y) > sp.r + 4) continue;
    if (s.kind !== 'ring') s.life = 0;
    const hp = (broken.get(sp.id) ?? 5) - 1; broken.set(sp.id, Math.max(0, hp));
    if (hp <= 0) { pickups.push({ x: sp.x, y: sp.y, type: rollPowerup(Math.random) }); d.burst(sp.x, sp.y, still ? 6 : 14); break; }
  }
  for (const s of shots) for (const e of enemies) damage(s, e, dt);
  const nextStep = ac.currentTime + (1 - (clock.position().beatFrac * 4) % 1) * clock.stepDur();
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i], def = ENEMIES[e.type];
    if (e.hp <= 0) {
      enemies.splice(i, 1);
      d.burst(e.x, e.y, still ? 4 : 8);
      audio.blip(keyScale()[Math.floor(Math.random() * 7)] + 24, nextStep);
      gems.push({ x: e.x, y: e.y, xp: e.xp });
      def.onDeath?.(e, (type, x, y) => enemies.push({ ...makeEnemy(type, x, y, cycle), xp: 2 })); // splitter children
      continue;
    }
    if (e.frozen > 0) e.frozen -= dt;
    else if (!e.held && !(buff.stutter > 0)) def.move(e, player, dt);
    for (const o of solid) pushOut(e, o);
    recycleEnemy(e, ...view());
    if (Math.hypot(e.x - player.x, e.y - player.y) < e.r + player.r) hurt();
  }
  for (let i = hostile.length - 1; i >= 0; i--) {
    const b = hostile[i]; if (buff.stutter > 0) continue;
    b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (Math.hypot(b.x - player.x, b.y - player.y) < player.r + 3) { hurt(); b.life = 0; }
    if (b.life <= 0) hostile.splice(i, 1);
  }
  for (let i = pickups.length - 1; i >= 0; i--) if (Math.hypot(pickups[i].x - player.x, pickups[i].y - player.y) < player.r + 12) powerup(pickups.splice(i, 1)[0].type);
  for (const o of solid) pushOut(player, o);
  const magnet = buff.magnet > 0 ? Infinity : (lastPhase === 'breakdown' ? 240 : 80) * bon.magnet;
  for (let i = gems.length - 1; i >= 0; i--) {
    const q = gems[i], dx = player.x - q.x, dy = player.y - q.y, dist = Math.hypot(dx, dy);
    if (dist < player.r + 4) { levelsPending += gainXp(progress, q.xp); gems.splice(i, 1); }
    else if (dist > 3 * Math.max(w, h)) gems.splice(i, 1); // far behind: drop it so gems can't pile up
    else if (dist < magnet) { q.x += dx / dist * 400 * dt; q.y += dy / dist * 400 * dt; }
  }
}

function drawShots() {
  for (const s of shots) {
    g.beginPath();
    const echo = s.level >= 3; // voice level 3+ adds a visual layer
    if (s.kind === 'ring') { g.arc(s.x, s.y, ringR(s), 0, 2 * Math.PI); if (echo) { const m = (20 + s.life * 400) * s.area; g.moveTo(s.x + m, s.y); g.arc(s.x, s.y, m, 0, 2 * Math.PI); } } // mirrored: contracts as the first expands
    else if (s.kind === 'field') { g.globalAlpha = s.life * 0.4; g.arc(s.x, s.y, fieldR(s), 0, 2 * Math.PI); }
    else if (s.kind === 'spectrum') for (let k = 0; k < 32; k++) { const a = -Math.PI + (k + 0.5) * Math.PI / 16, L = (30 + specAt(a) * 0.5) * s.area; g.moveTo(s.x + Math.cos(a) * 14, s.y + Math.sin(a) * 14); g.lineTo(s.x + Math.cos(a) * L, s.y + Math.sin(a) * L); }
    else if (s.kind === 'beam') { g.moveTo(s.x, s.y); g.lineTo(s.x + s.vx * 300, s.y + s.vy * 300); if (echo) { const ex = s.x - s.vy * 6, ey = s.y + s.vx * 6; g.moveTo(ex, ey); g.lineTo(ex + s.vx * 300, ey + s.vy * 300); } }
    else { const k = s.kind === 'pierce' ? 0.06 : s.kind === 'bolt' && echo ? 0.06 : 0.02; g.moveTo(s.x, s.y); g.lineTo(s.x - s.vx * k, s.y - s.vy * k); }
    if (s.wide) g.lineWidth = 9;
    g.stroke(); g.globalAlpha = 1; g.lineWidth = 3;
  }
}

const PICK_MARK = { stutter: '‖', double: '×2', bomb: '✱', magnet: 'U', sweep: '~', encore: '+' };
function drawObjects(t, pos) {
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '16px VT323, monospace'; g.lineWidth = 2;
  g.globalAlpha = 1; g.shadowBlur = d.glow ? 12 : 0;
  for (const p of objs.pillars) { // up: solid glowing column; down: dashed footprint
    const upNow = pillarUp(p, pos.step); g.strokeStyle = g.shadowColor = A;
    g.setLineDash(upNow ? [] : [4, 6]); g.globalAlpha = upNow ? 1 : 0.35;
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, 2 * Math.PI); g.stroke();
    if (upNow) { g.beginPath(); g.arc(p.x, p.y, p.r * 0.55, 0, 2 * Math.PI); g.stroke(); }
  }
  g.setLineDash([]); g.globalAlpha = 1; g.strokeStyle = g.shadowColor = g.fillStyle = P;
  for (const s of objs.speakers) { // speaker box with a cone that pumps on the beat
    g.strokeRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    g.beginPath(); g.arc(s.x, s.y, s.r * (0.45 + 0.15 * (1 - pos.beatFrac)), 0, 2 * Math.PI); g.stroke();
  }
  for (const q of pickups) { g.save(); g.translate(q.x, q.y); g.rotate(t * 2); g.strokeRect(-9, -9, 18, 18); g.restore(); g.fillText(PICK_MARK[q.type], q.x, q.y + 1); }
  g.lineWidth = 3;
}

function drawWorld(t) {
  g.shadowBlur = d.glow ? 16 : 0; g.shadowColor = g.strokeStyle = g.fillStyle = A;
  for (const e of enemies) ENEMIES[e.type].draw(g, e, t);
  for (const b of hostile) { g.beginPath(); g.arc(b.x, b.y, 3, 0, 2 * Math.PI); g.fill(); }
  g.shadowColor = g.strokeStyle = g.fillStyle = P;
  for (const q of gems) { g.beginPath(); g.moveTo(q.x, q.y - 4); g.lineTo(q.x + 4, q.y); g.lineTo(q.x, q.y + 4); g.lineTo(q.x - 4, q.y); g.closePath(); g.fill(); }
}

function size() { const d = devicePixelRatio || 1; w = c.clientWidth; h = c.clientHeight; c.width = w * d; c.height = h * d; g.setTransform(d, 0, 0, d, 0, 0); g.fillStyle = '#050505'; g.fillRect(0, 0, w, h); }
addEventListener('resize', size); size();

function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
  if (levelsPending > 0 && !picking && !paused && !gameOver) openPick();
  const live = !paused && !gameOver && !picking;
  if (!paused && !gameOver) clock.tick(); // music keeps going while picking
  if (live) {
    run.elapsed += dt;
    objs = around();
    for (const k of ['stutter', 'double', 'sweep', 'magnet']) buff[k] = Math.max(0, buff[k] - dt);
    const m = readMove();
    if (m.x || m.y) { const n = Math.hypot(m.x, m.y); dir.x = m.x / n; dir.y = m.y / n; }
    const k = 1 - Math.exp(-dt * 6); beamDir.x += (dir.x - beamDir.x) * k; beamDir.y += (dir.y - beamDir.y) * k;
    const bn = Math.hypot(beamDir.x, beamDir.y) || 1; beamDir.x /= bn; beamDir.y /= bn;
    player.x += m.x * player.speed * dt; player.y += m.y * player.speed * dt;
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
  g.shadowBlur = 0; g.strokeStyle = A; g.lineWidth = 1;
  for (let x = Math.floor(ox / cell) * cell; x < ox + vw; x += cell) { // spectrum floor: each column lit by one bin
    g.globalAlpha = 0.05 + spec[((Math.round(x / cell) % 32) + 32) % 32] / 255 * 0.4; g.beginPath(); g.moveTo(x, oy); g.lineTo(x, oy + vh); g.stroke();
  }
  g.globalAlpha = 0.08 + 0.06 * (1 - pos.beatFrac); g.beginPath();
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
  hud.textContent = mmss(run.elapsed) + '\n' + String(clock.bpm()).padStart(3, '0') + ' bpm';
}

function reset() {
  for (const a of [enemies, shots, queue, gems, hostile, pickups]) a.length = 0;
  broken.clear(); keyStep = 0; setKey(0); Object.assign(buff, { stutter: 0, double: 0, sweep: 0, magnet: 0, bomb: false });
  d.clear(); d.setHue(0); audio.master.gain.cancelScheduledValues(ac.currentTime); audio.master.gain.setValueAtTime(0.5, ac.currentTime); audio.newRun(); audio.setFx({}, ac.currentTime);
  run = createRun(); progress = createProgress(data.unlocked);
  bon = bonuses(data.ranks); rerolls = bon.rerolls; revive = bon.revive; player.speed = 240 * bon.speed;
  if (bon.opening && data.start !== 'kick') progress.voices = new Map([[data.start, 1]]); // opening track levelsPending = 0; audio.detune(0);
  lastPhase = null; cycle = 0; picking = false; pickBars = 0; levelup.hidden = true; invuln = 0; gameOver = false; finalDrop = false; results.hidden = true;
  player.x = player.y = 0; cam.x = cam.y = 0; cam.z = 1; cam.punch = 0;
  clock.start();
}

function begin() {
  if (start.hidden) return;
  removeEventListener('pointerdown', begin); removeEventListener('keydown', begin);
  ac = new AudioContext(); ac.resume();
  audio = createAudio(ac);
  clock = createClock(ac, onStep); reset();
  start.hidden = true; hud.hidden = false;
  requestAnimationFrame(frame);
}
addEventListener('pointerdown', begin); addEventListener('keydown', begin);
const again = e => { if (gameOver && performance.now() - endedAt > 500 && !e.target.closest?.('button')) reset(); }; // shop buttons don't restart
addEventListener('pointerdown', again); addEventListener('keydown', again); // ignore keys held during play

const togglePause = () => {
  if (!run || gameOver) return;
  paused = !paused; pauseEl.hidden = !paused; levelup.inert = paused;
  if (paused) ac.suspend(); else ac.resume();
};
onPause(togglePause);
document.addEventListener('visibilitychange', () => { if (document.hidden && !paused) togglePause(); });

const DESCRIPTIONS = {
  kick: 'shockwave ring', arp: 'aimed bolts', bass: 'piercing pulse', lead: 'sweeping beam', pad: 'slowing field', hats: 'spark burst', analyzer: 'spectrum spikes',
  acid: 'spiralling bolts, always echo', hardkick: 'ring shatters into 8 shards', rolling: 'pierce on every 16th', hoover: 'wide sweeping beam', wash: 'double field, freezes 1s', shaker: 'homing sparks',
  reverb: '+15% area', delay: 'shots echo', distortion: '+10% damage', unison: '+1 shot per note', filter: '+12% speed & range', sidechain: '+15% dmg on kick',
};
const KIND = { voice: 'new voice', voiceUp: 'voice', fx: 'new fx', fxUp: 'fx', evolve: 'evolve', heal: 'heal' };
function cardHtml(c, i) {
  if (c.kind === 'heal') return `<b>${i + 1}. heal</b><span>heal</span><span>+20% harmony</span>`;
  const line = c.kind === 'evolve' ? `${c.name} → ${c.to}</span><span>${DESCRIPTIONS[c.to]}` : `lvl ${c.from}→${c.to}</span><span>${DESCRIPTIONS[c.name] || ''}`;
  return `<b>${i + 1}. ${c.name}</b><span>${KIND[c.kind]}</span><span>${line}</span>`;
}
function openPick() {
  picking = true; queue.length = 0;
  cards = rollChoices(progress, Math.random);
  cardsEl.innerHTML = cards.map((c, i) => `<button class="card" type="button" data-i="${i}">${cardHtml(c, i)}</button>`).join('');
  if (rerolls > 0) cardsEl.insertAdjacentHTML('beforeend', `<button class="buy" type="button" data-reroll>r · reroll (${rerolls} left)</button>`);
  levelup.hidden = false;
  audio.setFilter(0.25, ac.currentTime);
  cardsEl.querySelector('button').focus();
}
function choose(i) {
  const c = cards[i];
  if (!picking || paused || gameOver || !c) return;
  if (c.kind === 'heal') { run.harmony = Math.min(1, run.harmony + 0.2); audio.detune(1 - run.harmony); } else applyChoice(progress, c);
  if (c.kind === 'evolve') { audio.riser(ac.currentTime, clock.stepDur() * 16); d.kickFlash(); } // kickFlash no-ops under reduced motion
  audio.setFx({ ...Object.fromEntries(progress.effects), duck: stats(progress).duck }, ac.currentTime);
  levelsPending--; picking = false; levelup.hidden = true;
  audio.setFilter(lastPhase === 'drop' ? 1 : 0.2, ac.currentTime); // shortcut: build snaps to 0.2, its per-step ramp corrects on the next step
  if (levelsPending > 0) openPick();
}
const reroll = () => { if (picking && !paused && rerolls > 0) { rerolls--; openPick(); } }; // crate digger
cardsEl.addEventListener('click', e => { if (e.target.closest('[data-reroll]')) return reroll(); const b = e.target.closest('.card'); if (b) choose(+b.dataset.i); });
addEventListener('keydown', e => {
  if (!e.repeat && e.key >= '1' && e.key <= '3') choose(e.key - 1);
  if (!e.repeat && e.key.toLowerCase() === 'r') reroll();
});
