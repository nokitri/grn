// DOM-free: draw(g, e, t) takes a canvas context.
const toward = (e, p, speed, dt) => {
  const dx = p.x - e.x, dy = p.y - e.y, n = Math.hypot(dx, dy) || 1;
  e.x += dx / n * speed * dt; e.y += dy / n * speed * dt; return n;
};
const poly = (g, x, y, r, n, a) => {
  g.beginPath();
  for (let i = 0; i <= n; i++) g.lineTo(x + Math.cos(a + i * 2 * Math.PI / n) * r, y + Math.sin(a + i * 2 * Math.PI / n) * r);
  g.stroke();
};

export const ENEMIES = {
  drifter: {
    hp: c => 3 * (1 + 0.25 * c), speed: 60, r: 10, unlock: 0,
    move(e, p, dt) { toward(e, p, this.speed * e.slow, dt); },
    draw(g, e, t) { poly(g, e.x, e.y, e.r, 3, t * 3); },
  },
  pulser: {
    hp: c => 4 * (1 + 0.25 * c), speed: 30, r: 12, unlock: 0,
    move(e, p, dt) { e.lunge = Math.max(0, (e.lunge || 0) - dt * 4); toward(e, p, (this.speed + e.lunge * 300) * e.slow, dt); },
    draw(g, e) { g.beginPath(); g.arc(e.x, e.y, e.r * (1 + 0.4 * (e.lunge || 0)), 0, 2 * Math.PI); g.stroke(); },
    onBeat(e) { e.lunge = 1; },
  },
  chain: {
    hp: c => 6 * (1 + 0.25 * c), speed: 70, r: 8, unlock: 1,
    move(e, p, dt) {
      e.t = (e.t || 0) + dt;
      const dx = p.x - e.x, dy = p.y - e.y, n = Math.hypot(dx, dy) || 1, s = Math.sin(e.t * 4) * 1.2;
      e.x += (dx / n - dy / n * s) * this.speed * e.slow * dt; e.y += (dy / n + dx / n * s) * this.speed * e.slow * dt;
      (e.trail ||= []).unshift({ x: e.x, y: e.y }); e.trail.length = Math.min(e.trail.length, 36);
    },
    draw(g, e) {
      const pts = (e.trail || [e]).filter((_, i) => i % 6 === 0);
      g.beginPath(); pts.forEach(q => g.lineTo(q.x, q.y)); g.stroke();
      for (const q of pts) { g.beginPath(); g.arc(q.x, q.y, 4, 0, 2 * Math.PI); g.stroke(); }
    },
  },
  splitter: {
    hp: c => 8 * (1 + 0.25 * c), speed: 40, r: 14, unlock: 2,
    move(e, p, dt) { toward(e, p, this.speed * e.slow, dt); },
    draw(g, e, t) { poly(g, e.x, e.y, e.r, 6, t); },
    onDeath(e, spawn) { for (let i = 0; i < 3; i++) spawn('drifter', e.x + Math.cos(i * 2.1) * 12, e.y + Math.sin(i * 2.1) * 12); },
  },
  shard: {
    hp: c => 5 * (1 + 0.25 * c), speed: 50, r: 12, unlock: 3,
    move(e, p, dt) { if (Math.hypot(p.x - e.x, p.y - e.y) < 260) toward(e, p, -this.speed * e.slow, dt); else toward(e, p, this.speed * e.slow, dt); },
    draw(g, e, t) {
      g.beginPath();
      for (let i = 0; i <= 10; i++) { const r = i % 2 ? e.r * 0.45 : e.r, a = -t + i * Math.PI / 5; g.lineTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r); }
      g.stroke();
    },
    // called on off-beats; returns a slow hostile shot
    onBeat(e, p) { const dx = p.x - e.x, dy = p.y - e.y, n = Math.hypot(dx, dy) || 1; return { x: e.x, y: e.y, vx: dx / n * 120, vy: dy / n * 120, life: 5 }; },
  },
};

export function makeEnemy(type, x, y, cycle) {
  return { type, x, y, hp: ENEMIES[type].hp(cycle), r: ENEMIES[type].r, slow: 1, held: false, xp: type === 'shard' ? 2 : 1 };
}

// build waves are the drop swarm, held at the edges until released.
export function spawnWave(phase, cycle, w, h) {
  const n = phase === 'breakdown' ? 3 : 12 + 6 * cycle;
  const pool = phase === 'breakdown' ? ['drifter'] : Object.keys(ENEMIES).filter(k => ENEMIES[k].unlock <= cycle);
  return Array.from({ length: n }, () => {
    const u = Math.random(), side = Math.floor(Math.random() * 4);
    const x = side < 2 ? u * w : side === 2 ? 0 : w, y = side < 2 ? (side ? h : 0) : u * h;
    const e = makeEnemy(pool[Math.floor(Math.random() * pool.length)], x, y, cycle);
    e.held = phase === 'build';
    return e;
  });
}
