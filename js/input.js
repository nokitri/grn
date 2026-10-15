const keys = new Set(), cbs = [];
let t0 = null, tv = { x: 0, y: 0 }, dash = false;
const uiTarget = target => target?.closest?.('button, input, select, .panel');
export function clearInput() { keys.clear(); t0 = null; tv = { x: 0, y: 0 }; dash = false; }
export function requestDash() { dash = true; }
export function takeDash() { const wanted = dash; dash = false; return wanted; }
if (typeof window !== 'undefined') {
  addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!e.repeat) cbs.forEach(f => f()); return; }
    if (uiTarget(e.target)) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (e.code === 'Space' || e.key === 'Shift') { if (!e.repeat) requestDash(); return; }
    keys.add(e.key.toLowerCase());
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', clearInput);
  addEventListener('touchstart', e => {
    if (uiTarget(e.target) || t0) return;
    const touch = e.changedTouches[0];
    t0 = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (!t0) return;
    const touch = [...e.touches].find(t => t.identifier === t0.id);
    if (!touch) return;
    e.preventDefault();
    const dx = touch.clientX - t0.x, dy = touch.clientY - t0.y, l = Math.hypot(dx, dy);
    tv = l ? { x: dx / l * Math.min(1, l / 60), y: dy / l * Math.min(1, l / 60) } : { x: 0, y: 0 };
  }, { passive: false });
  const end = e => { if (!t0 || [...e.touches].some(t => t.identifier === t0.id)) return; t0 = null; tv = { x: 0, y: 0 }; };
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
