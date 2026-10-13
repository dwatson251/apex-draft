import { Container, Graphics, Text } from "pixi.js";
import {
  PIT_BOX_A, PIT_ENTRY_A, PIT_EXIT_A, PIT_HALF, PIT_LANE_FROM, PIT_LANE_TO, PIT_LAT, PIT_LIMIT_A, PIT_SPEED, ROAD_HALF, Rng, centreAt, cross, dot, laneCentre, pitPoint, sub,
  type Segment, type Track, type Vec2,
} from "@apex/sim";

/** Retro palette: flat colours, a few tones each, light from the top left. */
export const PAL = {
  asphalt: 0x3b3e47, asphaltWorn: 0x34373f, speck: 0x6d7280, paint: 0xeeeeea,
  kerbRed: 0xd8393a, kerbWhite: 0xf3f1ea, gravel: 0xcdb682, gravelDark: 0xa58f5c,
  concrete: 0x59606f, concreteDark: 0x434958,
  crowd: [0xe84a4a, 0xf2c744, 0x4a8fe8, 0xf1f1f1, 0xe86bb5, 0x5ad07a, 0xff9a3c],
  ads: [0xd8393a, 0xf2c744, 0x2f6fd0, 0xf1f1f1],
  box: 0xb2773c, boxDark: 0x6b4520, water: 0x2f7fcf, waterLight: 0x7cc0f5, waterDark: 0x1d4f8a,
  boost: 0xffcf3f, grip: 0x4fd28a, ghost: 0xb48cff,
};

const at = (s: Segment, i: number, lat: number): Vec2 => ({ x: s.center[i]!.x + s.normals[i]!.x * lat, y: s.center[i]!.y + s.normals[i]!.y * lat });

function strip(g: Graphics, s: Segment, i0: number, i1: number, latA: number, latB: number): Graphics {
  const pts: number[] = [];
  for (let i = i0; i <= i1; i++) { const p = at(s, i, latA); pts.push(p.x, p.y); }
  for (let i = i1; i >= i0; i--) { const p = at(s, i, latB); pts.push(p.x, p.y); }
  return g.poly(pts);
}

export interface SegmentArt {
  root: Container;
  /** the two frames of the crowd; they swap a few times a second */
  crowdA: Graphics[];
  crowdB: Graphics[];
  pulses: Container[];
}

