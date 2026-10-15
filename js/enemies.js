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
    move(e, p, dt) { toward(e, { x: p.x + (p.vx || 0) * .35, y: p.y + (p.vy || 0) * .35 }, this.speed * e.slow, dt); },
    draw(g, e, t) { poly(g, e.x, e.y, e.r, 3, t * 3); },
  },
  pulser: {
    hp: c => 4 * (1 + 0.25 * c), speed: 30, r: 12, unlock: 0,
    move(e, p, dt) {
      if (e.dashT > 0) { e.dashT -= dt; e.x += Math.cos(e.aim) * 430 * e.slow * dt; e.y += Math.sin(e.aim) * 430 * e.slow * dt; }
      else if (!e.telegraph) toward(e, p, this.speed * e.slow, dt);
    },
    draw(g, e) { g.beginPath(); g.arc(e.x, e.y, e.r, 0, 2 * Math.PI); g.stroke(); poly(g, e.x, e.y, e.r * .5, 3, e.aim || 0); },
  },
  chain: {
    hp: c => 6 * (1 + 0.25 * c), speed: 70, r: 8, unlock: 1,
    move(e, p, dt) {
      e.t = (e.t || 0) + dt;
      const ahead = 0.6, dx = p.x + (p.vx || 0) * ahead - e.x, dy = p.y + (p.vy || 0) * ahead - e.y, n = Math.hypot(dx, dy) || 1, s = Math.sin(e.t * 2 + e.flank) * 1.3;
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
  },
  sentinel: {
    hp: c => 18 * (1 + 0.25 * c), speed: 24, r: 20, unlock: 4,
    move(e, p, dt) { if (Math.hypot(e.x - p.x, e.y - p.y) > 300) toward(e, p, this.speed * e.slow, dt); },
    draw(g, e, t) { poly(g, e.x, e.y, e.r, 4, t * .3); poly(g, e.x, e.y, e.r * .55, 4, -t * .5); },
  },
};

export function makeEnemy(type, x, y, cycle) {
  return { type, x, y, hp: ENEMIES[type].hp(cycle), maxHp: ENEMIES[type].hp(cycle), r: ENEMIES[type].r, slow: 1, held: false, cooldown: 1 + Math.random(), flank: Math.random() * Math.PI * 2, xp: type === 'shard' ? 2 : 1 };
}

// Keep the whole enemy beyond the camera, including pulser expansion and trails.
export function offscreenPosition(w, h, ox = 0, oy = 0, rng = Math.random) {
  const margin = 96, u = rng(), side = Math.floor(rng() * 4);
  return {
    x: ox + (side < 2 ? u * w : side === 2 ? -margin : w + margin),
    y: oy + (side < 2 ? (side ? h + margin : -margin) : u * h),
  };
}

function spawn(phase, cycle, count, w, h, ox, oy, held, rng) {
  const pool = phase === 'breakdown' ? ['drifter'] : Object.keys(ENEMIES).filter(k => ENEMIES[k].unlock <= cycle);
  return Array.from({ length: count }, () => {
    const { x, y } = offscreenPosition(w, h, ox, oy, rng);
    const e = makeEnemy(pool[Math.floor(rng() * pool.length)], x, y, cycle);
    e.held = held;
    return e;
  });
}

// Build waves wait outside the view until the drop releases them.
export function spawnWave(phase, cycle, w, h, ox = 0, oy = 0, rng = Math.random) {
  return spawn(phase, cycle, phase === 'breakdown' ? 3 : 12 + 6 * cycle, w, h, ox, oy, phase === 'build', rng);
}

// A fresh trickle every musical bar keeps pressure coming from every direction.
// Leave room for phase waves while bounding sustained reinforcement growth.
export function spawnReinforcements(phase, cycle, population, w, h, ox = 0, oy = 0, rng = Math.random) {
  const rate = phase === 'breakdown' ? 1 : (phase === 'build' ? 2 : 3) + Math.min(cycle, 5);
  const count = Math.max(0, Math.min(rate, 240 - population));
  return spawn(phase, cycle, count, w, h, ox, oy, false, rng);
}

export function recycleEnemy(e, w, h, ox = 0, oy = 0, rng = Math.random) {
  const margin = 320;
  if (e.held || (e.x >= ox - margin && e.x <= ox + w + margin && e.y >= oy - margin && e.y <= oy + h + margin)) return false;
  Object.assign(e, offscreenPosition(w, h, ox, oy, rng));
  // A chain must not draw a line back to its old position across the screen.
  if (e.trail) e.trail = [];
  e.lunge = 0; e.telegraph = 0; e.dashT = 0; e.cooldown = 1.5;
  return true;
}


export const ENEMY_COLORS = { drifter: '#5ff2ff', pulser: '#8affff', chain: '#53d9ff', splitter: '#a4f7ff', shard: '#5ff2ff', sentinel: '#c0ffff' };

// Attacks lock their aim before firing. Telegraphs give players time to dodge.
export function advanceEnemy(e, player, dt) {
  if (e.held) return [];
  if (e.frozen > 0) { e.frozen = Math.max(0, e.frozen - dt); return []; }
  const def = ENEMIES[e.type], bullets = [];
  const ranged = e.type === 'shard' || e.type === 'sentinel';
  if (ranged || e.type === 'pulser') {
    if (e.telegraph > 0) {
      e.telegraph = Math.max(0, e.telegraph - dt);
      if (!e.telegraph) {
        if (e.type === 'pulser') e.dashT = .42;
        else {
          const count = e.type === 'sentinel' ? 10 : 3;
          for (let i = 0; i < count; i++) {
            const angle = e.aim + (e.type === 'sentinel' ? i * Math.PI * 2 / count : (i - 1) * .22);
            bullets.push({ x: e.x, y: e.y, vx: Math.cos(angle) * 155, vy: Math.sin(angle) * 155, life: 4, r: 4 });
          }
        }
        e.cooldown = e.type === 'pulser' ? 2.4 : e.type === 'sentinel' ? 4 : 3;
      }
    } else {
      e.cooldown -= dt;
      if (e.cooldown <= 0 && Math.hypot(e.x - player.x, e.y - player.y) < 560) {
        e.aim = Math.atan2(player.y + (player.vy || 0) * .3 - e.y, player.x + (player.vx || 0) * .3 - e.x);
        e.telegraph = e.type === 'pulser' ? .7 : 1;
      }
    }
  }
  def.move(e, player, dt);
  return bullets;
}

export function makeElite(cycle, w, h, ox = 0, oy = 0, rng = Math.random) {
  const { x, y } = offscreenPosition(w, h, ox, oy, rng);
  const e = makeEnemy(cycle >= 4 ? 'sentinel' : 'pulser', x, y, cycle);
  e.elite = true; e.hp *= 6; e.maxHp = e.hp; e.r *= 1.6; e.xp = 18;
  return e;
}
