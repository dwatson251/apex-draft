import type { Application } from "pixi.js";
import {
  BIOMES, CAR_BUDGET, CELL, MAX_AMENDS, PIT_PENALTY, PIT_STOP_TIME, Race, Rng, STATS, STAT_MAX, STAT_MIN, TANK, VEHICLES, beginLine, botLine, carCost, carStats, changedSegments,
  circuitFor, MAX_RIVALS, defaultCar, distToSegment, biomeForSeed, decodeShare, encodeShare, fuelPerLap, generateTrack, isComplete, joinBefore, lapCurve, moveJoin, normalizePhrase, parseLineFile,
  phraseToSeed, previewSegment, projectToGate, randomPhrase, serializeLineFile, setSegment, smooth, validateCar, validateLine, vehicleForSeed,
  COMPOUNDS, COMPOUND_IDS, MAX_PIT_STOPS, forecast, forecastText, isCompound, weatherFor,
  PRACTICE_SECONDS, clampWear, finishSession, newWeekend, quickGridTime, sessionBest, sessionLaps, sessionRules, trialKey,
  type CarConfig, type CarResult, type SessionKind, type Weekend, type Compound, type Entrant, type Line, type LineFile, type RaceCar, type ShareState, type Stat, type Track, type Vec2, type VehicleId,
} from "@apex/sim";
import { CarAudio } from "./audio.ts";
import { Bar, type BarButton } from "./bar.ts";
import { load, save, type Best, type Settings } from "./store.ts";
import { copyText, wireControls } from "./menus/controls.ts";
import { homeHtml, pauseHtml, settingsHtml, setupHtml, type Flow } from "./menus/screens.ts";
import type { Handle, HandleKind, Skid, WorldView } from "./world.ts";

const ME = "me";
const PLAYER_COLOR = 0xffcf3f;
const RIVAL_COLORS = [0xff5d6c, 0x4fd28a, 0x5aa9ff, 0xb48cff, 0xff9f43, 0x3fe0d0, 0xf06bd2];
const RIVAL_NAMES = ["Nova", "Kestrel", "Dash", "Pebble", "Orbit", "Rook", "Ember", "Sable", "Juno", "Flint", "Mako", "Wren", "Zephyr", "Quill", "Tango", "Bolt", "Cinder", "Maple", "Onyx", "Pixel", "Ripley", "Sprocket", "Tundra", "Vesper", "Willow", "Yarrow", "Atlas", "Biscuit", "Comet", "Drift", "Echo", "Fennel"];
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

/** What the session on the track is: set when it starts, and what the race-time code reads. */
interface RunConfig {
  flow: Flow | "tutorial";
  kind: SessionKind;
  /** laps in the Race: for a timed session that is the out lap, the timed laps and the cooldown lap */
  laps: number;
  realism: boolean;
  rivals: number;
  wearFuel: number;
  wearTyre: number;
  mandatory: Compound[];
}

interface Motion { v: number; acc: number; slip: number; braking: boolean }

