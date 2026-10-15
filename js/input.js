const keys = new Set(), cbs = [];
let t0 = null, tv = { x: 0, y: 0 };
const pause = () => cbs.forEach(f => f());

if (typeof window !== 'undefined') {
  addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!e.repeat) pause(); return; }
    keys.add(e.key.toLowerCase());
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => { keys.clear(); t0 = null; tv = { x: 0, y: 0 }; });
  addEventListener('touchstart', e => {
    if (e.touches.length === 2) { pause(); t0 = null; tv = { x: 0, y: 0 }; return; }
    t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (!t0 || e.touches.length > 1) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - t0.x, dy = e.touches[0].clientY - t0.y, l = Math.hypot(dx, dy);
    tv = l ? { x: dx / l * Math.min(1, l / 60), y: dy / l * Math.min(1, l / 60) } : { x: 0, y: 0 };
  }, { passive: false });
  const end = () => { t0 = null; tv = { x: 0, y: 0 }; };
  addEventListener('touchend', end); addEventListener('touchcancel', end);
}

export function readMove() {
  let x = tv.x, y = tv.y;
  const k = (...n) => n.some(v => keys.has(v));
  x += k('d', 'arrowright') - k('a', 'arrowleft');
  y += k('s', 'arrowdown') - k('w', 'arrowup');
  const l = Math.hypot(x, y);
  return l > 1 ? { x: x / l, y: y / l } : { x, y };
}
export const onPause = cb => cbs.push(cb);
