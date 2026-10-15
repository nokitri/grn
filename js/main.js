const c = document.getElementById('game'), g = c.getContext('2d');
const start = document.getElementById('start');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
let w, h, ac;

function size() { const d = devicePixelRatio || 1; w = c.clientWidth; h = c.clientHeight; c.width = w * d; c.height = h * d; g.setTransform(d, 0, 0, d, 0, 0); g.fillStyle = '#050505'; g.fillRect(0, 0, w, h); }
addEventListener('resize', size); size();

function frame() {
  g.shadowBlur = 0; // else the fade rect itself glows
  g.fillStyle = still ? 'rgba(5,5,5,.4)' : 'rgba(5,5,5,.18)'; g.fillRect(0, 0, w, h);
  requestAnimationFrame(frame);
}

function begin() {
  if (start.hidden) return;
  removeEventListener('pointerdown', begin); removeEventListener('keydown', begin);
  ac = new AudioContext(); ac.resume();
  start.hidden = true;
  requestAnimationFrame(frame);
}
addEventListener('pointerdown', begin); addEventListener('keydown', begin);
