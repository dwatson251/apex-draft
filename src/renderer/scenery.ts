import { Container, Graphics } from "pixi.js";
import { CELL, Rng, type BiomeId } from "@apex/sim";
import { LOOKS, type Look } from "./look.ts";
import type { Sky } from "./sky.ts";

/** How far past the grid the countryside goes, in cells. The camera never sees past it. */
export const MARGIN_CELLS = 4;
/** The railway runs this far outside the grid. */
const RAIL_GAP = 62;
const RAIL_RADIUS = 38;

interface Rect { x: number; y: number; w: number; h: number }
const inflate = (r: Rect, m: number): Rect => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

const shadeUp = (c: number, k: number): number => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k)), g = Math.min(255, Math.round(((c >> 8) & 255) * k)), b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
};

export interface PlaneState { x: number; y: number; alt: number; vx: number; vy: number }

interface Spinner { c: Container; rate: number }
interface Boat { c: Container; cx: number; cy: number; rx: number; ry: number; a: number; rate: number }
interface Train { cars: Container[]; s: number; speed: number; puffs: { g: Graphics; age: number }[]; puffTimer: number }
type Flight = { kind: "departure" | "arrival" | "overflight"; t: number; x: number; y: number; v: number; ang: number; alt: number; sx: number; sy: number; ex: number; ey: number; fade: number };

/**
 * Everything behind the course: grass, hills, trees, lakes that take up several tiles, mountains in the distance, a
 * railway loop with a train going round, and (on some tracks) an airport with one aeroplane at a time.
 * It all comes from the track's seed, so a phrase always has the same countryside.
 */
export class Scenery {
  /** mown grass: always shown */
  readonly grass = new Container();
  /** everything else: shown once the whole track is known, because the empty cells would show where the road goes */
  readonly decor = new Container();
  readonly airport: Rect | null;
  /** an airport has aeroplanes; the moon base does not */
  private planes: boolean;
  readonly look: Look;
  private hasRail: boolean;
  private trains: Train[] = [];
  private spinners: Spinner[] = [];
  private boats: Boat[] = [];
  private flight: Flight | null = null;
  private nextFlight = 5;
  private planeBody = new Container();
  private planeShadow = new Container();
  private rail = { cx: 0, cy: 0, hw: 0, hh: 0, r: RAIL_RADIUS, len: 0 };
  private runway = { x: 0, y0: 0, y1: 0 };
  private clock = 0;

