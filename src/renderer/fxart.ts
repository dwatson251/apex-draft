import { Container, Graphics } from "pixi.js";
import { FX_GROUND, halfIdx, type Fx, type Rng, type Segment, type Vec2 } from "@apex/sim";

/**
 * The paint of ramps, speed pads and patches of ice, sand, mud and water on a segment (see the sim's fx.ts). Drawn over the tarmac and its markings, under the cars.
 * Original art: flat shapes, chevrons and glints, nothing from the games.
 */
const at = (s: Segment, i: number, lat: number): Vec2 => ({ x: s.center[i]!.x + s.normals[i]!.x * lat, y: s.center[i]!.y + s.normals[i]!.y * lat });

/** A polygon over samples i0..i1 between two lateral offsets (functions of the sample so the road's width is followed). */
function band(g: Graphics, s: Segment, i0: number, i1: number, a: (i: number) => number, b: (i: number) => number): Graphics {
  const pts: number[] = [];
  for (let i = i0; i <= i1; i++) { const p = at(s, i, a(i)); pts.push(p.x, p.y); }
  for (let i = i1; i >= i0; i--) { const p = at(s, i, b(i)); pts.push(p.x, p.y); }
  return g.poly(pts);
}

/** Sample position (fractional) of a point t of the way along the segment. */
const pos = (s: Segment, t: number): { p: Vec2; n: Vec2; d: Vec2 } => {
  const f = Math.min(Math.max(t, 0), 1) * (s.center.length - 1), i = Math.min(s.center.length - 2, Math.floor(f)), u = f - i;
  const a = s.center[i]!, b = s.center[i + 1]!, na = s.normals[i]!, nb = s.normals[i + 1]!;
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { p: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, n: { x: na.x + (nb.x - na.x) * u, y: na.y + (nb.y - na.y) * u }, d: { x: (b.x - a.x) / l, y: (b.y - a.y) / l } };
};
const halfAtT = (s: Segment, t: number): number => {
  const f = Math.min(Math.max(t, 0), 1) * (s.center.length - 1), i = Math.min(s.center.length - 2, Math.floor(f));
  return (halfIdx(s, i) + halfIdx(s, i + 1)) / 2;
};

/** A row of chevrons (pointing the way the road goes) between t0 and t1. */
function chevrons(g: Graphics, s: Segment, t0: number, t1: number, step: number, color: number, alpha: number, width: number, size = 0.55): void {
  const len = Math.hypot(s.exit.mid.x - s.entry.mid.x, s.exit.mid.y - s.entry.mid.y) || 100;
  const gap = step / len;
  for (let t = t0 + gap / 2; t < t1; t += gap) {
    const { p, n, d } = pos(s, t), h = halfAtT(s, t) * size;
    const tip = { x: p.x + d.x * h * 0.55, y: p.y + d.y * h * 0.55 };
    g.moveTo(p.x - n.x * h - d.x * h * 0.2, p.y - n.y * h - d.y * h * 0.2).lineTo(tip.x, tip.y).lineTo(p.x + n.x * h - d.x * h * 0.2, p.y + n.y * h - d.y * h * 0.2).stroke({ width, color, alpha, cap: "round", join: "round" });
  }
}

