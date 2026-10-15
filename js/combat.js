export function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}
export function ringTouches(distance, radius, previousRadius, bodyRadius) {
  return distance + bodyRadius >= Math.min(radius, previousRadius) - 4 && distance - bodyRadius <= Math.max(radius, previousRadius) + 4;
}
