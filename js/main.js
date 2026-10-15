import { createClock, stepDur } from './clock.js';
import { createRun, phaseAt } from './phase.js';
import { createAudio } from './audio.js';
import { VOICES, createLoadout } from './voices.js';
import { readMove, onPause } from './input.js';
const c = document.getElementById('game'), g = c.getContext('2d');
const start = document.getElementById('start'), pauseEl = document.getElementById('pause');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const player = { x: 0, y: 0, r: 10, speed: 240 };
let w, h, ac, clock, run, audio, loadout, paused = false, last = 0;
const enemies = [], shots = [], queue = []; // enemies filled by Task 7
const dir = { x: 0, y: -1 }; // last move direction

function onStep(step, time) {
  const s = step % 16, bar = Math.floor(step / 16), phase = phaseAt(bar).name;
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
  else if (v.weapon === 'beam') shot(dir.x, dir.y, 0.1, 'beam'); // vx,vy = unit heading
  else if (v.weapon === 'spark') for (let i = 0; i < 8; i++) shot(Math.cos(i * Math.PI / 4) * 400, Math.sin(i * Math.PI / 4) * 400, 0.3, 'spark');
  else shot(0, 0, v.weapon === 'ring' ? 0.25 : 1, v.weapon); // ring / field centred on player
}

function updateShots(dt) {
  while (queue.length && ac.currentTime >= queue[0].time) fire(queue.shift());
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; s.life -= dt;
    if (s.life <= 0) { shots.splice(i, 1); continue; }
    if (s.kind === 'beam' || s.kind === 'ring' || s.kind === 'field') { s.x = player.x; s.y = player.y; }
    else { s.x += s.vx * dt; s.y += s.vy * dt; }
  }
}

function drawShots() {
  for (const s of shots) {
    g.beginPath();
    if (s.kind === 'ring') g.arc(s.x, s.y, 20 + (0.25 - s.life) * 400, 0, 2 * Math.PI);
    else if (s.kind === 'field') { g.globalAlpha = s.life * 0.4; g.arc(s.x, s.y, 90, 0, 2 * Math.PI); }
    else if (s.kind === 'beam') { g.moveTo(s.x, s.y); g.lineTo(s.x + s.vx * 400, s.y + s.vy * 400); }
    else { const k = s.kind === 'pierce' ? 0.06 : 0.02; g.moveTo(s.x, s.y); g.lineTo(s.x - s.vx * k, s.y - s.vy * k); }
    g.stroke(); g.globalAlpha = 1;
  }
}

function clamp() { player.x = Math.min(w - player.r, Math.max(player.r, player.x)); player.y = Math.min(h - player.r, Math.max(player.r, player.y)); }
function size() { const d = devicePixelRatio || 1; w = c.clientWidth; h = c.clientHeight; c.width = w * d; c.height = h * d; g.setTransform(d, 0, 0, d, 0, 0); g.fillStyle = '#050505'; g.fillRect(0, 0, w, h); clamp(); }
addEventListener('resize', size); size();

function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
  if (!paused) {
    clock.tick();
    const m = readMove();
    if (m.x || m.y) { const n = Math.hypot(m.x, m.y); dir.x = m.x / n; dir.y = m.y / n; }
    player.x += m.x * player.speed * dt; player.y += m.y * player.speed * dt; clamp();
    updateShots(dt);
  }
  g.shadowBlur = 0; // else the fade rect itself glows
  g.fillStyle = still ? 'rgba(5,5,5,.4)' : 'rgba(5,5,5,.18)'; g.fillRect(0, 0, w, h);
  const P = '#ff4fd8', r = player.r;
  g.shadowColor = P; g.shadowBlur = 16; g.fillStyle = P; g.strokeStyle = P; g.lineWidth = 3;
  g.beginPath(); g.moveTo(player.x, player.y - r); g.lineTo(player.x + r, player.y); g.lineTo(player.x, player.y + r); g.lineTo(player.x - r, player.y); g.fill();
  drawShots();
  g.beginPath(); g.arc(player.x, player.y, r + 10, -Math.PI / 2, -Math.PI / 2 + run.harmony * 2 * Math.PI); g.stroke();
  g.shadowBlur = 0;
}

function begin() {
  if (start.hidden) return;
  removeEventListener('pointerdown', begin); removeEventListener('keydown', begin);
  ac = new AudioContext(); ac.resume();
  audio = createAudio(ac); loadout = createLoadout();
  clock = createClock(ac, onStep); clock.start(); run = createRun();
  player.x = w / 2; player.y = h / 2;
  start.hidden = true;
  requestAnimationFrame(frame);
}
addEventListener('pointerdown', begin); addEventListener('keydown', begin);

onPause(() => {
  if (!run) return;
  paused = !paused; pauseEl.hidden = !paused;
  if (paused) ac.suspend(); else ac.resume();
});
