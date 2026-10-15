import { createClock, stepDur, SCALE } from './clock.js';
import { createRun, phaseAt } from './phase.js';
import { createAudio } from './audio.js';
import { VOICES, createLoadout } from './voices.js';
import { ENEMIES, spawnWave, makeEnemy } from './enemies.js';
import { readMove, onPause } from './input.js';
import { load, save, checkUnlocks } from './save.js';
const c = document.getElementById('game'), g = c.getContext('2d');
const start = document.getElementById('start'), pauseEl = document.getElementById('pause'), results = document.getElementById('results');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const player = { x: 0, y: 0, r: 10, speed: 240 };
let store; try { store = localStorage; } catch {} // access itself can throw
const data = load(store);
let w, h, ac, clock, run, audio, loadout, paused = false, last = 0;
let endedAt = 0, lastPhase = null, cycle = 0, invuln = 0, gameOver = false, t0 = 0;
const enemies = [], shots = [], queue = [], orbs = [], hostile = [], parts = [];
const dir = { x: 0, y: -1 }, beamDir = { x: 0, y: -1 }; // last move direction; beam eases toward it

function onPhase(phase, time) {
  if (lastPhase === 'drop') run.drops++;
  if (phase === 'breakdown') {
    enemies.push(...spawnWave('breakdown', cycle, w, h));
    for (let i = 0; i < 2; i++) orbs.push({ x: 40 + Math.random() * (w - 80), y: 40 + Math.random() * (h - 80), name: data.unlocked[Math.floor(Math.random() * data.unlocked.length)] });
    audio.setFilter(0.2, time);
  } else if (phase === 'build') {
    orbs.length = 0;
    enemies.push(...spawnWave('build', cycle, w, h));
    audio.riser(time, stepDur * 64);
  } else {
    for (const e of enemies) e.held = false;
    audio.setFilter(1, time);
  }
}

function onStep(step, time) {
  const s = step % 16, bar = Math.floor(step / 16), p = phaseAt(bar), phase = p.name;
  cycle = p.cycle;
  if (phase !== lastPhase) { onPhase(phase, time); lastPhase = phase; }
  if (phase === 'build') {
    const b = p.barInPhase;
    if (s % (b < 2 ? 4 : b === 2 ? 2 : 1) === 0) audio.snare(time);
    audio.setFilter(0.2 + 0.8 * (b * 16 + s) / 64, time);
  }
  if (s % 2 === 0) for (const e of enemies) {
    const def = ENEMIES[e.type];
    if (e.held || !def.onBeat || (s % 4 === 0) !== (e.type !== 'shard')) continue; // shard fires on off-beats
    const shot = def.onBeat(e, player); if (shot) hostile.push(shot);
  }
  for (const [name, level] of loadout.voices) {
    const v = VOICES[name];
    if (!v.pattern(level)[s] || (name === 'kick' && phase !== 'drop')) continue;
    if (name === 'kick') audio.kick(time);
    else audio.play(v.patch, v.note(s, bar, level), time, { dur: name === 'pad' ? stepDur * 16 : stepDur, vel: 0.3 * (phase === 'drop' ? 1 : 0.4) });
    queue.push({ time, v, level });
  }
}

function fire({ v, level }) {
  const dmg = v.damage(level), x = player.x, y = player.y;
  const shot = (vx, vy, life, kind) => shots.push({ x, y, vx, vy, dmg, life, kind });
  const aim = speed => {
    let t = null, d = Infinity;
    for (const e of enemies) { const q = (e.x - x) ** 2 + (e.y - y) ** 2; if (q < d) { d = q; t = e; } }
    const dx = t ? t.x - x : dir.x, dy = t ? t.y - y : dir.y, n = Math.hypot(dx, dy) || 1;
    return [dx / n * speed, dy / n * speed];
  };
  if (v.weapon === 'bolt') shot(...aim(600), 0.8, 'bolt');
  else if (v.weapon === 'pierce') shot(...aim(250), 2, 'pierce');
  else if (v.weapon === 'beam') shot(beamDir.x, beamDir.y, 0.1, 'beam'); // vx,vy = unit heading
  else if (v.weapon === 'spark') for (let i = 0; i < 8; i++) shot(Math.cos(i * Math.PI / 4) * 400, Math.sin(i * Math.PI / 4) * 400, 0.3, 'spark');
  else shot(0, 0, v.weapon === 'ring' ? 0.25 : 1, v.weapon); // ring / field centred on player
}

