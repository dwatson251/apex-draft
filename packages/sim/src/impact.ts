/**
 * What happens when two cars touch. Each car is a disc on its own line: it has a speed along the line (`v`) and a
 * sideways speed (`offV`) that a spring in the race pulls back to nothing, so cars do their best to return to their
 * line. Contact is an impulse along the line between the two centres, shared by mass:
 *   - a nudge from behind takes speed off the car behind and puts it on the car in front;
 *   - side by side, both are kicked apart equally;
 *   - a T-bone throws the struck car sideways and takes a lot of its speed, and takes a lot of the striker's speed
 *     too, but the striker's impulse is along its own heading so it keeps its line.
 */
export interface Body {
  x: number;
  y: number;
  /** heading of the line at the car, radians */
  hp: number;
  /** speed along the line */
  v: number;
  /** distance from the line, and how fast it is changing */
  off: number;
  offV: number;
  /** distance along the lap */
  s: number;
  radius: number;
  mass: number;
  /** stopped in its pit box: very hard to shift */
  anchored: boolean;
}

/** How bouncy a hit is. */
export const RESTITUTION = 0.2;
/** Share of the speed a car loses when it is hit side-on, at full closing speed. */
const SIDE_LOSS = 0.3;
const MAX_SHIFT = 3;

const velocity = (c: Body) => ({
  x: Math.cos(c.hp) * c.v - Math.sin(c.hp) * c.offV,
  y: Math.sin(c.hp) * c.v + Math.cos(c.hp) * c.offV,
});

function kick(c: Body, dvx: number, dvy: number): void {
  c.v = Math.max(0, c.v + dvx * Math.cos(c.hp) + dvy * Math.sin(c.hp));
  c.offV += -dvx * Math.sin(c.hp) + dvy * Math.cos(c.hp);
}

function shove(c: Body, dx: number, dy: number): void {
  const along = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, dx * Math.cos(c.hp) + dy * Math.sin(c.hp)));
  const across = dx * -Math.sin(c.hp) + dy * Math.cos(c.hp);
  c.s += along;
  c.off += across;
  c.x += dx; c.y += dy;
}

/**
 * Resolve a contact between two cars, changing both. Returns the strength of the hit (the impulse), or -1 when they
 * are not touching.
 */
export function impact(a: Body, b: Body): number {
  const dx = b.x - a.x, dy = b.y - a.y, reach = a.radius + b.radius;
  if (dx * dx + dy * dy >= reach * reach) return -1;
  const d = Math.hypot(dx, dy);
  const nx = d > 1e-6 ? dx / d : -Math.sin(a.hp), ny = d > 1e-6 ? dy / d : Math.cos(a.hp);
  const ma = a.mass * (a.anchored ? 8 : 1), mb = b.mass * (b.anchored ? 8 : 1);
  const va = velocity(a), vb = velocity(b);
  const closing = (vb.x - va.x) * nx + (vb.y - va.y) * ny; // negative when they are coming together
  let j = 0;
  if (closing < 0) {
    j = (-(1 + RESTITUTION) * closing) / (1 / ma + 1 / mb);
    // how square on each car is hit: 1 is nose or tail, 0 is the side
    const alignA = Math.abs(nx * Math.cos(a.hp) + ny * Math.sin(a.hp));
    const alignB = Math.abs(nx * Math.cos(b.hp) + ny * Math.sin(b.hp));
    kick(a, (-j * nx) / ma, (-j * ny) / ma);
    kick(b, (j * nx) / mb, (j * ny) / mb);
    const power = Math.min(1, -closing / 45);
    a.v *= 1 - SIDE_LOSS * (1 - alignA) * power;
    b.v *= 1 - SIDE_LOSS * (1 - alignB) * power;
  }
  // and prise them apart, so they do not sit inside each other: the lighter car moves more
  const push = Math.max(0, reach - d - 0.15) * 0.9;
  if (push > 0) {
    shove(a, (-nx * push * mb) / (ma + mb), (-ny * push * mb) / (ma + mb));
    shove(b, (nx * push * ma) / (ma + mb), (ny * push * ma) / (ma + mb));
  }
  if (a.anchored) a.v = 0;
  if (b.anchored) b.v = 0;
  return j;
}
