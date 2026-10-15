import { createClock } from './clock.js';
import { createRun } from './phase.js';
import { readMove, onPause } from './input.js';
const c = document.getElementById('game'), g = c.getContext('2d');
const start = document.getElementById('start'), pauseEl = document.getElementById('pause');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const player = { x: 0, y: 0, r: 10, speed: 240 };
let w, h, ac, clock, run, paused = false, last = 0;

function clamp() { player.x = Math.min(w - player.r, Math.max(player.r, player.x)); player.y = Math.min(h - player.r, Math.max(player.r, player.y)); }
function size() { const d = devicePixelRatio || 1; w = c.clientWidth; h = c.clientHeight; c.width = w * d; c.height = h * d; g.setTransform(d, 0, 0, d, 0, 0); g.fillStyle = '#050505'; g.fillRect(0, 0, w, h); clamp(); }
addEventListener('resize', size); size();

function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
  if (!paused) {
    clock.tick();
    const m = readMove();
    player.x += m.x * player.speed * dt; player.y += m.y * player.speed * dt; clamp();
  }
  g.shadowBlur = 0; // else the fade rect itself glows
  g.fillStyle = still ? 'rgba(5,5,5,.4)' : 'rgba(5,5,5,.18)'; g.fillRect(0, 0, w, h);
  const P = '#ff4fd8', r = player.r;
  g.shadowColor = P; g.shadowBlur = 16; g.fillStyle = P; g.strokeStyle = P; g.lineWidth = 3;
  g.beginPath(); g.moveTo(player.x, player.y - r); g.lineTo(player.x + r, player.y); g.lineTo(player.x, player.y + r); g.lineTo(player.x - r, player.y); g.fill();
  g.beginPath(); g.arc(player.x, player.y, r + 10, -Math.PI / 2, -Math.PI / 2 + run.harmony * 2 * Math.PI); g.stroke();
  g.shadowBlur = 0;
}

function begin() {
  if (start.hidden) return;
  removeEventListener('pointerdown', begin); removeEventListener('keydown', begin);
  ac = new AudioContext(); ac.resume();
  clock = createClock(ac, () => {}); clock.start(); run = createRun();
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