const ringR = s => 20 + (0.25 - s.life) * 400;
function damage(s, e, dt) {
  const dx = e.x - s.x, dy = e.y - s.y, d = Math.hypot(dx, dy);
  if (s.kind === 'field') { if (d < 120) { e.slow = 0.5; e.hp -= s.dmg * dt; } return; }
  if (s.kind === 'beam') {
    const along = Math.max(0, Math.min(300, dx * s.vx + dy * s.vy));
    if (Math.hypot(dx - s.vx * along, dy - s.vy * along) < e.r) e.hp -= s.dmg * dt * 10; // ~dmg over its 0.1s life
    return;
  }
  if (s.life <= 0 || s.hit?.has(e)) return;
  if (!(s.kind === 'ring' ? Math.abs(d - ringR(s)) <= 8 : d < e.r)) return;
  e.hp -= s.dmg;
  if (s.kind === 'bolt' || s.kind === 'spark') s.life = 0; else (s.hit ||= new Set()).add(e); // ring/pierce: once per enemy
}

function updateShots(dt) {
  while (queue.length && ac.currentTime >= queue[0].time) fire(queue.shift());
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; s.life -= dt;
    if (s.life <= 0) { shots.splice(i, 1); continue; }
    if (s.kind === 'beam' || s.kind === 'ring' || s.kind === 'field') { s.x = player.x; s.y = player.y; }
    else { s.x += s.vx * dt; s.y += s.vy * dt; }
    if (s.kind === 'beam') { s.vx = beamDir.x; s.vy = beamDir.y; }
  }
}

function hurt() {
  if (invuln > 0 || gameOver) return;
  invuln = 1;
  const over = run.hit(0.1);
  audio.detune(1 - run.harmony);
  if (over) { clock.stop(); gameOver = true; endedAt = performance.now(); showResults(); }
}

function showResults() {
  const maxedVoices = [...loadout.voices.values()].filter(l => l >= 5).length;
  const fresh = checkUnlocks(data, { drops: run.drops, maxedVoices });
  data.unlocked.push(...fresh); data.best = Math.max(data.best, run.drops); save(store, data);
  results.innerHTML = `<h2>&gt; harmony lost</h2><p>drops survived: ${run.drops}</p><p>best: ${data.best}</p>`
    + (fresh.length ? `<p>unlocked: ${fresh.join(', ')}</p>` : '') + '<p>tap to play again</p>';
  results.hidden = false;
}

function updateEnemies(dt) {
  for (const e of enemies) e.slow = 1;
  for (const s of shots) for (const e of enemies) damage(s, e, dt);
  const nextStep = t0 + Math.ceil((ac.currentTime - t0) / stepDur) * stepDur;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i], def = ENEMIES[e.type];
    if (e.hp <= 0) {
      enemies.splice(i, 1);
      for (let k = 0; k < (still ? 4 : 8); k++) { const a = Math.random() * 2 * Math.PI, v = 80 + Math.random() * 160; parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 }); }
      audio.blip(SCALE[Math.floor(Math.random() * SCALE.length)] + 24, nextStep);
      def.onDeath?.(e, (type, x, y) => enemies.push(makeEnemy(type, x, y, cycle)));
      continue;
    }
    if (!e.held) def.move(e, player, dt);
    if (Math.hypot(e.x - player.x, e.y - player.y) < e.r + player.r) hurt();
  }
  for (let i = hostile.length - 1; i >= 0; i--) {
    const b = hostile[i]; b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (Math.hypot(b.x - player.x, b.y - player.y) < player.r + 3) { hurt(); b.life = 0; }
    if (b.life <= 0) hostile.splice(i, 1);
  }
  for (let i = orbs.length - 1; i >= 0; i--) if (Math.hypot(orbs[i].x - player.x, orbs[i].y - player.y) < player.r + 10) { loadout.add(orbs[i].name); orbs.splice(i, 1); }
  for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.life <= 0) parts.splice(i, 1); }
}

function drawShots() {
  for (const s of shots) {
    g.beginPath();
    if (s.kind === 'ring') g.arc(s.x, s.y, ringR(s), 0, 2 * Math.PI);
    else if (s.kind === 'field') { g.globalAlpha = s.life * 0.4; g.arc(s.x, s.y, 120, 0, 2 * Math.PI); }
    else if (s.kind === 'beam') { g.moveTo(s.x, s.y); g.lineTo(s.x + s.vx * 300, s.y + s.vy * 300); }
    else { const k = s.kind === 'pierce' ? 0.06 : 0.02; g.moveTo(s.x, s.y); g.lineTo(s.x - s.vx * k, s.y - s.vy * k); }
    g.stroke(); g.globalAlpha = 1;
  }
}

