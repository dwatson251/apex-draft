import { Application, Container, Graphics, Text } from "pixi.js";
import { CELL, ROAD_HALF, trackBounds, type Segment, type Track, type Vec2 } from "@apex/sim";

export interface TrackStyle {
  /** segments with index <= this are drawn; null = all */
  visibleUpTo: number | null;
  selected?: Set<number>;
  bad?: Set<number>;
}

const COLORS = { grid: 0x232a3d, road: 0x3b4256, edge: 0x7c86a6, box: 0xb2773c, water: 0x3b8bd6, boost: 0xffcf3f, grip: 0x4fd28a, ghost: 0xb48cff };

/** Pixi side: draws the track, lines and cars, and maps the pointer to world units. */
export class WorldView {
  readonly root = new Container();
  private base = new Graphics();
  private marks = new Container();
  private lines = new Graphics();
  private carsLayer = new Container();
  private cars = new Map<string, Container>();
  private size = { w: 700, h: 500 };
  private scale = 1;
  private ox = 0;
  private oy = 0;

  constructor(readonly app: Application) {
    this.root.addChild(this.base, this.marks, this.lines, this.carsLayer);
    app.stage.addChild(this.root);
    app.renderer.on("resize", () => this.fit());
  }

  setBounds(w: number, h: number): void { this.size = { w, h }; this.fit(); }

  private fit(): void {
    const pad = 24;
    const W = this.app.screen.width, H = this.app.screen.height;
    this.scale = Math.min((W - 2 * pad) / this.size.w, (H - 2 * pad) / this.size.h);
    // leave room for the side panel on wide screens
    const panel = W > 1000 ? 160 : 0;
    this.ox = (W - panel - this.size.w * this.scale) / 2;
    this.oy = (H - this.size.h * this.scale) / 2;
    this.root.scale.set(this.scale);
    this.root.position.set(this.ox, this.oy);
  }

  toWorld(clientX: number, clientY: number): Vec2 {
    const r = this.app.canvas.getBoundingClientRect();
    return { x: (clientX - r.left - this.ox) / this.scale, y: (clientY - r.top - this.oy) / this.scale };
  }

  clear(): void {
    this.base.clear();
    this.lines.clear();
    this.marks.removeChildren().forEach((c) => c.destroy());
    this.carsLayer.removeChildren().forEach((c) => c.destroy());
    this.cars.clear();
  }

  drawTrack(track: Track, style: TrackStyle): void {
    const b = trackBounds(track);
    this.setBounds(b.w, b.h);
    const g = this.base;
    g.clear();
    this.marks.removeChildren().forEach((c) => c.destroy());
    for (let x = 0; x <= track.cols; x++) g.moveTo(x * CELL, 0).lineTo(x * CELL, b.h);
    for (let y = 0; y <= track.rows; y++) g.moveTo(0, y * CELL).lineTo(b.w, y * CELL);
    g.stroke({ width: 1, color: COLORS.grid });
    const upTo = style.visibleUpTo ?? Infinity;
    for (const s of track.segments) {
      if (s.index > upTo) continue;
      this.road(g, s, style);
    }
    for (const s of track.segments) {
      if (s.index > upTo) continue;
      for (const o of s.obstacles) {
        const og = new Graphics();
        if (o.kind === "box") og.rect(-o.r, -o.r, 2 * o.r, 2 * o.r).fill(COLORS.box).stroke({ width: 1, color: 0x6b4520 });
        else og.circle(0, 0, o.r).fill({ color: COLORS.water, alpha: 0.85 }).stroke({ width: 1, color: 0xa9d4ff });
        og.position.set(o.x, o.y);
        this.marks.addChild(og);
      }
      if (s.powerup) {
        const col = COLORS[s.powerup.kind];
        const pg = new Graphics().circle(0, 0, s.powerup.r).fill({ color: col, alpha: 0.25 }).stroke({ width: 2, color: col });
        pg.position.set(s.powerup.x, s.powerup.y);
        const t = new Text({ text: s.powerup.kind === "boost" ? "B" : s.powerup.kind === "grip" ? "G" : "H", style: { fontSize: 9, fill: col, fontWeight: "700" } });
        t.anchor.set(0.5);
        pg.addChild(t);
        this.marks.addChild(pg);
      }
    }
    // start / finish line across the first gate
    const s0 = track.segments[0]!;
    const a = { x: s0.entry.mid.x - s0.entry.n.x * ROAD_HALF, y: s0.entry.mid.y - s0.entry.n.y * ROAD_HALF };
    const c = { x: s0.entry.mid.x + s0.entry.n.x * ROAD_HALF, y: s0.entry.mid.y + s0.entry.n.y * ROAD_HALF };
    const sf = new Graphics().moveTo(a.x, a.y).lineTo(c.x, c.y).stroke({ width: 4, color: 0xffffff });
    this.marks.addChild(sf);
  }

  private road(g: Graphics, s: Segment, style: TrackStyle): void {
    const left = s.center.map((p, i) => ({ x: p.x + s.normals[i]!.x * ROAD_HALF, y: p.y + s.normals[i]!.y * ROAD_HALF }));
    const right = s.center.map((p, i) => ({ x: p.x - s.normals[i]!.x * ROAD_HALF, y: p.y - s.normals[i]!.y * ROAD_HALF })).reverse();
    const pts = [...left, ...right].flatMap((p) => [p.x, p.y]);
    const color = style.bad?.has(s.index) ? 0x6a2f3a : style.selected?.has(s.index) ? 0x56507a : COLORS.road;
    g.poly(pts).fill(color);
    g.poly(pts).stroke({ width: 1.5, color: style.selected?.has(s.index) ? COLORS.boost : COLORS.edge });
  }

  /** Draw (or redraw) a set of polylines on the line layer. */
  drawCurves(curves: { pts: Vec2[]; color: number; width?: number; alpha?: number }[]): void {
    const g = this.lines;
    g.clear();
    for (const c of curves) {
      if (c.pts.length < 2) continue;
      g.moveTo(c.pts[0]!.x, c.pts[0]!.y);
      for (let i = 1; i < c.pts.length; i++) g.lineTo(c.pts[i]!.x, c.pts[i]!.y);
      g.stroke({ width: c.width ?? 2, color: c.color, alpha: c.alpha ?? 1, join: "round", cap: "round" });
    }
  }

  drawDots(pts: Vec2[], color: number, r = 3): void {
    for (const p of pts) this.lines.circle(p.x, p.y, r).fill(color).stroke({ width: 1, color: 0x000000, alpha: 0.5 });
  }

  setCar(id: string, x: number, y: number, h: number, color: number, ghost: boolean, isPlayer: boolean): void {
    let c = this.cars.get(id);
    if (!c) {
      c = new Container();
      const body = new Graphics().roundRect(-5, -3, 10, 6, 1.5).fill(color).stroke({ width: isPlayer ? 1.5 : 0.8, color: isPlayer ? 0xffffff : 0x000000 });
      body.rect(1, -2.2, 2.5, 4.4).fill({ color: 0x000000, alpha: 0.45 });
      c.addChild(body);
      this.carsLayer.addChild(c);
      this.cars.set(id, c);
    }
    c.position.set(x, y);
    c.rotation = h;
    c.alpha = ghost ? 0.4 : 1;
  }

  clearCars(): void { this.carsLayer.removeChildren().forEach((c) => c.destroy()); this.cars.clear(); }
  clearLines(): void { this.lines.clear(); }
}
