import type { Application } from "pixi.js";
import {
  CAR_BUDGET, MAX_AMENDS, Race, Rng, STATS, STAT_MAX, STAT_MIN, amendSegment, beginLine, botLine, carCost,
  changedSegments, defaultCar, drawSegment, generateTrack, isComplete, joinBefore, lapCurve, normalizePhrase,
  parseLineFile, previewSegment, projectToGate, randomPhrase, serializeLineFile, smooth, validateCar, validateLine,
  CELL, type CarConfig, type Entrant, type Line, type LineFile, type Stat, type Track, type Vec2,
} from "@apex/sim";
import { load, save, type Best, type Settings } from "./store.ts";
import type { WorldView } from "./world.ts";

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

interface DrawState {
  mode: "lap" | "amend";
  line: Line | null;
  seg: number;
  pts: Vec2[];
  queue: number[];
  /** later laps must stay within MAX_AMENDS; the first lap may be redrawn freely */
  returnTo: () => void;
}

export class Game {
  private settings: Settings = { phrase: "", laps: 3, mode: "race", rivals: 5, car: defaultCar() };
  private cars: CarConfig[] = [];
  private best: Best = {};
  private imported: LineFile[] = [];
  private note = "";

  private track!: Track;
  private rivalEntrants: Entrant[] = [];
  private me!: Entrant;
  private race!: Race;
  private lapNo = 0;
  private draw: DrawState | null = null;
  private pick: { selected: Set<number>; limit: number; bad: Set<number> } | null = null;
  private play: { tick: number; end: number; speed: number } | null = null;
  private version = "dev";

  constructor(private app: Application, private view: WorldView, private ui: HTMLElement) {}