/** One segment: tarmac, markings, sausage kerbs, apex paint, gravel traps, grandstands, obstacles, pick-ups. */
export function buildSegmentArt(track: Track, s: Segment): SegmentArt {
  const rng = new Rng(track.seed ^ (Math.imul(s.index + 1, 0x9e3779b1) >>> 0));
  const root = new Container();
  const art: SegmentArt = { root, crowdA: [], crowdB: [], pulses: [] };
  const n = s.center.length - 1;

  // turning angle at each sample: positive turns toward the +normal side
  const ang = new Array<number>(n + 1).fill(0);
  for (let i = 1; i < n; i++) {
    const d0 = sub(s.center[i]!, s.center[i - 1]!), d1 = sub(s.center[i + 1]!, s.center[i]!);
    ang[i] = Math.atan2(cross(d0, d1), dot(d0, d1));
  }
  const total = ang.reduce((a, b) => a + b, 0);

  // gravel trap on the outside of a real corner
  if ((s.kind === "corner" || s.kind === "sharp") && Math.abs(total) > 0.8) {
    const out = total > 0 ? -1 : 1;
    const g = new Graphics();
    const i0 = 5, i1 = 19;
    const pts: number[] = [];
    for (let i = i0; i <= i1; i++) { const p = at(s, i, out * (ROAD_HALF + 1)); pts.push(p.x, p.y); }
    for (let i = i1; i >= i0; i--) {
      const depth = 4 + 10 * Math.sin((Math.PI * (i - i0)) / (i1 - i0));
      const p = at(s, i, out * (ROAD_HALF + 1 + depth)); pts.push(p.x, p.y);
    }
    g.poly(pts).fill(PAL.gravel).stroke({ width: 0.8, color: PAL.gravelDark });
    for (let k = 0; k < 40; k++) {
      const i = i0 + rng.int(i1 - i0), p = at(s, i, out * (ROAD_HALF + rng.range(2, 9)));
      g.circle(p.x, p.y, rng.range(0.3, 0.8)).fill({ color: PAL.gravelDark, alpha: 0.7 });
    }
    root.addChild(g);
  }

  // grandstands: the start straight on both sides, other straights on one side now and then
  // (the pit lane takes the other side of the two straights beside the start line)
  const pitSeg = s.index === 0 || s.index === track.segments.length - 1;
  const sides: (1 | -1)[] = pitSeg
    ? (s.index === 0 || rng.chance(0.5) ? [(-track.pit.side) as 1 | -1] : [])
    : s.kind === "straight" && rng.chance(0.5) ? [rng.chance(0.5) ? 1 : -1] : [];
  for (const side of sides) root.addChild(stand(art, s, side, rng));

  // tarmac
  const road = new Graphics();
  strip(road, s, 0, n, -ROAD_HALF, ROAD_HALF).fill(PAL.asphalt);
  strip(road, s, 0, n, -7, 7).fill({ color: PAL.asphaltWorn, alpha: 0.55 });
  for (let k = 0; k < 90; k++) {
    const t = rng.next(), c = centreAt(s, t), l = rng.range(-ROAD_HALF + 1, ROAD_HALF - 1);
    road.circle(c.p.x + c.n.x * l, c.p.y + c.n.y * l, rng.range(0.3, 0.8)).fill({ color: PAL.speck, alpha: rng.range(0.25, 0.6) });
  }
  // a hair of overlap at both gates, so no grass seam shows between neighbouring segments
  for (const [gate, push] of [[s.entry, -0.9], [s.exit, 0.9]] as const) {
    const pt = (l: number, a: number) => [gate.mid.x + gate.n.x * l + gate.dir.x * a, gate.mid.y + gate.n.y * l + gate.dir.y * a];
    road.poly([...pt(-ROAD_HALF, 0), ...pt(ROAD_HALF, 0), ...pt(ROAD_HALF, push), ...pt(-ROAD_HALF, push)]).fill(PAL.asphalt);
  }
  root.addChild(road);

  // paint: edge lines and a faint dashed centre line
  const paint = new Graphics();
  for (const side of [-1, 1]) {
    const p0 = at(s, 0, side * (ROAD_HALF - 2.6));
    paint.moveTo(p0.x, p0.y);
    for (let i = 1; i <= n; i++) { const p = at(s, i, side * (ROAD_HALF - 2.6)); paint.lineTo(p.x, p.y); }
    paint.stroke({ width: 1, color: PAL.paint, alpha: 0.85 });
  }
  for (let i = 0; i < n; i += 2) paint.moveTo(s.center[i]!.x, s.center[i]!.y).lineTo(s.center[i + 1]!.x, s.center[i + 1]!.y);
  paint.stroke({ width: 0.8, color: PAL.paint, alpha: 0.28 });
  root.addChild(paint);

  // sausage kerbs on the inside of every bend, alternating red and white
  const kerbs = new Graphics();
  for (let i = 1; i < n - 1; i++) {
    const a = (ang[i]! + ang[i + 1]!) / 2;
    if (Math.abs(a) < 0.045) continue;
    const side = a > 0 ? 1 : -1;
    const p = at(s, i, side * (ROAD_HALF - 0.2)), q = at(s, i + 1, side * (ROAD_HALF - 0.2));
    kerbs.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 3.6, color: 0x2a1010, alpha: 0.35, cap: "round" });
    kerbs.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 3, color: i % 2 ? PAL.kerbRed : PAL.kerbWhite, cap: "round" });
  }
  root.addChild(kerbs);

  // apexes: a painted arrowhead on the tarmac at the tightest point of each bend
  const apex = new Graphics();
  for (let i = 2; i < n - 1; i++) {
    const m = Math.abs(ang[i]!);
    if (m < 0.07 || m < Math.abs(ang[i - 1]!) || m <= Math.abs(ang[i + 1]!)) continue;
    const side = ang[i]! > 0 ? 1 : -1;
    const p = at(s, i, side * (ROAD_HALF - 8));
    const d = sub(s.center[i + 1]!, s.center[i - 1]!), l = Math.hypot(d.x, d.y) || 1, t = { x: d.x / l, y: d.y / l };
    const nn = s.normals[i]!;
    apex.poly([p.x + t.x * 3.4, p.y + t.y * 3.4, p.x - t.x * 1.8 + nn.x * 2.3, p.y - t.y * 1.8 + nn.y * 2.3,
      p.x - t.x * 0.4, p.y - t.y * 0.4, p.x - t.x * 1.8 - nn.x * 2.3, p.y - t.y * 1.8 - nn.y * 2.3]).fill({ color: PAL.paint, alpha: 0.8 });
  }
  root.addChild(apex);

  if (s.index === 0) root.addChild(startLine(s));
  if (pitSeg) root.addChild(pitArt(track, s.index === 0));

  // obstacles
  for (const o of s.obstacles) {
    const g = new Graphics();
    if (o.kind === "box") {
      g.rect(-o.r + 1.4, -o.r + 2, 2 * o.r, 2 * o.r).fill({ color: 0x000000, alpha: 0.3 });
      g.rect(-o.r, -o.r, 2 * o.r, 2 * o.r).fill(PAL.box).stroke({ width: 1, color: PAL.boxDark });
      g.moveTo(-o.r, -o.r).lineTo(o.r, o.r).moveTo(o.r, -o.r).lineTo(-o.r, o.r).stroke({ width: 0.8, color: PAL.boxDark });
      g.rect(-o.r, -o.r, 2 * o.r, 1.4).fill({ color: 0xffffff, alpha: 0.2 });
    } else {
      g.ellipse(0, 0, o.r * 1.05, o.r * 0.9).fill(PAL.water).stroke({ width: 1, color: PAL.waterDark });
      g.ellipse(-o.r * 0.2, -o.r * 0.22, o.r * 0.55, o.r * 0.4).fill({ color: PAL.waterLight, alpha: 0.55 });
      g.ellipse(0, 0, o.r * 0.78, o.r * 0.64).stroke({ width: 0.6, color: 0xffffff, alpha: 0.4 });
    }
    g.position.set(o.x, o.y);
    root.addChild(g);
  }

  // power-up pick-ups
  if (s.powerup) {
    const pu = s.powerup, col = PAL[pu.kind];
    const g = new Container();
    g.addChild(new Graphics().circle(0, 0, pu.r + 3).fill({ color: col, alpha: 0.18 }));
    g.addChild(new Graphics().circle(0, 0, pu.r).fill({ color: 0x14161c, alpha: 0.75 }).stroke({ width: 1.6, color: col }));
    const t = new Text({ text: pu.kind === "boost" ? "B" : pu.kind === "grip" ? "G" : "H", style: { fontSize: 9, fill: col, fontWeight: "700" } });
    t.anchor.set(0.5);
    g.addChild(t);
    g.position.set(pu.x, pu.y);
    root.addChild(g);
    art.pulses.push(g);
  }
  return art;
}

