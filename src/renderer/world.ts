import { Application, Container, Graphics, RenderTexture, Sprite } from "pixi.js";
import { CELL, ROAD_HALF, WET_LAT, WET_LONG, trackBounds, type Track, type Vec2, type VehicleId } from "@apex/sim";
import { buildCar, type CarShape } from "./cars.ts";
import { buildScenery, MARGIN_CELLS, type PlaneState, type Scenery } from "./scenery.ts";
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
/** Countryside shown around the course in the overview, units. */
const BACKGROUND = 70;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 5;
type CamMode = "overview" | "focus" | "follow";

type CarView = CarShape;

/** Pixi side: draws the track and its surroundings, lines and cars, runs the camera, and maps the pointer to world units. */
export class WorldView {
  readonly root = new Container();
  readonly sky = new Sky();
  private groundLayer = new Container();
  private grid = new Graphics();
  private segLayer = new Container();
  private highlight = new Graphics();
  private wetG = new Graphics();
  private wetCells: number[][] = [];
  private wetShown: Uint8Array | null | undefined;
  private skidSprite = new Sprite();
  private lines = new Graphics();
  private carsLayer = new Container();
  private crew = new Graphics();
  private sparkG = new Graphics();
  private sparks: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  private skidTex: RenderTexture | null = null;
  private skidBrush = new Graphics();
  private arts = new Map<number, SegmentArt>();
  private decor: Container | null = null;
  private scenery: Scenery | null = null;
  private trackRef: Track | null = null;
  private cars = new Map<string, CarView>();
  private size = { w: 700, h: 500 };
  private cam = { zoom: 1, x: 350, y: 250 };
  private user = { zoom: 1, x: 350, y: 250 };
  private mode: CamMode = "overview";
  private focusRect: { x: number; y: number; w: number; h: number } | null = null;
  private panelPx = 160;
  private followPt: Vec2 | null = null;
  private clock = 0;

  constructor(readonly app: Application) {
    this.root.addChild(this.groundLayer, this.grid, this.segLayer, this.wetG, this.highlight, this.skidSprite, this.sky.shadows, this.lines, this.carsLayer, this.crew, this.sparkG, this.sky.air);
    app.stage.addChild(this.root);
    app.renderer.on("resize", () => this.applyCamera());
    this.setBounds(700, 500);
  }

  /** World units to screen pixels at the moment. */
  get scale(): number { return this.root.scale.x; }

  setBounds(w: number, h: number): void {
    this.size = { w, h };
    this.sky.setBounds(w, h);
    this.mode = "overview";
    this.focusRect = null;
    this.user = { zoom: 1, x: w / 2, y: h / 2 };
    this.cam = { zoom: 1, x: w / 2, y: h / 2 };
    this.panelPx = this.panelFor("overview");
    this.applyCamera();
  }

  /** Scale that fits the whole course plus a little countryside around it. */
  private baseScale(): number {
    const W = this.app.screen.width, H = this.app.screen.height, pad = 24;
    return Math.min((W - 2 * pad) / (this.size.w + 2 * BACKGROUND), (H - 2 * pad) / (this.size.h + 2 * BACKGROUND));
  }

  /** Pixels on the right that the panels cover, so the view is centred on what is left. */
  private panelFor(mode: CamMode): number {
    const W = this.app.screen.width;
    if (W <= 1000) return 0;
    return mode === "overview" ? 160 : mode === "focus" ? 340 : 0;
  }

  private applyCamera(): void {
    const W = this.app.screen.width, H = this.app.screen.height;
    const s = this.baseScale() * this.cam.zoom;
    this.root.scale.set(s);
    this.root.position.set((W - this.panelPx) / 2 - this.cam.x * s, H / 2 - this.cam.y * s);
  }

  toWorld(clientX: number, clientY: number): Vec2 {
    const r = this.app.canvas.getBoundingClientRect();
    return { x: (clientX - r.left - this.root.x) / this.root.scale.x, y: (clientY - r.top - this.root.y) / this.root.scale.y };
  }

  // ---------- camera ----------
  get cameraMode(): CamMode { return this.mode; }