export function fxArt(root: Container, s: Segment, rng: Rng): void {
  if (!s.fx) return;
  const n = s.center.length - 1;
  for (const fx of s.fx) {
    const i0 = Math.max(0, Math.floor(fx.t0 * n)), i1 = Math.min(n, Math.max(i0 + 1, Math.ceil(fx.t1 * n)));
    const hw = (i: number): number => halfIdx(s, i) - 1;
    const g = new Graphics();
    const ground = FX_GROUND[fx.type];
    if (ground) {
      band(g, s, i0, i1, (i) => -hw(i), hw).fill({ color: ground.color, alpha: fx.type === "water" ? 0.72 : 0.88 });
      const count = 18 + (i1 - i0) * 4;
      for (let k = 0; k < count; k++) {
        const t = fx.t0 + rng.next() * (fx.t1 - fx.t0), { p, n: nn } = pos(s, t), h = halfAtT(s, t), l = rng.range(-h + 2, h - 2), x = p.x + nn.x * l, y = p.y + nn.y * l;
        if (fx.type === "ice") g.moveTo(x - 1.4, y - 1).lineTo(x + 1.4, y + 1).stroke({ width: 0.5, color: 0xffffff, alpha: 0.85 });
        else if (fx.type === "sand") g.circle(x, y, rng.range(0.3, 0.8)).fill({ color: 0xf2e3b0, alpha: 0.7 });
        else if (fx.type === "mud") g.ellipse(x, y, rng.range(1, 2.4), rng.range(0.7, 1.5)).fill({ color: 0x3a2a1c, alpha: 0.6 });
        else g.moveTo(x - 2, y).lineTo(x + 2, y).stroke({ width: 0.5, color: 0xcfeaff, alpha: 0.7 });
      }
      root.addChild(g);
    } else if (fx.type === "boost") {
      band(g, s, i0, i1, (i) => -hw(i) * 0.7, (i) => hw(i) * 0.7).fill({ color: 0x14161c, alpha: 0.55 });
      band(g, s, i0, i1, (i) => -hw(i) * 0.7 - 0.8, (i) => -hw(i) * 0.7).fill({ color: 0xffcf3f, alpha: 0.9 });
      band(g, s, i0, i1, (i) => hw(i) * 0.7, (i) => hw(i) * 0.7 + 0.8).fill({ color: 0xffcf3f, alpha: 0.9 });
      chevrons(g, s, fx.t0, fx.t1, 11, 0xffcf3f, 0.95, 2.2, 0.55);
      chevrons(g, s, fx.t0, fx.t1, 11, 0xffe98a, 0.35, 5, 0.55);
      root.addChild(g);
    } else {
      // a ramp: a wedge across the road that gets lighter toward the lip, chevrons up it, the lip itself, and a dark gap past it where the car is not on the ground
      const glide = fx.type === "glide";
      const body = glide ? 0x8a6cd8 : 0xd8553a;
      const steps = Math.max(3, i1 - i0);
      for (let k = 0; k < steps; k++) {
        const a = i0 + ((i1 - i0) * k) / steps, b = i0 + ((i1 - i0) * (k + 1)) / steps;
        const ia = Math.floor(a), ib = Math.min(n, Math.ceil(b));
        band(g, s, ia, Math.max(ia + 1, ib), (i) => -hw(i) * 0.9, (i) => hw(i) * 0.9).fill({ color: body, alpha: 0.35 + 0.5 * ((k + 1) / steps) });
      }
      chevrons(g, s, fx.t0, fx.t1, glide ? 14 : 10, 0xfff2c8, 0.95, 2.2, 0.6);
      // the lip
      const e = pos(s, fx.t1), h = halfAtT(s, fx.t1) * 0.9;
      g.moveTo(e.p.x - e.n.x * h, e.p.y - e.n.y * h).lineTo(e.p.x + e.n.x * h, e.p.y + e.n.y * h).stroke({ width: 3.2, color: 0xfff2c8, alpha: 0.95, cap: "butt" });
      if (glide) {
        // wings: two swept strokes across the middle of the ramp
        const m = pos(s, (fx.t0 + fx.t1) / 2), w = halfAtT(s, (fx.t0 + fx.t1) / 2) * 0.7;
        for (const side of [-1, 1]) g.moveTo(m.p.x, m.p.y).lineTo(m.p.x + m.n.x * side * w - m.d.x * w * 0.5, m.p.y + m.n.y * side * w - m.d.y * w * 0.5).stroke({ width: 2.6, color: 0xffffff, alpha: 0.9, cap: "round" });
      }
      root.addChild(g);
      const shadow = new Graphics();
      const j0 = Math.min(n - 1, i1), j1 = Math.min(n, i1 + 3);
      if (j1 > j0) band(shadow, s, j0, j1, (i) => -hw(i) * 0.9, (i) => hw(i) * 0.9).fill({ color: 0x000000, alpha: 0.18 });
      root.addChild(shadow);
    }
  }
}
export type { Fx };