/** A grandstand with advertising boards, three rows of spectators, and a second frame so they bob about. */
function stand(art: SegmentArt, s: Segment, side: 1 | -1, rng: Rng): Container {
  const c = new Container();
  const lat0 = ROAD_HALF + 9, depth = 14, i0 = 3, i1 = 21;
  const base = new Graphics();
  strip(base, s, i0, i1, side * lat0, side * (lat0 + depth)).fill(PAL.concrete).stroke({ width: 0.8, color: PAL.concreteDark });
  for (const r of [0.33, 0.66]) {
    const pts: number[] = [];
    for (let i = i0; i <= i1; i++) { const p = at(s, i, side * (lat0 + depth * r)); pts.push(p.x, p.y); }
    base.moveTo(pts[0]!, pts[1]!);
    for (let k = 2; k < pts.length; k += 2) base.lineTo(pts[k]!, pts[k + 1]!);
    base.stroke({ width: 0.7, color: PAL.concreteDark });
  }
  // advertising boards along the front
  for (let i = i0; i < i1; i++) {
    const p = at(s, i, side * (lat0 - 1.6)), q = at(s, i + 1, side * (lat0 - 1.6));
    base.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 2.2, color: PAL.ads[Math.floor(i / 2) % PAL.ads.length] });
  }
  c.addChild(base);
  const a = new Graphics(), b = new Graphics();
  for (let row = 0; row < 3; row++) {
    const lat = side * (lat0 + 2.6 + row * 4.2);
    for (let t = 0.14; t < 0.86; t += 0.027) {
      const m = centreAt(s, t), col = rng.pick(PAL.crowd), jump = rng.chance(0.5) ? -0.8 : 0;
      const x = m.p.x + m.n.x * lat + rng.range(-0.3, 0.3), y = m.p.y + m.n.y * lat;
      a.circle(x, y, 1.15).fill(col);
      b.circle(x, y + jump, 1.15).fill(col);
    }
  }
  b.visible = false;
  c.addChild(a, b);
  art.crowdA.push(a);
  art.crowdB.push(b);
  return c;
}