  /** The whole course, which the player may zoom and pan. Coming from another mode eases back to the default view. */
  setOverview(): void {
    if (this.mode === "overview") return;
    this.mode = "overview";
    this.followPt = null;
    this.focusRect = null;
    this.user = { zoom: 1, x: this.size.w / 2, y: this.size.h / 2 };
  }

  /** Fill the screen with this rectangle (the segment being edited). Calling it again glides to the new one. */
  setFocus(r: { x: number; y: number; w: number; h: number }): void {
    this.mode = "focus";
    this.followPt = null;
    this.focusRect = r;
  }

  /** Follow this point with a slow zoom in; null zooms back out to the whole track. */
  setFollow(p: Vec2 | null): void {
    if (p) { this.mode = "follow"; this.focusRect = null; this.followPt = p; }
    else if (this.mode === "follow") this.setOverview();
  }

  /** Straight back to the default overview. */
  resetCamera(): void {
    this.mode = "overview";
    this.followPt = null;
    this.focusRect = null;
    this.user = { zoom: 1, x: this.size.w / 2, y: this.size.h / 2 };
    this.cam = { ...this.user };
    this.panelPx = this.panelFor("overview");
    this.applyCamera();
  }

  /** Skip the easing (screenshots, tests). */
  snapCamera(): void {
    if (this.followPt) this.cam = { zoom: FOLLOW_ZOOM, x: this.followPt.x, y: this.followPt.y };
    else if (this.focusRect) { const t = this.focusTarget(); this.cam = { ...t }; }
    this.panelPx = this.panelFor(this.mode);
    this.applyCamera();
  }

  private focusTarget(): { zoom: number; x: number; y: number } {
    const r = this.focusRect!, W = this.app.screen.width, H = this.app.screen.height, pad = 40;
    const s = Math.min((W - this.panelFor("focus") - 2 * pad) / r.w, (H - 2 * pad) / r.h);
    return { zoom: s / this.baseScale(), x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  /** Overview only: wheel zoom, keeping the point under the cursor where it is. */
  zoomBy(factor: number, clientX: number, clientY: number): void {
    if (this.mode !== "overview") return;
    const u = this.user, base = this.baseScale(), rect = this.app.canvas.getBoundingClientRect();
    const ox = clientX - rect.left - (this.app.screen.width - this.panelPx) / 2, oy = clientY - rect.top - this.app.screen.height / 2;
    const wx = u.x + ox / (base * u.zoom), wy = u.y + oy / (base * u.zoom);
    u.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, u.zoom * factor));
    u.x = wx - ox / (base * u.zoom); u.y = wy - oy / (base * u.zoom);
    this.clampUser();
  }

  /** Overview only: drag to pan, by pixels on screen. */
  panBy(dxPx: number, dyPx: number): void {
    if (this.mode !== "overview") return;
    const u = this.user, k = this.baseScale() * u.zoom;
    u.x -= dxPx / k; u.y -= dyPx / k;
    this.clampUser();
  }

  private clampUser(): void {
    const u = this.user, m = BACKGROUND + 60;
    u.x = Math.min(this.size.w + m, Math.max(-m, u.x));
    u.y = Math.min(this.size.h + m, Math.max(-m, u.y));
  }

