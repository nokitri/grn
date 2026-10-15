// DOM-free at import: everything goes through the 2D context passed in (and its g.canvas for the hue filter).
const still = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function createDraw(g) {
  const parts = [], times = [];
  let lastFade = 0, saved = false, flash = 0, jolt = 0;
  const d = {
    glow: true, // false once frames run slow: enemies/particles drop shadowBlur, player keeps it
    fade() {
      if (saved) { g.restore(); saved = false; } // undo last frame's camera jolt
      const now = performance.now(); // gaps over 250ms (hidden/throttled tab) are skipped
      if (lastFade && now - lastFade <= 250) { times.push(now - lastFade); if (times.length > 60) times.shift(); }
      lastFade = now;
      if (d.glow && times.length === 60 && times.reduce((a, b) => a + b) / 60 > 20) d.glow = false;
      g.shadowBlur = 0; // else the fade rect itself glows
      g.fillStyle = still() ? 'rgba(5,5,5,.35)' : 'rgba(5,5,5,.18)'; g.fillRect(0, 0, g.canvas.clientWidth, g.canvas.clientHeight);
    },
    background(t, phase, chordIndex, beatPulse) {
      const w = g.canvas.clientWidth, h = g.canvas.clientHeight, build = phase === 'build';
      g.save(); saved = true;
      if (jolt > 0) { g.translate((Math.random() * 2 - 1) * 4, (Math.random() * 2 - 1) * 4); jolt--; }
      const sides = 3 + chordIndex, rot = t * 0.2 * (build ? 3 : 1), base = Math.min(w, h) * 0.09 * (build ? 0.7 : 1);
      g.shadowBlur = 0; g.strokeStyle = '#ff4fd8'; g.lineWidth = 1; g.globalAlpha = 0.25;
      for (let i = 1; i <= 5; i++) {
        const r = base * i * (1 + 0.06 * beatPulse);
        g.beginPath();
        for (let k = 0; k <= sides; k++) { const a = rot + k * 2 * Math.PI / sides; g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); }
        g.stroke();
      }
      g.globalAlpha = 1;
      if (flash > 0) { g.fillStyle = `rgba(255,220,245,${0.15 * flash})`; g.fillRect(-8, -8, w + 16, h + 16); flash = Math.max(0, flash - 0.25); }
    },
    burst(x, y, n) { for (let k = 0; k < n; k++) { const a = Math.random() * 2 * Math.PI, v = 80 + Math.random() * 160; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 }); } },
    particles(dt) {
      g.shadowBlur = d.glow ? 16 : 0;
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
        if (q.life <= 0) { parts.splice(i, 1); continue; }
        g.globalAlpha = q.life / 0.4; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - q.vx * 0.04, q.y - q.vy * 0.04); g.stroke();
      }
      g.globalAlpha = 1;
    },
    clear() { parts.length = 0; },
    kickFlash() { if (still()) return; flash = 1; jolt = 3; },
    setHue(cycle) { g.canvas.style.filter = `hue-rotate(${Math.min(60, cycle * 20)}deg)`; },
  };
  return d;
}
