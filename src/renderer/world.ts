import { Application, Container, Graphics, RenderTexture, Sprite } from "pixi.js";
import { CELL, ROAD_HALF, trackBounds, type Track, type Vec2 } from "@apex/sim";
import { buildGround, MARGIN_CELLS } from "./scenery.ts";
import { Sky } from "./sky.ts";
import { buildSegmentArt, type SegmentArt } from "./trackart.ts";

export interface TrackStyle {
  /** segments with index <= this are drawn; null = all (and the countryside too) */
  visibleUpTo: number | null;
  selected?: Set<number>;
  bad?: Set<number>;
}

export type HandleKind = "join" | "pt" | "end";
export interface Handle { p: Vec2; kind: HandleKind; active?: boolean }

export interface Skid { x0: number; y0: number; x1: number; y1: number; alpha: number }

/** How far the camera zooms in on the player, as a multiple of the fit-to-window zoom. */
const FOLLOW_ZOOM = 2.4;
const SKID_RES = 3;

interface CarView { root: Container; body: Container; shadow: Graphics; brake: Graphics }

/** Pixi side: draws the track and its surroundings, lines and cars, runs the camera, and maps the pointer to world units. */
export class WorldView {
  readonly root = new Container();
  readonly sky = new Sky();
  private groundLayer = new Container();
  private grid = new Graphics();
  private segLayer = new Container();
  private highlight = new Graphics();
  private skidSprite = new Sprite();
  private lines = new Graphics();
  private carsLayer = new Container();
  private skidTex: RenderTexture | null = null;
  private skidBrush = new Graphics();
  private arts = new Map<number, SegmentArt>();
  private decor: Container | null = null;
  private trackRef: Track | null = null;
  private cars = new Map<string, CarView>();
  private size = { w: 700, h: 500 };
  private cam = { zoom: 1, x: 350, y: 250 };
  private followPt: Vec2 | null = null;
  private clock = 0;

  constructor(readonly app: Application) {
    this.root.addChild(this.groundLayer, this.grid, this.segLayer, this.highlight, this.skidSprite, this.sky.shadows, this.lines, this.carsLayer, this.sky.air);
    app.stage.addChild(this.root);
    app.renderer.on("resize", () => this.applyCamera());
    this.setBounds(700, 500);
  }

  /** World units to screen pixels at the moment. */
  get scale(): number { return this.root.scale.x; }

  setBounds(w: number, h: number): void {
    this.size = { w, h };
    this.sky.setBounds(w, h);
    this.cam.x = w / 2; this.cam.y = h / 2;
    this.applyCamera();
  }

  private applyCamera(): void {
    const W = this.app.screen.width, H = this.app.screen.height, pad = 24;
    const base = Math.min((W - 2 * pad) / this.size.w, (H - 2 * pad) / this.size.h);
    // make room for the side panel when looking at the whole map, but not when close in on a car
    const panel = W > 1000 ? 160 * Math.min(1, Math.max(0, 2 - this.cam.zoom)) : 0;
    const s = base * this.cam.zoom;
    this.root.scale.set(s);
    this.root.position.set((W - panel) / 2 - this.cam.x * s, H / 2 - this.cam.y * s);
  }

  toWorld(clientX: number, clientY: number): Vec2 {
    const r = this.app.canvas.getBoundingClientRect();
    return { x: (clientX - r.left - this.root.x) / this.root.scale.x, y: (clientY - r.top - this.root.y) / this.root.scale.y };
  }

  // ---------- camera ----------
  /** Follow this point with a slow zoom in; null zooms back out to the whole track. */
  setFollow(p: Vec2 | null): void { this.followPt = p; }
  /** Straight back to the default view. */
  resetCamera(): void {
    this.followPt = null;
    this.cam = { zoom: 1, x: this.size.w / 2, y: this.size.h / 2 };
    this.applyCamera();
  }
  /** Skip the easing (screenshots, tests). */
  snapCamera(): void {
    if (!this.followPt) return;
    this.cam = { zoom: FOLLOW_ZOOM, x: this.followPt.x, y: this.followPt.y };
    this.applyCamera();
  }

