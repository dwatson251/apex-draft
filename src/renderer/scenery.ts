import { Container, Graphics } from "pixi.js";
import { CELL, Rng } from "@apex/sim";
import type { Sky } from "./sky.ts";

const GRASS = [0x2f6b3a, 0x34763f];
const HILL = [0x2a5e35, 0x32703f, 0x3c844b, 0x4a9a5b];
const ROCK = [0x6c6f78, 0x80838d, 0x9a9da7, 0xb4b7c0];
const TREE = [0x1f5a2b, 0x2a6e35, 0x2f7a3a];
/** How far past the grid the countryside goes, in cells. The camera never sees past it. */
export const MARGIN_CELLS = 4;
/** The railway runs this far outside the grid. */
const RAIL_GAP = 62;
const RAIL_RADIUS = 38;

interface Rect { x: number; y: number; w: number; h: number }
const inflate = (r: Rect, m: number): Rect => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

export interface PlaneState { x: number; y: number; alt: number; vx: number; vy: number }

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
  private trains: Train[] = [];
  private flight: Flight | null = null;
  private nextFlight = 5;
  private planeBody = new Container();
  private planeShadow = new Container();
  private rail = { cx: 0, cy: 0, hw: 0, hh: 0, r: RAIL_RADIUS, len: 0 };
  private runway = { x: 0, y0: 0, y1: 0 };
  private clock = 0;

  constructor(readonly cols: number, readonly rows: number, roadCells: Set<string>, seed: number) {
    const W = cols * CELL, H = rows * CELL, M = MARGIN_CELLS * CELL;
    const feat = new Rng(seed ^ 0xa1b0a1b0);
    const rng = new Rng(seed ^ 0x5eed5eed);

    // ---- grass ----
    const g = new Graphics();
    g.rect(-M * 4, -M * 4, W + M * 8, H + M * 8).fill(GRASS[0]!);
    for (let y = -M, k = 0; y < H + M; y += 25, k++) if (k % 2) g.rect(-M, y, W + 2 * M, 25).fill(GRASS[1]!);
    this.grass.addChild(g);

    // ---- where things go ----
    this.rail = { cx: W / 2, cy: H / 2, hw: W / 2 + RAIL_GAP, hh: H / 2 + RAIL_GAP, r: RAIL_RADIUS, len: 0 };
    const rl = this.rail;
    rl.len = 2 * (2 * (rl.hw - rl.r)) + 2 * (2 * (rl.hh - rl.r)) + 2 * Math.PI * rl.r;
    this.airport = feat.chance(0.7) ? { x: -178, y: 8, w: 96, h: H - 16 } : null;
    this.runway = { x: -150, y0: 22, y1: H - 22 };
    const lakes: Rect[] = [];
    const railNear = (x: number, y: number) => Math.abs(this.sdRail(x, y));
    const blocked = (x: number, y: number, r: number): boolean =>
      (this.airport !== null && inside(inflate(this.airport, r + 4), x, y)) || railNear(x, y) < r + 12 || lakes.some((l) => inside(inflate(l, r), x, y));

    // ---- lakes across several tiles ----
    const lakeCount = (feat.chance(0.85) ? 1 : 0) + (feat.chance(0.4) ? 1 : 0);
    for (let n = 0; n < lakeCount; n++) {
      const sizes: [number, number][] = feat.chance(0.4) ? [[3, 3], [3, 2], [2, 3], [2, 2]] : [[3, 2], [2, 3], [2, 2]];
      let placed = false;
      for (const [bw, bh] of sizes) {
        if (placed) break;
        const cands: Rect[] = [];
        for (let cy = -MARGIN_CELLS; cy <= rows + MARGIN_CELLS - bh; cy++) {
          for (let cx = -MARGIN_CELLS; cx <= cols + MARGIN_CELLS - bw; cx++) {
            let free = true;
            for (let yy = cy; yy < cy + bh && free; yy++) for (let xx = cx; xx < cx + bw && free; xx++) if (roadCells.has(`${xx},${yy}`)) free = false;
            if (!free) continue;
            const r: Rect = { x: cx * CELL + 8, y: cy * CELL + 8, w: bw * CELL - 16, h: bh * CELL - 16 };
            if (this.airport && hits(inflate(r, 14), this.airport)) continue;
            let clear = true;
            for (let px = r.x; px <= r.x + r.w && clear; px += 14) for (let py = r.y; py <= r.y + r.h && clear; py += 14) if (railNear(px, py) < 24) clear = false;
            if (clear && lakes.every((l) => !hits(inflate(r, 10), l))) cands.push(r);
          }
        }
        if (cands.length) { lakes.push(feat.pick(cands)); placed = true; }
      }
    }
    for (const l of lakes) this.decor.addChild(this.lake(l, feat));

    // ---- hills (near) and mountains (far) ----
    const hillG = new Graphics();
    const hills: { x: number; y: number; r: number; rock: boolean }[] = [];
    const trees: { x: number; y: number; r: number }[] = [];
    for (let cy = -MARGIN_CELLS; cy < rows + MARGIN_CELLS; cy++) {
      for (let cx = -MARGIN_CELLS; cx < cols + MARGIN_CELLS; cx++) {
        if (roadCells.has(`${cx},${cy}`)) continue;
        const out = cx < 0 || cy < 0 || cx >= cols || cy >= rows;
        const far = cx < -1 || cy < -1 || cx > cols || cy > rows;
        if (!far && rng.chance(out ? 0.7 : 0.45)) {
          const h = { x: (cx + 0.5) * CELL + rng.range(-5, 5), y: (cy + 0.5) * CELL + rng.range(-5, 5), r: rng.range(24, 40), rock: rng.chance(0.15) };
          if (!blocked(h.x, h.y, h.r)) hills.push(h);
        }
        for (let k = rng.int(out ? 5 : 3); k > 0; k--) {
          const t = { x: cx * CELL + rng.range(12, CELL - 12), y: cy * CELL + rng.range(12, CELL - 12), r: rng.range(3.6, 6.4) };
          if (!blocked(t.x, t.y, t.r + 2)) trees.push(t);
        }
      }
    }
    hills.sort((a, b) => a.y - b.y);
    for (const h of hills) {
      const pal = h.rock ? ROCK : HILL;
      hillG.ellipse(h.x + h.r * 0.14, h.y + h.r * 0.22, h.r, h.r * 0.85).fill({ color: 0x000000, alpha: 0.22 });
      pal.forEach((col, i) => {
        const k = [1, 0.78, 0.56, 0.34][i]!;
        const e = hillG.ellipse(h.x - h.r * 0.07 * i, h.y - h.r * 0.09 * i, h.r * k, h.r * 0.85 * k).fill(col);
        if (i === 0) e.stroke({ width: 0.8, color: h.rock ? 0x4b4e57 : 0x1f4a2a, alpha: 0.7 });
      });
    }
    this.decor.addChild(hillG);

    const mountains: { x: number; y: number; r: number }[] = [];
    for (let tries = 0; tries < 120 && mountains.length < 8; tries++) {
      const cx = feat.int(cols + 2 * MARGIN_CELLS) - MARGIN_CELLS, cy = feat.int(rows + 2 * MARGIN_CELLS) - MARGIN_CELLS;
      if (!(cx < -1 || cy < -1 || cx > cols || cy > rows)) continue; // out beyond the near hills
      const m = { x: (cx + 0.5) * CELL + feat.range(-30, 30), y: (cy + 0.5) * CELL + feat.range(-30, 30), r: feat.range(40, 68) };
      if (blocked(m.x, m.y, m.r * 0.8) || mountains.some((o) => Math.hypot(o.x - m.x, o.y - m.y) < (o.r + m.r) * 0.7)) continue;
      mountains.push(m);
    }
    mountains.sort((a, b) => a.y - b.y);
    for (const m of mountains) this.decor.addChild(this.mountain(m.x, m.y, m.r, feat));

    // ---- airport, railway, trees ----
    if (this.airport) this.decor.addChild(this.airportArt(H));
    this.decor.addChild(this.railArt());
    const treeG = new Graphics();
    trees.sort((a, b) => a.y - b.y);
    for (const t of trees) {
      treeG.ellipse(t.x + t.r * 0.5, t.y + t.r * 0.7, t.r, t.r * 0.8).fill({ color: 0x000000, alpha: 0.25 });
      treeG.circle(t.x, t.y, t.r).fill(rng.pick(TREE)).stroke({ width: 0.7, color: 0x143d1e, alpha: 0.8 });
      treeG.circle(t.x - t.r * 0.28, t.y - t.r * 0.32, t.r * 0.5).fill({ color: 0x5aa85c, alpha: 0.75 });
    }
    this.decor.addChild(treeG);
    this.trains.push(this.makeTrain(feat));

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
    const c = new Container(), g = new Graphics();
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rx = r.w / 2, ry = r.h / 2;
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
    g.poly(blob(1.02, 3, 4)).fill({ color: 0x000000, alpha: 0.2 });
    g.poly(blob(1)).fill(0xd8c690);                 // sandy shore
    g.poly(blob(0.94)).fill(0x2a6fb8);              // deep
    g.poly(blob(0.78, -rx * 0.03, -ry * 0.04)).fill(0x3987d2);
    g.poly(blob(0.52, -rx * 0.08, -ry * 0.1)).fill({ color: 0x5aa6ea, alpha: 0.7 });
    for (let k = 0; k < 14; k++) { // little glints
      const a = rng.range(0, 6.28), d = rng.range(0.1, 0.8), x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d, l = rng.range(4, 9);
      g.moveTo(x, y).lineTo(x + l, y).stroke({ width: 0.8, color: 0xffffff, alpha: rng.range(0.18, 0.4) });
    }
    if (rng.chance(0.4)) { // an island
      const ix = cx + rng.range(-0.3, 0.3) * rx, iy = cy + rng.range(-0.3, 0.3) * ry, ir = Math.min(rx, ry) * rng.range(0.14, 0.22);
      g.ellipse(ix + 1.5, iy + 2, ir * 1.1, ir * 0.9).fill({ color: 0x000000, alpha: 0.22 });
      g.ellipse(ix, iy, ir * 1.1, ir * 0.9).fill(0xd8c690);
      g.ellipse(ix, iy, ir * 0.9, ir * 0.72).fill(0x3c844b);
      g.circle(ix - 1, iy - 1, ir * 0.35).fill(0x1f5a2b);
    }
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
      g.poly([peak.x, peak.y, p.x, p.y, q.x, q.y]).fill(mix(0x3e414b, 0x9a9ea9, k)).stroke({ width: 0.6, color: 0x2c2e36, alpha: 0.6 });
      // snow cap on the top third of each facet
      const sp = { x: peak.x + (p.x - peak.x) * 0.42, y: peak.y + (p.y - peak.y) * 0.42 }, sq = { x: peak.x + (q.x - peak.x) * 0.42, y: peak.y + (q.y - peak.y) * 0.42 };
      g.poly([peak.x, peak.y, sp.x, sp.y, sq.x, sq.y]).fill(mix(0xaab8d0, 0xffffff, k));
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
    g.closePath().stroke({ width: 11, color: 0x8d8b84, alpha: 0.85, join: "round" });
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
    const palette = [0xb83c3c, 0x3c6fb8, 0xd8a43a, 0x4a9a5b, 0x8a5bb8];
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
    if (!this.airport) return;
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
    // the train goes round and round, puffing
    for (const t of this.trains) {
      t.s += t.speed * dt;
      t.cars.forEach((car, i) => {
        const p = this.railAt(t.s - i * 14.5);
        car.position.set(p.x, p.y); car.rotation = p.a;
      });
      const head = this.railAt(t.s);
      if ((t.puffTimer -= dt) <= 0 && t.puffs.length < 16) {
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
    if (!this.airport) return;
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

export function buildScenery(cols: number, rows: number, roadCells: Set<string>, seed: number): Scenery {
  return new Scenery(cols, rows, roadCells, seed);
}