function drawWorld(t) {
  for (const e of enemies) ENEMIES[e.type].draw(g, e, t);
  for (const b of hostile) { g.beginPath(); g.arc(b.x, b.y, 3, 0, 2 * Math.PI); g.fill(); }
  for (const q of parts) { g.globalAlpha = q.life / 0.4; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - q.vx * 0.04, q.y - q.vy * 0.04); g.stroke(); }
  g.globalAlpha = 1; g.font = '16px VT323, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const o of orbs) { g.beginPath(); g.arc(o.x, o.y, 10, 0, 2 * Math.PI); g.stroke(); g.fillText(o.name[0], o.x, o.y + 1); }
}

function clamp() { player.x = Math.min(w - player.r, Math.max(player.r, player.x)); player.y = Math.min(h - player.r, Math.max(player.r, player.y)); }
function size() { const d = devicePixelRatio || 1; w = c.clientWidth; h = c.clientHeight; c.width = w * d; c.height = h * d; g.setTransform(d, 0, 0, d, 0, 0); g.fillStyle = '#050505'; g.fillRect(0, 0, w, h); clamp(); }
addEventListener('resize', size); size();

function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
  if (!paused && !gameOver) {
    clock.tick();
    const m = readMove();
    if (m.x || m.y) { const n = Math.hypot(m.x, m.y); dir.x = m.x / n; dir.y = m.y / n; }
    const k = 1 - Math.exp(-dt * 6); beamDir.x += (dir.x - beamDir.x) * k; beamDir.y += (dir.y - beamDir.y) * k;
    const bn = Math.hypot(beamDir.x, beamDir.y) || 1; beamDir.x /= bn; beamDir.y /= bn;
    player.x += m.x * player.speed * dt; player.y += m.y * player.speed * dt; clamp();
    invuln -= dt;
    updateShots(dt); updateEnemies(dt);
  }
  g.shadowBlur = 0; // else the fade rect itself glows
  g.fillStyle = still ? 'rgba(5,5,5,.4)' : 'rgba(5,5,5,.18)'; g.fillRect(0, 0, w, h);
  const P = '#ff4fd8', r = player.r;
  g.shadowColor = P; g.shadowBlur = 16; g.fillStyle = P; g.strokeStyle = P; g.lineWidth = 3;
  g.globalAlpha = invuln > 0 && !still && Math.floor(t / 80) % 2 ? 0.3 : 1; // blink while invulnerable
  g.beginPath(); g.moveTo(player.x, player.y - r); g.lineTo(player.x + r, player.y); g.lineTo(player.x, player.y + r); g.lineTo(player.x - r, player.y); g.fill();
  g.globalAlpha = 1;
  drawShots(); drawWorld(t / 1000);
  g.beginPath(); g.arc(player.x, player.y, r + 10, -Math.PI / 2, -Math.PI / 2 + run.harmony * 2 * Math.PI); g.stroke();
  g.shadowBlur = 0;
}

function reset() {
  for (const a of [enemies, shots, queue, orbs, hostile, parts]) a.length = 0;
  run = createRun(); loadout = createLoadout(); audio.detune(0);
  lastPhase = null; cycle = 0; invuln = 0; gameOver = false; results.hidden = true;
  player.x = w / 2; player.y = h / 2;
  clock.start(); t0 = ac.currentTime + 0.05; // matches clock.start's first step time
}

function begin() {
  if (start.hidden) return;
  removeEventListener('pointerdown', begin); removeEventListener('keydown', begin);
  ac = new AudioContext(); ac.resume();
  audio = createAudio(ac);
  clock = createClock(ac, onStep); reset();
  start.hidden = true;
  requestAnimationFrame(frame);
}
addEventListener('pointerdown', begin); addEventListener('keydown', begin);
const again = () => { if (gameOver && performance.now() - endedAt > 500) reset(); };
addEventListener('pointerdown', again); addEventListener('keydown', again); // ignore keys held during play

onPause(() => {
  if (!run || gameOver) return;
  paused = !paused; pauseEl.hidden = !paused;
  if (paused) ac.suspend(); else ac.resume();
});