  update(dt: number): void {
    this.clock += dt;
    const c = this.cam, cx = this.size.w / 2, cy = this.size.h / 2;
    if (this.followPt) {
      c.zoom += (FOLLOW_ZOOM - c.zoom) * (1 - Math.exp(-dt * 0.55));
      // glide from the middle of the map to the car as the zoom comes in
      const prog = Math.min(1, (c.zoom - 1) / (FOLLOW_ZOOM - 1));
      const wx = cx + (this.followPt.x - cx) * prog, wy = cy + (this.followPt.y - cy) * prog;
      const k = 1 - Math.exp(-dt * 7);
      c.x += (wx - c.x) * k; c.y += (wy - c.y) * k;
    } else {
      const k = 1 - Math.exp(-dt * 1.4);
      c.zoom += (1 - c.zoom) * k; c.x += (cx - c.x) * k; c.y += (cy - c.y) * k;
      if (Math.abs(c.zoom - 1) < 0.003) { c.zoom = 1; c.x = cx; c.y = cy; }
    }
    this.applyCamera();
    // crowd bobs, pick-ups pulse
    const frame = Math.floor(this.clock * 3) % 2 === 1;
    for (const a of this.arts.values()) {
      a.crowdA.forEach((g) => { g.visible = !frame; });
      a.crowdB.forEach((g) => { g.visible = frame; });
      a.pulses.forEach((p) => p.scale.set(1 + Math.sin(this.clock * 4) * 0.08));
    }
    this.sky.update(dt);
  }

  // ---------- the course ----------
  private clearTrack(): void {
    this.groundLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.segLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.arts.clear();
    this.decor = null;
    this.trackRef = null;
    this.skidTex?.destroy(true);
    this.skidTex = null;
    this.skidSprite.visible = false;
    this.grid.clear();
    this.highlight.clear();
  }

  private drawGrid(cols: number, rows: number): void {
    const g = this.grid.clear();
    for (let x = 0; x <= cols; x++) g.moveTo(x * CELL, 0).lineTo(x * CELL, rows * CELL);
    for (let y = 0; y <= rows; y++) g.moveTo(0, y * CELL).lineTo(cols * CELL, y * CELL);
    g.stroke({ width: 1, color: 0xffffff, alpha: 0.07 });
  }

  /** Cached art for a new track: ground, every segment, and a blank skid-mark texture. */
  setTrack(track: Track): void {
    if (this.trackRef === track) return;
    this.clearTrack();
    this.trackRef = track;
    const b = trackBounds(track);
    this.setBounds(b.w, b.h);
    const ground = buildGround(track.cols, track.rows, new Set(track.cellIndex.keys()), track.seed);
    this.groundLayer.addChild(ground.grass, ground.decor);
    this.decor = ground.decor;
    this.drawGrid(track.cols, track.rows);
    for (const s of track.segments) {
      const art = buildSegmentArt(track, s);
      this.arts.set(s.index, art);
      this.segLayer.addChild(art.root);
    }
    this.skidTex = RenderTexture.create({ width: b.w, height: b.h, resolution: SKID_RES });
    this.skidSprite.texture = this.skidTex;
    this.skidSprite.visible = true;
  }

  /** The menu: countryside and sky, no road. */
  showBackdrop(): void {
    this.clearTrack();
    this.clearCars();
    this.lines.clear();
    this.setBounds(700, 500);
    const ground = buildGround(7, 5, new Set(), 12345);
    this.groundLayer.addChild(ground.grass, ground.decor);
    this.drawGrid(7, 5);
    this.resetCamera();
  }

  drawTrack(track: Track, style: TrackStyle): void {
    this.setTrack(track);
    for (const [i, art] of this.arts) art.root.visible = i <= (style.visibleUpTo ?? Infinity);
    // the hills and trees would give away which cells are road, so they wait until the whole track is known
    if (this.decor) this.decor.visible = style.visibleUpTo === null;
    const h = this.highlight.clear();
    for (const s of track.segments) {
      const bad = style.bad?.has(s.index), sel = style.selected?.has(s.index);
      if ((!bad && !sel) || s.index > (style.visibleUpTo ?? Infinity)) continue;
      const pts: number[] = [];
      for (let i = 0; i < s.center.length; i++) pts.push(s.center[i]!.x + s.normals[i]!.x * ROAD_HALF, s.center[i]!.y + s.normals[i]!.y * ROAD_HALF);
      for (let i = s.center.length - 1; i >= 0; i--) pts.push(s.center[i]!.x - s.normals[i]!.x * ROAD_HALF, s.center[i]!.y - s.normals[i]!.y * ROAD_HALF);
      h.poly(pts).fill({ color: bad ? 0xff3b4e : 0xffcf3f, alpha: bad ? 0.38 : 0.28 }).stroke({ width: 1.6, color: bad ? 0xff5d6c : 0xffcf3f });
    }
  }

