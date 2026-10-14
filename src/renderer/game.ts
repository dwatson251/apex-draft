import type { Application } from "pixi.js";
import {
  BIOMES, CAR_BUDGET, CELL, MAX_AMENDS, PIT_PENALTY, PIT_STOP_TIME, Race, Rng, STATS, STAT_MAX, STAT_MIN, TANK, VEHICLES, beginLine, botLine, carCost, carStats, changedSegments,
  defaultCar, distToSegment, biomeForSeed, decodeShare, encodeShare, fuelPerLap, generateTrack, isComplete, joinBefore, lapCurve, moveJoin, normalizePhrase, parseLineFile,
  phraseToSeed, previewSegment, projectToGate, randomPhrase, serializeLineFile, setSegment, smooth, validateCar, validateLine, vehicleForSeed,
  COMPOUNDS, COMPOUND_IDS, MAX_PIT_STOPS, forecast, forecastText, isCompound, weatherFor,
  type CarConfig, type Compound, type Entrant, type Line, type LineFile, type RaceCar, type ShareState, type Stat, type Track, type Vec2, type VehicleId,
} from "@apex/sim";
import { CarAudio } from "./audio.ts";
import { Bar, type BarButton } from "./bar.ts";
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

/** A tyre drawn from above: dark rubber with a coloured sidewall. The colour is how you tell the kinds apart. */
export function tyreIcon(c: Compound, px: number): string {
  const col = `#${COMPOUNDS[c].color.toString(16).padStart(6, "0")}`;
  let treads = "";
  for (let i = 0; i < 16; i++) { const a = (i / 16) * 360; treads += `<rect x="30" y="1.5" width="4" height="6" rx="1" fill="#2c303c" transform="rotate(${a} 32 32)"/>`; }
  return `<svg width="${px}" height="${px}" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="31" fill="#14161c"/>${treads}<circle cx="32" cy="32" r="21" fill="none" stroke="${col}" stroke-width="9"/><circle cx="32" cy="32" r="8" fill="#2a2e3a" stroke="#6a7188" stroke-width="2"/><circle cx="32" cy="32" r="2.5" fill="${col}"/></svg>`;
}

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
  private settings: Settings = { phrase: "", laps: 3, mode: "race", rivals: 5, car: defaultCar(), realism: false, obstacles: true, startTyre: "medium", pitPlan: [] };
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
  private play: { tick: number; end: number; speed: number; atStop: boolean } | null = null;
  private currentLine!: Line;
  private pickMessage: string | null = null;
  private version = "dev";
  private audio = new CarAudio();
  private skidTick = 0;
  private clock = 0;
  /** pit[lap]: the player drives into the pits at the end of that lap */
  private bar!: Bar;
  private planLayer!: HTMLElement;
  private planOpen = false;
  private planLap = 0;
  private planMsg = "";
  private eventIdx = 0;
  /** the machines for this track's race day */
  private vehicle: VehicleId = "rally";
  /** what the share link remembers of the drawing */
  private shareLine: Line | undefined;
  private inGame = false;
  private menuOpen = false;
  private previewKey = "";
  /** bots going round behind the title menu, replayed in a loop */
  private ambient: { race: Race; tick: number } | null = null;
  private menuLayer!: HTMLElement;
  private menuBtn!: HTMLButtonElement;
  private modal!: HTMLElement;
  /** a drag that pans the overview, or turns out to be a click */
  private pan: { lx: number; ly: number; sx: number; sy: number; moved: boolean; button: number; world: Vec2 } | null = null;

  constructor(private app: Application, private view: WorldView, private ui: HTMLElement) {
    const host = ui.parentElement!;
    this.menuLayer = document.createElement("div"); this.menuLayer.id = "menu"; host.appendChild(this.menuLayer);
    this.menuLayer.addEventListener("pointerdown", (e) => { if (e.target === this.menuLayer && this.inGame) this.closeMenu(); });
    this.menuBtn = document.createElement("button"); this.menuBtn.id = "menubtn"; this.menuBtn.textContent = "☰  Menu"; this.menuBtn.style.display = "none";
    this.menuBtn.addEventListener("click", () => this.openMenu());
    host.appendChild(this.menuBtn);
    this.modal = document.createElement("div"); this.modal.id = "modal"; host.appendChild(this.modal);
    this.bar = new Bar(host);
    this.planLayer = document.createElement("div"); this.planLayer.id = "planlayer"; host.appendChild(this.planLayer);
  }

  async start(): Promise<void> {
    this.settings = { ...this.settings, ...(await load<Partial<Settings>>("settings", {})) };
    if (typeof this.settings.realism !== "boolean") this.settings.realism = false;
    // realism (tyres, fuel, weather) is switched off for now: settings saved before that decision follow it once
    if (this.settings.realismVersion !== 2) { this.settings.realism = false; this.settings.realismVersion = 2; }
    if (typeof this.settings.obstacles !== "boolean") this.settings.obstacles = true;
    this.normaliseSettings();
    if (!this.settings.phrase) this.settings.phrase = randomPhrase(new Rng((Math.random() * 2 ** 32) >>> 0));
    this.cars = await load<CarConfig[]>("cars", []);
    this.best = await load<Best>("best", {});
    this.version = (await window.apex?.version()) ?? "dev";
    this.audio.setMuted(!!this.settings.muted);
    this.audio.setMusic(!this.settings.musicOff);
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
      if (e.key === "Escape") { this.toggleMenu(); return; }
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT") return;
      if (e.key === "m" || e.key === "M") this.toggleMute();
      if (this.menuOpen || !this.draw) return;
      if (e.key === "Enter") this.finishSegment();
      else if (e.key === "Backspace" || (e.key === "z" && (e.ctrlKey || e.metaKey))) this.undo();
    });
    this.app.ticker.add((t) => this.onFrame(t.deltaMS / 1000));
    // a link brings back the track, the settings and however much of the lap was drawn, never a race in progress
    const link = this.readLink();
    if (link?.playing) this.startGame(link.line ?? null, true);
    else this.showMenu();
  }

  /** What the forecaster would say for this phrase and lap count: rain at the beginning, middle or end, never the detail. */
  private forecastFor(phrase: string, laps: number, obstacles: boolean): string {
    if (!this.settings.realism) return "";
    const t = generateTrack(phrase, { obstacles });
    return forecastText(forecast(weatherFor(t.seed, laps, t.biome), laps));
  }

  /** Make sure whatever came from storage or a link is something the game can run. */
  private normaliseSettings(): void {
    const s = this.settings;
    s.laps = Math.min(50, Math.max(1, Math.round(Number(s.laps)) || 3));
    if (!isCompound(s.startTyre)) s.startTyre = "medium";
    s.pitPlan = (Array.isArray(s.pitPlan) ? s.pitPlan : [])
      .filter((p) => p && Number.isInteger(p.lap) && p.lap >= 0 && p.lap <= s.laps - 2 && isCompound(p.tyre))
      .filter((p, i, all) => all.findIndex((q) => q.lap === p.lap) === i)
      .sort((a, b) => a.lap - b.lap).slice(0, MAX_PIT_STOPS);
  }

  // ---------- share link ----------
  private readLink(): ShareState | null {
    const raw = location.hash.replace(/^#/, "");
    if (!raw) return null;
    const st = decodeShare(raw);
    if (typeof st === "string") { this.note = `That link did not work: ${st}`; return null; }
    const car: CarConfig = { name: st.car.name || "Standard", accel: st.car.accel, top: st.car.top, grip: st.car.grip, brake: st.car.brake };
    Object.assign(this.settings, { phrase: st.phrase, laps: st.laps, mode: st.mode, rivals: st.rivals, realism: st.realism, obstacles: st.obstacles, car: validateCar(car) ? defaultCar() : car, startTyre: st.startTyre, pitPlan: st.pitPlan });
    this.normaliseSettings();
    return st;
  }

  /** Keep the address in step with what is on screen: the track and settings, and the segments drawn so far. */
  private syncHash(): void {
    const s = this.settings;
    try {
      const code = encodeShare({
        phrase: s.phrase, laps: s.laps, mode: s.mode, rivals: s.rivals, car: s.car, obstacles: s.obstacles, realism: s.realism,
        playing: this.inGame, line: this.inGame ? this.shareLine : undefined,
        startTyre: s.startTyre, pitPlan: s.pitPlan,
      });
      history.replaceState(null, "", `#${code}`);
    } catch { /* an address bar is a convenience */ }
  }

  // ---------- UI helpers ----------
  private show(cls: string, html: string): HTMLElement {
    this.ui.innerHTML = `<div class="panel ${cls}">${html}</div>`;
    return this.ui.firstElementChild as HTMLElement;
  }
  private on(el: HTMLElement, sel: string, fn: () => void): void {
    el.querySelector(sel)?.addEventListener("click", fn);
  }
  private persist(): void { void save("settings", this.settings); this.syncHash(); }
  private toggleMute(): void {
    this.settings.muted = !this.audio.isMuted();
    this.audio.setMuted(this.settings.muted);
    this.persist();
    for (const root of [this.ui, this.menuLayer]) {
      const b = root.querySelector<HTMLElement>("#mute");
      if (b) b.textContent = this.settings.muted ? "Sound off" : "Sound on";
    }
  }

  // ---------- menu ----------
  /** Go home: leave any game and show the title with a track behind it. */
  private showMenu(): void {
    if (this.inGame) this.leaveGame();
    this.openMenu();
  }

  private leaveGame(): void {
    this.draw = null; this.pick = null; this.play = null; this.race = undefined;
    this.inGame = false; this.shareLine = undefined; this.previewKey = "";
    this.audio.stopAll();
    this.view.setFollow(null);
    this.view.clearCars();
    this.ui.innerHTML = "";
    this.bar.clear();
    this.closePlan();
    this.menuBtn.style.display = "none";
  }

  private toggleMenu(): void {
    if (this.menuOpen) { if (this.inGame) this.closeMenu(); } else if (this.inGame) this.openMenu();
  }

  /** The menu sits over whatever is on screen: the title's preview track, or the game you are in (paused). */
  private openMenu(): void {
    this.menuOpen = true;
    this.menuLayer.style.display = "flex";
    this.menuBtn.style.display = "none";
    this.app.canvas.classList.add("blurred");
    this.audio.setDucked(true);
    this.planLayer.style.visibility = "hidden";
    if (!this.inGame) this.showPreview();
    this.renderMenu();
  }

  private closeMenu(): void {
    this.menuOpen = false;
    this.menuLayer.style.display = "none";
    this.app.canvas.classList.remove("blurred");
    this.audio.setDucked(false);
    this.planLayer.style.visibility = "visible";
    this.menuBtn.style.display = this.inGame ? "block" : "none";
  }

  /** The track for the typed phrase, drawn behind the menu with a few bots going round it. */
  private showPreview(): void {
    const s = this.settings;
    if (!normalizePhrase(s.phrase)) s.phrase = randomPhrase(new Rng((Math.random() * 2 ** 32) >>> 0));
    const key = `${normalizePhrase(s.phrase)}|${s.obstacles}`;
    this.view.sky.setActive(true);
    if (key === this.previewKey && this.ambient) return;
    this.previewKey = key;
    this.track = generateTrack(s.phrase, { obstacles: s.obstacles });
    this.vehicle = vehicleForSeed(this.track.seed);
    this.view.setTrack(this.track);
    this.view.resetCamera();
    this.view.clearCars();
    this.view.clearSkids();
    this.view.drawTrack(this.track, { visibleUpTo: null });
    this.view.clearLines();
    const bots: Entrant[] = Array.from({ length: 6 }, (_, i) => ({
      id: `a${i}`, name: `a${i}`, car: { name: "Bot", accel: 6, top: 6, grip: 6, brake: 6, type: this.vehicle },
      lines: [botLine(this.track, 31 + i * 7, 0.55 + 0.07 * i)],
    }));
    const race = new Race(this.track, bots, 2, { realism: false });
    race.runToEnd();
    this.ambient = { race, tick: 0 };
  }

  private hasEdits(): boolean {
    if (!this.inGame) return false;
    return (this.shareLine?.segs.length ?? 0) > 0 || !!this.race || (this.draw?.pts.length ?? 0) > 0;
  }

  /** A dialog that has to be answered. */
  private confirmDialog(title: string, body: string, ok: string): Promise<boolean> {
    return new Promise((resolve) => {
      const m = this.modal;
      m.innerHTML = `<div class="dialog"><h2>${esc(title)}</h2><p>${esc(body)}</p><div class="dialog-buttons"><button class="big grey" id="no">Keep my track</button><button class="big orange" id="yes">${esc(ok)}</button></div></div>`;
      m.style.display = "flex";
      const done = (v: boolean) => { m.style.display = "none"; m.innerHTML = ""; window.removeEventListener("keydown", onKey, true); resolve(v); };
      const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); done(false); } };
      window.addEventListener("keydown", onKey, true);
      m.querySelector("#yes")!.addEventListener("click", () => done(true));
      m.querySelector("#no")!.addEventListener("click", () => done(false));
    });
  }

  /**
   * Anything that changes the seed (the phrase, a new random one, obstacles) throws the drawing away, so if there is
   * one the player has to say yes first. Saying no puts everything back.
   */
  private async changeSeed(apply: () => void): Promise<void> {
    if (this.hasEdits()) {
      const ok = await this.confirmDialog("Start a different track?", "You have drawn on this track. Changing the seed throws that drawing away, along with any race in progress.", "Discard it and change");
      if (!ok) { this.renderMenu(); return; }
    }
    apply();
    if (this.inGame) this.leaveGame();
    this.persist();
    this.openMenu();
  }

  private renderMenu(): void {
    const s = this.settings, inGame = this.inGame, racing = !!this.race;
    const phrase = normalizePhrase(s.phrase);
    const seed = phraseToSeed(phrase);
    const biome = BIOMES[biomeForSeed(seed)], veh = VEHICLES[vehicleForSeed(seed)];
    const pct = (x: number, worse = false) => (x === 1 ? "" : `<span class="${(x > 1) !== worse ? "good" : "bad"}">${x > 1 ? "+" : "−"}${Math.round(Math.abs(x - 1) * 100)}%</span>`);
    const matching = this.imported.filter((f) => f.phrase === phrase);
    const bestKey = this.bestKey(phrase);
    const lock = racing ? "disabled" : "";
    const el = this.menuPanel(`
      <h1>APEX <span>DRAFT</span></h1>
      <p class="tagline">Draw the racing line. The car has to drive it.</p>
      <label>Track phrase: share it to share the track</label>
      <div class="row"><input id="phrase" class="fancy" type="text" value="${esc(s.phrase)}" spellcheck="false" /><button id="rand" class="big pink slim">Random</button></div>
      <div class="chips">
        <span class="chip biome-${biome.id}">${esc(biome.name)}</span>
        <span class="chip">${esc(veh.plural)}</span>
        ${biome.grip !== 1 ? `<span class="chip dim">grip ${pct(biome.grip)}</span>` : ""}${biome.brake !== 1 ? `<span class="chip dim">braking ${pct(biome.brake)}</span>` : ""}${biome.wear !== 1 ? `<span class="chip dim">tyre wear ${pct(biome.wear, true)}</span>` : ""}
      </div>
      <p class="dim blurb">${esc(biome.blurb)}</p>
      ${s.realism ? `<p class="blurb forecast">☁ ${esc(this.forecastFor(s.phrase, s.laps, s.obstacles))}</p>` : ""}
      <div class="row">
        <div><label>Laps (1 to 50)</label><input id="laps" class="fancy" type="number" min="1" max="50" value="${s.laps}" ${lock}/></div>
        <div><label>Mode</label><select id="mode" class="fancy" ${lock}><option value="trial" ${s.mode === "trial" ? "selected" : ""}>Time trial</option><option value="race" ${s.mode === "race" ? "selected" : ""}>Race rivals</option></select></div>
        <div ${s.mode === "trial" ? 'style="display:none"' : ""}><label>Rivals</label><select id="rivals" class="fancy" ${lock}>${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option ${n === s.rivals ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      </div>
      <div class="checks">
        <label><input type="checkbox" id="realism" ${s.realism ? "checked" : ""} ${lock}/> Realism: tyre wear, fuel, pit stops, tyre choice and weather</label>
        <label><input type="checkbox" id="obstacles" ${s.obstacles ? "checked" : ""}/> Obstacles: boxes and water</label>
      </div>
      <p class="dim blurb">You can only change your line while you are in the pits, so plan your stops.</p>
      ${racing || !s.realism ? "" : `<label>Starting tyre</label><div class="tyrepick">${COMPOUND_IDS.map((c) => `<button class="tyrebtn ${s.startTyre === c ? "on" : ""}" data-tyre="${c}" title="${esc(COMPOUNDS[c].blurb)}">${tyreIcon(c, 54)}<span>${COMPOUNDS[c].name}</span></button>`).join("")}</div>`}
      ${racing ? '<p class="dim">Laps, mode, rivals and realism are fixed while a race is under way.</p>' : ""}
      <p class="dim">Car: <b>${esc(s.car.name)}</b> (${carCost(s.car)}/${CAR_BUDGET} points)
        ${s.mode === "race" ? `· Imported rival lines for this track: <b>${matching.length}</b>` : ""}
        ${this.best[bestKey] ? `· Best: <b>${fmt(this.best[bestKey])}</b>` : ""}</p>
      <p class="bad">${esc(this.note)}</p>
      <div class="bigbtns">
        ${inGame ? '<button class="big yellow wide" id="resume">Resume</button><button class="big orange" id="restart">Restart track</button>' : '<button class="big yellow wide" id="go">Start</button>'}
        <button class="big cyan" id="garage">Garage</button>
        ${inGame ? "" : '<button class="big pink" id="import">Import lines</button>'}
        <button class="big green" id="mute">${s.muted ? "Sound off" : "Sound on"}</button>
        <button class="big violet" id="music">${s.musicOff ? "Music off" : "Music on"}</button>
        <button class="big blue" id="copy">Copy link</button>
        ${inGame ? '<button class="big grey" id="quit">Quit to title</button>' : ""}
      </div>
      <p class="dim small">v${esc(this.version)} · Click to place points. Drag any point to move it, start and end nodes included. Right-click deletes a point. <kbd>Enter</kbd> finishes a segment, <kbd>Backspace</kbd> undoes, <kbd>M</kbd> mutes, <kbd>Esc</kbd> opens this menu.</p>`);
    this.note = "";
    this.syncHash();
    const input = el.querySelector<HTMLInputElement>("#phrase")!;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
    input.addEventListener("change", () => {
      const next = input.value;
      if (normalizePhrase(next) === normalizePhrase(s.phrase)) return;
      if (!normalizePhrase(next)) { input.value = s.phrase; return; }
      void this.changeSeed(() => { s.phrase = next; });
    });
    this.on(el, "#rand", () => void this.changeSeed(() => { s.phrase = randomPhrase(new Rng((Math.random() * 2 ** 32) >>> 0)); }));
    el.querySelector("#obstacles")!.addEventListener("change", (e) => {
      const on = (e.target as HTMLInputElement).checked;
      void this.changeSeed(() => { s.obstacles = on; });
    });
    el.querySelector("#realism")!.addEventListener("change", (e) => { s.realism = (e.target as HTMLInputElement).checked; if (!s.realism) this.closePlan(); this.persist(); this.renderMenu(); });
    el.querySelector("#laps")!.addEventListener("change", (e) => {
      s.laps = Number((e.target as HTMLInputElement).value);
      this.normaliseSettings();
      this.persist();
      this.renderMenu();
    });
    el.querySelectorAll<HTMLButtonElement>(".tyrebtn").forEach((b) => b.addEventListener("click", () => { s.startTyre = b.dataset["tyre"] as Compound; this.persist(); this.renderMenu(); }));
    el.querySelector("#mode")!.addEventListener("change", (e) => { s.mode = (e.target as HTMLSelectElement).value as Settings["mode"]; this.persist(); this.renderMenu(); });
    el.querySelector("#rivals")?.addEventListener("change", (e) => { s.rivals = Number((e.target as HTMLSelectElement).value); this.persist(); });
    this.on(el, "#music", () => { s.musicOff = !s.musicOff; this.audio.unlock(); this.audio.setMusic(!s.musicOff); this.persist(); this.renderMenu(); });
    this.on(el, "#mute", () => this.toggleMute());
    this.on(el, "#garage", () => this.showGarage());
    this.on(el, "#import", () => void this.importLines());
    this.on(el, "#copy", () => {
      this.syncHash();
      try { void navigator.clipboard.writeText(location.href); this.note = ""; (el.querySelector("#copy") as HTMLElement).textContent = "Copied!"; } catch { (el.querySelector("#copy") as HTMLElement).textContent = "Copy failed"; }
    });
    this.on(el, "#resume", () => this.closeMenu());
    this.on(el, "#restart", () => {
      void (async () => {
        if (this.hasEdits() && !(await this.confirmDialog("Restart this track?", "That throws away your drawing and any race in progress. The track and settings stay the same.", "Discard and restart"))) return;
        this.audio.unlock();
        this.startGame();
      })();
    });
    this.on(el, "#quit", () => {
      void (async () => {
        if (this.hasEdits() && !(await this.confirmDialog("Quit to the title?", "That throws away your drawing and any race in progress.", "Discard and quit"))) return;
        this.leaveGame();
        this.persist();
        this.openMenu();
      })();
    });
    this.on(el, "#go", () => {
      if (!normalizePhrase(s.phrase)) { this.note = "Type a phrase or press Random."; this.renderMenu(); return; }
      this.persist();
      this.audio.unlock(); // a click is the moment the browser lets sound start
      this.startGame();
    });
  }

  private menuPanel(html: string): HTMLElement {
    this.menuLayer.innerHTML = `<div class="panel menu-panel">${html}</div>`;
    return this.menuLayer.firstElementChild as HTMLElement;
  }

  /** Times only compare with times set under the same rules. */
  private bestKey(phrase: string): string {
    const s = this.settings;
    return `${phrase}:${s.laps}:${s.realism ? "r" : "x"}${s.obstacles ? "o" : "c"}`;
  }

  private async importLines(): Promise<void> {
    const texts = await pickFiles();
    const bad: string[] = [];
    for (const t of texts) {
      const f = parseLineFile(t);
      if (typeof f === "string") bad.push(f);
      else this.imported.push(f);
    }
    this.imported = this.imported.slice(-7);
    this.note = bad.length ? `Could not read ${bad.length} file(s): ${bad[0]}` : "";
    this.renderMenu();
  }

  // ---------- garage ----------
  private showGarage(): void {
    const car = this.settings.car;
    const el = this.menuPanel(`
      <h2>Garage</h2>
      <p class="dim">Spend up to ${CAR_BUDGET} points. Every stat helps somewhere and costs somewhere else.</p>
      <p class="dim">For <b>${esc(this.settings.phrase)}</b> the field is <b>${esc(VEHICLES[vehicleForSeed(phraseToSeed(normalizePhrase(this.settings.phrase)))].plural)}</b>, and your levels are scaled to suit. ${esc(VEHICLES[vehicleForSeed(phraseToSeed(normalizePhrase(this.settings.phrase)))].blurb)}</p>
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
    this.on(el, "#back", () => { this.persist(); this.renderMenu(); });
  }

  // ---------- a game ----------
  /** `resume`: the drawing a share link brought back, in which case the race itself starts from scratch. */
  private startGame(resume: Line | null = null, fromLink = false): void {
    const s = this.settings;
    const carErr = validateCar(s.car);
    if (carErr) { this.note = `Car: ${carErr}`; this.openMenu(); return; }
    // the title already built this track (and its scenery) behind the menu
    if (this.inGame || this.previewKey !== `${normalizePhrase(s.phrase)}|${s.obstacles}`) this.track = generateTrack(s.phrase, { obstacles: s.obstacles });
    this.vehicle = vehicleForSeed(this.track.seed);
    this.ambient = null; this.previewKey = "";
    this.view.clearCars();
    this.closeMenu();
    this.race = undefined;
    if (!fromLink) this.settings.pitPlan = [];
    this.planOpen = false;
    this.eventIdx = 0;
    this.pick = null;
    this.view.setTrack(this.track);
    this.view.resetCamera();
    this.inGame = true;
    this.menuBtn.style.display = "block";
    const n = this.track.segments.length;
    const line = resume && resume.segs.length <= n && resume.start ? resume : null;
    this.shareLine = line ?? undefined;
    this.syncHash();
    void fromLink;
    if (line && line.segs.length === n) { this.currentLine = line; this.lapNo = 0; this.showPicker(null); }
    else if (line && line.segs.length > 0) {
      this.lapNo = 0;
      this.view.sky.setActive(false);
      this.draw = { mode: "lap", line, seg: line.segs.length, pts: [], end: null, queue: [], drag: null, warn: "" };
      this.renderDraw();
    } else this.beginLapDraw();
  }

  /** What the player drives: their own stats in this track's kind of machine. */
  private playerCar(): CarConfig { return { ...this.settings.car, type: this.vehicle }; }

  private makeRivals(): Entrant[] {
    const s = this.settings;
    const rng = new Rng(this.track.seed ^ 0xa5a5a5a5);
    const out: Entrant[] = [];
    const files = this.imported.filter((f) => f.phrase === this.track.phrase).slice(0, s.rivals);
    files.forEach((f, i) => {
      const lines = f.lines.filter((l) => isComplete(this.track, l) && validateLine(this.track, l).ok);
      if (lines.length) out.push({ id: `file${i}`, name: f.name, car: { ...f.car, type: f.car.type ?? this.vehicle }, lines });
    });
    const names = [...RIVAL_NAMES];
    for (let i = out.length; i < s.rivals; i++) {
      const car: CarConfig = { name: "Bot", accel: 6, top: 6, grip: 6, brake: 6, type: this.vehicle };
      for (let k = 0; k < 8; k++) {
        const from = rng.pick(STATS.filter((x) => car[x] > 3));
        const to = rng.pick(STATS.filter((x) => car[x] < 9 && x !== from));
        car[from]--; car[to]++;
      }
      const skill = 0.4 + 0.55 * rng.next();
      const seed = rng.int(2 ** 30);
      out.push({ id: `bot${i}`, name: names.splice(rng.int(names.length), 1)[0] ?? `Bot ${i}`, car, lines: [botLine(this.track, seed, skill)], bot: { seed, skill } });
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
    this.ui.innerHTML = "";
    const pv = this.preview(d);
    const needStart = d.mode === "lap" && d.seg === 0 && !d.line;
    const title = d.mode === "lap" ? `Lap 1 · segment ${d.seg + 1} of ${n}` : `Editing segment ${d.seg + 1}${d.queue.length ? ` · ${d.queue.length} more to go` : ""}`;
    const status = needStart ? "Click the white start line to place your start." : pv ? (pv.ok ? '<span class="good">Line is clear</span>' : '<span class="bad">Line leaves the road or hits something</span>') : "";
    const last = d.mode === "lap" && d.seg === n - 1 ? ' <span class="dim">· last segment: it returns to your start</span>' : "";
    this.bar.set([
      { id: "undo", label: "Undo", color: "orange", tip: "Take back the last point you placed (Backspace, or right-click a point to delete just that one).", onClick: () => this.undo() },
      { id: "clear", label: "Clear", color: "pink", tip: "Remove every point you have placed in this segment and start it again.", onClick: () => { d.pts = []; d.end = d.mode === "amend" ? d.end : null; if (needStart) d.line = null; this.renderDraw(); } },
      ...(this.settings.realism ? [{ id: "pits", label: "Pit strategy", color: "violet" as const, tip: "Queue pit stops: pick the lap and the tyre. Up to 5, one per lap.", onClick: () => this.togglePlan() }] : []),
      { id: "fin", label: "Finish segment", color: "yellow", wide: true, disabled: !(pv && pv.ok && !needStart), tip: "Lock in this segment (Enter). Click to place points; drag any point, the square (where it starts) or the diamond (where it ends) to move it along the road edge; Shift+click inserts a point.", onClick: () => this.finishSegment() },
      ...(d.mode === "amend" ? [{ id: "cancel", label: "Cancel", color: "grey" as const, tip: "Throw these edits away and go back to the map.", onClick: () => { this.draw = null; this.showPicker(null); } }] : []),
    ], `<b>${title}</b>${last}<br/>${status}${d.warn ? `<br/><span class="bad">${esc(d.warn)}</span>` : ""}`);
    if (this.planOpen) this.renderPlan();
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
      this.shareLine = d.line;
      this.syncHash();
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
      this.shareLine = d.line;
      this.syncHash();
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
      this.shareLine = candidate;
      this.syncHash();
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
    this.shareLine = line;
    this.syncHash();
    this.showPicker(null);
  }

  // ---------- picking segments to edit ----------
  /** Segments that differ from the line just raced. They use up the amend allowance. */
  private changedThisLap(): number[] {
    if (!this.race || !this.me.lines[this.lapNo]) return [];
    return changedSegments(this.me.lines[this.lapNo]!, this.currentLine);
  }

  /** The lap after the one in progress when the car stopped (lapNo is the lap it is finishing). */
  private nextLapIndex(): number { return this.race ? this.lapNo + 1 : 0; }

  /** What the tank and the plan say: the first lap, if any, on which the car would run dry. */
  private fuelProblem(next: number, fuel: number): number | null {
    const per = fuelPerLap(this.playerCar(), this.settings.laps);
    let left = fuel;
    for (let lap = next; lap < this.settings.laps; lap++) {
      if (left < per * 1.03) return lap;
      left -= per;
      if (this.settings.pitPlan.some((p) => p.lap === lap)) left = TANK;
    }
    return null;
  }

  private updateRain(r: number): void {
    this.view.sky.setRain(r);
    this.audio.rain(r);
  }

  private showWetState(): void {
    const snaps = this.race?.wetSnaps;
    this.view.setWet(snaps && snaps.length ? snaps[snaps.length - 1]! : null, 0);
  }

  private showPicker(message: string | null): void {
    this.pickMessage = message;
    const line = this.currentLine;
    if (!line) { this.beginLapDraw(); return; }
    this.view.setOverview();
    this.view.sky.setActive(false);
    this.showWetState();
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
    const next = this.nextLapIndex();
    const tooMany = !firstLap && changed.length > MAX_AMENDS;
    const real = this.settings.realism;
    const me = this.race?.cars.find((c) => c.entrant.id === ME);
    const fuel = me ? me.fuel : TANK, tyre = me ? me.tyre : 1;
    const compound = me ? me.compound : this.settings.startTyre;
    const dryAt = real ? this.fuelProblem(next, fuel) : null;
    const gauges = !real ? "" : `
      <div class="gauge"><span>Fuel</span><b><i class="${fuel < 25 ? "low" : ""}" style="width:${Math.round(fuel)}%"></i></b><em>${Math.round(fuel)}%</em></div>
      <div class="gauge"><span>Tyres</span><b><i class="${tyre < 0.4 ? "low" : ""}" style="width:${Math.round(tyre * 100)}%"></i></b><em>${Math.round(tyre * 100)}%</em></div>
      <p class="dim"><span class="tyrechip" style="background:#${COMPOUNDS[compound].color.toString(16).padStart(6, "0")}"></span>${COMPOUNDS[compound].name} tyres · ${this.settings.pitPlan.length} stop${this.settings.pitPlan.length === 1 ? "" : "s"} queued</p>
      ${dryAt !== null ? `<p class="bad">As planned you run dry on lap ${dryAt + 1}. The car would limp to the pits for an emergency refuel, which is slow and gives no fresh tyres. Queue a stop before it to avoid that.</p>` : ""}
      ${(me?.pits ?? 0) === 0 && this.settings.pitPlan.length === 0 ? `<p class="dim">Finishing without a single stop adds ${PIT_PENALTY.toFixed(1)}s.</p>` : ""}`;
    this.ui.innerHTML = "";
    this.show("top", `
      <h2>${firstLap ? "Your line" : `In the pits after lap ${next} of ${this.settings.laps}`}</h2>
      ${check.ok ? '<p class="good">Your line is clear all the way round.</p>' : '<p class="bad">Your line leaves the road or hits something, in the red segments.</p>'}
      ${gauges}
      ${firstLap && real ? `<p class="dim">☁ ${esc(this.forecastFor(this.settings.phrase, this.settings.laps, this.settings.obstacles))}</p>` : ""}
      ${tooMany ? '<p class="bad">Too many segments changed. Revert and try again.</p>' : ""}
      ${message ? `<p class="bad">${esc(message)}</p>` : ""}`);
    const goLabel = firstLap ? "Race!" : "Back out";
    this.bar.set([
      { id: "edit", label: "Edit segments", color: "cyan", disabled: !sel.size, tip: "Redraw the segments you have selected on the map. Click segments to select them; scroll to zoom and drag to pan.", onClick: () => {
        const queue = [...sel].sort((a, b) => a - b);
        const first = queue.shift()!;
        this.pick = null;
        this.view.sky.setActive(false);
        this.draw = { mode: "amend", line, seg: first, pts: line.segs[first]!.slice(0, -1), end: line.segs[first]!.at(-1)!, queue, drag: null, warn: "" };
        this.renderDraw();
      } },
      ...(!firstLap && changed.length ? [{ id: "revert", label: "Revert", color: "orange" as const, tip: "Undo every change you have made to your line during this stop.", onClick: () => { this.currentLine = this.me.lines[this.lapNo]!; this.shareLine = this.currentLine; this.syncHash(); this.pick = null; this.showPicker(null); } }] : []),
      ...(real ? [{ id: "pits", label: `Pit strategy${this.settings.pitPlan.length ? ` (${this.settings.pitPlan.length})` : ""}`, color: "violet" as const, tip: "Queue pit stops: pick the lap and the tyre. Up to 5, one per lap, and none on the last lap.", onClick: () => this.togglePlan() }] : []),
      { id: "go", label: goLabel, color: "yellow", wide: true, disabled: !(check.ok && !tooMany), tip: firstLap ? "Start the race with this line." : "Leave the pits and carry on with your line as it now is.", onClick: () => { this.pick = null; this.closePlan(); if (firstLap) this.startRace(); else this.resumeRace(); } },
    ], `${firstLap ? `Select segments on the map to edit them, or race. <span class="dim">Once the race starts you can only change your line during a pit stop.</span>` : `You are in the pits: change up to <b>${MAX_AMENDS}</b> segments before you go back out (<b>${used}</b> used).`} <span class="dim">Scroll to zoom, drag to pan.</span>`);
    if (this.planOpen) this.renderPlan();
  }

  // ---------- pit strategy ----------
  private togglePlan(): void { if (this.planOpen) this.closePlan(); else { this.planOpen = true; this.planMsg = ""; this.renderPlan(); } }
  private closePlan(): void { this.planOpen = false; this.planLayer.innerHTML = ""; }

  /** Laps (counting from 0) that can still have a stop at their end, and are not taken. */
  private freeStopLaps(): number[] {
    const lo = this.nextLapIndex(), hi = this.settings.laps - 2, taken = new Set(this.settings.pitPlan.map((p) => p.lap));
    const out: number[] = [];
    for (let l = lo; l <= hi; l++) if (!taken.has(l)) out.push(l);
    return out;
  }

  /** Queue a stop. The limits are the rules: five at most, one a lap, only laps still to come, never the last lap. */
  private addStop(lap: number, tyre: Compound): void {
    const s = this.settings;
    if (s.pitPlan.length >= MAX_PIT_STOPS) { this.planMsg = `You can queue at most ${MAX_PIT_STOPS} stops.`; return this.renderPlan(); }
    if (s.pitPlan.some((p) => p.lap === lap)) { this.planMsg = `There is already a stop at the end of lap ${lap + 1}.`; return this.renderPlan(); }
    if (!this.freeStopLaps().includes(lap)) { this.planMsg = "That lap has gone, or is the last one."; return this.renderPlan(); }
    s.pitPlan.push({ lap, tyre });
    s.pitPlan.sort((a, b) => a.lap - b.lap);
    this.planMsg = "";
    this.persist();
    this.afterPlanChange();
  }

  private removeStop(lap: number): void {
    if (lap < this.nextLapIndex()) return; // already behind us
    this.settings.pitPlan = this.settings.pitPlan.filter((p) => p.lap !== lap);
    this.me && (this.me.pitPlan = this.settings.pitPlan);
    this.planMsg = "";
    this.persist();
    this.afterPlanChange();
  }

  private afterPlanChange(): void {
    if (this.me) this.me.pitPlan = this.settings.pitPlan;
    if (this.draw) this.renderDraw(); else if (this.currentLine) this.showPicker(this.pickMessage);
    else this.renderPlan();
  }

  private renderPlan(): void {
    const s = this.settings, next = this.nextLapIndex();
    const free = this.freeStopLaps(), full = s.pitPlan.length >= MAX_PIT_STOPS;
    if (!free.includes(this.planLap)) this.planLap = free.find((l) => l >= this.planLap) ?? free[0] ?? next;
    const stopAt = new Map(s.pitPlan.map((p) => [p.lap, p.tyre]));
    const cells = Array.from({ length: s.laps }, (_, l) => {
      const cls = [l < next ? "done" : l === next ? "now" : "", stopAt.has(l) ? "stop" : ""].join(" ");
      const col = stopAt.has(l) ? `style="--stop:#${COMPOUNDS[stopAt.get(l)!].color.toString(16).padStart(6, "0")}"` : "";
      return `<i class="${cls}" ${col} title="Lap ${l + 1}"></i>`;
    }).join("");
    const slots = Array.from({ length: MAX_PIT_STOPS }, (_, i) => {
      const p = s.pitPlan[i];
      if (!p) return `<div class="slot empty"><span>Stop ${i + 1}</span><em>empty</em></div>`;
      const locked = p.lap < next;
      return `<div class="slot ${locked ? "locked" : ""}">${tyreIcon(p.tyre, 52)}<b>Lap ${p.lap + 1}</b><span>${COMPOUNDS[p.tyre].name}</span>${locked ? '<em>done</em>' : `<button class="rm" data-rm="${p.lap}" title="Take this stop out of the queue">✕</button>`}</div>`;
    }).join("");
    const reason = full ? `You have queued the most you can: ${MAX_PIT_STOPS} stops.` : free.length === 0 ? "No laps left to queue a stop on." : "";
    const can = !full && free.length > 0;
    this.planLayer.innerHTML = `<div class="panel plan">
      <div class="row"><h2 style="flex:1">Pit strategy <span class="dim" style="font-weight:400;font-size:13px">a stop gives fresh tyres and a full tank</span></h2><span class="dim" style="flex:0 0 auto">${s.pitPlan.length} / ${MAX_PIT_STOPS} stops</span><button id="planclose" class="big grey slim">Done</button></div>
      <div class="timeline">${cells}</div>
      <div class="slots">${slots}</div>
      <label>Add a stop</label>
      <div class="adder">
        <div class="lapstep"><button id="lapminus" ${can ? "" : "disabled"}>−</button><div><span class="dim">end of lap</span><b>${can ? this.planLap + 1 : "–"}</b></div><button id="lapplus" ${can ? "" : "disabled"}>+</button></div>
        <div class="tyrepick big">${COMPOUND_IDS.map((c) => `<button class="tyrebtn" data-add="${c}" ${can ? "" : "disabled"} title="${esc(COMPOUNDS[c].blurb)}">${tyreIcon(c, 74)}<span>${COMPOUNDS[c].name}</span></button>`).join("")}</div>
      </div>
      <p class="${reason || this.planMsg ? "bad" : "dim"}">${esc(reason || this.planMsg || "Pick the lap, then tap a tyre to queue the stop.")}</p>
      ${this.race || !s.realism ? "" : `<label>Starting tyre</label><div class="tyrepick">${COMPOUND_IDS.map((c) => `<button class="tyrebtn ${s.startTyre === c ? "on" : ""}" data-start="${c}" title="${esc(COMPOUNDS[c].blurb)}">${tyreIcon(c, 46)}<span>${COMPOUNDS[c].name}</span></button>`).join("")}</div>`}
    </div>`;
    const root = this.planLayer;
    root.querySelector("#planclose")?.addEventListener("click", () => this.closePlan());
    const step = (dir: number) => { const i = free.indexOf(this.planLap); const j = Math.min(free.length - 1, Math.max(0, i + dir)); this.planLap = free[j] ?? this.planLap; this.planMsg = ""; this.renderPlan(); };
    root.querySelector("#lapminus")?.addEventListener("click", () => step(-1));
    root.querySelector("#lapplus")?.addEventListener("click", () => step(1));
    root.querySelectorAll<HTMLButtonElement>("[data-add]").forEach((b) => b.addEventListener("click", () => this.addStop(this.planLap, b.dataset["add"] as Compound)));
    root.querySelectorAll<HTMLButtonElement>("[data-rm]").forEach((b) => b.addEventListener("click", () => this.removeStop(Number(b.dataset["rm"]))));
    root.querySelectorAll<HTMLButtonElement>("[data-start]").forEach((b) => b.addEventListener("click", () => { s.startTyre = b.dataset["start"] as Compound; this.persist(); this.renderPlan(); }));
  }

  // ---------- racing ----------
  private startRace(): void {
    this.rivalEntrants = this.settings.mode === "trial" ? [] : this.makeRivals();
    this.me = { id: ME, name: "You", car: this.playerCar(), lines: Array.from({ length: this.settings.laps }, () => this.currentLine), isPlayer: true, pitPlan: this.settings.pitPlan, startTyre: this.settings.startTyre };
    this.race = new Race(this.track, [this.me, ...this.rivalEntrants], this.settings.laps, { realism: this.settings.realism, weather: this.settings.realism });
    this.lapNo = 0;
    this.view.clearSkids();
    this.skidTick = 0;
    this.runAndPlay(0);
  }

  /** Back out of the pits: the line as it now is is the line for every lap from here, and the bots read the road again. */
  private resumeRace(): void {
    const race = this.race!, next = this.lapNo + 1;
    for (let l = next; l < this.settings.laps; l++) this.me.lines[l] = this.currentLine;
    this.me.pitPlan = this.settings.pitPlan;
    race.replanBots(next, this.settings.laps - next);
    this.runAndPlay(race.tick);
  }

  /** Run the race up to the player's next pit stop (or to the end), then play it back. */
  private runAndPlay(fromTick: number): void {
    const race = this.race!;
    const atStop = race.runToStop(ME);
    const mine = race.cars.find((c) => c.entrant.id === ME)!;
    // no more stops for the player: let everyone else finish
    if (!atStop) race.runToEnd();
    if (atStop) this.lapNo = mine.lap;
    this.play = { tick: fromTick, end: race.tick, speed: 1, atStop };
    const first = race.events.findIndex((e) => e.tick >= fromTick);
    this.eventIdx = first < 0 ? race.events.length : first;
    this.skidTick = fromTick;
    this.ui.innerHTML = "";
    this.closePlan();
    this.view.drawTrack(this.track, { visibleUpTo: null });
    this.view.drawCurves([{ pts: lapCurve(this.currentLine, this.track.segments.length).map((x) => x.p), color: PLAYER_COLOR, width: 1.5, alpha: 0.3 }]);
    this.view.clearCars();
    this.view.sky.setActive(true);
    this.audio.unlock();
    this.drawCarsAt(fromTick);
    const me = race.cars.find((c) => c.entrant.id === ME)!;
    this.view.setFollow({ x: me.trace[fromTick * 3]!, y: me.trace[fromTick * 3 + 1]! });
    // the race controls are big buttons at the bottom
    const speeds = [1, 3, 8, 20];
    this.bar.set([
      { id: "speed", label: "1×", color: "green", tip: "Change how fast the race plays: 1×, 3×, 8× or 20×.", onClick: () => { const q = this.play; if (q) { q.speed = speeds[(speeds.indexOf(q.speed) + 1) % speeds.length]!; const b = this.bar.button("speed"); if (b) b.textContent = `${q.speed}×`; } } },
      { id: "skip", label: "Skip ahead", color: "blue", tip: "Jump ahead to your next pit stop, or to the end of the race.", onClick: () => { const q = this.play; if (q) q.tick = q.end; } },
      { id: "sound", label: this.audio.isMuted() ? "Sound off" : "Sound on", color: "violet", tip: "Turn the engines and effects on or off (M).", onClick: () => this.toggleMute() },
    ]);
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
      this.view.setCar(c.entrant.id, c.entrant.car.type, c.trace[k * 3]!, c.trace[k * 3 + 1]!, c.trace[k * 3 + 2]!, this.colorOf(c.entrant.id), c.gtrace[k] === 1, c.entrant.id === ME, this.motion(c, k).braking || c.ptrace[k] === 2, c.ptrace[k] === 3);
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

  /** The aeroplane's engine: louder when it is close to what you are watching, with a little Doppler. */
  private updatePlane(fx: number, fy: number): void {
    const st = this.view.planeState();
    if (!st) { this.audio.planeSound(null); return; }
    const dx = st.x - fx, dy = st.y - fy, d = Math.hypot(dx, dy) || 1;
    const approach = -(st.vx * dx + st.vy * dy) / d;
    this.audio.planeSound({ vol: clamp(1 / (1 + d / 130), 0, 1) * (1 - 0.3 * st.alt), pan: dx / 220, pitch: 1 + clamp(approach / 700, -0.15, 0.15) });
  }

  private updateAudio(k: number, now: number, speed: number): void {
    const race = this.race!;
    this.audio.setDucked(speed > 1);
    const me = race.cars.find((c) => c.entrant.id === ME)!;
    const mk = Math.min(k, me.trace.length / 3 - 1);
    const fx = me.trace[mk * 3]!;
    const fy = me.trace[mk * 3 + 1]!;
    this.updatePlane(fx, fy);
    for (const c of race.cars) {
      if (c.finishTime !== null && c.finishTime <= now) { this.audio.hush(c.entrant.id); continue; }
      const i = Math.min(k, c.trace.length / 3 - 1), m = this.motion(c, i);
      const x = c.trace[i * 3]!, y = c.trace[i * 3 + 1]!, isMe = c.entrant.id === ME;
      const vol = isMe ? 1 : 0.8 / (1 + Math.hypot(x - fx, y - fy) / 45);
      if (c.ptrace[i] === 3) { this.audio.hush(c.entrant.id); continue; }
      this.audio.update(c.entrant.id, c.entrant.car.type, { speed: m.v, accel: m.acc, slip: m.slip, vol, pan: (x - fx) / 160 }, isMe);
    }
  }

  private onFrame(dt: number): void {
    this.clock += dt;
    this.view.update(dt);
    // behind the title: bots going round and round
    if (this.ambient && this.menuOpen && !this.inGame) {
      const a = this.ambient;
      a.tick += dt * 60;
      if (a.tick >= a.race.tick - 2) a.tick = 0;
      const k = Math.floor(a.tick);
      a.race.cars.forEach((c, i) => {
        const j = Math.min(k, c.trace.length / 3 - 1);
        this.view.setCar(c.entrant.id, c.entrant.car.type, c.trace[j * 3]!, c.trace[j * 3 + 1]!, c.trace[j * 3 + 2]!, RIVAL_COLORS[i % RIVAL_COLORS.length]!, false, false, false);
      });
      return;
    }
    const p = this.play;
    if (!p || !this.race || (this.menuOpen && this.inGame)) return; // the menu pauses the race
    const race = this.race;
    p.tick = Math.min(p.end, p.tick + dt * 60 * p.speed);
    const k = Math.floor(p.tick);
    const now = k / 60;
    this.drawCarsAt(k);
    this.updateSkids(k);
    const me = race.cars.find((c) => c.entrant.id === ME)!;
    const mi = Math.min(k, me.trace.length / 3 - 1);
    const meDone = (me.finishTime !== null && me.finishTime <= now) || me.ptrace[mi] === 3;
    // slowly in on the player, and back out to the whole track once they finish
    this.view.setFollow(meDone ? null : { x: me.trace[mi * 3]!, y: me.trace[mi * 3 + 1]! });
    this.view.setCrew(me.ptrace[mi] === 2 ? { x: me.trace[mi * 3]!, y: me.trace[mi * 3 + 1]!, h: me.trace[mi * 3 + 2]! } : null);
    // the crowd as you go past the line, the wheel guns in your box, the radio when you are let go
    while (this.eventIdx < race.events.length && race.events[this.eventIdx]!.tick <= k) {
      const ev = race.events[this.eventIdx++]!;
      if (ev.type === "bump") {
        this.view.spark(ev.x ?? 0, ev.y ?? 0, ev.strength ?? 0);
        if (p.speed <= 1 && (ev.id === ME || ev.other === ME)) this.audio.bump(ev.strength ?? 0);
        continue;
      }
      if (ev.id !== ME || p.speed > 1) continue;
      if (ev.type === "cross") this.audio.cheer();
      else if (ev.type === "pitStart") this.audio.drill(PIT_STOP_TIME);
      else if (ev.type === "pitEnd") this.audio.goGoGo();
    }
    this.updateAudio(k, now, p.speed);

    const standing = [...race.cars].map((c) => {
      const done = c.finishTime !== null && c.finishTime <= now;
      return { c, key: done ? 1e12 - (c.finishTime as number) : (c.prog[Math.min(k, c.prog.length - 1)] ?? 0) };
    }).sort((a, b) => b.key - a.key);
    const lap = Math.min(this.settings.laps, Math.max(1, Math.floor(((me.prog[mi] ?? 0) + 1e5) / 1e5)));
    const rain = race.rainTrace[Math.min(Math.floor(k / 60), race.rainTrace.length - 1)] ?? 0;
    this.view.setWet(race.wetSnaps[Math.min(Math.floor(k / 60), race.wetSnaps.length - 1)] ?? null, rain);
    this.updateRain(rain);
    // the panel is built once and only its contents change
    let el = this.ui.querySelector<HTMLElement>(".panel.top");
    if (!el || !el.querySelector("#hud-head")) {
      el = this.show("top", `<h2 id="hud-head"></h2><div id="hud-weather"></div><div id="hud-gauges"></div><div id="hud-status"></div><table id="hud-table"></table>`);
    }
    const set = (sel: string, html: string) => { const n = el!.querySelector(sel); if (n && n.innerHTML !== html) n.innerHTML = html; };
    set("#hud-head", `Lap ${lap} / ${this.settings.laps} <span class="dim">${fmt(now)}</span>`);
    set("#hud-weather", this.settings.realism ? (rain > 0.05 ? `<p class="dim">🌧 Raining${rain > 0.7 ? " hard" : ""}</p>` : "") : "");
    set("#hud-table", standing.map(({ c }, i) => `<tr class="${c.entrant.id === ME ? "me" : ""}"><td>${i + 1}</td><td><span style="color:${hex(this.colorOf(c.entrant.id))}">■</span> ${esc(c.entrant.name)}</td></tr>`).join(""));
    if (this.settings.realism) {
      const fuel = me.ftrace[mi] ?? 100, tyre = me.ttrace[mi] ?? 1, per = fuelPerLap(this.playerCar(), this.settings.laps);
      const comp = (["soft", "medium", "wet"] as const)[me.ctrace[mi] ?? 1]!;
      set("#hud-gauges", `<div class="gauge"><span>Fuel</span><b><i class="${fuel < per * 0.5 ? "low" : ""}" style="width:${Math.round(fuel)}%"></i></b><em>${Math.round(fuel)}%</em></div>
        <div class="gauge"><span><span class="tyrechip" style="background:#${COMPOUNDS[comp].color.toString(16).padStart(6, "0")}"></span>Tyres</span><b><i class="${tyre < 0.4 ? "low" : ""}" style="width:${Math.round(tyre * 100)}%"></i></b><em>${Math.round(tyre * 100)}%</em></div>`);
      const code = me.ptrace[mi];
      set("#hud-status", fuel <= 0 && code !== 2 ? '<p class="bad">Out of fuel! Limping to the pits</p>' : code === 2 ? '<p class="good">In the pits…</p>' : code === 1 ? '<p class="dim">Pit lane: speed limit</p>' : fuel < per * 0.5 ? '<p class="bad">Fuel low</p>' : "");
    }
    const sb = this.bar.button("sound");
    if (sb) { const t = this.audio.isMuted() ? "Sound off" : "Sound on"; if (sb.textContent !== t) sb.textContent = t; }
    if (p.tick >= p.end) {
      this.play = null;
      this.drawCarsAt(p.end);
      this.audio.stopAll();
      this.updateRain(0);
      this.bar.clear();
      if (p.atStop && !race.over) this.showPicker(null);
      else this.showResults();
    }
  }

  // ---------- results ----------
  private showResults(): void {
    this.bar.clear();
    const race = this.race!;
    const res = race.results();
    const mine = res.find((r) => r.isPlayer)!;
    const key = this.bestKey(this.track.phrase);
    let record = "";
    if (!mine.dnf && mine.finishTime !== null && (this.best[key] === undefined || mine.finishTime < this.best[key]!)) {
      this.best[key] = mine.finishTime;
      void save("best", this.best);
      record = '<p class="good">New best time for this track and these rules!</p>';
    }
    const trial = this.settings.mode === "trial";
    const title = trial ? "Time trial" : mine.position === 1 ? "You won!" : `You finished P${mine.position}`;
    const when = (r: (typeof res)[number]) => (fmt(r.finishTime) + (r.penalty ? ` <span class="bad">+${r.penalty.toFixed(1)}</span>` : ""));
    const el = this.show("center", `
      <h2>${title}</h2>
      <p class="dim">${esc(this.track.phrase)} · ${this.settings.laps} lap(s) · ${esc(VEHICLES[this.vehicle].plural)}${this.settings.realism ? "" : " · no tyres or fuel"}${this.settings.obstacles ? "" : " · no obstacles"}</p>${record}
      ${mine.emergencies ? `<p class="bad">The tank ran dry ${mine.emergencies === 1 ? "once" : `${mine.emergencies} times`}: ${mine.emergencies === 1 ? "an emergency refuel" : "emergency refuels"} cost you a slow limp to the pits and a long stop.</p>` : ""}
      ${mine.penalty ? `<p class="bad">+${mine.penalty.toFixed(1)}s because you never stopped in the pits.</p>` : ""}
      <table><tr><th>#</th><th>Driver</th><th class="num">Stops</th><th class="num">Time</th><th class="num">Best lap</th></tr>
      ${res.map((r) => `<tr class="${r.isPlayer ? "me" : ""}"><td>${r.position}</td><td>${esc(r.name)}</td><td class="num">${r.pits}${r.emergencies ? ` <span class="bad" title="emergency refuel">!</span>` : ""}</td><td class="num">${when(r)}</td><td class="num">${fmt(r.lapTimes.length ? Math.min(...r.lapTimes) : null)}</td></tr>`).join("")}</table>
      <p class="dim">Your laps: ${mine.lapTimes.map(fmt).join(" · ")}</p>
      <button class="primary" id="again">Race again</button><button id="export">Save my lines</button><button id="menu">Menu</button>`);
    this.on(el, "#menu", () => this.showMenu());
    this.on(el, "#again", () => { this.audio.unlock(); this.startGame(); });
    this.on(el, "#export", () => {
      const text = serializeLineFile({ phrase: this.track.phrase, name: "Player", car: this.playerCar(), lines: this.me.lines });
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
