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
  /** the car's real size and the way it is pointing as drawn: with all three, contact is between two rectangles and not two discs */
  length?: number;
  width?: number;
  h?: number;
  mass: number;
  /** stopped in its pit box: very hard to shift */
  anchored: boolean;
  /** how much traction it has right now (1 on dry tarmac with fresh tyres; far less on snow or a wet track): a slippery car is thrown further */
  grip?: number;
}

/** How bouncy a hit is. */
export const RESTITUTION = 0.2;
/** Share of the speed a car loses when it is hit side-on, at full closing speed. */
const SIDE_LOSS = 0.45;
/** Extra sideways kick, per unit of impulse, for a car that is hit side-on, and the same again for how slippery it is. */
const SLIDE_KICK = 0.35;
const SLIDE_GRIP_KICK = 1.1;

/** What the last contact was like, for the race to decide on spins: how hard they closed, and how square-on each car was hit. */
export const lastImpact = { closing: 0, alignA: 1, alignB: 1 };
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

export interface Contact { nx: number; ny: number; depth: number }

/**
 * Whether two cars touch, and how: the way out of each other that takes the least (the contact normal, pointing from `a` to `b`) and how
 * far in they are. Two rectangles of the cars' own length and width (separating axis test) when both have a size, so a long car's nose and
 * tail count and nobody drives through a bumper; otherwise two discs.
 */
export function contact(a: Body, b: Body): Contact | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (a.length === undefined || a.width === undefined || b.length === undefined || b.width === undefined) {
    const reach = a.radius + b.radius, d2 = dx * dx + dy * dy;
    if (d2 >= reach * reach) return null;
    const d = Math.sqrt(d2);
    return { nx: d > 1e-6 ? dx / d : -Math.sin(a.hp), ny: d > 1e-6 ? dy / d : Math.cos(a.hp), depth: reach - d };
  }
  const ha = a.h ?? a.hp, hb = b.h ?? b.hp;
  const ca = Math.cos(ha), sa = Math.sin(ha), cb = Math.cos(hb), sb = Math.sin(hb);
  const hla = a.length / 2, hwa = a.width / 2, hlb = b.length / 2, hwb = b.width / 2;
  let best = Infinity, bx = 0, by = 0;
  // the four axes: each car's length and each car's width
  for (const [ax, ay] of [[ca, sa], [-sa, ca], [cb, sb], [-sb, cb]] as const) {
    const ra = hla * Math.abs(ax * ca + ay * sa) + hwa * Math.abs(ax * -sa + ay * ca);
    const rb = hlb * Math.abs(ax * cb + ay * sb) + hwb * Math.abs(ax * -sb + ay * cb);
    const dist = dx * ax + dy * ay, overlap = ra + rb - Math.abs(dist);
    if (overlap <= 0) return null;
    if (overlap < best) { best = overlap; bx = dist < 0 ? -ax : ax; by = dist < 0 ? -ay : ay; }
  }
  return { nx: bx, ny: by, depth: best };
}

/**
 * Resolve a contact between two cars, changing both. Returns the strength of the hit (the impulse), or -1 when they
 * are not touching.
 */
export function impact(a: Body, b: Body): number {
  const hit = contact(a, b);
  if (!hit) return -1;
  // (the record of the hit is this one's: a touch with nobody closing must not inherit the speed of an earlier hit, which spun cars that were barely moving)
  lastImpact.closing = 0; lastImpact.alignA = 1; lastImpact.alignB = 1;
  const { nx, ny } = hit;
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
    // a hit at speed costs much more than a nudge, and a car with little grip loses more of its speed and is thrown further sideways
    const power = Math.min(1.6, -closing / 45);
    const slipA = 1 - Math.min(1.2, Math.max(0.3, a.grip ?? 1)), slipB = 1 - Math.min(1.2, Math.max(0.3, b.grip ?? 1));
    a.v *= 1 - Math.min(0.85, SIDE_LOSS * (1 - alignA) * power * (1 + 1.2 * slipA));
    b.v *= 1 - Math.min(0.85, SIDE_LOSS * (1 - alignB) * power * (1 + 1.2 * slipB));
    // an extra shove sideways, equal and opposite on the two cars (so momentum still holds): as big as the worse of the two hits
    const slide = j * Math.max((1 - alignA) * (SLIDE_KICK + SLIDE_GRIP_KICK * Math.max(0, slipA)), (1 - alignB) * (SLIDE_KICK + SLIDE_GRIP_KICK * Math.max(0, slipB)));
    kick(a, (-nx * slide) / ma, (-ny * slide) / ma);
    kick(b, (nx * slide) / mb, (ny * slide) / mb);
    lastImpact.closing = -closing; lastImpact.alignA = alignA; lastImpact.alignB = alignB;
  }
  // and prise them apart, so they do not sit inside each other: the lighter car moves more
  const push = Math.max(0, hit.depth - 0.15) * 0.9;
  if (push > 0) {
    shove(a, (-nx * push * mb) / (ma + mb), (-ny * push * mb) / (ma + mb));
    shove(b, (nx * push * ma) / (ma + mb), (ny * push * ma) / (ma + mb));
  }
  if (a.anchored) a.v = 0;
  if (b.anchored) b.v = 0;
  return j;
}