/** Chequered line across the start gate, with a gantry just before it. */
function startLine(s: Segment): Container {
  const c = new Container();
  const g = new Graphics();
  const { mid, dir, n } = s.entry;
  const sq = 4, cols = Math.round((2 * ROAD_HALF) / sq);
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < cols; k++) {
      const l0 = -ROAD_HALF + k * sq, l1 = l0 + sq, a0 = (r - 1) * sq, a1 = a0 + sq;
      const pt = (l: number, a: number) => [mid.x + n.x * l + dir.x * a, mid.y + n.y * l + dir.y * a];
      g.poly([...pt(l0, a0), ...pt(l1, a0), ...pt(l1, a1), ...pt(l0, a1)]).fill((r + k) % 2 ? 0x16171c : 0xf5f5f0);
    }
  }
  c.addChild(g);
  const gantry = new Graphics();
  const L = ROAD_HALF + 4;
  const pt = (l: number, a: number) => [mid.x + n.x * l + dir.x * a, mid.y + n.y * l + dir.y * a];
  gantry.poly([...pt(-L + 1.2, -9.5), ...pt(L + 1.2, -9.5), ...pt(L + 1.2, -6.9), ...pt(-L + 1.2, -6.9)]).fill({ color: 0x000000, alpha: 0.3 });
  gantry.poly([...pt(-L, -10), ...pt(L, -10), ...pt(L, -7.5), ...pt(-L, -7.5)]).fill(0x2b2e38);
  for (let k = 0; k < 8; k++) {
    const l0 = -L + (k * 2 * L) / 8, l1 = l0 + (2 * L) / 8;
    gantry.poly([...pt(l0, -9.4), ...pt(l1, -9.4), ...pt(l1, -8.1), ...pt(l0, -8.1)]).fill(k % 2 ? PAL.kerbRed : PAL.kerbWhite);
  }
  for (const side of [-1, 1]) {
    const p = pt(side * L, -8.7);
    gantry.circle(p[0]!, p[1]!, 2.2).fill(0x14161c);
  }
  c.addChild(gantry);
  return c;
}