  update(dt: number): void {
    this.clock += dt;
    const c = this.cam, cx = this.size.w / 2, cy = this.size.h / 2;
    const ease = (to: { zoom: number; x: number; y: number }, rate: number) => {
      const k = 1 - Math.exp(-dt * rate);
      c.zoom += (to.zoom - c.zoom) * k; c.x += (to.x - c.x) * k; c.y += (to.y - c.y) * k;
    };
    if (this.mode === "follow" && this.followPt) {
      c.zoom += (FOLLOW_ZOOM - c.zoom) * (1 - Math.exp(-dt * 0.55));
      // glide from the middle of the map to the car as the zoom comes in
      const prog = Math.min(1, Math.max(0, (c.zoom - 1) / (FOLLOW_ZOOM - 1)));
      const wx = cx + (this.followPt.x - cx) * prog, wy = cy + (this.followPt.y - cy) * prog;
      const k = 1 - Math.exp(-dt * 7);
      c.x += (wx - c.x) * k; c.y += (wy - c.y) * k;
    } else if (this.mode === "focus" && this.focusRect) ease(this.focusTarget(), 4.5);
    else ease(this.user, 7);
    this.panelPx += (this.panelFor(this.mode) - this.panelPx) * (1 - Math.exp(-dt * 5));
    this.applyCamera();
    // crowd bobs, pick-ups pulse
    const frame = Math.floor(this.clock * 3) % 2 === 1;
    for (const a of this.arts.values()) {
      a.crowdA.forEach((g) => { g.visible = !frame; });
      a.crowdB.forEach((g) => { g.visible = frame; });
      a.pulses.forEach((p) => p.scale.set(1 + Math.sin(this.clock * 4) * 0.08));
    }
    if (this.decor?.visible) this.scenery?.update(dt, this.sky.isOn());
    const sg = this.sparkG.clear();
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const q = this.sparks[i]!;
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.9; q.vy *= 0.9;
      if (q.life <= 0) { this.sparks.splice(i, 1); continue; }
      sg.circle(q.x, q.y, 0.9).fill({ color: q.life > 0.2 ? 0xfff2a8 : 0xff9a3c, alpha: Math.min(1, q.life * 4) });
    }
    this.sky.update(dt);
  }

  // ---------- the course ----------
  private clearTrack(): void {
    this.groundLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.segLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.arts.clear();
    this.scenery?.dispose();
    this.scenery = null;
    this.decor = null;
    this.trackRef = null;
    this.skidTex?.destroy(true);
    this.skidTex = null;
    this.skidSprite.visible = false;
    this.grid.clear();
    this.highlight.clear();
    this.wetG.clear();
    this.wetCells = [];
    this.wetShown = undefined;
  }

  private drawGrid(cols: number, rows: number, dark: boolean): void {
    const g = this.grid.clear();
    for (let x = 0; x <= cols; x++) g.moveTo(x * CELL, 0).lineTo(x * CELL, rows * CELL);
    for (let y = 0; y <= rows; y++) g.moveTo(0, y * CELL).lineTo(cols * CELL, y * CELL);
    g.stroke({ width: 1, color: dark ? 0x000000 : 0xffffff, alpha: dark ? 0.1 : 0.07 });
  }

  /** Cached art for a new track: ground, every segment, and a blank skid-mark texture. */
  setTrack(track: Track): void {
    if (this.trackRef === track) return;
    this.clearTrack();
    this.trackRef = track;
    const b = trackBounds(track);
    this.setBounds(b.w, b.h);
    const ground = buildScenery(track.cols, track.rows, new Set(track.cellIndex.keys()), track.seed, track.biome);
    this.groundLayer.addChild(ground.grass, ground.decor);
    this.decor = ground.decor;
    this.scenery = ground;
    ground.attach(this.sky);
    this.sky.configure(ground.look);
    this.drawGrid(track.cols, track.rows, ground.look.ground[0] > 0x808080);
    for (const s of track.segments) {
      const art = buildSegmentArt(track, s);
      this.arts.set(s.index, art);
      this.segLayer.addChild(art.root);
    }
    // one polygon for each bin of the wet field, worked out once
    const samples = track.segments[0]!.center.length;
    for (const seg of track.segments) {
      for (let lo = 0; lo < WET_LONG; lo++) {
        for (let la = 0; la < WET_LAT; la++) {
          const i0 = Math.floor((lo * samples) / WET_LONG), i1 = Math.min(samples - 1, Math.floor(((lo + 1) * samples) / WET_LONG));
          const l0 = -ROAD_HALF + (la * 2 * ROAD_HALF) / WET_LAT, l1 = l0 + (2 * ROAD_HALF) / WET_LAT;
          const pts: number[] = [];
          for (let i = i0; i <= i1; i++) pts.push(seg.center[i]!.x + seg.normals[i]!.x * l0, seg.center[i]!.y + seg.normals[i]!.y * l0);
          for (let i = i1; i >= i0; i--) pts.push(seg.center[i]!.x + seg.normals[i]!.x * l1, seg.center[i]!.y + seg.normals[i]!.y * l1);
          this.wetCells.push(pts);
        }
      }
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
    const ground = buildScenery(7, 5, new Set(), 12345);
    this.groundLayer.addChild(ground.grass, ground.decor);
    this.decor = ground.decor;
    this.scenery = ground;
    ground.attach(this.sky);
    this.drawGrid(7, 5, false);
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

  /**
   * Paint how wet the road is (and how much it has been driven) from a snapshot of the sim's wet field: dark, glossy
   * where it is wet, and lighter along the dry line the cars have worn. null clears it. Redrawn only when it changes.
   */
  setWet(snap: Uint8Array | null, rain: number): void {
    this.sky.setRain(rain);
    if (snap === this.wetShown) return;
    this.wetShown = snap;
    const g = this.wetG.clear();
    if (!snap) return;
    const cells = this.wetCells.length;
    for (let i = 0; i < cells; i++) {
      const w = snap[i]! / 255, u = snap[cells + i]! / 255, pts = this.wetCells[i]!;
      if (w > 0.04) {
        g.poly(pts).fill({ color: 0x0b2038, alpha: 0.5 * w });
        // a sheen that shows where the water lies: strongest on bits nobody has driven
        g.poly(pts).fill({ color: 0x9cc8ff, alpha: 0.11 * w * (1 - u * 0.8) });
      } else if (u > 0.25) {
        g.poly(pts).fill({ color: 0x000000, alpha: 0.07 * u }); // rubbered in
      }
      if (u > 0.3 && w < 0.6) g.poly(pts).fill({ color: 0xffffff, alpha: 0.1 * u * (1 - w) }); // the dry line, paler
    }
  }

  /** The aeroplane, if one is in the air (or on the runway) right now. */
  planeState(): PlaneState | null { return this.decor?.visible ? this.scenery?.planeState() ?? null : null; }

  /** Where the camera is looking, in world units. */
  get focus(): Vec2 { return { x: this.cam.x, y: this.cam.y }; }

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
  setCar(id: string, type: VehicleId | undefined, x: number, y: number, h: number, color: number, ghost: boolean, isPlayer: boolean, braking: boolean, hidden = false): void {
    let c = this.cars.get(id);
    if (!c) {
      c = buildCar(type ?? "rally", color, isPlayer);
      this.carsLayer.addChild(c.root);
      this.cars.set(id, c);
    }
    c.root.visible = !hidden;
    c.root.position.set(x, y);
    c.body.rotation = h;
    c.shadow.position.set(1.6, 2.2);
    c.shadow.rotation = h;
    c.brake.visible = braking;
    c.root.alpha = ghost ? 0.4 : 1;
  }

  /** A shower of sparks where two cars touched. */
  spark(x: number, y: number, strength: number): void {
    const n = Math.min(26, 6 + Math.round(strength / 3));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 50;
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.25 + Math.random() * 0.3 });
    }
  }

  /** Four mechanics around a car in its box. */
  setCrew(p: { x: number; y: number; h: number } | null): void {
    const g = this.crew.clear();
    if (!p) return;
    const t = this.clock * 9;
    for (const [da, dl, col] of [[-3.6, -5.2, 0xffcf3f], [3.6, -5.2, 0x4fd2ff], [-3.6, 5.2, 0xff6a3d], [3.6, 5.2, 0xffffff]] as const) {
      const wob = Math.sin(t + da) * 0.7;
      const x = p.x + Math.cos(p.h) * da - Math.sin(p.h) * (dl + wob), y = p.y + Math.sin(p.h) * da + Math.cos(p.h) * (dl + wob);
      g.circle(x + 0.5, y + 0.8, 1.7).fill({ color: 0x000000, alpha: 0.3 });
      g.circle(x, y, 1.7).fill(col).stroke({ width: 0.4, color: 0x14161c });
    }
  }

  clearCars(): void { this.carsLayer.removeChildren().forEach((c) => c.destroy({ children: true })); this.cars.clear(); }
}

export { MARGIN_CELLS };
