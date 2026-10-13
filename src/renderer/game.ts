import type { Application } from "pixi.js";
import {
  CAR_BUDGET, CELL, MAX_AMENDS, Race, Rng, STATS, STAT_MAX, STAT_MIN, beginLine, botLine, carCost, carStats, changedSegments,
  defaultCar, distToSegment, generateTrack, isComplete, joinBefore, lapCurve, moveJoin, normalizePhrase, parseLineFile,
  previewSegment, projectToGate, randomPhrase, serializeLineFile, setSegment, smooth, validateCar, validateLine,
  type CarConfig, type Entrant, type Line, type LineFile, type RaceCar, type Stat, type Track, type Vec2,
} from "@apex/sim";
import { CarAudio } from "./audio.ts";
import { load, save, type Best, type Settings } from "./store.ts";
import type { Handle, HandleKind, Skid, WorldView } from "./world.ts";

const ME = "me";
const PLAYER_COLOR = 0xffcf3f;
const RIVAL_COLORS = [0xff5d6c, 0x4fd28a, 0x5aa9ff, 0xb48cff, 0xff9f43, 0x3fe0d0, 0xf06bd2];
const RIVAL_NAMES = ["Nova", "Kestrel", "Dash", "Pebble", "Orbit", "Rook", "Ember", "Sable", "Juno", "Flint", "Mako", "Wren"];
const STAT_LABEL: Record<Stat, string> = { accel: "Acceleration", top: "Top speed", grip: "Cornering", brake: "Braking" };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const fmt = (t: number | null | undefined) => {
  if (t === null || t === undefined) return "–";
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(3).padStart(6, "0")}`;
};
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

interface DrawState {
  mode: "lap" | "amend";
  /** lap: the start and the segments drawn so far; amend: the whole lap being edited */
  line: Line | null;
  seg: number;
  /** points between the start and the end of this segment */
  pts: Vec2[];
  /** where this segment leaves; null while drawing a lap means "wherever the last point lines up" */
  end: Vec2 | null;
  queue: number[];
  drag: { kind: HandleKind; i: number } | null;
  warn: string;
}

interface Motion { v: number; acc: number; slip: number; braking: boolean }

export class Game {
  private settings: Settings = { phrase: "", laps: 3, mode: "race", rivals: 5, car: defaultCar() };
  private cars: CarConfig[] = [];
  private best: Best = {};
  private imported: LineFile[] = [];
  private note = "";

  private track!: Track;
  private rivalEntrants: Entrant[] = [];
  private me!: Entrant;
  private race: Race | undefined;
  private lapNo = 0;
  private draw: DrawState | null = null;
  private pick: { selected: Set<number>; limit: number; bad: Set<number> } | null = null;
  private play: { tick: number; end: number; speed: number } | null = null;
  private currentLine!: Line;
  private pickMessage: string | null = null;
  private version = "dev";
  private audio = new CarAudio();
  private skidTick = 0;
  private clock = 0;
  /** a drag that pans the overview, or turns out to be a click */
  private pan: { lx: number; ly: number; sx: number; sy: number; moved: boolean; button: number; world: Vec2 } | null = null;

  constructor(private app: Application, private view: WorldView, private ui: HTMLElement) {}

  async start(): Promise<void> {
    this.settings = { ...this.settings, ...(await load<Partial<Settings>>("settings", {})) };
    if (!this.settings.phrase) this.settings.phrase = randomPhrase(new Rng((Math.random() * 2 ** 32) >>> 0));
    this.cars = await load<CarConfig[]>("cars", []);
    this.best = await load<Best>("best", {});
    this.version = (await window.apex?.version()) ?? "dev";
    this.audio.setMuted(!!this.settings.muted);
    const c = this.app.canvas;
    c.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    c.addEventListener("pointermove", (e) => this.onPointerMove(e));
    c.addEventListener("pointerup", (e) => this.onPointerUp(e));
    c.addEventListener("pointercancel", (e) => this.onPointerUp(e));
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("wheel", (e) => {
      if (this.view.cameraMode !== "overview") return;
      e.preventDefault();
      this.view.zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    }, { passive: false });
    window.addEventListener("keydown", (e) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "m" || e.key === "M") this.toggleMute();
      if (!this.draw) return;
      if (e.key === "Enter") this.finishSegment();
      else if (e.key === "Backspace" || (e.key === "z" && (e.ctrlKey || e.metaKey))) this.undo();
    });
    this.app.ticker.add((t) => this.onFrame(t.deltaMS / 1000));
    this.showMenu();
  }

  // ---------- UI helpers ----------
  private show(cls: string, html: string): HTMLElement {
    this.ui.innerHTML = `<div class="panel ${cls}">${html}</div>`;
    return this.ui.firstElementChild as HTMLElement;
  }
  private on(el: HTMLElement, sel: string, fn: () => void): void {
    el.querySelector(sel)?.addEventListener("click", fn);
  }
  private persist(): void { void save("settings", this.settings); }
  private toggleMute(): void {
    this.settings.muted = !this.audio.isMuted();
    this.audio.setMuted(this.settings.muted);
    this.persist();
    const b = this.ui.querySelector<HTMLElement>("#mute");
    if (b) b.textContent = this.settings.muted ? "Sound off" : "Sound on";
  }

  // ---------- menu ----------
  private showMenu(): void {
    this.draw = null; this.pick = null; this.play = null; this.race = undefined;
    this.audio.stopAll();
    this.view.showBackdrop();
    this.view.sky.setActive(true);
    const s = this.settings;
    const phrase = normalizePhrase(s.phrase);
    const bestKey = `${phrase}:${s.laps}`;
    const matching = this.imported.filter((f) => f.phrase === phrase);
    const el = this.show("center", `
      <h1>APEX <span>DRAFT</span></h1>
      <p class="dim">Draw the racing line, one segment at a time. Then the car has to drive it.</p>
      <label>Track phrase (share it to share the track)</label>
      <div class="row"><input id="phrase" type="text" value="${esc(s.phrase)}" spellcheck="false" /><button id="rand">Random</button></div>
      <div class="row">
        <div><label>Laps</label><select id="laps">${[1, 2, 3, 4, 5].map((n) => `<option ${n === s.laps ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        <div><label>Mode</label><select id="mode"><option value="trial" ${s.mode === "trial" ? "selected" : ""}>Time trial</option><option value="race" ${s.mode === "race" ? "selected" : ""}>Race rivals</option></select></div>
        <div ${s.mode === "trial" ? 'style="display:none"' : ""}><label>Rivals</label><select id="rivals">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option ${n === s.rivals ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      </div>
      <p class="dim">Car: <b>${esc(s.car.name)}</b> (${carCost(s.car)}/${CAR_BUDGET} points)
        ${s.mode === "race" ? `· Imported rival lines for this track: <b>${matching.length}</b>` : ""}
        ${this.best[bestKey] ? `· Best: <b>${fmt(this.best[bestKey])}</b>` : ""}</p>
      <p class="bad">${esc(this.note)}</p>
      <button class="primary" id="go">Start</button><button id="garage">Garage</button><button id="import">Import rival lines…</button><button id="mute">${s.muted ? "Sound off" : "Sound on"}</button>
      <p class="dim" style="margin-top:12px">v${esc(this.version)} · Click to place points. Drag any point to move it, start and end nodes included. Right-click a point to delete it. <kbd>Enter</kbd> finishes a segment, <kbd>Backspace</kbd> undoes, <kbd>M</kbd> mutes.</p>`);
    this.note = "";
    const input = el.querySelector<HTMLInputElement>("#phrase")!;
    input.addEventListener("input", () => { s.phrase = input.value; });
    el.querySelector("#laps")!.addEventListener("change", (e) => { s.laps = Number((e.target as HTMLSelectElement).value); this.persist(); this.showMenu(); });
    el.querySelector("#mode")!.addEventListener("change", (e) => { s.mode = (e.target as HTMLSelectElement).value as Settings["mode"]; this.persist(); this.showMenu(); });
    el.querySelector("#rivals")?.addEventListener("change", (e) => { s.rivals = Number((e.target as HTMLSelectElement).value); this.persist(); });
    this.on(el, "#rand", () => { s.phrase = randomPhrase(new Rng((Math.random() * 2 ** 32) >>> 0)); this.persist(); this.showMenu(); });
    this.on(el, "#garage", () => { s.phrase = input.value; this.persist(); this.showGarage(); });
    this.on(el, "#import", () => void this.importLines(input.value));
    this.on(el, "#mute", () => this.toggleMute());
    this.on(el, "#go", () => {
      s.phrase = input.value;
      if (!normalizePhrase(s.phrase)) { this.note = "Type a phrase or press Random."; this.showMenu(); return; }
      this.persist();
      this.audio.unlock(); // a click is the moment the browser lets sound start
      this.startGame();
    });
  }

  private async importLines(phrase: string): Promise<void> {
    this.settings.phrase = phrase;
    const texts = await pickFiles();
    const bad: string[] = [];
    for (const t of texts) {
      const f = parseLineFile(t);
      if (typeof f === "string") bad.push(f);
      else this.imported.push(f);
    }
    this.imported = this.imported.slice(-7);
    this.note = bad.length ? `Could not read ${bad.length} file(s): ${bad[0]}` : "";
    this.showMenu();
  }

  // ---------- garage ----------
  private showGarage(): void {
    const car = this.settings.car;
    const el = this.show("center", `
      <h2>Garage</h2>
      <p class="dim">Spend up to ${CAR_BUDGET} points. Every stat helps somewhere and costs somewhere else.</p>
      <label>Name</label><input id="name" type="text" value="${esc(car.name)}" maxlength="30" />
      <div style="margin-top:10px">${STATS.map((st) => `
        <div class="stat"><b>${STAT_LABEL[st]}</b><button data-s="${st}" data-d="-1">−</button>
        <div class="bar"><i style="width:${(car[st] / STAT_MAX) * 100}%"></i></div><button data-s="${st}" data-d="1">+</button><span>${car[st]}</span></div>`).join("")}</div>
      <p>Points used: <b class="${carCost(car) > CAR_BUDGET ? "bad" : ""}">${carCost(car)}</b> / ${CAR_BUDGET}</p>
      <button id="save">Save this setup</button><button id="reset">Reset</button>
      ${this.cars.length ? `<label>Saved setups</label>${this.cars.map((c, i) => `<div class="row"><span>${esc(c.name)} <span class="dim">${c.accel}/${c.top}/${c.grip}/${c.brake}</span></span><button data-load="${i}">Use</button><button data-del="${i}">Delete</button></div>`).join("")}` : ""}
      <p><button class="primary" id="back">Done</button></p>`);
    const name = el.querySelector<HTMLInputElement>("#name")!;
    name.addEventListener("input", () => { car.name = name.value; });
    el.querySelectorAll<HTMLButtonElement>("button[data-s]").forEach((b) => b.addEventListener("click", () => {
      const st = b.dataset["s"] as Stat;
      const next = car[st] + Number(b.dataset["d"]);
      if (next < STAT_MIN || next > STAT_MAX) return;
      if (next > car[st] && carCost(car) >= CAR_BUDGET) return;
      car[st] = next;
      this.showGarage();
    }));
    this.on(el, "#reset", () => { this.settings.car = defaultCar(); this.showGarage(); });
    this.on(el, "#save", () => {
      if (validateCar(car)) return;
      const copy = { ...car, name: car.name.trim() || "Setup" };
      this.cars = [...this.cars.filter((c) => c.name !== copy.name), copy].slice(-12);
      void save("cars", this.cars);
      this.showGarage();
    });
    el.querySelectorAll<HTMLButtonElement>("button[data-load]").forEach((b) => b.addEventListener("click", () => { this.settings.car = { ...this.cars[Number(b.dataset["load"])]! }; this.showGarage(); }));
    el.querySelectorAll<HTMLButtonElement>("button[data-del]").forEach((b) => b.addEventListener("click", () => { this.cars.splice(Number(b.dataset["del"]), 1); void save("cars", this.cars); this.showGarage(); }));
    this.on(el, "#back", () => { this.persist(); this.showMenu(); });
  }

  // ---------- a game ----------
  private startGame(): void {
    const s = this.settings;
    this.track = generateTrack(s.phrase);
    const carErr = validateCar(s.car);
    if (carErr) { this.note = `Car: ${carErr}`; this.showMenu(); return; }
    this.rivalEntrants = s.mode === "trial" ? [] : this.makeRivals();
    this.race = undefined;
    this.view.setTrack(this.track);
    this.view.resetCamera();
    this.beginLapDraw();
  }

  private makeRivals(): Entrant[] {
    const s = this.settings;
    const rng = new Rng(this.track.seed ^ 0xa5a5a5a5);
    const out: Entrant[] = [];
    const files = this.imported.filter((f) => f.phrase === this.track.phrase).slice(0, s.rivals);
    files.forEach((f, i) => {
      const lines = f.lines.filter((l) => isComplete(this.track, l) && validateLine(this.track, l).ok);
      if (lines.length) out.push({ id: `file${i}`, name: f.name, car: f.car, lines });
    });
    const names = [...RIVAL_NAMES];
    for (let i = out.length; i < s.rivals; i++) {
      const car: CarConfig = { name: "Bot", accel: 6, top: 6, grip: 6, brake: 6 };
      for (let k = 0; k < 8; k++) {
        const from = rng.pick(STATS.filter((x) => car[x] > 3));
        const to = rng.pick(STATS.filter((x) => car[x] < 9 && x !== from));
        car[from]--; car[to]++;
      }
      const skill = 0.4 + 0.55 * rng.next();
      out.push({ id: `bot${i}`, name: names.splice(rng.int(names.length), 1)[0] ?? `Bot ${i}`, car, lines: [botLine(this.track, rng.int(2 ** 30), skill)] });
    }
    return out;
  }

  // ---------- drawing and editing ----------
  private beginLapDraw(): void {
    this.lapNo = 0;
    this.pick = null;
    this.view.sky.setActive(false);
    this.draw = { mode: "lap", line: null, seg: 0, pts: [], end: null, queue: [], drag: null, warn: "" };
    this.renderDraw();
  }

  private joinPoint(d: DrawState): Vec2 | null { return d.line ? joinBefore(d.line, d.seg) : null; }

  private exitPoint(d: DrawState): Vec2 | null {
    const t = this.track;
    if (d.seg === t.segments.length - 1) return d.line?.start ?? null;
    if (d.end) return d.end;
    const j = this.joinPoint(d);
    return j ? projectToGate(t.segments[d.seg]!.exit, d.pts.at(-1) ?? j) : null;
  }

  private handles(d: DrawState): { kind: HandleKind; i: number; p: Vec2 }[] {
    const out: { kind: HandleKind; i: number; p: Vec2 }[] = [];
    const j = this.joinPoint(d), e = this.exitPoint(d);
    if (j) out.push({ kind: "join", i: 0, p: j });
    d.pts.forEach((p, i) => out.push({ kind: "pt", i, p }));
    if (j && e) out.push({ kind: "end", i: 0, p: e });
    return out;
  }

  private hit(d: DrawState, p: Vec2): { kind: HandleKind; i: number } | null {
    const r = Math.max(4, 11 / this.view.scale);
    let best: { kind: HandleKind; i: number } | null = null, bd = r;
    for (const h of this.handles(d)) {
      const dd = Math.hypot(h.p.x - p.x, h.p.y - p.y);
      if (dd <= bd) { bd = dd; best = { kind: h.kind, i: h.i }; }
    }
    return best;
  }

  private preview(d: DrawState): { curve: Vec2[]; ok: boolean } | null {
    const j = this.joinPoint(d), e = this.exitPoint(d);
    return j && e ? previewSegment(this.track, j, [...d.pts, e]) : null;
  }

  /** The canvas half of the draw screen. Cheap enough to redo on every pointer move. */
  private drawWorld(): void {
    const d = this.draw!;
    const t = this.track;
    // fill the screen with this segment; the camera glides there from wherever it was
    const cell = t.segments[d.seg]!, m = 8;
    this.view.setFocus({ x: cell.cx * CELL - m, y: cell.cy * CELL - m, w: CELL + 2 * m, h: CELL + 2 * m });
    this.view.drawTrack(t, { visibleUpTo: d.mode === "lap" ? d.seg : null, selected: d.mode === "amend" ? new Set([d.seg]) : undefined });
    const curves: { pts: Vec2[]; color: number; width?: number; alpha?: number }[] = [];
    if (d.mode === "lap" && d.line && d.line.segs.length) {
      curves.push({ pts: smooth([d.line.start, ...d.line.segs.flat()], false).map((x) => x.p), color: PLAYER_COLOR, width: 2, alpha: 0.55 });
    } else if (d.mode === "amend" && d.line) {
      curves.push({ pts: lapCurve(d.line, t.segments.length).map((x) => x.p), color: PLAYER_COLOR, width: 2, alpha: 0.35 });
    }
    const pv = this.preview(d);
    if (pv) curves.push({ pts: pv.curve, color: pv.ok ? 0x4fd28a : 0xff5d6c, width: 3 });
    this.view.drawCurves(curves);
    this.view.drawHandles(this.handles(d).map((h): Handle => ({ p: h.p, kind: h.kind, active: d.drag?.kind === h.kind && d.drag.i === h.i })));
  }

  private renderDraw(): void {
    const d = this.draw!;
    const n = this.track.segments.length;
    this.drawWorld();
    const pv = this.preview(d);
    const needStart = d.mode === "lap" && d.seg === 0 && !d.line;
    const el = this.show("side", `
      <h2>${d.mode === "lap" ? `Lap ${this.lapNo + 1}: segment ${d.seg + 1} of ${n}` : `Editing segment ${d.seg + 1}${d.queue.length ? ` (${d.queue.length} more to go)` : ""}`}</h2>
      <p class="dim">${needStart ? "Click on the white start line to choose where your car starts." :
        d.mode === "lap" ? "Click to place points. The yellow diamond is where your line leaves this segment: drag it along the road edge. The next segment stays hidden until you finish this one." :
        "Drag points to move them, click to add, right-click a point to delete it."}</p>
      ${needStart ? "" : '<p class="dim">Drag the square (where this segment starts) and the diamond (where it ends) to slide them along the road edge. <kbd>Shift</kbd>+click inserts a point between two others.</p>'}
      ${d.mode === "lap" && d.seg === n - 1 ? '<p class="dim">Last segment: your line returns to the start point.</p>' : ""}
      <p>${pv ? (pv.ok ? '<span class="good">Line is clear.</span>' : '<span class="bad">Line leaves the road or hits an obstacle.</span>') : ""}</p>
      ${d.warn ? `<p class="bad">${esc(d.warn)}</p>` : ""}
      <button class="primary" id="fin" ${pv && pv.ok && !needStart ? "" : "disabled"}>Finish segment (Enter)</button>
      <button id="undo">Undo</button><button id="clear">Clear points</button>
      ${d.mode === "amend" ? '<button id="cancel">Cancel</button>' : ""}`);
    this.on(el, "#fin", () => this.finishSegment());
    this.on(el, "#undo", () => this.undo());
    this.on(el, "#clear", () => { d.pts = []; d.end = d.mode === "amend" ? d.end : null; if (needStart) d.line = null; this.renderDraw(); });
    this.on(el, "#cancel", () => { this.draw = null; this.showPicker(null); });
  }

  private onPointerDown(e: PointerEvent): void {
    const d = this.draw;
    const p = this.view.toWorld(e.clientX, e.clientY);
    if (d) {
      if (e.button === 2) {
        const h = this.hit(d, p);
        if (h?.kind === "pt") { d.pts.splice(h.i, 1); d.warn = ""; this.renderDraw(); } else this.undo();
        return;
      }
      if (e.button !== 0) return;
      const h = this.hit(d, p);
      if (h) {
        d.drag = h;
        this.app.canvas.setPointerCapture(e.pointerId);
        this.drawWorld();
        return;
      }
      d.warn = "";
      if (d.mode === "lap" && d.seg === 0 && !d.line) d.line = beginLine(this.track, p);
      else if (e.shiftKey) this.insertPoint(d, p);
      else d.pts.push(p);
      this.renderDraw();
    } else if (this.view.cameraMode === "overview") {
      // drag to pan; a click that did not move picks a segment
      this.pan = { lx: e.clientX, ly: e.clientY, sx: e.clientX, sy: e.clientY, moved: e.button !== 0, button: e.button, world: p };
      this.app.canvas.setPointerCapture(e.pointerId);
    }
  }

  private pickAt(p: Vec2): void {
    if (!this.pick) return;
    const idx = this.track.cellIndex.get(`${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`);
    if (idx === undefined) return;
    const s = this.pick.selected;
    if (s.has(idx)) s.delete(idx);
    else if (new Set([...this.changedThisLap(), ...s, idx]).size <= this.pick.limit) s.add(idx);
    this.showPicker(this.pickMessage);
  }

  private insertPoint(d: DrawState, p: Vec2): void {
    const j = this.joinPoint(d), e = this.exitPoint(d);
    if (!j || !e) { d.pts.push(p); return; }
    const poly = [j, ...d.pts, e];
    let best = -1, bd = 14;
    for (let i = 0; i < poly.length - 1; i++) {
      const dd = distToSegment(p, poly[i]!, poly[i + 1]!);
      if (dd < bd) { bd = dd; best = i; }
    }
    if (best < 0) d.pts.push(p);
    else d.pts.splice(best, 0, p);
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.pan) {
      const q = this.pan;
      if (!q.moved && Math.hypot(e.clientX - q.sx, e.clientY - q.sy) > 6) q.moved = true;
      if (q.moved) this.view.panBy(e.clientX - q.lx, e.clientY - q.ly);
      q.lx = e.clientX; q.ly = e.clientY;
      return;
    }
    const d = this.draw;
    if (!d?.drag || !d.line) return;
    const p = this.view.toWorld(e.clientX, e.clientY);
    const t = this.track, last = d.seg === t.segments.length - 1;
    if (d.drag.kind === "pt") d.pts[d.drag.i] = p;
    else if (d.drag.kind === "join") d.line = moveJoin(t, d.line, d.seg, p);
    else if (last) d.line = moveJoin(t, d.line, 0, p); // the last segment ends on the start line
    else d.end = projectToGate(t.segments[d.seg]!.exit, p);
    this.drawWorld();
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.pan) {
      const q = this.pan;
      this.pan = null;
      try { this.app.canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      if (!q.moved && q.button === 0) this.pickAt(q.world);
      return;
    }
    const d = this.draw;
    if (!d?.drag) return;
    d.drag = null;
    try { this.app.canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    d.warn = "";
    this.renderDraw();
  }

  private undo(): void {
    const d = this.draw;
    if (!d) return;
    d.warn = "";
    if (d.pts.length) d.pts.pop();
    else if (d.mode === "lap" && d.seg > 0) {
      // go back into the previous segment and reopen its points
      const prev = d.line!.segs[d.seg - 1]!;
      d.line = { start: d.line!.start, segs: d.line!.segs.slice(0, d.seg - 1) };
      d.seg--;
      d.pts = prev.slice(0, -1);
      d.end = prev.at(-1)!;
    } else if (d.mode === "lap" && d.seg === 0 && d.line) d.line = null;
    this.renderDraw();
  }

  private finishSegment(): void {
    const d = this.draw;
    if (!d) return;
    const pv = this.preview(d);
    if (!pv || !pv.ok) return;
    const n = this.track.segments.length;
    const end = this.exitPoint(d)!;
    if (d.mode === "lap") {
      d.line = setSegment(d.line!, d.seg, d.pts, end, true);
      d.pts = []; d.end = null;
      d.seg++;
      if (d.seg >= n) { this.draw = null; this.finishedLine(d.line); return; }
    } else {
      const candidate = setSegment(d.line!, d.seg, d.pts, end, false);
      if (this.race) {
        const changed = changedSegments(this.me.lines[this.lapNo]!, candidate);
        if (changed.length > MAX_AMENDS) {
          d.warn = `That changes ${changed.length} segments (segments ${changed.map((i) => i + 1).join(", ")}). Moving a start or end node changes its neighbour too, and only ${MAX_AMENDS} may change between laps.`;
          this.renderDraw();
          return;
        }
      }
      d.line = candidate;
      d.pts = [];
      const next = d.queue.shift();
      if (next === undefined) { this.draw = null; this.finishedLine(d.line); return; }
      d.seg = next;
      d.pts = d.line.segs[next]!.slice(0, -1);
      d.end = d.line.segs[next]!.at(-1)!;
    }
    d.warn = "";
    this.renderDraw();
  }

  private finishedLine(line: Line): void {
    this.currentLine = line;
    this.showPicker(null);
  }

  // ---------- picking segments to edit ----------
  /** Segments that differ from the line just raced. They use up the amend allowance. */
  private changedThisLap(): number[] {
    if (!this.race || !this.me.lines[this.lapNo]) return [];
    return changedSegments(this.me.lines[this.lapNo]!, this.currentLine);
  }

  private showPicker(message: string | null): void {
    this.pickMessage = message;
    const line = this.currentLine;
    if (!line) { this.beginLapDraw(); return; }
    this.view.setOverview();
    this.view.sky.setActive(false);
    const check = validateLine(this.track, line);
    const firstLap = !this.race;
    const bad = new Set(check.badSegs);
    const limit = firstLap ? Infinity : MAX_AMENDS;
    if (!this.pick) this.pick = { selected: new Set(check.badSegs), limit, bad };
    this.pick.bad = bad; this.pick.limit = limit;
    const sel = this.pick.selected;
    this.draw = null;
    const changed = this.changedThisLap();
    const used = new Set([...changed, ...sel]).size;
    this.view.drawTrack(this.track, { visibleUpTo: null, selected: sel, bad });
    this.view.drawCurves([{ pts: lapCurve(line, this.track.segments.length).map((x) => x.p), color: PLAYER_COLOR, width: 3 }]);
    if (this.race) this.drawCarsAt(this.race.tick);
    const lapsLeft = this.settings.laps - this.lapNo;
    const tooMany = !firstLap && changed.length > MAX_AMENDS;
    const el = this.show("side", `
      <h2>${firstLap ? "Your line" : `Lap ${this.lapNo + 1} of ${this.settings.laps}`}</h2>
      ${check.ok ? '<p class="good">Your line is clear all the way round.</p>' : `<p class="bad">The line leaves the road or hits something in the red segments. Select them and edit.</p>`}
      <p class="dim">${firstLap ? "Click segments on the map to edit them, or race." : `You can change up to ${MAX_AMENDS} segments before lap ${this.lapNo + 1}. Click segments on the map to select them.`}</p>
      <p>${limit === Infinity ? `Selected: <b>${sel.size}</b>` : `Segments changed or selected: <b class="${used > limit ? "bad" : ""}">${used}</b> / ${limit}`}</p>
      ${tooMany ? `<p class="bad">Too many segments changed. Revert and try again.</p>` : ""}
      ${message ? `<p class="bad">${esc(message)}</p>` : ""}
      <button id="redraw" ${sel.size ? "" : "disabled"}>Edit selected</button>
      ${!firstLap && changed.length ? '<button id="revert">Revert changes</button>' : ""}
      <button class="primary" id="race" ${check.ok && !tooMany ? "" : "disabled"}>${firstLap ? "Race!" : lapsLeft === 1 ? "Final lap!" : `Race lap ${this.lapNo + 1}`}</button>`);
    this.on(el, "#redraw", () => {
      const queue = [...sel].sort((a, b) => a - b);
      const first = queue.shift()!;
      this.pick = null;
      this.view.sky.setActive(false);
      this.draw = { mode: "amend", line, seg: first, pts: line.segs[first]!.slice(0, -1), end: line.segs[first]!.at(-1)!, queue, drag: null, warn: "" };
      this.renderDraw();
    });
    this.on(el, "#revert", () => { this.currentLine = this.me.lines[this.lapNo]!; this.pick = null; this.showPicker(null); });
    this.on(el, "#race", () => { this.pick = null; if (firstLap) this.startRace(); else this.nextLap(); });
  }

  // ---------- racing ----------
  private startRace(): void {
    this.me = { id: ME, name: "You", car: { ...this.settings.car }, lines: [this.currentLine], isPlayer: true };
    this.race = new Race(this.track, [this.me, ...this.rivalEntrants], this.settings.laps);
    this.lapNo = 0;
    this.view.clearSkids();
    this.skidTick = 0;
    this.runAndPlay(0);
  }

  private nextLap(): void {
    this.lapNo++;
    this.me.lines[this.lapNo] = this.currentLine;
    this.runAndPlay(this.race!.tick);
  }

  private runAndPlay(fromTick: number): void {
    const race = this.race!;
    race.runLap(ME, this.lapNo);
    if (this.lapNo >= this.settings.laps - 1) race.runToEnd();
    this.play = { tick: fromTick, end: race.tick, speed: 1 };
    this.skidTick = fromTick;
    this.view.drawTrack(this.track, { visibleUpTo: null });
    this.view.drawCurves([{ pts: lapCurve(this.currentLine, this.track.segments.length).map((x) => x.p), color: PLAYER_COLOR, width: 1.5, alpha: 0.3 }]);
    this.view.clearCars();
    this.view.sky.setActive(true);
    this.audio.unlock();
    this.drawCarsAt(fromTick);
    const me = race.cars.find((c) => c.entrant.id === ME)!;
    this.view.setFollow({ x: me.trace[fromTick * 3]!, y: me.trace[fromTick * 3 + 1]! });
  }

  private colorOf(id: string): number {
    if (id === ME) return PLAYER_COLOR;
    const i = this.race!.cars.findIndex((c) => c.entrant.id === id);
    return RIVAL_COLORS[i % RIVAL_COLORS.length]!;
  }

  /** Speed, acceleration and how hard the tyres are working at a tick, read from the recorded race. */
  private motion(c: RaceCar, k: number): Motion {
    const last = c.vtrace.length - 1;
    const i = Math.min(k, last), j = Math.max(0, i - 6), h0 = Math.max(0, i - 3);
    const v = c.vtrace[i]!, acc = (v - c.vtrace[j]!) * 10;
    let dh = c.trace[i * 3 + 2]! - c.trace[h0 * 3 + 2]!;
    if (dh > Math.PI) dh -= 2 * Math.PI; else if (dh < -Math.PI) dh += 2 * Math.PI;
    const st = carStats(c.entrant.car);
    const ratio = Math.abs(v * dh * 20) / st.aLat;
    return { v, acc, slip: clamp((ratio - 0.88) / 0.12, 0, 1), braking: acc < -0.5 * st.brake && v > 20 };
  }

  private drawCarsAt(tick: number): void {
    for (const c of this.race!.cars) {
      const k = Math.min(tick, c.trace.length / 3 - 1);
      this.view.setCar(c.entrant.id, c.trace[k * 3]!, c.trace[k * 3 + 1]!, c.trace[k * 3 + 2]!, this.colorOf(c.entrant.id), c.gtrace[k] === 1, c.entrant.id === ME, this.motion(c, k).braking);
    }
  }

  /** Rubber on the tarmac where the cars slid in corners or stood on the brakes. */
  private updateSkids(k: number): void {
    const out: Skid[] = [];
    for (let i = this.skidTick + 1; i <= k; i++) {
      if (i < 2 || i % 2) continue;
      for (const c of this.race!.cars) {
        if (i >= c.vtrace.length || c.gtrace[i] || c.vtrace[i]! < 30) continue;
        const m = this.motion(c, i);
        const strength = Math.max(m.slip * 0.42, m.braking ? 0.16 : 0);
        if (strength < 0.05) continue;
        const nx = -Math.sin(c.trace[i * 3 + 2]!), ny = Math.cos(c.trace[i * 3 + 2]!);
        for (const side of [-2.1, 2.1]) {
          out.push({ x0: c.trace[(i - 2) * 3]! + nx * side, y0: c.trace[(i - 2) * 3 + 1]! + ny * side, x1: c.trace[i * 3]! + nx * side, y1: c.trace[i * 3 + 1]! + ny * side, alpha: strength });
        }
      }
    }
    this.skidTick = Math.max(this.skidTick, k);
    this.view.addSkids(out);
  }

  private updateAudio(k: number, now: number, speed: number): void {
    const race = this.race!;
    this.audio.setDucked(speed > 1);
    const me = race.cars.find((c) => c.entrant.id === ME)!;
    const mk = Math.min(k, me.trace.length / 3 - 1);
    const fx = me.trace[mk * 3]!;
    const fy = me.trace[mk * 3 + 1]!;
    for (const c of race.cars) {
      if (c.finishTime !== null && c.finishTime <= now) { this.audio.hush(c.entrant.id); continue; }
      const i = Math.min(k, c.trace.length / 3 - 1), m = this.motion(c, i);
      const x = c.trace[i * 3]!, y = c.trace[i * 3 + 1]!, isMe = c.entrant.id === ME;
      const vol = isMe ? 1 : 0.8 / (1 + Math.hypot(x - fx, y - fy) / 45);
      this.audio.update(c.entrant.id, { speed: m.v, accel: m.acc, slip: m.slip, vol, pan: (x - fx) / 160 }, isMe);
    }
  }

  private onFrame(dt: number): void {
    this.clock += dt;
    this.view.update(dt);
    const p = this.play;
    if (!p || !this.race) return;
    const race = this.race;
    p.tick = Math.min(p.end, p.tick + dt * 60 * p.speed);
    const k = Math.floor(p.tick);
    const now = k / 60;
    this.drawCarsAt(k);
    this.updateSkids(k);
    const me = race.cars.find((c) => c.entrant.id === ME)!;
    const mi = Math.min(k, me.trace.length / 3 - 1);
    const meDone = me.finishTime !== null && me.finishTime <= now;
    // slowly in on the player, and back out to the whole track once they finish
    this.view.setFollow(meDone ? null : { x: me.trace[mi * 3]!, y: me.trace[mi * 3 + 1]! });
    this.updateAudio(k, now, p.speed);

    const standing = [...race.cars].map((c) => {
      const done = c.finishTime !== null && c.finishTime <= now;
      return { c, key: done ? 1e12 - (c.finishTime as number) : (c.prog[Math.min(k, c.prog.length - 1)] ?? 0) };
    }).sort((a, b) => b.key - a.key);
    const lap = Math.min(this.settings.laps, Math.max(1, Math.floor(((me.prog[mi] ?? 0) + 1e5) / 1e5)));
    // the buttons are built once: replacing them every frame would swallow clicks
    let el = this.ui.querySelector<HTMLElement>(".panel.top");
    if (!el) {
      el = this.show("top", `<h2 id="hud-head"></h2><table id="hud-table"></table>
        <button id="speed"></button><button id="skip">Skip</button><button id="mute"></button>`);
      this.on(el, "#speed", () => { const q = this.play; if (q) q.speed = q.speed === 1 ? 3 : q.speed === 3 ? 8 : 1; });
      this.on(el, "#skip", () => { const q = this.play; if (q) q.tick = q.end; });
      this.on(el, "#mute", () => this.toggleMute());
    }
    const set = (sel: string, html: string) => { const n = el!.querySelector(sel); if (n && n.innerHTML !== html) n.innerHTML = html; };
    set("#hud-head", `Lap ${lap} / ${this.settings.laps} <span class="dim">${fmt(now)}</span>`);
    set("#hud-table", standing.map(({ c }, i) => `<tr class="${c.entrant.id === ME ? "me" : ""}"><td>${i + 1}</td><td><span style="color:${hex(this.colorOf(c.entrant.id))}">■</span> ${esc(c.entrant.name)}</td></tr>`).join(""));
    set("#speed", `${p.speed}×`);
    set("#mute", this.audio.isMuted() ? "Sound off" : "Sound on");
    if (p.tick >= p.end) {
      this.play = null;
      this.drawCarsAt(p.end);
      this.audio.stopAll();
      if (race.over || this.lapNo >= this.settings.laps - 1) this.showResults();
      else this.showPicker(null);
    }
  }

  // ---------- results ----------
  private showResults(): void {
    const race = this.race!;
    const res = race.results();
    const mine = res.find((r) => r.isPlayer)!;
    const key = `${this.track.phrase}:${this.settings.laps}`;
    let record = "";
    if (mine.finishTime !== null && (this.best[key] === undefined || mine.finishTime < this.best[key]!)) {
      this.best[key] = mine.finishTime;
      void save("best", this.best);
      record = '<p class="good">New best time for this track!</p>';
    }
    const trial = this.settings.mode === "trial";
    const el = this.show("center", `
      <h2>${trial ? "Time trial" : mine.position === 1 ? "You won!" : `You finished P${mine.position}`}</h2>
      <p class="dim">${esc(this.track.phrase)} · ${this.settings.laps} lap(s)</p>${record}
      <table><tr><th>#</th><th>Driver</th><th class="num">Time</th><th class="num">Best lap</th></tr>
      ${res.map((r) => `<tr class="${r.isPlayer ? "me" : ""}"><td>${r.position}</td><td>${esc(r.name)}</td><td class="num">${fmt(r.finishTime)}</td><td class="num">${fmt(r.lapTimes.length ? Math.min(...r.lapTimes) : null)}</td></tr>`).join("")}</table>
      <p class="dim">Your laps: ${mine.lapTimes.map(fmt).join(" · ")}</p>
      <button class="primary" id="again">Race again</button><button id="export">Save my lines</button><button id="menu">Menu</button>`);
    this.on(el, "#menu", () => this.showMenu());
    this.on(el, "#again", () => { this.audio.unlock(); this.startGame(); });
    this.on(el, "#export", () => {
      const text = serializeLineFile({ phrase: this.track.phrase, name: "Player", car: this.settings.car, lines: this.me.lines });
      void saveFile(`${this.track.phrase}-${this.settings.laps}laps`, text);
    });
    // the camera is already easing back out to the whole track
    this.view.setFollow(null);
  }

  /** Dev only: start a lap's drawing with the first `segments` segments already drawn along a bot line. */
  demoDraw(segments: number, amend = false): void {
    this.settings = { ...this.settings, phrase: "brave-owl-rides-melons", mode: "race", muted: true };
    this.startGame();
    const guide = botLine(this.track, 99, 0.9);
    if (amend) {
      this.currentLine = guide;
      this.draw = null;
      this.showPicker(null);
      this.pick = null;
      this.draw = { mode: "amend", line: guide, seg: segments, pts: guide.segs[segments]!.slice(0, -1), end: guide.segs[segments]!.at(-1)!, queue: [], drag: null, warn: "" };
      this.renderDraw();
      return;
    }
    let line = beginLine(this.track, guide.start);
    for (let i = 0; i < segments; i++) line = setSegment(line, i, guide.segs[i]!.slice(0, -1), guide.segs[i]!.at(-1)!, true);
    this.draw = { mode: "lap", line, seg: segments, pts: guide.segs[segments]!.slice(0, 3), end: null, queue: [], drag: null, warn: "" };
    this.renderDraw();
  }

  /** Dev only (npm run dev:web?demo): skip the drawing, race a bot line, and park the camera on it. */
  demo(opts: { phrase?: string; laps?: number; rivals?: number; atSeconds?: number; zoomed?: boolean } = {}): void {
    this.settings = { ...this.settings, phrase: opts.phrase ?? "brave-owl-rides-melons", laps: opts.laps ?? 2, mode: "race", rivals: opts.rivals ?? 6, muted: true };
    this.audio.setMuted(true);
    this.startGame();
    this.draw = null;
    this.currentLine = botLine(this.track, 99, 0.9);
    this.startRace();
    const p = this.play!;
    p.tick = Math.min(p.end - 1, Math.floor((opts.atSeconds ?? 12) * 60));
    this.skidTick = 0;
    this.updateSkids(Math.floor(p.tick));
    this.drawCarsAt(Math.floor(p.tick));
    const me = this.race!.cars.find((c) => c.entrant.id === ME)!;
    const k = Math.floor(p.tick);
    this.view.setFollow(opts.zoomed === false ? null : { x: me.trace[k * 3]!, y: me.trace[k * 3 + 1]! });
    if (opts.zoomed !== false) this.view.snapCamera();
  }
}

async function saveFile(name: string, text: string): Promise<void> {
  if (window.apex) { await window.apex.exportLine(name, text); return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = `${name}.apexline.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function pickFiles(): Promise<string[]> {
  if (window.apex) return window.apex.importLines();
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file"; input.multiple = true; input.accept = ".json";
    input.onchange = async () => resolve(await Promise.all([...(input.files ?? [])].slice(0, 7).map((f) => f.text())));
    input.click();
  });
}