export class Game {
  private settings: Settings = { phrase: "", laps: 3, mode: "race", rivals: 5, car: defaultCar(), realism: false, obstacles: false, startTyre: "medium", pitPlan: [], flow: "quick", wearFuel: 1, wearTyre: 1, mandatory: [] };
  private screen: "home" | "setup" | "settings" | "garage" = "home";
  private flow: Flow = "quick";
  private run: RunConfig = { flow: "quick", kind: "race", laps: 3, realism: false, rivals: 5, wearFuel: 1, wearTyre: 1, mandatory: [] };
  /** the weekend in progress, if any */
  private weekend: Weekend | null = null;
  /** simulated seconds used up in this weekend's practice */
  private practiceSecs = 0;
  /** the line drawn last, which the next session on the same track starts from */
  private carry: { phrase: string; line: Line } | null = null;
  /** while the tutorial runs, the player's own settings are kept here and the tutorial's stand in for them */
  private tutBackup: Settings | null = null;
  private tutLayer!: HTMLElement;
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
    this.tutLayer = document.createElement("div"); this.tutLayer.id = "tut"; host.appendChild(this.tutLayer);
  }

  async start(): Promise<void> {
    this.settings = { ...this.settings, ...(await load<Partial<Settings>>("settings", {})) };
    if (typeof this.settings.realism !== "boolean") this.settings.realism = false;
    // realism (tyres, fuel, weather) is switched off for now: settings saved before that decision follow it once
    if (this.settings.realismVersion !== 2) { this.settings.realism = false; this.settings.realismVersion = 2; }
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
    if (link?.playing) {
      this.flow = this.settings.mode === "trial" ? "trial" : "quick";
      this.run = this.runFor(this.flow, this.flow === "trial" ? "trial" : "race");
      this.startGame(link.line ?? null, true);
    } else this.showMenu();
  }

  /** What the forecaster would say for this phrase and lap count: rain at the beginning, middle or end, never the detail. */
  private forecastFor(phrase: string, laps: number, obstacles: boolean, on = this.run.realism): string {
    if (!on) return "";
    const t = generateTrack(phrase, { obstacles });
    return forecastText(forecast(weatherFor(t.seed, laps, t.biome), laps));
  }

  /** Make sure whatever came from storage or a link is something the game can run. */
  private normaliseSettings(): void {
    const s = this.settings;
    s.laps = Math.min(50, Math.max(1, Math.round(Number(s.laps)) || 3));
    // boxes and water are not offered any more
    s.obstacles = false;
    s.wearFuel = clampWear(s.wearFuel);
    s.wearTyre = clampWear(s.wearTyre);
    s.mandatory = COMPOUND_IDS.filter((c) => Array.isArray(s.mandatory) && s.mandatory.includes(c));
    s.rivals = Math.min(MAX_RIVALS, Math.max(1, Math.round(Number(s.rivals)) || 5));
    if (s.flow !== "trial" && s.flow !== "quick" && s.flow !== "weekend") s.flow = "quick";
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
    Object.assign(this.settings, { phrase: st.phrase, laps: st.laps, mode: st.mode, rivals: st.rivals, realism: st.realism, obstacles: false, car: validateCar(car) ? defaultCar() : car, startTyre: st.startTyre, pitPlan: st.pitPlan });
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
  private persist(): void { void save("settings", this.tutBackup ?? this.settings); this.syncHash(); }
  private toggleMute(): void {
    this.settings.muted = !this.audio.isMuted();
    this.audio.setMuted(this.settings.muted);
    this.persist();
    if (this.menuOpen && this.screen === "settings") this.renderMenu();
  }

  // ---------- menu ----------
  /** Go home: leave any game and show the title with a track behind it. */
  private showMenu(): void {
    if (this.inGame) this.leaveGame();
    this.screen = "home";
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
    this.tutLayer.style.display = "none";
    if (this.tutBackup) { this.settings = this.tutBackup; this.tutBackup = null; this.normaliseSettings(); }
  }

  private toggleMenu(): void {
    if (this.menuOpen) {
      if (this.inGame) { if (this.screen === "settings") { this.screen = "home"; this.renderMenu(); } else this.closeMenu(); }
      else if (this.screen === "garage") this.go("setup");
      else if (this.screen !== "home") this.go("home");
    } else if (this.inGame) { this.screen = "home"; this.openMenu(); }
  }

  /** The menu sits over whatever is on screen: the title's preview track, or the game you are in (paused). */
  private openMenu(): void {
    if (this.inGame) this.screen = this.screen === "settings" ? "settings" : "home";
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
    if (this.inGame) { if (this.screen === "settings") this.renderSettings(); else this.renderPause(); return; }
    if (this.screen === "setup") this.renderSetup();
    else if (this.screen === "settings") this.renderSettings();
    else if (this.screen === "garage") this.showGarage();
    else this.renderHome();
  }

  private go(screen: "home" | "setup" | "settings" | "garage"): void {
    this.screen = screen;
    this.note = "";
    this.renderMenu();
  }

  private menuPanel(html: string, cls = ""): HTMLElement {
    this.menuLayer.innerHTML = `<div class="panel menu-panel bubble ${cls}">${html}</div>`;
    return this.menuLayer.firstElementChild as HTMLElement;
  }

  private renderHome(): void {
    const el = this.menuPanel(homeHtml({ version: this.version, quit: !!window.apex?.quit, note: this.note }));
    this.note = "";
    this.syncHash();
    this.on(el, "#h-trial", () => this.openSetup("trial"));
    this.on(el, "#h-quick", () => this.openSetup("quick"));
    this.on(el, "#h-weekend", () => this.openSetup("weekend"));
    this.on(el, "#h-tutorial", () => this.startTutorial());
    this.on(el, "#h-settings", () => this.go("settings"));
    this.on(el, "#h-quit", () => void window.apex?.quit());
  }

  private openSetup(flow: Flow): void {
    this.flow = flow;
    this.settings.flow = flow;
    this.settings.mode = flow === "trial" ? "trial" : "race";
    this.persist();
    this.go("setup");
  }

  private renderSetup(): void {
    const s = this.settings, flow = this.flow;
    const phrase = normalizePhrase(s.phrase);
    const seed = phraseToSeed(phrase);
    const circuit = circuitFor(phrase);
    const biome = BIOMES[circuit?.biome ?? biomeForSeed(seed)], veh = VEHICLES[vehicleForSeed(seed)];
    const pct = (x: number, worse = false) => (x === 1 ? "" : `<span class="${(x > 1) !== worse ? "good" : "bad"}">${x > 1 ? "+" : "−"}${Math.round(Math.abs(x - 1) * 100)}%</span>`);
    const tt = this.best[trialKey(phrase)];
    const realism = flow === "weekend" ? true : flow === "quick" && s.realism;
    const chips = `
        ${circuit ? `<span class="chip circuit">🏁 ${esc(circuit.name)} · ${circuit.lengthKm} km</span>` : ""}
        <span class="chip biome-${biome.id}">${esc(biome.name)}</span>
        <span class="chip">${esc(veh.plural)}</span>
        ${biome.grip !== 1 ? `<span class="chip dim">grip ${pct(biome.grip)}</span>` : ""}${biome.brake !== 1 ? `<span class="chip dim">braking ${pct(biome.brake)}</span>` : ""}${biome.wear !== 1 ? `<span class="chip dim">tyre wear ${pct(biome.wear, true)}</span>` : ""}`;
    const el = this.menuPanel(setupHtml({
      flow, phrase: s.phrase, chips, blurb: circuit ? circuit.blurb : biome.blurb,
      forecast: realism && flow !== "trial" ? this.forecastFor(s.phrase, s.laps, false, true) : "",
      laps: s.laps, rivals: s.rivals, realism, wearFuel: s.wearFuel ?? 1, wearTyre: s.wearTyre ?? 1, mandatory: s.mandatory ?? [],
      carLine: `Car: ${s.car.name} (${carCost(s.car)}/${CAR_BUDGET} points)`,
      bestLine: flow === "trial" && tt !== undefined ? `Your time: <b>${fmt(tt)}</b>` : "",
      gridLine: flow === "quick" ? (tt !== undefined ? `Your grid place comes from your time trial: <b>${fmt(tt)}</b>` : "No time trial time on this track yet, so you start <b>last</b>.") : flow === "weekend" ? "Your grid place comes from the qualifier." : "",
      importCount: this.imported.filter((f) => f.phrase === phrase).length,
      note: this.note,
    }));
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
    const copy = el.querySelector<HTMLButtonElement>("#phrase-copy")!;
    copy.addEventListener("click", () => {
      void copyText(input.value.trim()).then((ok) => {
        copy.classList.toggle("done", ok);
        const label = copy.querySelector("span");
        if (label) label.textContent = ok ? "Copied" : "Failed";
        setTimeout(() => { copy.classList.remove("done"); if (label) label.textContent = "Copy"; }, 1400);
      });
    });
    this.on(el, "#rand", () => void this.changeSeed(() => { s.phrase = randomPhrase(new Rng((Math.random() * 2 ** 32) >>> 0)); }));
    this.on(el, "#back", () => this.go("home"));
    this.on(el, "#garage", () => this.go("garage"));
    this.on(el, "#import", () => void this.importLines());
    this.on(el, "#go", () => {
      if (!normalizePhrase(s.phrase)) { this.note = "Type a phrase or press Random."; this.renderMenu(); return; }
      this.persist();
      this.audio.unlock(); // a click is the moment the browser lets sound start
      this.beginFlow();
    });
    wireControls(el, {
      change: (id, v) => {
        if (id === "laps") s.laps = Number(v);
        else if (id === "rivals") s.rivals = Number(v);
        else if (id === "wearFuel") s.wearFuel = clampWear(Number(v));
        else if (id === "wearTyre") s.wearTyre = clampWear(Number(v));
        else if (id === "realism") s.realism = v === "1";
        this.normaliseSettings();
        this.persist();
        this.renderMenu();
      },
      chips: (id, on) => { if (id === "mandatory") { s.mandatory = on; this.persist(); this.renderMenu(); } },
    });
  }

  private renderSettings(): void {
    const s = this.settings;
    const el = this.menuPanel(settingsHtml({ muted: !!s.muted, music: !s.musicOff, version: this.version, fromGame: this.inGame }));
    this.on(el, "#back", () => { if (this.inGame) { this.screen = "home"; this.renderMenu(); } else this.go("home"); });
    this.on(el, "#tutorial-reset", () => { s.tutorialDone = false; this.persist(); (el.querySelector("#tutorial-reset") as HTMLElement).textContent = "Tutorial reset"; });
    wireControls(el, {
      change: (id, v) => {
        if (id === "sound") { this.audio.unlock(); this.settings.muted = v !== "1"; this.audio.setMuted(!!this.settings.muted); this.persist(); }
        else if (id === "music") { this.audio.unlock(); s.musicOff = v !== "1"; this.audio.setMusic(!s.musicOff); this.persist(); }
        this.renderMenu();
      },
    });
  }

  private renderPause(): void {
    const el = this.menuPanel(pauseHtml({ title: "Paused", sub: this.sessionTitle() }), "narrow");
    this.on(el, "#resume", () => this.closeMenu());
    this.on(el, "#p-settings", () => this.go("settings"));
    this.on(el, "#restart", () => {
      void (async () => {
        if (this.hasEdits() && !(await this.confirmDialog("Redraw this track?", "That throws away your drawing and any session in progress. The track and settings stay the same.", "Discard and redraw"))) return;
        this.audio.unlock();
        this.carry = null;
        this.startGame();
      })();
    });
    this.on(el, "#quit", () => {
      void (async () => {
        if (this.hasEdits() && !(await this.confirmDialog("Quit to the menu?", "That ends the session in progress. Your line is kept for the next one on this track.", "Quit"))) return;
        this.showMenu();
        this.persist();
      })();
    });
  }

  // ---------- sessions ----------
  /** What a session of this kind runs with, from the setup screen's choices. */
  private runFor(flow: Flow | "tutorial", kind: SessionKind): RunConfig {
    const s = this.settings;
    if (flow === "tutorial") return { flow, kind: "race", laps: 3, realism: true, rivals: 3, wearFuel: 1, wearTyre: 1, mandatory: [] };
    if (kind === "trial") return { flow, kind, laps: sessionLaps("trial"), realism: false, rivals: 0, wearFuel: 1, wearTyre: 1, mandatory: [] };
    if (kind === "practice" || kind === "qualifying") return { flow, kind, laps: sessionLaps(kind), realism: false, rivals: s.rivals, wearFuel: 1, wearTyre: 1, mandatory: [] };
    const realism = flow === "weekend" ? true : s.realism;
    return { flow, kind, laps: s.laps, realism, rivals: s.rivals, wearFuel: realism ? clampWear(s.wearFuel) : 1, wearTyre: realism ? clampWear(s.wearTyre) : 1, mandatory: realism ? s.mandatory ?? [] : [] };
  }

  private timed(): boolean { return this.run.kind !== "race"; }

  private sessionTitle(): string {
    const r = this.run;
    if (r.flow === "tutorial") return "Tutorial";
    if (r.kind === "trial") return "Solo time trial";
    if (r.flow === "weekend") return `Race weekend · ${r.kind === "practice" ? "Practice" : r.kind === "qualifying" ? "Qualifier" : "Race"}`;
    return "Quick race";
  }

  /** Which lap of the session this is, for the heads-up display. `lap` counts from 1. */
  private lapText(lap: number): string {
    const r = this.run;
    if (!this.timed()) return `Lap ${lap} / ${r.laps}`;
    if (lap <= 1) return "Out lap";
    if (lap >= r.laps) return "Cool-down lap";
    return `Lap ${lap - 1} / ${r.laps - 2}`;
  }

  private beginFlow(): void {
    const f = this.flow;
    this.weekend = null;
    if (f === "weekend") { this.weekend = newWeekend(); this.practiceSecs = 0; }
    this.settings.mode = f === "trial" ? "trial" : "race";
    this.run = this.runFor(f, f === "trial" ? "trial" : f === "weekend" ? "practice" : "race");
    this.startGame();
  }

  /** The next session of the weekend, on the same track and with the same line. */
  private startWeekendSession(kind: SessionKind): void {
    this.run = this.runFor("weekend", kind);
    this.audio.unlock();
    this.startGame();
  }

  private startTutorial(): void {
    this.tutBackup = JSON.parse(JSON.stringify(this.settings)) as Settings;
    this.settings = { ...this.settings, phrase: "oval", laps: 3, rivals: 3, realism: true, mode: "race", pitPlan: [], mandatory: [], wearFuel: 1, wearTyre: 1, obstacles: false, startTyre: "medium" };
    this.weekend = null;
    this.run = this.runFor("tutorial", "race");
    this.audio.unlock();
    this.startGame();
  }

  /** Times only compare with times set under the same rules. */
  private bestKey(phrase: string): string {
    const r = this.run;
    return `${phrase}:${r.laps}:${r.realism ? "r" : "x"}c`;
  }

  /** The fastest lap you have set on this track (any number of laps), which can put you further up the grid. */
  private lapKey(phrase: string): string {
    return `${phrase}:lap:${this.run.realism ? "r" : "x"}c`;
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
    this.on(el, "#back", () => { this.persist(); this.go("setup"); });
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
    const carried = !line && this.carry && this.carry.phrase === normalizePhrase(s.phrase) && isComplete(this.track, this.carry.line) && validateLine(this.track, this.carry.line).ok ? this.carry.line : null;
    if (carried) { this.currentLine = carried; this.shareLine = carried; this.lapNo = 0; this.syncHash(); this.showPicker(null); }
    else if (line && line.segs.length === n) { this.currentLine = line; this.lapNo = 0; this.showPicker(null); }
    else if (line && line.segs.length > 0) {
      this.lapNo = 0;
      this.view.sky.setActive(false);
      this.draw = { mode: "lap", line, seg: line.segs.length, pts: [], end: null, queue: [], drag: null, warn: "" };
      this.renderDraw();
    } else this.beginLapDraw();
  }

  /** What the player drives: their own stats in this track's kind of machine. */
  private playerCar(): CarConfig { return { ...this.settings.car, type: this.vehicle }; }

  private makeRivals(count: number): Entrant[] {
    const s = { rivals: count };
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
      ...(this.run.realism ? [{ id: "pits", label: "Pit strategy", color: "violet" as const, tip: "Queue pit stops: pick the lap and the tyre. Up to 5, one per lap.", onClick: () => this.togglePlan() }] : []),
      { id: "fin", label: "Finish segment", color: "yellow", wide: true, disabled: !(pv && pv.ok && !needStart), tip: "Lock in this segment (Enter). Click to place points; drag any point, the square (where it starts) or the diamond (where it ends) to move it along the road edge; Shift+click inserts a point.", onClick: () => this.finishSegment() },
      ...(d.mode === "amend" ? [{ id: "cancel", label: "Cancel", color: "grey" as const, tip: "Throw these edits away and go back to the map.", onClick: () => { this.draw = null; this.showPicker(null); } }] : []),
    ], `<b>${title}</b>${last}<br/>${status}${d.warn ? `<br/><span class="bad">${esc(d.warn)}</span>` : ""}`);
    if (this.planOpen) this.renderPlan();
    this.updateTutorial();
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
    // the next session on this track starts from this line (the tutorial's oval does not replace it)
    if (!this.tutBackup) this.carry = { phrase: normalizePhrase(this.settings.phrase), line };
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
    const per = fuelPerLap(this.playerCar(), this.run.laps) * this.run.wearFuel;
    let left = fuel;
    for (let lap = next; lap < this.run.laps; lap++) {
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
    const real = this.run.realism;
    const me = this.race?.cars.find((c) => c.entrant.id === ME);
    const fuel = me ? me.fuel : TANK, tyre = me ? me.tyre : 1;
    const compound = me ? me.compound : this.settings.startTyre;
    const dryAt = real ? this.fuelProblem(next, fuel) : null;
    const gauges = !real ? "" : `
      <div class="gauge"><span>Fuel</span><b><i class="${fuel < 25 ? "low" : ""}" style="width:${Math.round(fuel)}%"></i></b><em>${Math.round(fuel)}%</em></div>
      <div class="gauge"><span>Tyres</span><b><i class="${tyre < 0.4 ? "low" : ""}" style="width:${Math.round(tyre * 100)}%"></i></b><em>${Math.round(tyre * 100)}%</em></div>
      <p class="dim"><span class="tyrechip" style="background:#${COMPOUNDS[compound].color.toString(16).padStart(6, "0")}"></span>${COMPOUNDS[compound].name} tyres · ${this.settings.pitPlan.length} stop${this.settings.pitPlan.length === 1 ? "" : "s"} queued</p>
      ${dryAt !== null ? `<p class="bad">As planned you run dry on lap ${dryAt + 1}. The car would limp to the pits for an emergency refuel, which is slow and gives no fresh tyres. Queue a stop before it to avoid that.</p>` : ""}
      ${(me?.pits ?? 0) === 0 && this.settings.pitPlan.length === 0 ? `<p class="dim">Finishing without a single stop adds ${PIT_PENALTY.toFixed(1)}s.</p>` : ""}
      ${this.plannedMissing(me, next).length ? `<p class="bad">Your plan never uses ${this.plannedMissing(me, next).map((c) => COMPOUNDS[c].name).join(" or ")} tyres, which you must run: +${PIT_PENALTY.toFixed(1)}s each.</p>` : ""}`;
    this.ui.innerHTML = "";
    this.show("top", `
      <h2>${firstLap ? `${this.sessionTitle()} · your line` : `In the pits after lap ${next} of ${this.run.laps}`}</h2>
      ${check.ok ? '<p class="good">Your line is clear all the way round.</p>' : '<p class="bad">Your line leaves the road or hits something, in the red segments.</p>'}
      ${gauges}
      ${firstLap && real ? `<p class="dim">☁ ${esc(this.forecastFor(this.settings.phrase, this.run.laps, false))}</p>` : ""}
      ${tooMany ? '<p class="bad">Too many segments changed. Revert and try again.</p>' : ""}
      ${message ? `<p class="bad">${esc(message)}</p>` : ""}`);
    const goLabel = firstLap ? (this.timed() ? "Go!" : "Race!") : "Back out";
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
      { id: "go", label: goLabel, color: "yellow", wide: true, disabled: !(check.ok && !tooMany), tip: firstLap ? (this.timed() ? "Start the session with this line." : "Start the race with this line.") : "Leave the pits and carry on with your line as it now is.", onClick: () => { this.pick = null; this.closePlan(); if (firstLap) this.startRace(); else this.resumeRace(); } },
    ], `${firstLap ? `Select segments on the map to edit them, or go. ${this.timed() ? "" : `<span class="dim">Once the race starts you can only change your line during a pit stop.</span>`}` : `You are in the pits: change up to <b>${MAX_AMENDS}</b> segments before you go back out (<b>${used}</b> used).`} <span class="dim">Scroll to zoom, drag to pan.</span>`);
    if (this.planOpen) this.renderPlan();
    this.updateTutorial();
  }

  /** Compounds the player has to run that neither the stints so far nor the plan from lap `next` on will use. */
  private plannedMissing(me: RaceCar | undefined, next: number): Compound[] {
    const r = this.run;
    if (!r.realism || !r.mandatory.length) return [];
    const have = new Set<Compound>(me ? me.used : [this.settings.startTyre]);
    for (const p of this.settings.pitPlan) if (p.lap >= next) have.add(p.tyre);
    return r.mandatory.filter((c) => !have.has(c));
  }

  // ---------- pit strategy ----------
  private togglePlan(): void { if (this.planOpen) this.closePlan(); else { this.planOpen = true; this.planMsg = ""; this.renderPlan(); this.updateTutorial(); } }
  private closePlan(): void { this.planOpen = false; this.planLayer.innerHTML = ""; if (this.tutBackup) this.updateTutorial(); }

  /** Laps (counting from 0) that can still have a stop at their end, and are not taken. */
  private freeStopLaps(): number[] {
    const lo = this.nextLapIndex(), hi = this.run.laps - 2, taken = new Set(this.settings.pitPlan.map((p) => p.lap));
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
    const cells = Array.from({ length: this.run.laps }, (_, l) => {
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
      ${this.race || !this.run.realism ? "" : `<label>Starting tyre</label><div class="tyrepick">${COMPOUND_IDS.map((c) => `<button class="tyrebtn ${s.startTyre === c ? "on" : ""}" data-start="${c}" title="${esc(COMPOUNDS[c].blurb)}">${tyreIcon(c, 46)}<span>${COMPOUNDS[c].name}</span></button>`).join("")}</div>`}
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
    const r = this.run, st = this.settings;
    this.rivalEntrants = r.rivals ? this.makeRivals(r.rivals) : [];
    const timed = this.timed();
    // practice and qualifying: the rivals are out on the track already, spread round it, and the player is on the line
    if (timed) this.rivalEntrants.forEach((e, i) => { e.startFrac = (i + 1) / (this.rivalEntrants.length + 1); });
    const tt = this.best[trialKey(st.phrase)];
    this.me = {
      id: ME, name: "You", car: this.playerCar(), lines: Array.from({ length: r.laps }, () => this.currentLine), isPlayer: true,
      pitPlan: r.realism ? st.pitPlan : [], startTyre: r.kind === "trial" ? "soft" : st.startTyre,
      ...(timed ? { gridSlot: 0 } : {}),
      // a quick race is gridded by the time trial: without a time you start last
      ...(r.flow === "quick" ? { gridTime: quickGridTime(tt) } : {}),
    };
    const entrants = [this.me, ...this.rivalEntrants];
    // the race of a weekend starts from the qualifying order
    const grid = r.flow === "weekend" && r.kind === "race" ? this.weekend?.grid : undefined;
    if (grid) for (const e of entrants) if (grid[e.id] !== undefined) e.gridSlot = grid[e.id];
    const rules = r.kind !== "race" ? sessionRules(r.kind) : r.realism ? { ...sessionRules("race", { wearMult: { fuel: r.wearFuel, tyre: r.wearTyre }, mandatory: r.mandatory }), weather: true } : { realism: false, weather: false };
    this.race = new Race(this.track, entrants, r.laps, rules);
    this.lapNo = 0;
    this.view.clearSkids();
    this.skidTick = 0;
    this.runAndPlay(0);
  }

  /** Back out of the pits: the line as it now is is the line for every lap from here, and the bots read the road again. */
  private resumeRace(): void {
    const race = this.race!, next = this.lapNo + 1;
    for (let l = next; l < this.run.laps; l++) this.me.lines[l] = this.currentLine;
    this.me.pitPlan = this.settings.pitPlan;
    race.replanBots(next, this.run.laps - next);
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
    this.updateTutorial();
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
    const lap = Math.min(this.run.laps, Math.max(1, Math.floor(((me.prog[mi] ?? 0) + 1e5) / 1e5)));
    const rain = race.rainTrace[Math.min(Math.floor(k / 60), race.rainTrace.length - 1)] ?? 0;
    this.view.setWet(race.wetSnaps[Math.min(Math.floor(k / 60), race.wetSnaps.length - 1)] ?? null, rain);
    this.updateRain(rain);
    // the panel is built once and only its contents change
    let el = this.ui.querySelector<HTMLElement>(".panel.top");
    if (!el || !el.querySelector("#hud-head")) {
      el = this.show("top", `<h2 id="hud-head"></h2><div id="hud-weather"></div><div id="hud-gauges"></div><div id="hud-status"></div><table id="hud-table"></table>`);
    }
    const set = (sel: string, html: string) => { const n = el!.querySelector(sel); if (n && n.innerHTML !== html) n.innerHTML = html; };
    set("#hud-head", `${this.lapText(lap)} <span class="dim">${fmt(now)}</span>`);
    set("#hud-weather", this.run.realism ? (rain > 0.05 ? `<p class="dim">🌧 Raining${rain > 0.7 ? " hard" : ""}</p>` : "") : "");
    set("#hud-table", standing.map(({ c }, i) => `<tr class="${c.entrant.id === ME ? "me" : ""}"><td>${i + 1}</td><td><span style="color:${hex(this.colorOf(c.entrant.id))}">■</span> ${esc(c.entrant.name)}</td></tr>`).join(""));
    // with a big grid the list scrolls: keep your own row in view
    const mine = el.querySelector<HTMLElement>("#hud-table tr.me");
    if (mine && el.scrollHeight > el.clientHeight) {
      if (mine.offsetTop < el.scrollTop + 40) el.scrollTop = Math.max(0, mine.offsetTop - 40);
      else if (mine.offsetTop + mine.offsetHeight > el.scrollTop + el.clientHeight - 8) el.scrollTop = mine.offsetTop + mine.offsetHeight - el.clientHeight + 8;
    }
    if (this.run.realism) {
      const fuel = me.ftrace[mi] ?? 100, tyre = me.ttrace[mi] ?? 1, per = fuelPerLap(this.playerCar(), this.run.laps) * this.run.wearFuel;
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
  /** Back to the map with the same line to change it, then go again. Nothing of the session just run is kept but its time. */
  private rerun(): void {
    this.race = undefined; this.play = null; this.pick = null;
    this.view.clearCars(); this.view.clearSkids();
    this.eventIdx = 0;
    this.showPicker(null);
  }

  private showResults(): void {
    this.bar.clear();
    const race = this.race!;
    const res = race.results();
    if (this.timed()) this.showSessionResults(res); else this.showRaceResults(res);
    // the camera is already easing back out to the whole track
    this.view.setFollow(null);
    this.updateTutorial();
  }

  /** Time trial, practice and qualifying: out lap, timed laps, cool-down lap. */
  private showSessionResults(res: CarResult[]): void {
    const r = this.run, kind = r.kind as Exclude<SessionKind, "race">;
    const mine = res.find((x) => x.isPlayer)!;
    const time = sessionBest(mine.lapTimes, kind);
    const name = this.sessionTitle();
    const laps = mine.lapTimes.map((t, i) => {
      const label = i === 0 ? "Out lap" : i === mine.lapTimes.length - 1 ? "Cool-down" : `Lap ${i}`;
      const timedLap = i > 0 && i < mine.lapTimes.length - 1;
      return `<tr class="${timedLap && t === time ? "me" : ""}"><td>${label}</td><td class="num">${fmt(t)}</td></tr>`;
    }).join("");
    let extra = "", buttons = "";
    if (kind === "trial") {
      const key = trialKey(this.settings.phrase);
      if (time !== null && (this.best[key] === undefined || time < this.best[key]!)) {
        this.best[key] = time;
        void save("best", this.best);
        extra = '<p class="good">New time trial record for this track!</p>';
      }
      extra += this.best[key] !== undefined ? `<p class="dim">Your best on this track: <b>${fmt(this.best[key])}</b></p>` : "";
      buttons = '<button class="primary" id="again">Edit line &amp; try again</button><button id="res-menu">Menu</button>';
    } else if (kind === "practice") {
      this.practiceSecs += this.race!.time;
      const w = this.weekend ?? newWeekend();
      this.weekend = { ...w, practice: time !== null && (w.practice === undefined || time < w.practice) ? time : w.practice };
      const left = Math.max(0, PRACTICE_SECONDS - this.practiceSecs);
      extra = `<p class="dim">Best practice time: <b>${fmt(this.weekend.practice)}</b> · ${left > 0 ? `${Math.ceil(left / 60)} min of practice left` : "practice time is up"}</p>`;
      buttons = `${left > 0 ? '<button class="primary" id="again">Edit line &amp; go again</button>' : ""}<button id="next" class="${left > 0 ? "" : "primary"}">Finish practice → Qualifier</button><button id="res-menu">Menu</button>`;
    } else {
      const times = res.map((x) => ({ id: x.id, time: sessionBest(x.lapTimes, "qualifying") }));
      this.weekend = finishSession(this.weekend ?? newWeekend(), "qualifying", time, times);
      const grid = this.weekend.grid ?? {};
      const order = [...res].sort((a, b) => (grid[a.id] ?? 99) - (grid[b.id] ?? 99));
      extra = `<p class="good">You start the race from P${(grid[ME] ?? 0) + 1}.</p>
        <table><tr><th>#</th><th>Driver</th><th class="num">Best lap</th></tr>${order.map((x, i) => `<tr class="${x.isPlayer ? "me" : ""}"><td>${i + 1}</td><td>${esc(x.name)}</td><td class="num">${fmt(times.find((t) => t.id === x.id)?.time)}</td></tr>`).join("")}</table>`;
      buttons = '<button class="primary" id="next">On to the race</button><button id="res-menu">Menu</button>';
    }
    const el = this.show("center", `
      <h2>${esc(name)}</h2>
      <p class="dim">${esc(this.track.phrase)} · ${esc(VEHICLES[this.vehicle].plural)}</p>
      <p style="font-size:26px;margin:8px 0"><b>${fmt(time)}</b> <span class="dim" style="font-size:13px">${time === null ? "no timed lap set" : "best timed lap"}</span></p>
      <table>${laps}</table>${extra}
      ${buttons}`);
    this.on(el, "#res-menu", () => this.showMenu());
    this.on(el, "#again", () => { this.audio.unlock(); this.rerun(); });
    this.on(el, "#next", () => {
      if (kind === "practice") {
        this.weekend = finishSession(this.weekend ?? newWeekend(), "practice", this.weekend?.practice ?? null);
        this.startWeekendSession("qualifying");
      } else this.startWeekendSession("race");
    });
  }

  private showRaceResults(res: CarResult[]): void {
    const mine = res.find((r) => r.isPlayer)!;
    const key = this.bestKey(this.track.phrase);
    let record = "";
    if (!mine.dnf && mine.finishTime !== null && (this.best[key] === undefined || mine.finishTime < this.best[key]!)) {
      this.best[key] = mine.finishTime;
      void save("best", this.best);
      record = '<p class="good">New best time for this track and these rules!</p>';
    }
    const fastest = mine.lapTimes.length ? Math.min(...mine.lapTimes) : null;
    const lapKey = this.lapKey(this.track.phrase);
    if (fastest !== null && (this.best[lapKey] === undefined || fastest < this.best[lapKey]!)) { this.best[lapKey] = fastest; void save("best", this.best); }
    const r = this.run;
    if (r.flow === "weekend" && this.weekend) this.weekend = finishSession(this.weekend, "race", null);
    if (r.flow === "tutorial" && this.tutBackup) { this.tutBackup.tutorialDone = true; this.persist(); }
    const title = mine.position === 1 ? "You won!" : `You finished P${mine.position}`;
    const when = (x: CarResult) => (fmt(x.finishTime) + (x.penalty ? ` <span class="bad">+${x.penalty.toFixed(1)}</span>` : ""));
    const grid = r.flow === "weekend" ? this.weekend?.grid?.[ME] : undefined;
    const noStop = mine.penalty - mine.missing.length * PIT_PENALTY;
    const el = this.show("center", `
      <h2>${r.flow === "weekend" ? "Race weekend · " : ""}${title}</h2>
      <p class="dim">${esc(this.track.phrase)} · ${r.laps} lap(s) · ${esc(VEHICLES[this.vehicle].plural)}${r.realism ? (r.wearFuel > 1 || r.wearTyre > 1 ? ` · fuel ${r.wearFuel}× · tyres ${r.wearTyre}×` : "") : " · no tyres or fuel"}${grid !== undefined ? ` · started P${grid + 1}` : ""}</p>${record}
      ${mine.emergencies ? `<p class="bad">The tank ran dry ${mine.emergencies === 1 ? "once" : `${mine.emergencies} times`}: ${mine.emergencies === 1 ? "an emergency refuel" : "emergency refuels"} cost you a slow limp to the pits and a long stop.</p>` : ""}
      ${noStop > 0 ? `<p class="bad">+${noStop.toFixed(1)}s because you never stopped in the pits.</p>` : ""}
      ${mine.missing.length ? `<p class="bad">+${(mine.missing.length * PIT_PENALTY).toFixed(1)}s for never running ${mine.missing.map((c) => COMPOUNDS[c].name).join(" or ")} tyres.</p>` : ""}
      <table><tr><th>#</th><th>Driver</th><th class="num">Stops</th><th class="num">Time</th><th class="num">Best lap</th></tr>
      ${res.map((x) => `<tr class="${x.isPlayer ? "me" : ""}"><td>${x.position}</td><td>${esc(x.name)}</td><td class="num">${x.pits}${x.emergencies ? ` <span class="bad" title="emergency refuel">!</span>` : ""}</td><td class="num">${when(x)}</td><td class="num">${fmt(x.lapTimes.length ? Math.min(...x.lapTimes) : null)}</td></tr>`).join("")}</table>
      <p class="dim">Your laps: ${mine.lapTimes.map(fmt).join(" · ")}</p>
      <button class="primary" id="again">${r.flow === "weekend" ? "Weekend again" : "Race again"}</button><button id="export">Save my lines</button><button id="res-menu">Menu</button>`);
    this.on(el, "#res-menu", () => this.showMenu());
    this.on(el, "#again", () => {
      this.audio.unlock();
      if (r.flow === "weekend") { this.weekend = newWeekend(); this.practiceSecs = 0; this.run = this.runFor("weekend", "practice"); }
      this.startGame();
    });
    this.on(el, "#export", () => {
      const text = serializeLineFile({ phrase: this.track.phrase, name: "Player", car: this.playerCar(), lines: this.me.lines });
      void saveFile(`${this.track.phrase}-${r.laps}laps`, text);
    });
  }

  // ---------- tutorial ----------
  /** The tooltip for wherever the player is in the tutorial; nothing outside it. */
  private updateTutorial(): void {
    const el = this.tutLayer;
    if (!this.tutBackup || !this.inGame || this.planOpen) { el.style.display = "none"; return; }
    const d = this.draw, n = this.track.segments.length;
    let step = "", text = "";
    if (d) {
      const pv = this.preview(d);
      if (d.mode === "amend") { step = "Editing a segment"; text = "Redraw this segment the way you want it, then press <b>Finish segment</b>. <b>Cancel</b> takes you back to the map."; }
      else if (!d.line) { step = "1 · Start"; text = "Click the <b>white start line</b> to place the start of your racing line."; }
      else if (d.pts.length === 0) { step = "2 · Draw"; text = "Click along the road to place points. The curve runs through them and the car has to drive it. <b>Green</b> means clear, <b>red</b> means the line leaves the road."; }
      else if (pv && !pv.ok) { step = "2 · Draw"; text = "That part is <b>red</b>: it leaves the road. Drag a point back onto the tarmac, or press <b>Backspace</b> to undo."; }
      else { step = "3 · Lock it in"; text = `Looks good. Press <b>Finish segment</b> (or <b>Enter</b>) and carry on to the next square of track. ${d.seg === n - 1 ? "This is the last one: it returns to your start." : `${n - d.seg} to go.`}`; }
    } else if (this.play) {
      step = "5 · Race"; text = "Your car drives the line you drew. <b>1×</b> changes the speed. It will stop at your pit stop, where you can change your line.";
    } else if (this.race && this.pick) {
      step = "6 · In the pits"; text = "You are in the pits. Select up to <b>3 segments</b> on the map, press <b>Edit segments</b> and redraw them, then <b>Back out</b>. You can also queue more stops.";
    } else if (this.pick && !this.race) {
      step = "4 · Plan";
      text = this.settings.pitPlan.length === 0
        ? "Your lap is drawn. Click segments on the map to select them and <b>Edit segments</b> to redraw. Open <b>Pit strategy</b> and queue a stop for fresh tyres and fuel, then press <b>Race!</b>"
        : "Stop queued. A pit stop is the only time you can change your line mid-race. Press <b>Race!</b>";
    } else if (this.race && !this.play) {
      step = "Done"; text = "Tutorial complete. Draw, race, pit, adjust. Try <b>Quick Race</b> next, or a <b>Race Weekend</b>.";
    }
    if (!text) { el.style.display = "none"; return; }
    el.innerHTML = `<div class="step">Tutorial · ${step}</div><p>${text}</p><button class="tut-skip" id="tut-skip">${step === "Done" ? "Close" : "Skip tutorial"}</button>`;
    el.style.display = "block";
    el.querySelector("#tut-skip")!.addEventListener("click", () => this.showMenu());
  }

  /** Dev only: start a lap's drawing with the first `segments` segments already drawn along a bot line. */
  demoDraw(segments: number, amend = false): void {
    this.settings = { ...this.settings, phrase: "brave-owl-rides-melons", mode: "race", muted: true };
    this.run = this.runFor("quick", "race");
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
    this.run = this.runFor("quick", "race");
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