  constructor(readonly cols: number, readonly rows: number, roadCells: Set<string>, seed: number, readonly biome: BiomeId = "grass") {
    const W = cols * CELL, H = rows * CELL, M = MARGIN_CELLS * CELL;
    const look = (this.look = LOOKS[biome]);
    const feat = new Rng(seed ^ 0xa1b0a1b0);
    const rng = new Rng(seed ^ 0x5eed5eed);

    // ---- ground ----
    const g = new Graphics();
    g.rect(-M * 4, -M * 4, W + M * 8, H + M * 8).fill(look.ground[0]);
    for (let y = -M, k = 0; y < H + M; y += 25, k++) if (k % 2) g.rect(-M, y, W + 2 * M, 25).fill(look.ground[1]);
    this.grass.addChild(g);

    // ---- what the countryside has this time: not everything turns up on every track ----
    this.rail = { cx: W / 2, cy: H / 2, hw: W / 2 + RAIL_GAP, hh: H / 2 + RAIL_GAP, r: RAIL_RADIUS, len: 0 };
    const rl = this.rail;
    rl.len = 2 * (2 * (rl.hw - rl.r)) + 2 * (2 * (rl.hh - rl.r)) + 2 * Math.PI * rl.r;
    const odds = (a: Record<BiomeId, number>) => feat.chance(a[biome]);
    this.hasRail = odds({ grass: 0.45, desert: 0.35, snow: 0.4, city: 0.55, moon: 0.5, water: 0 });
    this.planes = biome !== "moon" && odds({ grass: 0.4, desert: 0.4, snow: 0.3, city: 0.5, moon: 0, water: 0 });
    const base = biome === "moon" && feat.chance(0.75);
    this.airport = this.planes || base ? { x: -178, y: 8, w: 96, h: H - 16 } : null;
    this.runway = { x: -150, y0: 22, y1: H - 22 };
    const taken: Rect[] = this.airport ? [this.airport] : [];
    const railNear = (x: number, y: number) => (this.hasRail ? Math.abs(this.sdRail(x, y)) : Infinity);
    const blocked = (x: number, y: number, r: number): boolean => railNear(x, y) < r + 12 || taken.some((t) => inside(inflate(t, r + 3), x, y));
    /** every free block of cells of this size: no road, clear of the rail and of what is already placed */
    const blocks = (bw: number, bh: number, inset: number, gap: number): Rect[] => {
      const out: Rect[] = [];
      for (let cy = -MARGIN_CELLS; cy <= rows + MARGIN_CELLS - bh; cy++) {
        for (let cx = -MARGIN_CELLS; cx <= cols + MARGIN_CELLS - bw; cx++) {
          let free = true;
          for (let yy = cy; yy < cy + bh && free; yy++) for (let xx = cx; xx < cx + bw && free; xx++) if (roadCells.has(`${xx},${yy}`)) free = false;
          if (!free) continue;
          const r: Rect = { x: cx * CELL + inset, y: cy * CELL + inset, w: bw * CELL - 2 * inset, h: bh * CELL - 2 * inset };
          let clear = true;
          for (let px = r.x; px <= r.x + r.w && clear; px += 14) for (let py = r.y; py <= r.y + r.h && clear; py += 14) if (railNear(px, py) < 24) clear = false;
          if (clear && taken.every((t) => !hits(inflate(r, gap), t))) out.push(r);
        }
      }
      return out;
    };

    // ---- lakes across several tiles (not on the moon) ----
    const lakes: Rect[] = [];
    const lakeCount = look.lake.kind === "none" ? 0 : (feat.chance(0.75) ? 1 : 0) + (feat.chance(0.35) ? 1 : 0);
    for (let n = 0; n < lakeCount; n++) {
      const sizes: [number, number][] = look.lake.kind === "oasis" ? [[2, 2], [2, 1]] : look.lake.kind === "pond" ? [[2, 1], [1, 2], [2, 2]] : feat.chance(0.4) ? [[3, 3], [3, 2], [2, 3], [2, 2]] : [[3, 2], [2, 3], [2, 2]];
      for (const [bw, bh] of sizes) {
        const cands = blocks(bw, bh, 8, 10);
        if (!cands.length) continue;
        const r = feat.pick(cands);
        lakes.push(r); taken.push(r);
        break;
      }
    }
    for (const l of lakes) this.decor.addChild(this.lake(l, feat));

    // ---- fields and a village ----
    if (biome === "grass" && feat.chance(0.6)) {
      for (let n = 1 + feat.int(2); n > 0; n--) {
        const cands = blocks(feat.chance(0.5) ? 2 : 1, 1 + feat.int(2), 6, 6);
        if (!cands.length) break;
        const r = feat.pick(cands);
        taken.push(r);
        this.decor.addChild(this.field(r, feat));
      }
    }
    if ((biome === "grass" || biome === "desert" || biome === "snow") && feat.chance(0.5)) {
      const cands = blocks(2, 1, 10, 8);
      if (cands.length) { const r = feat.pick(cands); taken.push(r); this.decor.addChild(this.village(r, feat)); }
    }

    // ---- hills, craters and city blocks (near); mountains and towers (far) ----
    const hillG = new Graphics();
    const hills: { x: number; y: number; r: number; rock: boolean }[] = [];
    const trees: { x: number; y: number; r: number }[] = [];
    for (let cy = -MARGIN_CELLS; cy < rows + MARGIN_CELLS; cy++) {
      for (let cx = -MARGIN_CELLS; cx < cols + MARGIN_CELLS; cx++) {
        if (roadCells.has(`${cx},${cy}`)) continue;
        const out = cx < 0 || cy < 0 || cx >= cols || cy >= rows;
        const far = cx < -1 || cy < -1 || cx > cols || cy > rows;
        if (biome === "city") { this.cityCell(hillG, cx, cy, far, rng, blocked); continue; }
        if (!far && rng.chance(out ? 0.7 : 0.45)) {
          const h = { x: (cx + 0.5) * CELL + rng.range(-5, 5), y: (cy + 0.5) * CELL + rng.range(-5, 5), r: rng.range(24, 40), rock: rng.chance(biome === "desert" ? 0.3 : 0.15) };
          if (!blocked(h.x, h.y, h.r)) hills.push(h);
        }
        for (let k = rng.int(biome === "moon" ? 4 : biome === "desert" ? 3 : out ? 5 : 3); k > 0; k--) {
          const t = { x: cx * CELL + rng.range(12, CELL - 12), y: cy * CELL + rng.range(12, CELL - 12), r: rng.range(3.6, 6.4) };
          if (!blocked(t.x, t.y, t.r + 2)) trees.push(t);
        }
      }
    }
    hills.sort((a, b) => a.y - b.y);
    for (const h of hills) this.hill(hillG, h, look, biome);
    this.decor.addChild(hillG);

    const mountains: { x: number; y: number; r: number }[] = [];
    const wanted = feat.int(10);
    for (let tries = 0; tries < 120 && mountains.length < wanted; tries++) {
      const cx = feat.int(cols + 2 * MARGIN_CELLS) - MARGIN_CELLS, cy = feat.int(rows + 2 * MARGIN_CELLS) - MARGIN_CELLS;
      if (!(cx < -1 || cy < -1 || cx > cols || cy > rows)) continue; // out beyond the near hills
      const m = { x: (cx + 0.5) * CELL + feat.range(-30, 30), y: (cy + 0.5) * CELL + feat.range(-30, 30), r: feat.range(40, 68) };
      if (blocked(m.x, m.y, m.r * 0.8) || mountains.some((o) => Math.hypot(o.x - m.x, o.y - m.y) < (o.r + m.r) * 0.7)) continue;
      mountains.push(m);
    }
    mountains.sort((a, b) => a.y - b.y);
    for (const m of mountains) this.decor.addChild(biome === "city" ? this.skyscrapers(m.x, m.y, m.r, feat) : this.mountain(m.x, m.y, m.r, feat));

    // ---- airport or moon base, railway, wind turbines, trees ----
    if (this.airport) this.decor.addChild(this.planes ? this.airportArt(H) : this.moonBase(H, feat));
    if (this.hasRail) { this.decor.addChild(this.railArt()); this.trains.push(this.makeTrain(feat)); }
    if (biome !== "moon" && biome !== "city") {
      for (let n = feat.chance(0.6) ? 1 + feat.int(5) : 0, tries = 0; n > 0 && tries < 60; tries++) {
        const x = feat.range(-M + 40, W + M - 40), y = feat.range(-M + 40, H + M - 40);
        if (inside({ x: -30, y: -30, w: W + 60, h: H + 60 }, x, y) || blocked(x, y, 14)) continue;
        this.decor.addChild(this.turbine(x, y, feat));
        n--;
      }
    }
    const treeG = new Graphics();
    trees.sort((a, b) => a.y - b.y);
    for (const t of trees) this.tree(treeG, t, look, rng);
    this.decor.addChild(treeG);
    for (const l of lakes) if (look.lake.kind === "water" && feat.chance(0.6)) this.decor.addChild(this.boat(l, feat));

    this.planeBody.visible = this.planeShadow.visible = false;
  }