const TEAM = [0xd8393a, 0x2f6fd0, 0xf2c744, 0x4fd28a, 0xe86bb5, 0xff9a3c];

/** The pit lane, wall and garages, tacked on beside the straight. Each straight draws its own half, split at the start line. */
function pitArt(track: Track, head: boolean): Container {
  const c = new Container(), pit = track.pit;
  const a0 = head ? 0 : PIT_ENTRY_A, a1 = head ? PIT_EXIT_A : 0;
  const P = (a: number, lat: number) => pitPoint(pit, a, lat);
  const angle = Math.atan2(pit.dir.y, pit.dir.x);
  const poly = (pts: Vec2[]) => pts.flatMap((p) => [p.x, p.y]);
  // the lane never draws over the road: its inner edge stops at the road's edge, so the ramps simply start there
  const edge = ROAD_HALF + 2.6;

  const lane = new Graphics();
  const inner: Vec2[] = [], outer: Vec2[] = [];
  for (let a = a0; a <= a1; a += 1) {
    const m = laneCentre(a), lo = Math.max(m - PIT_HALF, edge), hi = m + PIT_HALF;
    if (hi - lo < 1.2) continue;
    inner.push(P(a, lo)); outer.push(P(a, hi));
  }
  if (inner.length > 1) {
    lane.poly(poly([...inner, ...outer.reverse()])).fill(0x464952);
    // paint: a white line along the outer edge, yellow dashes along the inner edge
    const line = (pts: Vec2[], color: number, dashed: boolean, width: number) => {
      pts.forEach((p, i) => { if (i && (!dashed || Math.floor(i / 3) % 2 === 0)) lane.moveTo(pts[i - 1]!.x, pts[i - 1]!.y).lineTo(p.x, p.y); });
      lane.stroke({ width, color, alpha: 0.9 });
    };
    line(outer.slice().reverse(), PAL.paint, false, 0.8);
    line(inner, 0xf2c744, true, 0.8);
  }
  c.addChild(lane);

  // the pit wall between the road and the lane, with a barrier stripe
  const wall = new Graphics();
  const wa0 = Math.max(a0, PIT_LANE_FROM - 6), wa1 = Math.min(a1, PIT_LANE_TO + 6);
  for (let a = wa0; a < wa1; a += 3) {
    const q = (lat: number) => [P(a, lat), P(Math.min(a + 3, wa1), lat)];
    const [p0, p1] = q(ROAD_HALF + 3.1), [p2, p3] = q(ROAD_HALF + 5.6);
    wall.poly(poly([p0!, p1!, p3!, p2!])).fill(Math.floor(a / 3) % 2 ? PAL.kerbRed : PAL.kerbWhite);
  }
  if (wa1 > wa0) {
    const a = P(wa0, ROAD_HALF + 3.1), b = P(wa1, ROAD_HALF + 3.1), d = P(wa0, ROAD_HALF + 5.6), e = P(wa1, ROAD_HALF + 5.6);
    wall.moveTo(a.x, a.y).lineTo(b.x, b.y).moveTo(d.x, d.y).lineTo(e.x, e.y).stroke({ width: 0.5, color: 0x1c1d24, alpha: 0.8 });
  }
  c.addChild(wall);

  // the stopping box: team colour, with corner marks
  const marks = new Graphics();
  if (PIT_BOX_A >= a0 && PIT_BOX_A <= a1) {
    const box = [[-6.5, -5], [6.5, -5], [6.5, 5], [-6.5, 5]].map(([da, dl]) => P(PIT_BOX_A + da!, PIT_LAT + dl!));
    marks.poly(poly(box)).fill({ color: TEAM[0]!, alpha: 0.28 }).stroke({ width: 0.9, color: 0xf2c744 });
    for (const [da, dl] of [[-6.5, -5], [6.5, -5], [6.5, 5], [-6.5, 5]] as const) {
      const p = P(PIT_BOX_A + da, PIT_LAT + dl);
      marks.circle(p.x, p.y, 0.9).fill(0xf2c744);
    }
  }
  c.addChild(marks);

  // the speed-limit roundel where the lane starts, and the word PIT on the tarmac
  const sign = -PIT_LIMIT_A + 3;
  if (sign >= a0 && sign <= a1) {
    const p = P(sign, PIT_LAT);
    const g = new Container();
    g.addChild(new Graphics().circle(0, 0, 4.2).fill({ color: 0xf1f1ee, alpha: 0.92 }).stroke({ width: 1, color: 0xd8393a }));
    const t = new Text({ text: String(PIT_SPEED), style: { fontSize: 5.4, fill: 0x14161c, fontWeight: "700" } });
    t.anchor.set(0.5);
    g.addChild(t);
    g.position.set(p.x, p.y); g.rotation = angle;
    c.addChild(g);
  }
  const word = head ? 22 : -40;
  if (word >= a0 && word <= a1) {
    const p = P(word, PIT_LAT);
    const t = new Text({ text: "PIT", style: { fontSize: 7, fill: 0xf1f1ee, fontWeight: "700", letterSpacing: 1.5 } });
    t.anchor.set(0.5); t.alpha = 0.55; t.rotation = angle + Math.PI / 2; t.position.set(p.x, p.y);
    c.addChild(t);
  }

  // the pit building: a row of bays with team-coloured doors, a roof ridge, lights; tyre stacks at each end
  const gar = new Graphics();
  const bay = PIT_LAT + PIT_HALF + 1.4, depth = 6.4;
  for (let k = 0; k < 6; k++) {
    const ga = -31.5 + k * 10.5;
    if ((ga >= 0) !== head) continue;
    const q = (da: number, dl: number) => P(ga + da, dl);
    const box = (d0: number, d1: number, l0: number, l1: number) => poly([q(d0, l0), q(d1, l0), q(d1, l1), q(d0, l1)]);
    gar.poly(box(0.4, 9.6, bay + 0.8, bay + depth + 0.8)).fill({ color: 0x000000, alpha: 0.25 });
    gar.poly(box(0, 9.2, bay, bay + depth)).fill(0x646b7c).stroke({ width: 0.6, color: 0x2f333f });
    gar.poly(box(0.6, 8.6, bay + 0.2, bay + 2.4)).fill(TEAM[k % TEAM.length]!);         // the door, facing the lane
    gar.poly(box(0.6, 8.6, bay + 0.2, bay + 0.8)).fill({ color: 0xffffff, alpha: 0.28 });
    gar.poly(box(0, 9.2, bay + depth * 0.45, bay + depth * 0.55)).fill({ color: 0xffffff, alpha: 0.2 }); // roof ridge
    const lamp = q(4.6, bay - 0.7);
    gar.circle(lamp.x, lamp.y, 0.7).fill(k % 2 ? 0x4fd28a : 0xff5d6c);
  }
  // tyre stacks at the start of the wall
  for (const [a, row] of [[-PIT_LANE_FROM + 2, 0], [-PIT_LANE_FROM + 2, 1], [PIT_LANE_FROM - 2, 0], [PIT_LANE_FROM - 2, 1]] as const) {
    const aa = head ? -PIT_LANE_FROM - 4 + row * 3.4 - 0 : PIT_LANE_FROM + 2 + row * 3.4;
    void a;
    if ((aa >= 0) !== head) continue;
    const p = P(aa, ROAD_HALF + 8);
    gar.circle(p.x + 0.5, p.y + 0.7, 1.9).fill({ color: 0x000000, alpha: 0.3 });
    gar.circle(p.x, p.y, 1.9).fill(0x1a1b20).stroke({ width: 0.4, color: 0xf2f2f2 });
    gar.circle(p.x, p.y, 0.7).fill(0x3a3d46);
  }
  c.addChild(gar);
  return c;
}