  // ---------- lines and handles ----------
  drawCurves(curves: { pts: Vec2[]; color: number; width?: number; alpha?: number }[]): void {
    const g = this.lines.clear();
    for (const c of curves) {
      if (c.pts.length < 2) continue;
      g.moveTo(c.pts[0]!.x, c.pts[0]!.y);
      for (let i = 1; i < c.pts.length; i++) g.lineTo(c.pts[i]!.x, c.pts[i]!.y);
      g.stroke({ width: c.width ?? 2, color: c.color, alpha: c.alpha ?? 1, join: "round", cap: "round" });
    }
  }

  /** Draggable points: a square where the segment starts, a diamond where it ends, round dots between. */
  drawHandles(hs: Handle[]): void {
    const g = this.lines;
    for (const h of hs) {
      const { x, y } = h.p, hot = h.active ? 0xffcf3f : 0xffffff;
      if (h.kind === "join") g.rect(x - 3.6, y - 3.6, 7.2, 7.2).fill(hot).stroke({ width: 1, color: 0x14161c });
      else if (h.kind === "end") g.poly([x, y - 4.8, x + 4.8, y, x, y + 4.8, x - 4.8, y]).fill(0xffcf3f).stroke({ width: 1, color: 0x14161c });
      else g.circle(x, y, 3.2).fill(hot).stroke({ width: 1, color: 0x14161c });
    }
  }

  clearLines(): void { this.lines.clear(); }

  // ---------- skid marks ----------
  addSkids(list: Skid[]): void {
    if (!this.skidTex || !list.length) return;
    const g = this.skidBrush.clear();
    for (const s of list) g.moveTo(s.x0, s.y0).lineTo(s.x1, s.y1).stroke({ width: 1.1, color: 0x101114, alpha: s.alpha, cap: "round" });
    this.app.renderer.render({ container: g, target: this.skidTex, clear: false });
    g.clear();
  }

  clearSkids(): void {
    if (!this.skidTex) return;
    this.app.renderer.render({ container: new Container(), target: this.skidTex, clear: true });
  }

  // ---------- cars ----------
  setCar(id: string, x: number, y: number, h: number, color: number, ghost: boolean, isPlayer: boolean, braking: boolean): void {
    let c = this.cars.get(id);
    if (!c) {
      const root = new Container(), body = new Container();
      const shadow = new Graphics().roundRect(-5, -3, 10, 6, 1.5).fill({ color: 0x000000, alpha: 0.32 });
      const hull = new Graphics()
        .roundRect(-5, -3, 10, 6, 1.6).fill(color).stroke({ width: isPlayer ? 1.4 : 0.7, color: isPlayer ? 0xffffff : 0x14161c });
      hull.rect(-4.2, -0.7, 8.4, 1.4).fill({ color: 0xffffff, alpha: 0.5 });
      hull.roundRect(0.4, -2.2, 2.6, 4.4, 0.8).fill(0x14161c);
      for (const [wx, wy] of [[-3.4, -3.4], [2.6, -3.4], [-3.4, 3.4], [2.6, 3.4]] as const) hull.rect(wx - 1, wy - 0.6, 2, 1.2).fill(0x14161c);
      const brake = new Graphics().rect(-5.2, -2.6, 0.9, 1.6).rect(-5.2, 1, 0.9, 1.6).fill(0xff2a2a);
      brake.visible = false;
      body.addChild(hull, brake);
      root.addChild(shadow, body);
      this.carsLayer.addChild(root);
      c = { root, body, shadow, brake };
      this.cars.set(id, c);
    }
    c.root.position.set(x, y);
    c.body.rotation = h;
    c.shadow.position.set(1.6, 2.2);
    c.shadow.rotation = h;
    c.brake.visible = braking;
    c.root.alpha = ghost ? 0.4 : 1;
  }

  clearCars(): void { this.carsLayer.removeChildren().forEach((c) => c.destroy({ children: true })); this.cars.clear(); }
}

export { MARGIN_CELLS };