  // ---------- shapes ----------
  /** Signed distance to the railway's rounded rectangle: negative inside. Its absolute value is how far from the line. */
  private sdRail(x: number, y: number): number {
    const { cx, cy, hw, hh, r } = this.rail;
    const qx = Math.abs(x - cx) - (hw - r), qy = Math.abs(y - cy) - (hh - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  }

  /** Position and heading a given distance round the loop (clockwise from the middle of the top side). */
  private railAt(s: number): { x: number; y: number; a: number } {
    const { cx, cy, hw, hh, r, len } = this.rail;
    s = ((s % len) + len) % len;
    const top = hw - r; // half-length of the straight part of the top side
    const sideW = 2 * (hw - r), sideH = 2 * (hh - r), arc = (Math.PI / 2) * r;
    // start at the middle of the top side, heading right
    if (s < top) return { x: cx + s, y: cy - hh, a: 0 };
    s -= top;
    if (s < arc) { const t = s / r; return { x: cx + hw - r + Math.sin(t) * r, y: cy - hh + r - Math.cos(t) * r, a: t }; }
    s -= arc;
    if (s < sideH) return { x: cx + hw, y: cy - hh + r + s, a: Math.PI / 2 };
    s -= sideH;
    if (s < arc) { const t = s / r; return { x: cx + hw - r + Math.cos(t) * r, y: cy + hh - r + Math.sin(t) * r, a: Math.PI / 2 + t }; }
    s -= arc;
    if (s < sideW) return { x: cx + hw - r - s, y: cy + hh, a: Math.PI };
    s -= sideW;
    if (s < arc) { const t = s / r; return { x: cx - hw + r - Math.sin(t) * r, y: cy + hh - r + Math.cos(t) * r, a: Math.PI + t }; }
    s -= arc;
    if (s < sideH) return { x: cx - hw, y: cy + hh - r - s, a: -Math.PI / 2 };
    s -= sideH;
    if (s < arc) { const t = s / r; return { x: cx - hw + r - Math.cos(t) * r, y: cy - hh + r - Math.sin(t) * r, a: -Math.PI / 2 + t }; }
    s -= arc;
    return { x: cx - hw + r + s, y: cy - hh, a: 0 };
  }

  private lake(r: Rect, rng: Rng): Container {
    const c = new Container(), g = new Graphics(), L = this.look.lake;
    const kind = L.kind;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const shrink = kind === "oasis" ? 0.62 : 1;
    const rx = (r.w / 2) * shrink, ry = (r.h / 2) * shrink;
    const phase = [rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28)];
    const blob = (k: number, dx = 0, dy = 0): number[] => {
      const pts: number[] = [];
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const wob = 1 + 0.07 * Math.sin(3 * a + phase[0]!) + 0.05 * Math.sin(5 * a + phase[1]!) + 0.03 * Math.sin(8 * a + phase[2]!);
        pts.push(cx + dx + Math.cos(a) * rx * k * wob, cy + dy + Math.sin(a) * ry * k * wob);
      }
      return pts;
    };
    if (kind === "pond") {
      // a city reservoir: a square basin with a concrete rim
      g.roundRect(r.x + 3, r.y + 4, r.w, r.h, 8).fill({ color: 0x000000, alpha: 0.25 });
      g.roundRect(r.x, r.y, r.w, r.h, 8).fill(L.shore);
      g.roundRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12, 5).fill(L.deep);
      g.roundRect(r.x + 10, r.y + 10, r.w - 24, r.h - 24, 4).fill({ color: L.mid, alpha: 0.9 });
      for (let k = 0; k < 8; k++) { const x = r.x + rng.range(14, r.w - 30), y = r.y + rng.range(14, r.h - 14); g.moveTo(x, y).lineTo(x + rng.range(5, 12), y).stroke({ width: 0.8, color: 0xffffff, alpha: 0.3 }); }
      c.addChild(g);
      return c;
    }
    g.poly(blob(1.02, 3, 4)).fill({ color: 0x000000, alpha: 0.2 });
    g.poly(blob(1)).fill(L.shore);
    g.poly(blob(0.94)).fill(L.deep);
    g.poly(blob(0.78, -rx * 0.03, -ry * 0.04)).fill(L.mid);
    g.poly(blob(0.52, -rx * 0.08, -ry * 0.1)).fill({ color: L.light, alpha: 0.7 });
    if (kind === "ice") {
      for (let k = 0; k < 9; k++) { // cracks in the ice
        let x = cx + rng.range(-0.6, 0.6) * rx, y = cy + rng.range(-0.6, 0.6) * ry;
        g.moveTo(x, y);
        for (let j = 0; j < 4; j++) { x += rng.range(-10, 12); y += rng.range(-8, 10); g.lineTo(x, y); }
        g.stroke({ width: 0.7, color: 0xffffff, alpha: 0.55 });
      }
    } else {
      for (let k = 0; k < 14; k++) { // little glints
        const a = rng.range(0, 6.28), d = rng.range(0.1, 0.8), x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d, l = rng.range(4, 9);
        g.moveTo(x, y).lineTo(x + l, y).stroke({ width: 0.8, color: 0xffffff, alpha: rng.range(0.18, 0.4) });
      }
      if (kind === "water" && rng.chance(0.4)) { // an island
        const ix = cx + rng.range(-0.3, 0.3) * rx, iy = cy + rng.range(-0.3, 0.3) * ry, ir = Math.min(rx, ry) * rng.range(0.14, 0.22);
        g.ellipse(ix + 1.5, iy + 2, ir * 1.1, ir * 0.9).fill({ color: 0x000000, alpha: 0.22 });
        g.ellipse(ix, iy, ir * 1.1, ir * 0.9).fill(L.shore);
        g.ellipse(ix, iy, ir * 0.9, ir * 0.72).fill(0x3c844b);
        g.circle(ix - 1, iy - 1, ir * 0.35).fill(0x1f5a2b);
      }
    }
    if (kind === "oasis") {
      for (let k = 0; k < 11; k++) { // palms round the water
        const a = rng.range(0, 6.28), px = cx + Math.cos(a) * rx * rng.range(0.95, 1.2), py = cy + Math.sin(a) * ry * rng.range(0.95, 1.2);
        g.circle(px + 1.5, py + 2.2, 4.4).fill({ color: 0x000000, alpha: 0.22 });
        for (let f = 0; f < 6; f++) { const fa = (f / 6) * Math.PI * 2 + a; g.moveTo(px, py).lineTo(px + Math.cos(fa) * 5, py + Math.sin(fa) * 5).stroke({ width: 1.6, color: 0x3f7a35, cap: "round" }); }
        g.circle(px, py, 1.2).fill(0x7a5a2a);
      }
    }
    c.addChild(g);
    return c;
  }

  /** A sailing boat that goes round and round its lake. */
  private boat(l: Rect, rng: Rng): Container {
    const c = new Container();
    c.addChild(new Graphics().ellipse(1.2, 1.8, 6, 2.4).fill({ color: 0x000000, alpha: 0.25 }));
    c.addChild(new Graphics().ellipse(0, 0, 5.4, 2).fill(0xf4f6fa).stroke({ width: 0.5, color: 0x2b2e36 }).poly([-1, 0, 3.5, -4, 3.5, 4]).fill(0xe8504a).poly([-1, 0, -4.5, -3, -4.5, 3]).fill(0xffffff));
    this.decor.addChild(c);
    this.boats.push({ c, cx: l.x + l.w / 2, cy: l.y + l.h / 2, rx: l.w * 0.3, ry: l.h * 0.3, a: rng.range(0, 6.28), rate: rng.range(0.1, 0.18) * (rng.chance(0.5) ? 1 : -1) });
    return c;
  }

  /** Patchwork farmland. */
  private field(r: Rect, rng: Rng): Container {
    const c = new Container(), g = new Graphics();
    const crops = [[0x8aa63a, 0x7d9a33], [0xd2b43c, 0xc6a832], [0x6c8f3a, 0x608334], [0xb88a4a, 0xa87c40], [0x9aab45, 0x8d9e3c]];
    const cols = Math.max(2, Math.round(r.w / 46)), rows = Math.max(2, Math.round(r.h / 46));
    const cw = r.w / cols, ch = r.h / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const [a, b] = rng.pick(crops)!, x = r.x + i * cw + 1, y = r.y + j * ch + 1, vertical = rng.chance(0.5);
        g.rect(x, y, cw - 2, ch - 2).fill(a);
        for (let k = 0; k < (vertical ? cw : ch) - 2; k += 4) { if (vertical) g.rect(x + k, y, 2, ch - 2).fill(b); else g.rect(x, y + k, cw - 2, 2).fill(b); }
      }
    }
    g.rect(r.x, r.y, r.w, r.h).stroke({ width: 1.2, color: 0x5d452e, alpha: 0.5 });
    c.addChild(g);
    return c;
  }

  /** A handful of houses with a lane through them. */
  private village(r: Rect, rng: Rng): Container {
    const c = new Container(), g = new Graphics();
    g.rect(r.x, r.y + r.h / 2 - 3, r.w, 6).fill(0x8d8b84);
    const roofs = [0xb94a3a, 0x9c5a3a, 0x3f6fa8, 0x7a4a6a, 0xc78a3a];
    const house = (x: number, y: number, w: number, h: number) => {
      g.rect(x + 1.6, y + 2.2, w, h).fill({ color: 0x000000, alpha: 0.28 });
      g.rect(x, y, w, h).fill(0xece6d8).stroke({ width: 0.5, color: 0x2b2e36 });
      const col = rng.pick(roofs)!;
      g.poly([x - 0.8, y + h * 0.5, x + w / 2, y - 1, x + w + 0.8, y + h * 0.5]).fill(col);
      g.poly([x - 0.8, y + h * 0.5, x + w / 2, y + h + 1, x + w + 0.8, y + h * 0.5]).fill({ color: col, alpha: 0.78 });
    };
    for (let x = r.x + 4; x < r.x + r.w - 16; x += rng.range(15, 22)) {
      if (rng.chance(0.85)) house(x, r.y + rng.range(4, 14), rng.range(9, 13), rng.range(8, 12));
      if (rng.chance(0.85)) house(x + rng.range(-2, 4), r.y + r.h - rng.range(20, 28), rng.range(9, 13), rng.range(8, 12));
    }
    for (let k = 0; k < 5; k++) { const x = r.x + rng.range(6, r.w - 6), y = r.y + rng.range(8, r.h - 8); if (Math.abs(y - (r.y + r.h / 2)) > 9) g.circle(x, y, 3.4).fill(0x2a6e35); }
    c.addChild(g);
    return c;
  }

  /** A wind turbine whose blades turn. */
  private turbine(x: number, y: number, rng: Rng): Container {
    const c = new Container();
    const rot = new Container();
    const blades = new Graphics(), shadow = new Graphics();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      for (const [gr, off, col, w] of [[shadow, 7, 0x000000, 1.8], [blades, 0, 0xf2f4f8, 1.6]] as const) {
        gr.moveTo(off, off).lineTo(off + Math.cos(a) * 11, off + Math.sin(a) * 11).stroke({ width: w, color: col, alpha: col === 0 ? 0.2 : 1, cap: "round" });
      }
    }
    c.addChild(new Graphics().circle(5, 7, 2.2).fill({ color: 0x000000, alpha: 0.2 }));
    rot.addChild(shadow, blades);
    c.addChild(rot);
    c.addChild(new Graphics().circle(0, 0, 2.2).fill(0xd8dce6).stroke({ width: 0.5, color: 0x2b2e36 }));
    c.position.set(x, y);
    rot.rotation = rng.range(0, 6.28);
    this.decor.addChild(c);
    this.spinners.push({ c: rot, rate: rng.range(0.8, 1.6) });
    return c;
  }

  private hill(g: Graphics, h: { x: number; y: number; r: number; rock: boolean }, look: Look, biome: BiomeId): void {
    if (biome === "moon") { // a crater: a bright rim, a dark floor, a shadow on the sunward wall
      g.ellipse(h.x, h.y, h.r * 1.06, h.r * 0.9).fill(look.hill[3]!).stroke({ width: 1, color: look.hillLine, alpha: 0.7 });
      g.ellipse(h.x + h.r * 0.05, h.y + h.r * 0.06, h.r * 0.86, h.r * 0.72).fill(look.hill[0]!);
      g.ellipse(h.x + h.r * 0.12, h.y + h.r * 0.14, h.r * 0.62, h.r * 0.5).fill({ color: 0x000000, alpha: 0.16 });
      g.ellipse(h.x - h.r * 0.52, h.y - h.r * 0.42, h.r * 0.3, h.r * 0.18).fill({ color: 0xffffff, alpha: 0.12 });
      return;
    }
    const pal = h.rock ? look.rockHill : look.hill;
    g.ellipse(h.x + h.r * 0.14, h.y + h.r * 0.22, h.r, h.r * 0.85).fill({ color: biome === "snow" ? 0x6f86a6 : 0x000000, alpha: biome === "snow" ? 0.28 : 0.22 });
    pal.forEach((col, i) => {
      const k = [1, 0.78, 0.56, 0.34][i]!;
      const e = g.ellipse(h.x - h.r * 0.07 * i, h.y - h.r * 0.09 * i, h.r * k, h.r * 0.85 * k).fill(col);
      if (i === 0) e.stroke({ width: 0.8, color: look.hillLine, alpha: 0.7 });
    });
  }

  private tree(g: Graphics, t: { x: number; y: number; r: number }, look: Look, rng: Rng): void {
    const col = rng.pick(look.tree)!;
    switch (look.treeKind) {
      case "cactus": {
        g.ellipse(t.x + 2.5, t.y + 3, 2.4, 4.4).fill({ color: 0x000000, alpha: 0.22 });
        g.roundRect(t.x - 1.3, t.y - 4.4, 2.6, 8.8, 1.3).fill(col).stroke({ width: 0.4, color: 0x2e4a22 });
        g.roundRect(t.x - 4.2, t.y - 1.6, 2.4, 1.6, 0.8).fill(col); g.roundRect(t.x + 1.8, t.y + 0.4, 2.4, 1.6, 0.8).fill(col);
        break;
      }
      case "pine": {
        g.ellipse(t.x + t.r * 0.6, t.y + t.r * 0.8, t.r, t.r * 0.8).fill({ color: 0x4a6a8a, alpha: 0.28 });
        g.circle(t.x, t.y, t.r).fill(col).stroke({ width: 0.6, color: 0x143d2a, alpha: 0.8 });
        g.circle(t.x, t.y, t.r * 0.66).fill(shadeUp(col, 1.18));
        g.circle(t.x - t.r * 0.18, t.y - t.r * 0.2, t.r * 0.42).fill(0xf4f9ff);
        break;
      }
      case "rock": {
        g.ellipse(t.x + 1.6, t.y + 1.8, t.r * 0.9, t.r * 0.6).fill({ color: 0x000000, alpha: 0.28 });
        g.poly([t.x - t.r * 0.8, t.y + t.r * 0.2, t.x - t.r * 0.3, t.y - t.r * 0.6, t.x + t.r * 0.5, t.y - t.r * 0.5, t.x + t.r * 0.9, t.y + t.r * 0.1, t.x + t.r * 0.2, t.y + t.r * 0.6]).fill(col).stroke({ width: 0.4, color: 0x4b4e57 });
        g.poly([t.x - t.r * 0.3, t.y - t.r * 0.6, t.x + t.r * 0.5, t.y - t.r * 0.5, t.x, t.y - t.r * 0.1]).fill({ color: 0xffffff, alpha: 0.22 });
        break;
      }
      default: {
        g.ellipse(t.x + t.r * 0.5, t.y + t.r * 0.7, t.r, t.r * 0.8).fill({ color: 0x000000, alpha: 0.25 });
        g.circle(t.x, t.y, t.r).fill(col).stroke({ width: 0.7, color: 0x143d1e, alpha: 0.8 });
        g.circle(t.x - t.r * 0.28, t.y - t.r * 0.32, t.r * 0.5).fill({ color: 0x5aa85c, alpha: 0.75 });
      }
    }
  }

  /** A block of the city: lots with rooftops, or now and then a park. */
  private cityCell(g: Graphics, cx: number, cy: number, far: boolean, rng: Rng, blocked: (x: number, y: number, r: number) => boolean): void {
    const x0 = cx * CELL, y0 = cy * CELL;
    if (blocked(x0 + CELL / 2, y0 + CELL / 2, CELL / 2 - 6)) return;
    // streets between the blocks
    g.rect(x0, y0 + CELL - 3, CELL, 6).fill({ color: 0x3b3f4a, alpha: 0.9 });
    g.rect(x0 + CELL - 3, y0, 6, CELL).fill({ color: 0x3b3f4a, alpha: 0.9 });
    g.moveTo(x0 + 4, y0 + CELL).lineTo(x0 + CELL - 4, y0 + CELL).moveTo(x0 + CELL, y0 + 4).lineTo(x0 + CELL, y0 + CELL - 4).stroke({ width: 0.6, color: 0xe9d46a, alpha: 0.4 });
    if (!far && rng.chance(0.14)) { // a park
      g.roundRect(x0 + 8, y0 + 8, CELL - 20, CELL - 20, 6).fill(0x356e3b);
      for (let k = 0; k < 9; k++) { const tx = x0 + rng.range(14, CELL - 18), ty = y0 + rng.range(14, CELL - 18); g.circle(tx + 1, ty + 1.4, 4).fill({ color: 0x000000, alpha: 0.25 }); g.circle(tx, ty, 4).fill(0x2a6e35); }
      return;
    }
    const roofs = [0x8e96a8, 0xa4a9b8, 0x7a8196, 0xb9a98f, 0x9a8f86, 0x6e7b8f, 0xc2c6d2];
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        if (rng.chance(0.12)) continue;
        const w = rng.range(26, 38), h = rng.range(26, 38), x = x0 + 8 + i * 44 + rng.range(0, 44 - w + 2), y = y0 + 8 + j * 44 + rng.range(0, 44 - h + 2);
        const tall = rng.range(0.4, 1);
        g.rect(x + 3 + tall * 4, y + 4 + tall * 6, w, h).fill({ color: 0x000000, alpha: 0.3 });
        const col = rng.pick(roofs)!;
        g.rect(x, y, w, h).fill(col).stroke({ width: 0.6, color: 0x23262e });
        g.rect(x + 3, y + 3, w - 6, h - 6).fill(shadeUp(col, 0.88));
        if (rng.chance(0.6)) g.rect(x + w * 0.2, y + h * 0.25, w * 0.22, h * 0.2).fill(0x5a6070); // a rooftop unit
        if (rng.chance(0.25)) g.circle(x + w * 0.7, y + h * 0.65, 3).fill(0xd8dce6).stroke({ width: 0.4, color: 0x23262e });
        g.rect(x, y, w, 1.6).fill({ color: 0xffffff, alpha: 0.16 });
      }
    }
  }

  /** The tall ones: skyscrapers far out, with long shadows. */
  private skyscrapers(x: number, y: number, r: number, rng: Rng): Container {
    const c = new Container(), g = new Graphics();
    const list = Array.from({ length: 6 + rng.int(5) }, () => ({ x: x + rng.range(-r, r) * 0.9, y: y + rng.range(-r, r) * 0.7, w: rng.range(14, 26), h: rng.range(14, 26), t: rng.range(0.5, 1.3) }));
    list.sort((a, b) => a.y - b.y);
    const tones = [0x6d7690, 0x8089a4, 0x59627c, 0x9aa3bc];
    for (const b of list) {
      g.poly([b.x + b.w, b.y, b.x + b.w + 20 * b.t, b.y + 28 * b.t, b.x + b.w + 20 * b.t, b.y + b.h + 28 * b.t, b.x + b.w, b.y + b.h, b.x, b.y + b.h, b.x + 20 * b.t * 0.2, b.y + b.h + 6]).fill({ color: 0x000000, alpha: 0.24 });
      const col = rng.pick(tones)!;
      g.rect(b.x, b.y, b.w, b.h).fill(col).stroke({ width: 0.7, color: 0x1f2230 });
      g.rect(b.x + 2.5, b.y + 2.5, b.w - 5, b.h - 5).fill(shadeUp(col, 1.14)).stroke({ width: 0.5, color: 0x1f2230, alpha: 0.5 });
      g.rect(b.x + b.w * 0.35, b.y + b.h * 0.35, b.w * 0.3, b.h * 0.3).fill(0x3d4458);
      g.circle(b.x + b.w / 2, b.y + b.h / 2, 1).fill(0xff5d6c);
    }
    c.addChild(g);
    return c;
  }

  /** The moon base: pressurised domes joined by tubes, a dish, and a landing pad. */
  private moonBase(H: number, rng: Rng): Container {
    const c = new Container(), g = new Graphics();
    const x = -130;
    const domes: [number, number, number][] = [[x, 120, 22], [x + 12, 215, 16], [x - 6, 300, 26], [x + 8, 400, 14]];
    g.moveTo(domes[0]![0], domes[0]![1]);
    for (const d of domes) g.lineTo(d[0], d[1]);
    g.stroke({ width: 7, color: 0x6b6f79 }); g.moveTo(domes[0]![0], domes[0]![1]);
    for (const d of domes) g.lineTo(d[0], d[1]);
    g.stroke({ width: 4.5, color: 0xd5d8e0 });
    for (const [dx, dy, r] of domes) {
      g.circle(dx + r * 0.18, dy + r * 0.26, r).fill({ color: 0x000000, alpha: 0.28 });
      g.circle(dx, dy, r).fill(0xc9ced9).stroke({ width: 1, color: 0x4b4e57 });
      g.circle(dx - r * 0.12, dy - r * 0.12, r * 0.78).fill(0xe6eaf2);
      g.circle(dx - r * 0.3, dy - r * 0.32, r * 0.3).fill({ color: 0xffffff, alpha: 0.7 });
      for (let k = 0; k < 6; k++) { const a = (k / 6) * 6.28; g.moveTo(dx, dy).lineTo(dx + Math.cos(a) * r, dy + Math.sin(a) * r).stroke({ width: 0.5, color: 0x8a909c, alpha: 0.7 }); }
    }
    // the dish
    g.ellipse(x - 28, 480, 11, 9).fill({ color: 0x000000, alpha: 0.25 }); g.ellipse(x - 30, 478, 11, 9).fill(0xdfe3ec).stroke({ width: 0.8, color: 0x4b4e57 }); g.circle(x - 30, 478, 1.8).fill(0xff5d6c);
    // the landing pad
    g.circle(x - 6, H - 70, 24).fill(0x555862).stroke({ width: 1.4, color: 0xf2c744 }); g.circle(x - 6, H - 70, 15).stroke({ width: 1, color: 0xf2c744, alpha: 0.7 });
    g.rect(x - 8.5, H - 76, 5, 12).fill(0xf2c744);
    void rng;
    c.addChild(g);
    return c;
  }

  /** A peak seen from above: facets lit from the top left, snow on top, and a long shadow. */
  private mountain(x: number, y: number, r: number, rng: Rng): Container {
    const c = new Container(), g = new Graphics();
    const K = 8, pts: { x: number; y: number }[] = [];
    for (let i = 0; i < K; i++) { const a = (i / K) * Math.PI * 2 + rng.range(-0.18, 0.18), rr = r * rng.range(0.86, 1.05); pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * 0.92 }); }
    g.poly(pts.flatMap((p) => [p.x + r * 0.22, p.y + r * 0.3])).fill({ color: 0x000000, alpha: 0.24 });
    const peak = { x: x - r * 0.08, y: y - r * 0.1 };
    const lit = (mx: number, my: number): number => { const dx = mx - x, dy = my - y, l = Math.hypot(dx, dy) || 1; return 0.5 + 0.5 * Math.max(-1, Math.min(1, (-dx * 0.6 - dy * 0.8) / l)); };
    const mix = (a: number, b: number, t: number): number => {
      const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
      return (ch(16) << 16) | (ch(8) << 8) | ch(0);
    };
    for (let i = 0; i < K; i++) {
      const p = pts[i]!, q = pts[(i + 1) % K]!;
      const k = lit((p.x + q.x) / 2, (p.y + q.y) / 2);
      g.poly([peak.x, peak.y, p.x, p.y, q.x, q.y]).fill(mix(this.look.mountain.dark, this.look.mountain.light, k)).stroke({ width: 0.6, color: 0x2c2e36, alpha: 0.6 });
      // snow cap on the top third of each facet
      const sp = { x: peak.x + (p.x - peak.x) * 0.42, y: peak.y + (p.y - peak.y) * 0.42 }, sq = { x: peak.x + (q.x - peak.x) * 0.42, y: peak.y + (q.y - peak.y) * 0.42 };
      if (this.look.mountain.snow || this.biome === "desert") g.poly([peak.x, peak.y, sp.x, sp.y, sq.x, sq.y]).fill(mix(this.look.mountain.snowDark, this.look.mountain.snowLight, k));
    }
    c.addChild(g);
    return c;
  }

  private airportArt(H: number): Container {
    const c = new Container(), g = new Graphics();
    const { x, y0, y1 } = this.runway, T = x + 62;
    // apron and taxiways
    g.rect(T - 16, 150, 50, H - 300).fill(0x5a5e69);
    for (const ty of [150, H - 160]) g.rect(x + 10, ty - 5, T - 16 - (x + 10), 10).fill(0x4d515c);
    // runway
    g.rect(x - 11, y0, 22, y1 - y0).fill(0x3a3d46).stroke({ width: 1, color: 0x2b2e36 });
    g.rect(x - 0.5, y0 + 10, 1, y1 - y0 - 20).stroke({ width: 0 });
    for (let yy = y0 + 14; yy < y1 - 14; yy += 14) g.rect(x - 0.7, yy, 1.4, 7).fill({ color: 0xffffff, alpha: 0.85 });
    for (const [yy, dir] of [[y0 + 3, 1], [y1 - 3, -1]] as const) for (let k = -4; k <= 4; k++) if (k) g.rect(x + k * 2.2 - 0.5, yy, 1, 7 * dir).fill({ color: 0xffffff, alpha: 0.8 });
    for (let yy = y0; yy <= y1; yy += 24) { g.circle(x - 11.8, yy, 0.8).fill(0xffd870); g.circle(x + 11.8, yy, 0.8).fill(0xffd870); }
    // terminal, tower, hangars
    const roof = (bx: number, by: number, w: number, h: number, col: number) => {
      g.rect(bx + 1.5, by + 2, w, h).fill({ color: 0x000000, alpha: 0.28 });
      g.rect(bx, by, w, h).fill(col).stroke({ width: 0.7, color: 0x2b2e36 });
      g.rect(bx + 1.5, by + 1.5, w - 3, h * 0.35).fill({ color: 0xffffff, alpha: 0.14 });
    };
    roof(T - 8, 200, 24, 100, 0xcfd4de);
    for (let yy = 206; yy < 296; yy += 12) g.rect(T - 6, yy, 6, 7).fill(0x4a7fb5);
    roof(T - 4, 304, 14, 30, 0xb7bcc9);
    roof(T + 6, 156, 10, 10, 0xe9edf4);
    g.circle(T + 11, 161, 5.2).fill(0x8bb7de).stroke({ width: 0.8, color: 0x2b2e36 }); // the control tower seen from above
    g.circle(T + 11, 161, 2.2).fill(0xe84a4a);
    for (const hy of [H - 150, H - 120]) roof(T - 10, hy, 26, 22, 0x9aa1b1);
    c.addChild(g);
    return c;
  }

  private railArt(): Container {
    const c = new Container(), g = new Graphics();
    const step = 3, n = Math.floor(this.rail.len / step);
    const P = Array.from({ length: n }, (_, i) => this.railAt(i * step));
    // ballast
    g.moveTo(P[0]!.x, P[0]!.y);
    for (const p of P) g.lineTo(p.x, p.y);
    g.closePath().stroke({ width: this.look.tramway ? 8 : 11, color: this.look.tramway ? 0x70747e : 0x8d8b84, alpha: 0.85, join: "round" });
    // sleepers
    for (let i = 0; i < n; i += 2) {
      const p = P[i]!, nx = -Math.sin(p.a), ny = Math.cos(p.a);
      g.moveTo(p.x + nx * 4.4, p.y + ny * 4.4).lineTo(p.x - nx * 4.4, p.y - ny * 4.4);
    }
    g.stroke({ width: 1.5, color: 0x5d452e });
    // rails
    for (const off of [-1.8, 1.8]) {
      g.moveTo(P[0]!.x - Math.sin(P[0]!.a) * off, P[0]!.y + Math.cos(P[0]!.a) * off);
      for (const p of P) g.lineTo(p.x - Math.sin(p.a) * off, p.y + Math.cos(p.a) * off);
      g.closePath().stroke({ width: 0.9, color: 0xc6c9d1, join: "round" });
    }
    c.addChild(g);
    return c;
  }

  private makeTrain(rng: Rng): Train {
    const cars: Container[] = [];
    const palette = this.biome === "moon" ? [0xdfe3ec, 0xc8cdd9, 0xf2c744, 0xbfc5d2] : [0xb83c3c, 0x3c6fb8, 0xd8a43a, 0x4a9a5b, 0x8a5bb8];
    const loco = new Container();
    loco.addChild(new Graphics().rect(-7 + 1.3, -2.8 + 1.8, 14, 5.6).fill({ color: 0x000000, alpha: 0.3 }));
    loco.addChild(new Graphics().roundRect(-7, -2.8, 14, 5.6, 1).fill(0x2f3340).stroke({ width: 0.6, color: 0x14161c })
      .rect(-7, -2.8, 4.5, 5.6).fill(rng.pick(palette)).circle(3, 0, 1.4).fill(0x14161c).rect(5, -2, 2, 4).fill(0xf2c744));
    cars.push(loco);
    for (let i = 0, n = 3 + rng.int(3); i < n; i++) {
      const w = new Container(), col = rng.pick(palette);
      w.addChild(new Graphics().rect(-6 + 1.3, -2.6 + 1.8, 12, 5.2).fill({ color: 0x000000, alpha: 0.3 }));
      w.addChild(new Graphics().roundRect(-6, -2.6, 12, 5.2, 0.8).fill(col).stroke({ width: 0.5, color: 0x14161c }).rect(-5, -0.4, 10, 0.8).fill({ color: 0xffffff, alpha: 0.35 }));
      cars.push(w);
    }
    for (const car of cars) this.decor.addChild(car);
    return { cars, s: rng.range(0, this.rail.len), speed: 26 + rng.range(0, 8), puffs: [], puffTimer: 0 };
  }

  private planeShape(g: Graphics, body: number, wing: number, shadow = false): Graphics {
    const k = shadow ? 0x000000 : body;
    g.ellipse(0, 0, 13, 2.3).fill(k);
    g.poly([3, 0, -5, -15, -8.5, -15, -3.5, 0]).fill(shadow ? k : wing);
    g.poly([3, 0, -5, 15, -8.5, 15, -3.5, 0]).fill(shadow ? k : wing);
    g.poly([-9.5, 0, -13, -5.5, -14.6, -5.5, -12.5, 0]).fill(shadow ? k : wing);
    g.poly([-9.5, 0, -13, 5.5, -14.6, 5.5, -12.5, 0]).fill(shadow ? k : wing);
    if (!shadow) {
      g.circle(-2.5, -8, 1.5).fill(0x555b6b); g.circle(-2.5, 8, 1.5).fill(0x555b6b);
      g.rect(-9, -0.5, 14, 1).fill({ color: 0x4a7fb5, alpha: 0.9 });
      g.circle(11, 0, 1.1).fill(0x2b2e36);
    }
    return g;
  }

  /** The aeroplane's graphics live in the sky layers (over the cars, and its shadow on the ground). */
  attach(sky: Sky): void {
    if (!this.planes) return;
    this.planeShape(this.planeBody.addChild(new Graphics()) as Graphics, 0xf4f6fa, 0xcfd6e6);
    this.planeShape(this.planeShadow.addChild(new Graphics()) as Graphics, 0, 0, true);
    (this.planeShadow.children[0] as Graphics).alpha = 0.26;
    sky.air.addChild(this.planeBody);
    sky.shadows.addChild(this.planeShadow);
  }

  dispose(): void {
    this.planeBody.destroy({ children: true });
    this.planeShadow.destroy({ children: true });
  }

  /** Where the plane is, for its engine sound. null when there is none. */
  planeState(): PlaneState | null {
    const f = this.flight;
    return f ? { x: f.x, y: f.y, alt: f.alt, vx: Math.cos(f.ang) * f.v, vy: Math.sin(f.ang) * f.v } : null;
  }

  private startFlight(): void {
    const W = this.cols * CELL, H = this.rows * CELL, { x, y0, y1 } = this.runway;
    const roll = Math.random();
    const base = { t: 0, v: 0, alt: 0, fade: 1, sx: 0, sy: 0, ex: 0, ey: 0 };
    if (roll < 0.3) this.flight = { ...base, kind: "departure", x, y: y1 - 14, ang: -Math.PI / 2 };
    else if (roll < 0.6) {
      const sx = x + 220, sy = -340;
      this.flight = { ...base, kind: "arrival", x: sx, y: sy, v: 78, alt: 1, ang: Math.atan2(y0 + 6 - sy, x - sx), sx, sy, ex: x, ey: y0 + 6 };
    } else {
      // right over the course, from any side to the opposite one
      const side = Math.floor(Math.random() * 4), pad = 360;
      const along = (a: number, b: number) => a + Math.random() * (b - a);
      const pts = [[-pad, along(0, H)], [W + pad, along(0, H)], [along(0, W), -pad], [along(0, W), H + pad]] as const;
      const s = pts[side]!, e = pts[side ^ 1]!;
      this.flight = { ...base, kind: "overflight", x: s[0], y: s[1], v: 88, alt: 1, ang: Math.atan2(e[1] - s[1], e[0] - s[0]), sx: s[0], sy: s[1], ex: e[0], ey: e[1] };
    }
  }

  // ---------- animation ----------
  update(dt: number, skyOn: boolean): void {
    this.clock += dt;
    for (const sp of this.spinners) sp.c.rotation += sp.rate * dt;
    for (const b of this.boats) {
      b.a += b.rate * dt;
      b.c.position.set(b.cx + Math.cos(b.a) * b.rx, b.cy + Math.sin(b.a) * b.ry);
      b.c.rotation = Math.atan2(Math.cos(b.a) * b.ry * Math.sign(b.rate), -Math.sin(b.a) * b.rx * Math.sign(b.rate));
    }
    // the train goes round and round, puffing
    for (const t of this.trains) {
      t.s += t.speed * dt;
      t.cars.forEach((car, i) => {
        const p = this.railAt(t.s - i * 14.5);
        car.position.set(p.x, p.y); car.rotation = p.a;
      });
      const head = this.railAt(t.s);
      if (this.biome !== "moon" && (t.puffTimer -= dt) <= 0 && t.puffs.length < 16) {
        t.puffTimer = 0.45;
        const g = new Graphics().circle(0, 0, 2).fill({ color: 0xf2f2f2, alpha: 0.8 });
        g.position.set(head.x - Math.cos(head.a) * 3, head.y - Math.sin(head.a) * 3);
        this.decor.addChild(g);
        t.puffs.push({ g, age: 0 });
      }
      for (let i = t.puffs.length - 1; i >= 0; i--) {
        const p = t.puffs[i]!;
        p.age += dt;
        p.g.position.x += 4 * dt; p.g.position.y -= 3 * dt;
        p.g.scale.set(1 + p.age * 1.3);
        p.g.alpha = Math.max(0, 0.75 - p.age * 0.3);
        if (p.age > 2.5) { p.g.destroy(); t.puffs.splice(i, 1); }
      }
    }
    if (!this.planes) return;
    const f = this.flight;
    if (!f) {
      this.planeBody.visible = this.planeShadow.visible = false;
      if (skyOn && (this.nextFlight -= dt) <= 0) this.startFlight();
      return;
    }
    const { y0, y1 } = this.runway;
    f.t += dt;
    if (f.kind === "departure") {
      f.v = Math.min(78, f.v + 13 * dt);
      f.alt = Math.min(1, Math.max(0, (f.t - 5.4) / 5));
      f.ang = -Math.PI / 2 + 0.6 * Math.min(1, Math.max(0, (f.alt - 0.25) / 0.75));
      if (f.y < -330 || f.x > this.cols * CELL + 340) this.endFlight();
    } else if (f.kind === "arrival") {
      if (f.alt > 0 || f.x !== this.runway.x) {
        const total = Math.hypot(f.ex - f.sx, f.ey - f.sy), done = Math.hypot(f.x - f.sx, f.y - f.sy);
        f.alt = Math.max(0, 1 - done / total);
        if (done >= total - 1) { f.alt = 0; f.x = this.runway.x; f.ang = Math.PI / 2; }
      } else {
        f.v = Math.max(10, f.v - 7 * dt);
        if (f.y > y1 - 70 || f.v <= 10) f.fade -= dt / 2.2;
        if (f.fade <= 0) this.endFlight();
      }
    } else if (Math.hypot(f.x - f.ex, f.y - f.ey) < 14 || f.t > 40) this.endFlight();
    if (!this.flight) return;
    f.x += Math.cos(f.ang) * f.v * dt; f.y += Math.sin(f.ang) * f.v * dt;
    if (f.kind === "arrival" && f.alt === 0 && f.x === this.runway.x) f.y = Math.max(f.y, y0); // keep to the runway while it rolls
    const sc = 0.85 + 0.75 * f.alt;
    this.planeBody.visible = this.planeShadow.visible = true;
    this.planeBody.position.set(f.x, f.y); this.planeBody.rotation = f.ang; this.planeBody.scale.set(sc); this.planeBody.alpha = f.fade;
    this.planeShadow.position.set(f.x + f.alt * 64, f.y + f.alt * 88); this.planeShadow.rotation = f.ang; this.planeShadow.scale.set(0.85 + 0.2 * f.alt); this.planeShadow.alpha = f.fade * (0.55 + 0.45 * (1 - f.alt));
  }

  private endFlight(): void {
    this.flight = null;
    this.nextFlight = 22 + Math.random() * 26;
    this.planeBody.visible = this.planeShadow.visible = false;
  }
}

export function buildScenery(cols: number, rows: number, roadCells: Set<string>, seed: number, biome: BiomeId = "grass"): Scenery {
  return new Scenery(cols, rows, roadCells, seed, biome);
}