  async start(): Promise<void> {
    this.settings = { ...this.settings, ...(await load<Partial<Settings>>("settings", {})) };
    if (!this.settings.phrase) this.settings.phrase = randomPhrase(new Rng((Math.random() * 2 ** 32) >>> 0));
    this.cars = await load<CarConfig[]>("cars", []);
    this.best = await load<Best>("best", {});
    this.version = (await window.apex?.version()) ?? "dev";
    const c = this.app.canvas;
    c.addEventListener("pointerdown", (e) => this.onPointer(e));
    c.addEventListener("contextmenu", (e) => { e.preventDefault(); this.undo(); });
    window.addEventListener("keydown", (e) => {
      if (!this.draw || (e.target as HTMLElement).tagName === "INPUT") return;
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

  // ---------- menu ----------
  private showMenu(): void {
    this.draw = null; this.pick = null; this.play = null;
    this.view.clear();
    this.view.setBounds(700, 500);
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
      <button class="primary" id="go">Start</button><button id="garage">Garage</button><button id="import">Import rival lines…</button>
      <p class="dim" style="margin-top:12px">v${esc(this.version)} · Click to place points, <kbd>Enter</kbd> finishes a segment, <kbd>Backspace</kbd> or right-click undoes.</p>`);
    this.note = "";
    const input = el.querySelector<HTMLInputElement>("#phrase")!;
    input.addEventListener("input", () => { s.phrase = input.value; });
    el.querySelector("#laps")!.addEventListener("change", (e) => { s.laps = Number((e.target as HTMLSelectElement).value); this.persist(); this.showMenu(); });
    el.querySelector("#mode")!.addEventListener("change", (e) => { s.mode = (e.target as HTMLSelectElement).value as Settings["mode"]; this.persist(); this.showMenu(); });
    el.querySelector("#rivals")?.addEventListener("change", (e) => { s.rivals = Number((e.target as HTMLSelectElement).value); this.persist(); });
    this.on(el, "#rand", () => { s.phrase = randomPhrase(new Rng((Math.random() * 2 ** 32) >>> 0)); this.persist(); this.showMenu(); });
    this.on(el, "#garage", () => { s.phrase = input.value; this.persist(); this.showGarage(); });
    this.on(el, "#import", () => void this.importLines(input.value));
    this.on(el, "#go", () => {
      s.phrase = input.value;
      if (!normalizePhrase(s.phrase)) { this.note = "Type a phrase or press Random."; this.showMenu(); return; }
      this.persist();
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

  // ---------- drawing ----------
  private beginLapDraw(): void {
    this.lapNo = 0;
    this.pick = null;
    this.draw = { mode: "lap", line: null, seg: 0, pts: [], queue: [], returnTo: () => this.showPicker(null) };
    this.renderDraw();
  }

  private join(d: DrawState): Vec2 | null {
    if (d.mode === "lap") return d.line ? joinBefore(d.line, d.seg) : null;
    return joinBefore(d.line!, d.seg);
  }

  private endPoint(d: DrawState): Vec2 | null {
    const n = this.track.segments.length;
    if (d.mode === "amend") return d.line!.segs[d.seg]!.at(-1)!;
    const j = this.join(d);
    if (!j) return null;
    if (d.seg === n - 1) return d.line!.start;
    return projectToGate(this.track.segments[d.seg]!.exit, d.pts.at(-1) ?? j);
  }

  private preview(d: DrawState): { curve: Vec2[]; ok: boolean } | null {
    const j = this.join(d), e = this.endPoint(d);
    if (!j || !e) return null;
    return previewSegment(this.track, j, [...d.pts, e]);
  }

  private renderDraw(): void {
    const d = this.draw!;
    const t = this.track;
    const n = t.segments.length;
    this.view.drawTrack(t, { visibleUpTo: d.mode === "lap" ? d.seg : null, selected: d.mode === "amend" ? new Set([d.seg]) : undefined });
    const curves: { pts: Vec2[]; color: number; width?: number; alpha?: number }[] = [];
    if (d.mode === "lap" && d.line && d.line.segs.length) {
      curves.push({ pts: smooth([d.line.start, ...d.line.segs.flat()], false).map((x) => x.p), color: PLAYER_COLOR, width: 2, alpha: 0.55 });
    } else if (d.mode === "amend" && d.line) {
      curves.push({ pts: lapCurve(d.line, n).map((x) => x.p), color: PLAYER_COLOR, width: 2, alpha: 0.35 });
    }
    const pv = this.preview(d);
    if (pv) curves.push({ pts: pv.curve, color: pv.ok ? 0x4fd28a : 0xff5d6c, width: 3 });
    this.view.drawCurves(curves);
    const dots = [...d.pts];
    const j = this.join(d);
    if (j) dots.unshift(j);
    this.view.drawDots(dots, 0xffffff);
    const e = this.endPoint(d);
    if (e && j) this.view.drawDots([e], 0xffcf3f, 4);

    const needStart = d.mode === "lap" && d.seg === 0 && !d.line;
    const segs = n;
    const el = this.show("side", `
      <h2>${d.mode === "lap" ? `Lap ${this.lapNo + 1}: segment ${d.seg + 1} of ${segs}` : `Redraw segment ${d.seg + 1}`}</h2>
      <p class="dim">${needStart ? "Click on the white start line to choose where your car starts." :
        d.mode === "lap" ? "Click to place points. Your line leaves this segment where your last point lines up with the road ahead, shown as the yellow dot. The next segment stays hidden until you finish this one." :
        "The ends of this segment are fixed. Redraw the middle."}</p>
      ${d.mode === "lap" && d.seg === n - 1 ? '<p class="dim">Last segment: your line returns to the start point.</p>' : ""}
      <p>${pv ? (pv.ok ? '<span class="good">Line is clear.</span>' : '<span class="bad">Line leaves the road or hits an obstacle.</span>') : ""}</p>
      <button class="primary" id="fin" ${pv && pv.ok && !needStart ? "" : "disabled"}>Finish segment (Enter)</button>
      <button id="undo">Undo</button><button id="clear">Clear</button>
      ${d.mode === "amend" ? '<button id="cancel">Cancel</button>' : ""}`);
    this.on(el, "#fin", () => this.finishSegment());
    this.on(el, "#undo", () => this.undo());
    this.on(el, "#clear", () => { d.pts = []; if (needStart || (d.mode === "lap" && d.seg === 0 && d.line && !d.line.segs.length)) d.line = null; this.renderDraw(); });
    this.on(el, "#cancel", () => { this.draw = null; this.showPicker(null); });
  }

  private onPointer(e: PointerEvent): void {
    if (e.button !== 0) return;
    const p = this.view.toWorld(e.clientX, e.clientY);
    if (this.draw) {
      const d = this.draw;
      if (d.mode === "lap" && d.seg === 0 && !d.line) d.line = beginLine(this.track, p);
      else if (d.line || d.mode === "amend") d.pts.push(p);
      this.renderDraw();
    } else if (this.pick) {
      const idx = this.track.cellIndex.get(`${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`);
      if (idx === undefined) return;
      const s = this.pick.selected;
      if (s.has(idx)) s.delete(idx);
      else if (new Set([...this.changedThisLap(), ...s, idx]).size <= this.pick.limit) s.add(idx);
      this.showPicker(this.pickMessage);
    }
  }

  private undo(): void {
    const d = this.draw;
    if (!d) return;
    if (d.pts.length) d.pts.pop();
    else if (d.mode === "lap" && d.seg > 0) {
      // go back into the previous segment, reopening its points
      const prev = d.line!.segs[d.seg - 1]!;
      d.line = { start: d.line!.start, segs: d.line!.segs.slice(0, d.seg - 1) };
      d.seg--;
      d.pts = prev.slice(0, -1);
    } else if (d.mode === "lap" && d.seg === 0 && d.line) d.line = null;
    this.renderDraw();
  }

  private finishSegment(): void {
    const d = this.draw;
    if (!d) return;
    const pv = this.preview(d);
    if (!pv || !pv.ok) return;
    const n = this.track.segments.length;
    if (d.mode === "lap") {
      const j = this.join(d)!;
      d.line = drawSegment(this.track, d.line!, d.seg, [...d.pts, d.pts.at(-1) ?? j]);
      d.pts = [];
      d.seg++;
      if (d.seg >= n) { this.draw = null; this.finishedLine(d.line); return; }
    } else {
      d.line = amendSegment(d.line!, d.seg, d.pts);
      d.pts = [];
      const next = d.queue.shift();
      if (next === undefined) { this.draw = null; this.finishedLine(d.line); return; }
      d.seg = next;
    }
    this.renderDraw();
  }

  private finishedLine(line: Line): void {
    this.currentLine = line;
    this.showPicker(null);
  }

  // ---------- picking segments to redraw ----------
  private currentLine!: Line;

  /** Segments already redrawn compared with the line that was just raced. They use up the amend allowance. */
  private changedThisLap(): number[] {
    if (!this.race || !this.me.lines[this.lapNo]) return [];
    return changedSegments(this.me.lines[this.lapNo]!, this.currentLine);
  }
  private pickMessage: string | null = null;

  private showPicker(message: string | null): void {
    this.pickMessage = message;
    const line = this.currentLine;
    if (!line) { this.beginLapDraw(); return; }
    const check = validateLine(this.track, line);
    const firstLap = this.lapNo === 0 && !this.race;
    const bad = new Set(check.badSegs);
    const limit = firstLap ? Infinity : MAX_AMENDS;
    if (!this.pick) this.pick = { selected: new Set(check.badSegs), limit, bad };
    this.pick.bad = bad; this.pick.limit = limit;
    const sel = this.pick.selected;
    this.draw = null;
    this.view.drawTrack(this.track, { visibleUpTo: null, selected: sel, bad });
    this.view.drawCurves([{ pts: lapCurve(line, this.track.segments.length).map((x) => x.p), color: PLAYER_COLOR, width: 3 }]);
    if (this.race) this.drawCarsAt(this.race.tick);
    const lapsLeft = this.settings.laps - this.lapNo;
    const el = this.show("side", `
      <h2>${firstLap ? "Your line" : `Lap ${this.lapNo + 1} of ${this.settings.laps}`}</h2>
      ${check.ok ? '<p class="good">Your line is clear all the way round.</p>' : `<p class="bad">The line leaves the road or hits something in the red segments. Select them and redraw.</p>`}
      <p class="dim">${firstLap ? "Click segments on the map to redraw them, or race." : `You can amend up to ${MAX_AMENDS} segments before lap ${this.lapNo + 1}. Click segments on the map to select them.`}</p>
      <p>${limit === Infinity ? `Selected: <b>${sel.size}</b>` : `Segments changed or selected: <b>${new Set([...this.changedThisLap(), ...sel]).size}</b> / ${limit}`}</p>
      ${message ? `<p class="bad">${esc(message)}</p>` : ""}
      <button id="redraw" ${sel.size ? "" : "disabled"}>Redraw selected</button>
      <button class="primary" id="race" ${check.ok ? "" : "disabled"}>${firstLap ? "Race!" : lapsLeft === 1 ? "Final lap!" : `Race lap ${this.lapNo + 1}`}</button>`);
    this.on(el, "#redraw", () => {
      const queue = [...sel].sort((a, b) => a - b);
      const first = queue.shift()!;
      this.pick = null;
      this.draw = { mode: "amend", line, seg: first, pts: [], queue, returnTo: () => this.showPicker(null) };
      this.renderDraw();
    });
    this.on(el, "#race", () => { this.pick = null; firstLap ? this.startRace() : this.nextLap(); });
  }

  // ---------- racing ----------
  private startRace(): void {
    this.me = { id: ME, name: "You", car: { ...this.settings.car }, lines: [this.currentLine], isPlayer: true };
    this.race = new Race(this.track, [this.me, ...this.rivalEntrants], this.settings.laps);
    this.lapNo = 0;
    this.runAndPlay(0);
  }

  private nextLap(): void {
    this.lapNo++;
    this.me.lines[this.lapNo] = this.currentLine;
    this.runAndPlay(this.race.tick);
  }

  private runAndPlay(fromTick: number): void {
    this.race.runLap(ME, this.lapNo);
    if (this.lapNo >= this.settings.laps - 1) this.race.runToEnd();
    this.play = { tick: fromTick, end: this.race.tick, speed: 1 };
    this.view.drawTrack(this.track, { visibleUpTo: null });
    this.view.clearLines();
    this.view.drawCurves([{ pts: lapCurve(this.currentLine, this.track.segments.length).map((x) => x.p), color: PLAYER_COLOR, width: 1.5, alpha: 0.35 }]);
    this.view.clearCars();
  }

  private colorOf(id: string): number {
    if (id === ME) return PLAYER_COLOR;
    const i = this.race.cars.findIndex((c) => c.entrant.id === id);
    return RIVAL_COLORS[i % RIVAL_COLORS.length]!;
  }

  private drawCarsAt(tick: number): void {
    for (const c of this.race.cars) {
      const k = Math.min(tick, c.trace.length / 3 - 1);
      this.view.setCar(c.entrant.id, c.trace[k * 3]!, c.trace[k * 3 + 1]!, c.trace[k * 3 + 2]!, this.colorOf(c.entrant.id), false, c.entrant.id === ME);
    }
  }

  private onFrame(dt: number): void {
    const p = this.play;
    if (!p) return;
    p.tick = Math.min(p.end, p.tick + dt * 60 * p.speed);
    const k = Math.floor(p.tick);
    this.drawCarsAt(k);
    const now = k / 60;
    const standing = [...this.race.cars].map((c) => {
      const done = c.finishTime !== null && c.finishTime <= now;
      return { c, key: done ? 1e12 - (c.finishTime as number) : (c.prog[Math.min(k, c.prog.length - 1)] ?? 0) };
    }).sort((a, b) => b.key - a.key);
    const me = this.race.cars.find((c) => c.entrant.id === ME)!;
    const lap = Math.min(this.settings.laps, Math.max(1, Math.floor(((me.prog[Math.min(k, me.prog.length - 1)] ?? 0) + 1e5) / 1e5) )) ;
    const hud = `
      <h2>Lap ${lap} / ${this.settings.laps} <span class="dim">${fmt(now)}</span></h2>
      <table>${standing.map(({ c }, i) => `<tr class="${c.entrant.id === ME ? "me" : ""}"><td>${i + 1}</td><td><span style="color:${hex(this.colorOf(c.entrant.id))}">■</span> ${esc(c.entrant.name)}</td></tr>`).join("")}</table>
      <button id="speed">${p.speed}×</button><button id="skip">Skip</button>`;
    let el = this.ui.querySelector<HTMLElement>(".panel.top");
    if (!el) {
      this.show("top", hud);
      el = this.ui.querySelector<HTMLElement>(".panel.top")!;
    } else el.innerHTML = hud;
    this.on(el, "#speed", () => { p.speed = p.speed === 1 ? 3 : p.speed === 3 ? 8 : 1; });
    this.on(el, "#skip", () => { p.tick = p.end; });
    if (p.tick >= p.end) {
      this.play = null;
      this.drawCarsAt(p.end);
      if (this.race.over || this.lapNo >= this.settings.laps - 1) this.showResults();
      else this.showPicker(null);
    }
  }

  // ---------- results ----------
  private showResults(): void {
    const res = this.race.results();
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
    this.on(el, "#menu", () => { this.race = undefined as unknown as Race; this.showMenu(); });
    this.on(el, "#again", () => { this.race = undefined as unknown as Race; this.startGame(); });
    this.on(el, "#export", () => {
      const text = serializeLineFile({ phrase: this.track.phrase, name: "Player", car: this.settings.car, lines: this.me.lines });
      void saveFile(`${this.track.phrase}-${this.settings.laps}laps`, text);
    });
    this.view.drawTrack(this.track, { visibleUpTo: null });
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

