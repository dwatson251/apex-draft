import { BTN, GamepadInput, cycle, type PadFrame } from "./input/gamepad.ts";
import { activateFocus, clearFocus, moveFocus } from "./input/focus.ts";
import type { Application } from "pixi.js";
import {
  BIOMES, CAR_BUDGET, CAR_R, CELL, KERB_ALLOW, halfAt, isDrivable, ROAD_HALF, MAX_AMENDS, pitPenalty, pitStopTime, Race, Rng, STATS, STAT_MAX, STAT_MIN, TANK, VEHICLES, beginLine, botLine, carCost, carStats, changedSegments,
  circuitFor, nextCircuit, KART_CIRCUITS, completeLine, MAX_RACE_RIVALS, snapRivals, NAME_MAX, defaultCar, makeBots, roundLine, sanitiseName, distToSegment, biomeForSeed, decodeShare, encodeShare, fuelPerLap, linesFromWire, lineToWire, trackLength, generateTrack, isComplete, joinBefore, lapCurve, moveJoin, normalizePhrase, parseLineFile,
  exitsAfter, idAt, makeLine, nextOf, phraseToSeed, previewSegment, projectToGate, randomPhrase, rerollPhrase, setSegment, smooth, validateCar, validateLine, vehicleForTrack, vehicleChoicesForTrack, migrateBest, isVehicleId, placeFor,
  COMPOUNDS, COMPOUND_IDS, MAX_PIT_STOPS, forecast, forecastText, isCompound, raceDuration, weatherFor,
  PRACTICE_SECONDS, clampWear, finishSession, newWeekend, quickGridTime, sessionBest, sessionLaps, sessionRules, trialKey,
  type CarConfig, type CarResult, type Segment, type SessionKind, type Weekend, type Compound, type Entrant, type Line, type RaceCar, type ShareState, type Stat, type Track, type Vec2, type VehicleId,
} from "@apex/sim";
import { CarAudio } from "./audio.ts";
import { Online } from "./online.ts";
import { WORLD_TIME, realSeconds } from "./scale.ts";
import { CHROME, DEFAULT_LIVERY, GOLD, LIVERY_COLORS, type Livery } from "./cars.ts";
import { FUEL_ICON, TEMP_ICON, TYRE_SMALL, bubble, weatherGrid } from "./hudicons.ts";
import { Bar, type BarButton } from "./bar.ts";
import { SPLIT_EVERY, lapsApart, splitSeconds, standingsRows } from "./standings.ts";
import { load, save, type Best, type Settings } from "./store.ts";
import {
  CHALLENGES, ROUNDS, goalText, addDays, applyRound, challengeById, contactCount, dailyDate, dailyPhrase, dailyStreak, evaluate, isOver, newChampionship, newDaily, nextPhrase, normaliseChallenges, normaliseChampionship, normaliseDaily,
  TACTIC_INFO, crossedPlace, firstDryLap, isTactic, surfaceAt, type Tactic, overtakeCount, recordChallenge, recordDaily, referenceTime, rosterOf, skipTo, standings, totalStars, VEHICLE_IDS,
  type Challenge, type ChallengeStore, type Championship, type DailyRecord,
} from "@apex/sim";
import { CIRCUITS, TROPHIES, newTrophies, rewardsOf, type RunSummary, type TrophyMode } from "@apex/sim";
import { CAREER_TIERS, PROMOTE_PLACE, finishSeason, newCareer, normaliseCareer, startSeason, type Career } from "@apex/sim";
import { SHIFTING, fuelMultFor } from "@apex/sim";
import { SIM_VERSION, duelCode, readDuel, buildProfile, golfPar, golfPhrase, golfStars, golfTarget, linePoints, segmentTimes, type Profile, type RaceEdit, type RaceRules } from "@apex/sim";
import { MAX_REPLAYS, MAX_REPLAY_BYTES, keepReplay, loadReplays, rulesIn, rulesOut, type Replay } from "./replays.ts";
import { DIFFICULTIES, DIFFICULTY_NAMES, bestPlace, cornerCap, ghostsAllowed, highestUnlocked, isDifficulty, isUnlocked, lockReason, normaliseRecords, realismAllowed, recordFinish, recordKey, starsFor, type Difficulty, type Records } from "@apex/sim";
import { copyText, dropdown, wireControls } from "./menus/controls.ts";
import { atlasHtml, careerHtml, challengesHtml, championshipHtml, groupHtml, tacticChips, homeHtml, pauseHtml, settingsHtml, setupHtml, type Flow } from "./menus/screens.ts";
import type { Handle, HandleKind, Skid, WorldView } from "./world.ts";

const ME = "me";
const PLAYER_COLOR = 0xffcf3f;
/** other online racers: their arrow and name */
const ONLINE_COLOR = 0x4fe0ff;
const RIVAL_COLORS = [0xff5d6c, 0x4fd28a, 0x5aa9ff, 0xb48cff, 0xff9f43, 0x3fe0d0, 0xf06bd2];
const STAT_LABEL: Record<Stat, string> = { accel: "Acceleration", top: "Top speed", grip: "Cornering", brake: "Braking" };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** A time from the sim as a clock reading, in real seconds (see scale.ts). */
/** The start sequence: when the first light comes on, the gap between lights, in seconds. */
const START_FIRST = 1;
const START_GAP = 0.85;
interface StartSeq { t: number; lit: number; out: number; done: boolean }

/** The tutorial teaches one more thing on each of the first segments, under its usual words (by the segment just finished: index 0 shows on the second). */
const TUT_TIPS: readonly string[] = [
  "Tip: the segments you have finished are drawn in <b>speed colours</b>: red where the car is slow, green where it is fast.",
  "Tip: <b>drag</b> any point to move it. Only the segment you are on changes.",
  "Tip: <b>Shift+click</b> on the line puts a new point between two others; <b>right-click</b> a point deletes it.",
  "Tip: the <b>square</b> where a segment starts and the <b>diamond</b> where it ends slide along the edge of the road: drag them to start or leave the bend wider.",
  "Tip: a smooth, sparse line is usually quicker than a busy one. Fewer points, longer curves.",
];

/** How long a trophy card stays up. */
const TROPHY_MS = 5000;

/** What each livery reward is called in the garage. */
const REWARD_NAMES = { gold: "gold paint", chrome: "chrome paint", chequer: "the chequered pattern", chevron: "the chevron pattern" } as const;

/** The longest clip a recording makes. */
const REC_MAX_MS = 60_000;

/** Laps of an elimination race: one for every rival, so one car goes out on each lap but the last, which is a duel (25 at most). */
const elimLaps = (rivals: number): number => Math.min(25, Math.max(2, rivals));

/** Line Golf in the bar under the map: points against par, and the flying lap against the target. */
const golfBar = (g: { points: number; par: number; lap: number; target: number; stars: number } | null): string =>
  !g ? "" : `<span class="golfbar">⛳ <b>${g.points}</b> points (par ${g.par}) · ${g.lap <= g.target ? `<span class="good">beats</span>` : `<span class="bad">misses</span>`} the target ${fmt(g.target)}${g.stars ? ` · ${"★".repeat(g.stars)}${"☆".repeat(3 - g.stars)}` : ""}</span><br/>`;

export const fmt = (sim: number | null | undefined) => {
  if (sim === null || sim === undefined) return "–";
  const t = realSeconds(sim), m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(3).padStart(6, "0")}`;
};
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** Engine loudness against zoom: full at this many screen pixels to a world unit, quieter below it (further off), a little louder above. */
const ENGINE_REF_SCALE = 3;
const ENGINE_MIN_GAIN = 0.08;
const ENGINE_MAX_GAIN = 1.3;

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
  /** the position in the lap being drawn (the index into the line's lists of points) */
  seg: number;
  /** the segment of the track it is drawn in; the same as `seg` until the lap takes a shortcut */
  id: number;
  /** points between the start and the end of this segment */
  pts: Vec2[];
  /** where this segment leaves; null while drawing a lap means "wherever the last point lines up" */
  end: Vec2 | null;
  queue: number[];
  drag: { kind: HandleKind; i: number } | null;
  warn: string;
}

/** Ticks of a race worked out before it starts playing, how far ahead of the play head it is kept (ticks), and the most time a frame gives it (ms). */
const FIRST_TICKS = 240;
/** The closest a waypoint may go to the start or end of its segment or to another waypoint, units. */
const MIN_NODE_GAP = 8;
/** How many tracks' lines are kept. */
const SAVED_LINES_MAX = 40;
const STREAM_AHEAD = 600;
const STREAM_MS = 8;

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
  difficulty: Difficulty;
  /** an elimination race (Quick Race only) */
  elimination?: boolean;
}

interface Motion { v: number; acc: number; slip: number; beta: number; braking: boolean; /** angle of the front wheels, radians, positive to the right */ steer: number }

export class Game {
  private settings: Settings = { phrase: "", laps: 3, mode: "race", rivals: 7, car: defaultCar(), realism: false, obstacles: false, startTyre: "medium", pitPlan: [], flow: "quick", wearFuel: 1, wearTyre: 1, mandatory: [], difficulty: "easy" };
  private records: Records = {};
  /** the Daily, Challenges and Championship the player has: see sim/daily.ts, challenges.ts, championship.ts */
  private dailyRec: DailyRecord = newDaily();
  private challenges: ChallengeStore = { stars: {} };
  private champ: Championship | null = null;
  /** what the Championship screen is about to start */
  /** the tactic the next queued pit stop will carry */
  private planTactic: Tactic = "balanced";
  private champPick: { difficulty: Difficulty; vehicle: VehicleId } = { difficulty: "easy", vehicle: "rally" };
  /** a Daily, a Challenge or a round of the Championship being played: it borrows the settings and gives them back (see `modeBackup`) */
  private special: { kind: "daily"; date: string } | { kind: "challenge"; id: string } | { kind: "champ"; career?: boolean } | { kind: "play" } | { kind: "golf"; date: string } | { kind: "replay"; rep: Replay } | { kind: "duel"; name: string; vehicle: string; line: Line; car: CarConfig } | null = null;
  /** trophies earned (trophies.ts), with when; races finished and won; the real circuits found, with when */
  private trophies: Record<string, number> = {};
  private stats = { races: 0, wins: 0 };
  private found: Record<string, number> = {};
  /** the career ladder (career.ts) and its season in progress */
  private career: Career = newCareer();
  /** The season being raced: the career's, or the standalone championship's. */
  private season(): Championship | null { return this.special?.kind === "champ" && this.special.career ? this.career.current : this.champ; }
  /** Keep a season after a round, wherever it belongs. */
  private saveSeason(c: Championship): void {
    if (this.special?.kind === "champ" && this.special.career) { this.career = { ...this.career, current: c }; void save("career", this.career); }
    else { this.champ = c; void save("championship", c); }
  }
  /** the records have been read from storage (the difficulty is checked against them only then) */
  private recordsLoaded = false;
  /** races kept to watch again (replays.ts), newest first */
  private replays: Replay[] = [];
  /** the entrants as they were when the race began, and its rules, for the replay */
  private replayStart: { entrants: string; rules: RaceRules } | null = null;
  /** Line Golf: the best stars and fewest points on each course, by phrase */
  private golfRec: Record<string, { stars: number; points: number }> = {};
  private modeBackup: Settings | null = null;
  /** which segment the edit view last framed, so a new one starts centred */
  private focusKey = "";
  private toastLayer: HTMLDivElement;
  /** the track has a rough surface somewhere, so the sound looks for one under the cars */
  private roughTrack = false;
  private screen: "home" | "setup" | "settings" | "garage" | "challenges" | "championship" | "career" | "atlas" | "race" | "attack" = "home";
  private flow: Flow = "quick";
  private run: RunConfig = { flow: "quick", kind: "race", laps: 3, realism: false, rivals: 7, wearFuel: 1, wearTyre: 1, mandatory: [], difficulty: "easy" };
  /** the weekend in progress, if any */
  private weekend: Weekend | null = null;
  /** simulated seconds used up in this weekend's practice */
  private practiceSecs = 0;
  /** the line drawn last, which the next session on the same track starts from */
  private carry: { phrase: string; line: Line } | null = null;
  /** the racing line drawn for each track (by phrase), kept in storage: finished or half drawn, it is still there after quitting to the menu or closing the game, until the player clears it */
  private savedLines: Record<string, unknown> = {};
  private savedKey = "";
  /** the gap to each car in the standings, as shown, and the tick it was worked out at */
  private splits = new Map<string, string>();
  private splitTick = -1e9;
  /** while the tutorial runs, the player's own settings are kept here and the tutorial's stand in for them */
  private tutBackup: Settings | null = null;
  private tutLayer!: HTMLElement;
  /** a timed session's results are up (while the cool-down lap is still being driven behind them) */
  private sessionShown = false;
  private cars: CarConfig[] = [];
  private best: Best = {};
  /** the online server: ghosts to race and a place to send times. Optional; every call fails quietly */
  private online = new Online();
  /** the race whose result has already gone to the server */
  private reported: Race | null = null;
  private note = "";

  private track!: Track;
  private rivalEntrants: Entrant[] = [];
  private me!: Entrant;
  private race: Race | undefined;
  private lapNo = 0;
  private draw: DrawState | null = null;
  private pick: { selected: Set<number>; limit: number; bad: Set<number> } | null = null;
  /** `end` is as far as the race has been worked out: all of it, or (until `final`) a frontier that moves on between frames. */
  private play: { tick: number; end: number; speed: number; atStop: boolean; final: boolean; stage: { toEnd: boolean }; start?: StartSeq } | null = null;
  private currentLine!: Line;
  private pickMessage: string | null = null;
  private version = "dev";
  private audio = new CarAudio();
  private skidTick = 0;
  private clock = 0;
  /** pit[lap]: the player drives into the pits at the end of that lap */
  private bar!: Bar;
  private planLayer!: HTMLElement;
  /** the five red lights of the start sequence */
  private lightsLayer!: HTMLElement;
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
  /** the screen the garage was opened from, and where Done goes back to */
  private garageFrom: "home" | "setup" = "setup";
  private previewKey = "";
  /** bots going round behind the title menu, replayed in a loop */
  private ambient: { race: Race; tick: number } | null = null;
  private menuLayer!: HTMLElement;
  private menuBtn!: HTMLButtonElement;
  private modal!: HTMLElement;
  /** a drag that pans the overview, or turns out to be a click */
  /** touch: what a tap does while drawing (the desktop uses Shift-click and right-click instead) */
  private tool: "add" | "insert" | "delete" = "add";
  /** fingers on the screen, for pinch zoom */
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; cx: number; cy: number } | null = null;
  /** holding a point for a moment deletes it */
  private hold: { timer: number; x: number; y: number } | null = null;
  /** space is held: a drag slides the view while drawing */
  private spaceDown = false;
  /** when a touch last placed a point, so a second finger arriving at once can take it back */
  private placed: { at: number } | null = null;
  /** gamepad: the pad, its cursor (client pixels), whether the d-pad is walking the buttons, and which handle d-pad cycling is on */
  private pad = new GamepadInput();
  private cur = { x: 0, y: 0, init: false };
  private padUi = false;
  private padSel = -1;
  private padNav = { dir: "", t: 0 };
  private pan: { lx: number; ly: number; sx: number; sy: number; moved: boolean; button: number; world: Vec2 } | null = null;

  constructor(private app: Application, private view: WorldView, private ui: HTMLElement) {
    const host = ui.parentElement!;
    this.menuLayer = document.createElement("div"); this.menuLayer.id = "menu"; host.appendChild(this.menuLayer);
    this.menuLayer.addEventListener("pointerdown", (e) => { if (e.target === this.menuLayer && this.inGame) this.closeMenu(); });
    this.menuBtn = document.createElement("button"); this.menuBtn.id = "menubtn"; this.menuBtn.innerHTML = '<span class="ic" aria-hidden="true">☰</span><span class="tx">Menu</span>'; this.menuBtn.title = "Menu"; this.menuBtn.setAttribute("aria-label", "Menu"); this.menuBtn.style.display = "none";
    this.menuBtn.addEventListener("click", () => this.openMenu());
    host.appendChild(this.menuBtn);
    this.modal = document.createElement("div"); this.modal.id = "modal"; host.appendChild(this.modal);
    this.bar = new Bar(host);
    this.planLayer = document.createElement("div"); this.planLayer.id = "planlayer"; host.appendChild(this.planLayer);
    this.lightsLayer = document.createElement("div"); this.lightsLayer.id = "startlights"; this.lightsLayer.style.display = "none"; host.appendChild(this.lightsLayer);
    this.tutLayer = document.createElement("div"); this.tutLayer.id = "tut"; host.appendChild(this.tutLayer);
    this.toastLayer = document.createElement("div"); this.toastLayer.id = "toasts"; this.toastLayer.setAttribute("aria-live", "polite"); host.appendChild(this.toastLayer);
  }

  async start(): Promise<void> {
    this.settings = { ...this.settings, ...(await load<Partial<Settings>>("settings", {})) };
    if (typeof this.settings.realism !== "boolean") this.settings.realism = false;
    // realism (tyres, fuel, weather) is switched off for now: settings saved before that decision follow it once
    if (this.settings.realismVersion !== 2) { this.settings.realism = false; this.settings.realismVersion = 2; }
    this.normaliseSettings();
    await this.online.init();
    if (!this.settings.phrase) this.settings.phrase = randomPhrase(new Rng((Math.random() * 2 ** 32) >>> 0));
    this.cars = await load<CarConfig[]>("cars", []);
    this.best = await load<Best>("best", {});
    this.records = normaliseRecords(await load<unknown>("records", {}));
    this.recordsLoaded = true;
    this.dailyRec = normaliseDaily(await load<unknown>("daily", {}));
    this.replays = await loadReplays();
    { const g = await load<unknown>("golf", {}); if (g && typeof g === "object") for (const [k, v] of Object.entries(g as Record<string, { stars?: unknown; points?: unknown }>)) if (typeof v?.stars === "number" && typeof v.points === "number") this.golfRec[k] = { stars: v.stars, points: v.points }; }
    this.challenges = normaliseChallenges(await load<unknown>("challenges", {}));
    this.champ = normaliseChampionship(await load<unknown>("championship", null));
    this.career = normaliseCareer(await load<unknown>("career", null));
    { const t = await load<unknown>("trophies", {}); if (t && typeof t === "object") for (const [k, v] of Object.entries(t)) if (typeof v === "number" && TROPHIES.some((x) => x.id === k)) this.trophies[k] = v; }
    { const st = await load<{ races?: unknown; wins?: unknown }>("stats", {}); this.stats = { races: Math.max(0, Number(st?.races) || 0), wins: Math.max(0, Number(st?.wins) || 0) }; }
    { const f = await load<unknown>("found", {}); if (f && typeof f === "object") for (const [k, v] of Object.entries(f)) if (typeof v === "number" && CIRCUITS.some((c) => c.id === k && !c.kart)) this.found[k] = v; }
    this.normaliseSettings(); // again: the difficulty depends on the records
    this.savedLines = await load<Record<string, unknown>>("lines", {});
    // times set before the machine was a choice belong to the track's own machine
    const moved = migrateBest(this.best, (p) => placeFor(p).vehicle);
    if (Object.keys(moved).some((k) => !(k in this.best)) || Object.keys(this.best).some((k) => !(k in moved))) { this.best = moved; void save("best", this.best); }
    this.version = (await window.apex?.version?.()) ?? "dev";
    this.audio.setMuted(!!this.settings.muted);
    this.audio.setMusic(!this.settings.musicOff);
    this.applyVolumes();
    this.applyEngines();
    this.audio.arm();
    const c = this.app.canvas;
    window.addEventListener("pointermove", (e) => { if (e.movementX || e.movementY || e.pointerType === "touch") this.pad.active = false; }, true);
    window.addEventListener("pointerdown", () => { this.pad.active = false; }, true);
    c.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    c.addEventListener("pointermove", (e) => this.onPointerMove(e));
    c.addEventListener("pointerup", (e) => this.onPointerUp(e));
    c.addEventListener("pointercancel", (e) => this.onPointerUp(e));
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("wheel", (e) => {
      if (this.view.cameraMode !== "overview" && this.view.cameraMode !== "follow") return;
      e.preventDefault();
      this.view.zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    }, { passive: false });
    window.addEventListener("keyup", (e) => { if (e.key === " ") this.spaceDown = false; });
    window.addEventListener("blur", () => { this.spaceDown = false; });
    window.addEventListener("keydown", (e) => {
      if (e.key === " " && this.draw && !this.menuOpen && (e.target as HTMLElement).tagName !== "INPUT") { this.spaceDown = true; e.preventDefault(); }
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
    if (link?.duel) this.startDuel(link);
    else if (link?.playing) {
      this.flow = this.settings.mode === "trial" ? "trial" : "quick";
      this.run = this.runFor(this.flow, this.flow === "trial" ? "trial" : "race");
      this.startGame(link.line ?? null, true);
    } else this.showMenu();
  }

  /** What the forecaster would say for this phrase and lap count: rain at the start, middle or end of the race, never the detail. */
  /** The race's weather comes from the length of the race in the player's own machine (`Race` takes the first entrant's), so the forecast has to use the same one. */
  private forecastFor(phrase: string, laps: number, vehicle: VehicleId, on = this.run.realism): [boolean, boolean, boolean] | null {
    if (!on) return null;
    const key = `${phrase}|${laps}|${vehicle}`;
    if (this.fcKey !== key) {
      const t = generateTrack(phrase, { obstacles: false });
      const duration = raceDuration(t, vehicle, laps);
      const ph = forecast(weatherFor(t.seed, duration, t.biome), duration);
      this.fcKey = key;
      this.fcRain = [ph.includes("beginning"), ph.includes("middle"), ph.includes("end")];
    }
    return this.fcRain;
  }
  private fcKey = "";
  private fcRain: [boolean, boolean, boolean] = [false, false, false];

  /** Make sure whatever came from storage or a link is something the game can run. */
  private normaliseSettings(): void {
    const s = this.settings;
    s.laps = Math.min(50, Math.max(1, Math.round(Number(s.laps)) || 3));
    if (s.vehicle !== undefined && !isVehicleId(s.vehicle)) delete s.vehicle;
    if (s.vehiclePhrase !== undefined && typeof s.vehiclePhrase !== "string") delete s.vehiclePhrase;
    // boxes and water are not offered any more
    s.obstacles = false;
    s.wearFuel = clampWear(s.wearFuel);
    s.wearTyre = clampWear(s.wearTyre);
    s.mandatory = COMPOUND_IDS.filter((c) => Array.isArray(s.mandatory) && s.mandatory.includes(c));
    s.rivals = snapRivals(Number(s.rivals) || 7);
    // (only once the records are loaded: checked against none, a saved Medium or Hard fell back to Easy every time the game opened)
    if (!isDifficulty(s.difficulty) || (this.recordsLoaded && !isUnlocked(s.difficulty, this.records))) s.difficulty = this.recordsLoaded ? highestUnlocked(this.records) : isDifficulty(s.difficulty) ? s.difficulty : "easy";
    if (s.flow !== "trial" && s.flow !== "quick" && s.flow !== "weekend") s.flow = "quick";
    if (s.livery !== undefined) {
      const l = s.livery as Partial<Livery>;
      const ok = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 0xffffff;
      s.livery = ok(l.primary) && ok(l.secondary) && [0, 1, 2, 3, 4, 5].includes(l.stripe as number) && Number.isInteger(l.number) && l.number! >= 0 && l.number! <= 99 ? { primary: l.primary!, secondary: l.secondary!, stripe: l.stripe!, number: l.number! } : undefined;
      if (!s.livery) delete s.livery;
    }
    // the experimental racing room and overtaking switches are gone (they only made races slower and rougher): forget a saved choice
    delete s.room; delete s.overtake;
    if (!isCompound(s.startTyre)) s.startTyre = "medium";
    if (s.startTactic !== undefined && !isTactic(s.startTactic)) delete s.startTactic;
    s.pitPlan = (Array.isArray(s.pitPlan) ? s.pitPlan : [])
      .filter((p) => p && Number.isInteger(p.lap) && p.lap >= 0 && p.lap <= s.laps - 2 && isCompound(p.tyre))
      .map((p) => (p.tactic !== undefined && !isTactic(p.tactic) ? { lap: p.lap, tyre: p.tyre } : p))
      .filter((p, i, all) => all.findIndex((q) => q.lap === p.lap) === i)
      .sort((a, b) => a.lap - b.lap).slice(0, 50);
  }

  // ---------- share link ----------
  private readLink(): ShareState | null {
    const raw = location.hash.replace(/^#/, "");
    if (!raw) return null;
    const st = decodeShare(raw);
    if (typeof st === "string") { this.note = `That link did not work: ${st}`; return null; }
    const car: CarConfig = { name: st.car.name || "Standard", accel: st.car.accel, top: st.car.top, grip: st.car.grip, brake: st.car.brake };
    Object.assign(this.settings, { elimination: false, phrase: st.phrase, laps: st.laps, mode: st.mode, rivals: st.rivals, realism: st.realism, obstacles: false, car: validateCar(car) ? defaultCar() : car, startTyre: st.startTyre, pitPlan: st.pitPlan });
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
    this.rememberLine();
  }

  /** Keep the line drawn so far for this track (a finished lap, or the segments done so far), so leaving the game never loses it. */
  private rememberLine(): void {
    const line = this.shareLine;
    if (!this.inGame || this.tutBackup || !line || line.segs.length === 0) return;
    const phrase = normalizePhrase(this.settings.phrase);
    const wire = lineToWire(line), key = `${phrase}|${JSON.stringify(wire)}`;
    if (key === this.savedKey) return;
    this.savedKey = key;
    delete this.savedLines[phrase];
    this.savedLines[phrase] = wire; // (newest last, so the oldest go first when there are too many)
    for (const old of Object.keys(this.savedLines).slice(0, Math.max(0, Object.keys(this.savedLines).length - SAVED_LINES_MAX))) delete this.savedLines[old];
    void save("lines", this.savedLines);
  }

  /** The line kept for this track, if there is one that still fits it. */
  private storedLine(phrase: string): Line | null {
    const raw = this.savedLines[phrase];
    if (!raw) return null;
    const r = linesFromWire(defaultCar(), [raw]);
    return typeof r === "string" ? null : r.lines[0] ?? null;
  }

  /** Throw away the line kept for this track (the one thing that clears it: the player asking to redraw). */
  private forgetLine(phrase: string): void {
    delete this.savedLines[phrase];
    this.savedKey = "";
    void save("lines", this.savedLines);
  }

  // ---------- UI helpers ----------
  private show(cls: string, html: string): HTMLElement {
    this.ui.innerHTML = `<div class="panel ${cls}">${html}</div>`;
    return this.ui.firstElementChild as HTMLElement;
  }
  private on(el: HTMLElement, sel: string, fn: () => void): void {
    el.querySelector(sel)?.addEventListener("click", fn);
  }
  private persist(): void { void save("settings", this.tutBackup ?? this.modeBackup ?? this.settings); this.syncHash(); }
  /** The player's three levels, from the settings, to the sound. */
  /** The experimental engine settings (a URL can override them for a quick test: ?engines=waveguide&voices=32&meter). */
  private applyEngines(): void {
    const s = this.settings, q = new URLSearchParams(location.search);
    const model = q.get("engines") ?? s.engineModel ?? "synth", voices = Number(q.get("voices")) || s.engineVoices || CarAudio.defaultVoices();
    this.audio.setEngineModel(model === "waveguide" ? "waveguide" : "synth");
    this.audio.setMaxVoices(voices);
    const meter = q.has("meter") || !!s.audioMeter;
    if (meter && !this.meterTimer) {
      const el = document.createElement("div"); el.id = "audiometer"; this.toastLayer.parentElement?.appendChild(el);
      this.meterTimer = window.setInterval(() => {
        const st = this.audio.engineStats();
        el.textContent = `${st.model}${st.model === "waveguide" && st.state !== "ready" ? ` (${st.state})` : ""} · ${st.voices} engines${st.wg ? ` · ${st.wg} waveguide · audio thread ${Math.round(st.load * 100)}%` : ""}${st.shed ? ` · ${st.shed} moved to synth` : ""}`;
        el.classList.toggle("hot", st.load > 0.7);
      }, 500);
    } else if (!meter && this.meterTimer) { clearInterval(this.meterTimer); this.meterTimer = 0; document.getElementById("audiometer")?.remove(); }
  }
  private meterTimer = 0;

  private applyVolumes(): void { const s = this.settings, v = (x: number | undefined) => Math.max(0, Math.min(100, x ?? 100)) / 100; this.audio.setVolumes({ music: v(s.volMusic), fx: v(s.volFx), engine: v(s.volEngine) }); }

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
    this.rec?.r.stop();
    this.draw = null; this.pick = null; this.play = null; this.race = undefined; this.neighbours.clear();
    this.inGame = false; this.shareLine = undefined; this.previewKey = "";
    this.audio.stopAll();
    this.audio.setBiome(null); // back to the title's own track
    this.view.setFollow(null);
    this.view.clearCars();
    this.ui.innerHTML = "";
    this.bar.clear();
    this.closePlan();
    this.menuBtn.style.display = "none";
    this.tutLayer.style.display = "none";
    if (this.tutBackup) { this.settings = this.tutBackup; this.tutBackup = null; this.normaliseSettings(); }
    if (this.modeBackup) { this.settings = this.modeBackup; this.modeBackup = null; this.normaliseSettings(); }
    this.special = null;
  }

  /** Android Back: step out of menus the way Escape does. Returns false when there is nowhere left to go. */
  handleBack(): boolean {
    if (this.menuOpen && this.inGame && this.screen === "home") { this.closeMenu(); return true; }
    if (this.menuOpen && !this.inGame && this.screen === "home") return false;
    this.toggleMenu();
    return true;
  }

  /** The app left the screen: pause the sound and open the pause menu if a game is on. */
  setVisible(visible: boolean): void {
    this.audio.setSuspended(!visible);
    if (!visible && this.inGame && !this.menuOpen) this.toggleMenu();
  }

  private toggleMenu(): void {
    if (this.menuOpen) {
      if (this.inGame) { if (this.screen === "settings") { this.screen = "home"; this.renderMenu(); } else this.closeMenu(); }
      else if (this.screen === "garage") this.go(this.garageFrom);
      else if (this.screen === "setup") this.go(this.flow === "trial" ? "attack" : "race");
      else if (this.screen === "championship" || this.screen === "career") this.go("race");
      else if (this.screen === "atlas") this.go("attack");
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
    this.audio.setRacing(false);
    this.planLayer.style.visibility = "hidden";
    if (!this.inGame) this.showPreview();
    this.renderMenu();
  }

  private closeMenu(): void {
    this.menuOpen = false;
    this.menuLayer.style.display = "none";
    this.app.canvas.classList.remove("blurred");
    this.audio.setDucked(false);
    this.audio.setRacing(!!this.play);
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
    this.vehicle = vehicleForTrack(this.track);
    this.view.setTrack(this.track);
    this.view.resetCamera();
    this.view.clearCars();
    this.view.clearSkids();
    this.view.drawTrack(this.track, { visible: null });
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
    else if (this.screen === "challenges") this.renderChallenges();
    else if (this.screen === "championship") this.renderChampionship();
    else if (this.screen === "career") this.renderCareer();
    else if (this.screen === "atlas") this.renderAtlas();
    else if (this.screen === "race" || this.screen === "attack") this.renderGroup(this.screen);
    else this.renderHome();
  }

  private go(screen: "home" | "setup" | "settings" | "garage" | "challenges" | "championship" | "career" | "atlas" | "race" | "attack"): void {
    this.screen = screen;
    this.note = "";
    this.renderMenu();
  }

  private menuPanel(html: string, cls = ""): HTMLElement {
    this.menuLayer.innerHTML = `<div class="panel menu-panel bubble ${cls}">${html}</div>`;
    return this.menuLayer.firstElementChild as HTMLElement;
  }

  private renderHome(): void {
    const el = this.menuPanel(homeHtml({
      version: this.version, quit: !!window.apex?.quit, note: this.note,
      challenges: `${totalStars(this.challenges)} of ${CHALLENGES.length * 3} stars`,
    }), "tiles");
    this.note = "";
    this.syncHash();
    this.on(el, "#h-race", () => this.go("race"));
    this.on(el, "#h-play", () => this.startPlayNow());
    this.on(el, "#h-attack", () => this.go("attack"));
    this.on(el, "#h-challenges", () => this.go("challenges"));
    this.on(el, "#h-tutorial", () => this.startTutorial());
    this.on(el, "#h-garage", () => { this.garageFrom = "home"; this.go("garage"); });
    this.on(el, "#h-settings", () => this.go("settings"));
    this.on(el, "#h-quit", () => void window.apex?.quit?.());
  }

  /** The Race and Time Attack groups: a screen of their own modes between the title and the mode's own screens. */
  private renderGroup(kind: "race" | "attack"): void {
    const today = dailyDate(new Date()), ran = this.dailyRec.days[today], streak = dailyStreak(this.dailyRec, today);
    const el = this.menuPanel(groupHtml(kind, {
      daily: ran !== undefined ? `Today ${fmt(ran)}${streak > 1 ? ` · ${streak} days` : ""}` : streak > 0 ? `${streak} day streak: run today` : "One track a day, for all",
      career: (() => { const c = this.career, t = CAREER_TIERS[c.tier]!; return c.current ? `${t.name}: round ${c.current.done + 1} of ${c.current.rounds.length}` : `${t.name}: rung ${c.tier + 1} of ${CAREER_TIERS.length}`; })(),
      atlas: `${Object.keys(this.found).length} of ${CIRCUITS.filter((c) => !c.kart).length} circuits · ${Object.keys(this.trophies).length} of ${TROPHIES.length} trophies`,
      golf: (() => { const r = this.golfRec[golfPhrase(dailyDate(new Date()))]; return r ? `Today ${"★".repeat(r.stars)}${"☆".repeat(3 - r.stars)} in ${r.points} points` : "Fewest points that beat the clock"; })(),
      champ: this.champ ? (isOver(this.champ) ? "Season over" : `Round ${this.champ.done + 1} of ${this.champ.rounds.length}`) : `${ROUNDS} races, one title`,
    }), "tiles");
    this.on(el, "#back", () => this.go("home"));
    this.on(el, "#h-quick", () => { this.settings.elimination = false; this.openSetup("quick"); });
    this.on(el, "#h-elim", () => { this.settings.elimination = true; this.openSetup("quick"); });
    this.on(el, "#h-weekend", () => this.openSetup("weekend"));
    this.on(el, "#h-champ", () => this.go("championship"));
    this.on(el, "#h-career", () => this.go("career"));
    this.on(el, "#h-trial", () => this.openSetup("trial"));
    this.on(el, "#h-daily", () => this.startDaily());
    this.on(el, "#h-golf", () => this.startGolf());
    this.on(el, "#h-atlas", () => this.go("atlas"));
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
    const place = placeFor(phrase), biome = BIOMES[place.biome], chosen = this.pickVehicle(place.choices);
    const pct = (x: number, worse = false) => (x === 1 ? "" : `<span class="${(x > 1) !== worse ? "good" : "bad"}">${x > 1 ? "+" : "−"}${Math.round(Math.abs(x - 1) * 100)}%</span>`);
    const tt = this.best[trialKey(phrase, chosen)];
    const easy = flow !== "trial" && !realismAllowed(s.difficulty);
    const realism = !easy && (flow === "weekend" ? true : flow === "quick" && s.realism);
    const chips = `
        ${circuit ? `<span class="chip circuit">🏁 ${esc(circuit.name)} · ${circuit.lengthKm} km</span>` : ""}
        ${place.fun ? '<span class="chip fun" title="Crossings, bridges, shortcuts, narrows and open water">Fun track</span>' : ""}
        <span class="chip biome-${biome.id}">${esc(biome.name)}</span>
        <span class="chip chip-dd">${dropdown("vehicle", chosen, place.choices.map((id) => ({ value: id, label: VEHICLES[id].name })), { label: "Car type" })}</span>
        ${biome.grip !== 1 ? `<span class="chip dim">grip ${pct(biome.grip)}</span>` : ""}${biome.brake !== 1 ? `<span class="chip dim">braking ${pct(biome.brake)}</span>` : ""}${biome.wear !== 1 ? `<span class="chip dim">tyre wear ${pct(biome.wear, true)}</span>` : ""}`;
    const el = this.menuPanel(setupHtml({
      flow, phrase: s.phrase, chips, difficulty: flow === "trial" ? null : s.difficulty,
      unlocked: DIFFICULTIES.filter((d) => isUnlocked(d, this.records)), nextLock: (() => { const d = DIFFICULTIES.find((x) => !isUnlocked(x, this.records)); return d ? `${DIFFICULTY_NAMES[d]}: ${lockReason(d)}` : ""; })(), noRealism: easy, blurb: circuit ? circuit.blurb : biome.blurb,
      forecast: realism && flow !== "trial" ? this.forecastFor(s.phrase, s.laps, chosen, true) : null,
      laps: flow === "quick" && s.elimination ? elimLaps(s.rivals) : s.laps, rivals: s.rivals, realism: realism && !(flow === "quick" && s.elimination), elimination: flow === "quick" && !!s.elimination, wearFuel: s.wearFuel ?? 1, wearTyre: s.wearTyre ?? 1, mandatory: s.mandatory ?? [],
      carLine: `Car: ${s.car.name} (${carCost(s.car)}/${CAR_BUDGET} points)`,
      bestLine: flow === "trial" ? (tt !== undefined ? `Your time: <b>${fmt(tt)}</b>` : "") : "",
      record: flow === "trial" ? null : { stars: starsFor(this.records, recordKey(phrase, chosen)), place: bestPlace(this.records, recordKey(phrase, chosen)) },
      gridLine: (flow === "quick" ? (tt !== undefined ? `Your grid place comes from your time trial: <b>${fmt(tt)}</b>` : "Your grid place comes from the lap time of the line you draw. A Time Trial time, once you have one, counts instead.") : flow === "weekend" ? "Your grid place comes from the qualifier." : "")
        // (reportRun only sends a race the server can replay: say so, rather than leave a race off the boards without a word)
        + (realism && (s.wearFuel ?? 1) > 1 ? (() => { const t = generateTrack(s.phrase, { obstacles: false }), len = trackLength(t), car = { ...s.car, type: chosen }, m = fuelMultFor(car, s.laps, len, BIOMES[t.biome].fuel, s.wearFuel); return m < (s.wearFuel ?? 1) - 0.01 ? ` <span class="unranked">Fuel use is held to ${m.toFixed(1)}× here: a full tank always lasts a lap and a half.</span>` : ""; })() : "")
        + (flow !== "trial" && (s.difficulty !== "hard" || (flow === "quick" && s.elimination)) ? ` <span class="unranked">This race won't go on the online boards: only ${flow === "quick" && s.elimination ? "ordinary races" : "races"} on Hard do. Your lap times still count.</span>` : ""),
      note: this.note,
    }));
    this.note = "";
    this.syncHash();
    this.preloadGhosts();
    const input = el.querySelector<HTMLInputElement>("#phrase")!;
    // typing a different track turns Random into Load Track; they swap back when the box matches the current track again
    const rand = el.querySelector<HTMLButtonElement>("#rand")!;
    // (a pasted duel code is not a phrase: it starts the duel)
    const typedDiffers = (): boolean => { if (readDuel(input.value)) return true; const t = normalizePhrase(input.value); return !!t && t !== normalizePhrase(s.phrase); };
    const syncRand = (): void => { const load = typedDiffers(); rand.textContent = readDuel(input.value) ? "Load Duel" : load ? "Load Track" : "Random"; rand.classList.toggle("green", load); rand.classList.toggle("pink", !load); };
    const loadTyped = (): void => { const duel = readDuel(input.value); if (duel) { this.startDuel(duel); return; } const next = input.value; if (typedDiffers()) void this.changeSeed(() => { s.phrase = next; }); };
    input.addEventListener("input", syncRand);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { loadTyped(); input.blur(); } });
    input.addEventListener("change", () => { if (!normalizePhrase(input.value) && !readDuel(input.value)) input.value = s.phrase; syncRand(); });
    const copy = el.querySelector<HTMLButtonElement>("#phrase-copy")!;
    copy.addEventListener("click", () => {
      void copyText(input.value.trim()).then((ok) => {
        copy.classList.toggle("done", ok);
        const label = copy.querySelector("span");
        if (label) label.textContent = ok ? "Copied" : "Failed";
        setTimeout(() => { copy.classList.remove("done"); if (label) label.textContent = "Copy"; }, 1400);
      });
    });
    this.on(el, "#rand", () => { if (typedDiffers()) loadTyped(); else void this.changeSeed(() => { s.phrase = nextCircuit(s.phrase) ?? rerollPhrase(s.phrase, new Rng((Math.random() * 2 ** 32) >>> 0)); }); });
    this.on(el, "#back", () => this.go(flow === "trial" ? "attack" : "race"));
    this.on(el, "#garage", () => { this.garageFrom = "setup"; this.go("garage"); });
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
        else if (id === "difficulty" && isDifficulty(v) && isUnlocked(v, this.records)) s.difficulty = v;
        else if (id === "vehicle" && isVehicleId(v)) { s.vehicle = v; s.vehiclePhrase = normalizePhrase(s.phrase); }
        this.normaliseSettings();
        this.persist();
        this.renderMenu();
      },
      chips: (id, on) => { if (id === "mandatory") { s.mandatory = on; this.persist(); this.renderMenu(); } },
    });
  }

  private renderSettings(): void {
    const s = this.settings;
    const el = this.menuPanel(settingsHtml({ muted: !!s.muted, music: !s.musicOff, vol: { music: s.volMusic ?? 100, fx: s.volFx ?? 100, engine: s.volEngine ?? 100 }, replays: this.replays.map((r) => ({ id: r.id, title: r.title, when: r.when, place: r.place, ok: r.version === SIM_VERSION })), version: this.version, fromGame: this.inGame, name: this.online.name, nameMax: NAME_MAX, engines: { model: s.engineModel ?? "synth", voices: s.engineVoices ?? CarAudio.defaultVoices(), meter: !!s.audioMeter } }));
    this.on(el, "#back", () => { if (this.inGame) { this.screen = "home"; this.renderMenu(); } else this.go("home"); });
    // committed when the box loses focus or Enter is pressed, not on every key: a re-render would take the focus away
    el.querySelectorAll<HTMLInputElement>("input[data-vol]").forEach((r) => r.addEventListener("input", () => { const k = r.dataset["vol"] as "volMusic" | "volFx" | "volEngine"; s[k] = Number(r.value); this.audio.unlock(); this.applyVolumes(); }));
    el.querySelectorAll<HTMLInputElement>("input[data-vol]").forEach((r) => r.addEventListener("change", () => this.persist()));
    el.querySelectorAll<HTMLButtonElement>("[data-watch]").forEach((b) => b.addEventListener("click", () => { const rep = this.replays.find((r) => r.id === b.dataset["watch"]); if (rep) this.watchReplay(rep); }));
    const nameBox = el.querySelector<HTMLInputElement>("#player-name")!;
    nameBox.addEventListener("change", () => { nameBox.value = this.online.setName(nameBox.value); });
    nameBox.addEventListener("keydown", (e) => { if (e.key === "Enter") nameBox.blur(); });
    this.on(el, "#tutorial-reset", () => { s.tutorialDone = false; this.persist(); (el.querySelector("#tutorial-reset") as HTMLElement).textContent = "Tutorial reset"; });
    wireControls(el, {
      change: (id, v) => {
        if (id === "sound") { this.audio.unlock(); this.settings.muted = v !== "1"; this.audio.setMuted(!!this.settings.muted); this.persist(); }
        else if (id === "music") { this.audio.unlock(); s.musicOff = v !== "1"; this.audio.setMusic(!s.musicOff); this.persist(); }
        else if (id === "engine-model") { this.audio.unlock(); s.engineModel = v === "waveguide" ? "waveguide" : "synth"; this.applyEngines(); this.persist(); }
        else if (id === "engine-voices") { s.engineVoices = Number(v); this.applyEngines(); this.persist(); }
        else if (id === "audio-meter") { s.audioMeter = v === "1"; this.applyEngines(); this.persist(); }
        this.renderMenu();
      },
    });
  }

  private renderPause(): void {
    const el = this.menuPanel(pauseHtml({ title: "Paused", sub: this.sessionTitle(), finish: this.draw?.mode === "lap" }), "narrow");
    this.on(el, "#resume", () => this.closeMenu());
    this.on(el, "#p-settings", () => this.go("settings"));
    this.on(el, "#finish-track", () => this.finishTrackForMe());
    this.on(el, "#restart", () => {
      void (async () => {
        if (this.hasEdits() && !(await this.confirmDialog("Redraw this track?", "That throws away your drawing and any session in progress. The track and settings stay the same.", "Discard and redraw"))) return;
        this.audio.unlock();
        this.carry = null;
        this.forgetLine(normalizePhrase(this.settings.phrase));
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
    const difficulty = s.difficulty;
    if (flow === "tutorial") return { flow, kind: "race", laps: 3, realism: true, rivals: 3, wearFuel: 1, wearTyre: 1, mandatory: [], difficulty: "hard" };
    if (kind === "trial") return { flow, kind, laps: sessionLaps("trial"), realism: false, rivals: 0, wearFuel: 1, wearTyre: 1, mandatory: [], difficulty };
    if (kind === "practice" || kind === "qualifying") return { flow, kind, laps: sessionLaps(kind), realism: false, rivals: s.rivals, wearFuel: 1, wearTyre: 1, mandatory: [], difficulty };
    // an elimination race: no tyres or fuel, and a lap for every rival, so the last lap is a duel (25 at most)
    if (flow === "quick" && s.elimination) return { flow, kind, laps: elimLaps(s.rivals), realism: false, rivals: s.rivals, wearFuel: 1, wearTyre: 1, mandatory: [], difficulty, elimination: true };
    const realism = realismAllowed(difficulty) && (flow === "weekend" ? true : s.realism);
    return { flow, kind, laps: s.laps, realism, rivals: s.rivals, wearFuel: realism ? clampWear(s.wearFuel) : 1, wearTyre: realism ? clampWear(s.wearTyre) : 1, mandatory: realism ? s.mandatory ?? [] : [], difficulty };
  }

  private timed(): boolean { return this.run.kind !== "race"; }

  private sessionTitle(): string {
    const r = this.run;
    if (r.flow === "tutorial") return "Tutorial";
    if (r.kind === "trial") return this.special?.kind === "golf" ? "Line Golf" : "Solo time trial";
    if (r.flow === "weekend") return `Race weekend · ${r.kind === "practice" ? "Practice" : r.kind === "qualifying" ? "Qualifier" : "Race"}`;
    return this.run.elimination ? "Elimination race" : "Quick race";
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
    this.settings = { ...this.settings, phrase: "oval", laps: 3, rivals: 3, realism: true, mode: "race", pitPlan: [], autoPit: false, mandatory: [], wearFuel: 1, wearTyre: 1, obstacles: false, startTyre: "medium" };
    this.weekend = null;
    this.run = this.runFor("tutorial", "race");
    this.audio.unlock();
    this.startGame();
  }

  /** Times only compare with times set under the same rules. */
  private bestKey(phrase: string): string {
    const r = this.run;
    // (an elimination race is timed against its own kind: its winner drives the whole distance with the field thinning out)
    return `${phrase}:${r.laps}:${r.realism ? "r" : "x"}c:${this.vehicle}${r.elimination ? ":elim" : ""}`;
  }

  /** The fastest lap you have set on this track (any number of laps), which can put you further up the grid. */
  private lapKey(phrase: string): string {
    return `${phrase}:lap:${this.run.realism ? "r" : "x"}c:${this.vehicle}`;
  }

  // ---------- the Daily, Challenges and the Championship ----------
  /**
   * Start a mode that brings its own track and rules: the settings are borrowed (and given back when the game is left), the machine is
   * picked by `pickVehicle` from `this.special`, and the run is built from the borrowed settings like any other.
   */
  private beginSpecial(special: NonNullable<Game["special"]>, patch: Partial<Settings>, flow: Flow): void {
    if (!this.modeBackup) this.modeBackup = JSON.parse(JSON.stringify(this.settings)) as Settings;
    this.special = special;
    this.flow = flow;
    Object.assign(this.settings, { pitPlan: [], mandatory: [], wearFuel: 1, wearTyre: 1, obstacles: false, elimination: false, ...patch, mode: flow === "trial" ? "trial" : "race", flow });
    this.normaliseSettings();
  }

  /**
   * Play now: a random track, three laps against seven rivals, no tyres or fuel, at Medium if the player has opened it (else Easy). The settings
   * are borrowed (`beginSpecial`), so the player's own Quick Race setup is still there afterwards.
   */
  private startPlayNow(): void {
    const difficulty: Difficulty = isUnlocked("medium", this.records) ? "medium" : "easy";
    this.beginSpecial({ kind: "play" }, { phrase: randomPhrase(new Rng((Math.random() * 2 ** 32) >>> 0)), laps: 3, rivals: 7, realism: false, difficulty }, "quick");
    this.weekend = null;
    this.run = this.runFor("quick", "race");
    this.audio.unlock();
    this.startGame();
  }

  /** Line Golf: today's course, as a Time Trial in the garage car, scored on the points of the line against a target lap (golf.ts). */
  private startGolf(): void {
    const date = dailyDate(new Date());
    this.beginSpecial({ kind: "golf", date }, { phrase: golfPhrase(date) }, "trial");
    this.weekend = null;
    this.run = this.runFor("trial", "trial");
    this.audio.unlock();
    this.startGame();
  }

  /** Line Golf on a line: its points, par, flying lap, the target and the stars it would earn. Null outside Line Golf or for a lap not finished. */
  private golfScore(line: Line | null): { points: number; par: number; lap: number; target: number; stars: number } | null {
    if (this.special?.kind !== "golf" || !line || !isComplete(this.track, line)) return null;
    const prof = this.lineProfile(line);
    if (!prof) return null;
    const key = `${this.track.phrase}|${this.vehicle}|${JSON.stringify(this.playerCar())}`;
    if (this.golfTargetKey !== key) { this.golfTargetKey = key; this.golfTargetLap = golfTarget(this.track, this.playerCar()); }
    const points = linePoints(line), par = golfPar(this.track), made = prof.ideal <= this.golfTargetLap;
    return { points, par, lap: prof.ideal, target: this.golfTargetLap, stars: golfStars(points, par, made) };
  }
  private golfTargetKey = "";
  private golfTargetLap = 0;

  /** Keep the race just finished to watch again (the newest replay). False when it cannot be kept (too big, or nothing to keep). */
  private keepThisRace(title: string, place: number): boolean {
    const race = this.race, st = this.replayStart;
    if (!race || !st || this.special?.kind === "replay") return false;
    const rep: Replay = {
      id: `${Date.now()}`, when: Date.now(), version: SIM_VERSION, phrase: this.track.phrase, obstacles: this.settings.obstacles, vehicle: this.vehicle, laps: race.laps,
      run: this.run, rules: st.rules, entrants: JSON.parse(st.entrants) as Entrant[], edits: JSON.parse(JSON.stringify(race.edits)) as RaceEdit[],
      title: `${this.sessionTitle()} · ${title}`, place, hash: race.hash(),
    };
    if (JSON.stringify(rep).length > MAX_REPLAY_BYTES) return false;
    this.replays = [rep, ...this.replays.filter((x) => x.id !== rep.id)].slice(0, MAX_REPLAYS);
    void keepReplay(this.replays.slice(1), rep);
    this.replayStart = null;
    return true;
  }

  /** Watch a kept race: the same track, the same entrants as at the start, the stops' changes made again on their ticks, run straight to the end. */
  private watchReplay(rep: Replay): void {
    if (rep.version !== SIM_VERSION) { this.toast("That race was run on an older version of the game, so it would not come out the same.", "bad"); return; }
    this.leaveGame();
    this.beginSpecial({ kind: "replay", rep }, { phrase: rep.phrase, obstacles: rep.obstacles }, "quick");
    this.run = rep.run as RunConfig;
    this.track = generateTrack(rep.phrase, { obstacles: rep.obstacles });
    this.vehicle = rep.vehicle;
    this.ambient = null; this.previewKey = "";
    this.audio.unlock();
    this.audio.setBiome(this.track.biome);
    this.play = null; this.audio.stopAll(); this.updateRain(0);
    this.view.clearCars();
    this.closeMenu();
    this.draw = null; this.pick = null; this.planOpen = false; this.eventIdx = 0;
    this.view.livery = this.settings.livery;
    this.view.setTrack(this.track);
    this.roughTrack = this.track.allSegments.some((x) => x.surface);
    this.view.resetCamera();
    this.inGame = true;
    this.menuBtn.style.display = "block";
    const entrants = JSON.parse(JSON.stringify(rep.entrants)) as Entrant[];
    this.me = entrants.find((e) => e.id === ME)!;
    this.rivalEntrants = entrants.filter((e) => e.id !== ME);
    this.currentLine = this.me.lines[0]!;
    this.race = new Race(this.track, entrants, rep.laps, rulesIn(rep.rules));
    this.race.replay(rep.edits);
    this.lapNo = 0;
    this.view.clearSkids();
    this.skidTick = 0;
    this.runAndPlay(0);
  }

  /** The end of a replay: the order, and whether it came out as the race did. */
  private showReplayEnd(rep: Replay, res: CarResult[]): void {
    const same = this.race?.hash() === rep.hash;
    const el = this.show("center", `
      <h2>Replay · ${esc(rep.title)}</h2>
      <p class="dim">${esc(rep.phrase)} · ${rep.laps} lap(s) · ${new Date(rep.when).toLocaleString()}</p>
      ${same ? "" : '<p class="bad">This replay did not come out exactly as the race did.</p>'}
      <table><tr><th>#</th><th>Driver</th><th class="num">Time</th></tr>
      ${res.map((x) => `<tr class="${x.isPlayer ? "me" : ""}"><td>${x.position}</td><td>${esc(x.name)}</td><td class="num">${x.eliminated ? "out" : fmt(x.finishTime)}</td></tr>`).join("")}</table>
      <button class="primary" id="rewatch">Watch again</button><button id="res-menu">Menu</button>`);
    this.on(el, "#rewatch", () => this.watchReplay(rep));
    this.on(el, "#res-menu", () => this.showMenu());
  }

  /** A duel from a code or a link: the challenger's track and rules, a race of two, their lap against the one the player is about to draw. */
  private startDuel(st: ShareState): void {
    if (!st.duel || !st.line) return;
    const car: CarConfig = { name: st.car.name || "Standard", accel: st.car.accel, top: st.car.top, grip: st.car.grip, brake: st.car.brake };
    if (this.inGame) this.leaveGame();
    this.beginSpecial({ kind: "duel", name: st.duel.name || "Challenger", vehicle: st.duel.vehicle, line: st.line, car: validateCar(car) ? defaultCar() : car }, { phrase: st.phrase, laps: st.laps, rivals: 1, realism: st.realism, obstacles: false, startTyre: st.startTyre }, "quick");
    this.weekend = null;
    this.run = this.runFor("quick", "race");
    this.audio.unlock();
    this.startGame();
    this.toast(`Duel: draw a lap to beat <b>${esc(st.duel.name || "the challenger")}</b>`);
  }

  /** The duel code for the line the player has just driven: paste it into the track phrase box to race against it. */
  private myDuelCode(): string | null {
    const line = this.me?.lines.at(-1);
    if (!line || !isComplete(this.track, line)) return null;
    const r = this.run, s = this.settings;
    return duelCode({ phrase: this.track.phrase, laps: r.kind === "race" ? r.laps : 3, mode: "race", rivals: 1, car: s.car, obstacles: false, realism: r.kind === "race" && r.realism, playing: true, startTyre: s.startTyre, pitPlan: [], line, duel: { name: this.online.name, vehicle: this.vehicle } });
  }

  /** A button that copies the player's duel code, and says what to do with it. */
  private duelButton(label: string): string { return this.myDuelCode() ? `<button id="duelcode" title="Copies a code: a friend pastes it into the track phrase box in race setup and races your line">${label}</button>` : ""; }
  private wireDuelButton(el: HTMLElement): void {
    const b = el.querySelector<HTMLButtonElement>("#duelcode");
    if (!b) return;
    b.addEventListener("click", () => { const code = this.myDuelCode(); if (code) void copyText(code).then((ok) => { b.textContent = ok ? "Copied: send it to a friend" : "Could not copy"; }); });
  }

  /** Today's track, as a Time Trial in the garage car. */
  private startDaily(): void {
    const date = dailyDate(new Date());
    this.beginSpecial({ kind: "daily", date }, { phrase: dailyPhrase(date) }, "trial");
    this.weekend = null;
    this.run = this.runFor("trial", "trial");
    this.audio.unlock();
    this.startGame();
  }

  private renderChallenges(): void {
    const el = this.menuPanel(challengesHtml({ stars: this.challenges.stars, total: totalStars(this.challenges) }), "wide");
    this.on(el, "#back", () => this.go("home"));
    for (const c of CHALLENGES) {
      const b = el.querySelector<HTMLButtonElement>(`#ch-${c.id}`)!;
      if (!isUnlocked(c.difficulty, this.records)) {
        b.classList.add("locked"); b.setAttribute("aria-disabled", "true"); b.dataset["tip"] = lockReason(c.difficulty);
        b.addEventListener("click", () => { el.querySelectorAll(".tipping").forEach((x) => x.classList.remove("tipping")); b.classList.add("tipping"); setTimeout(() => b.classList.remove("tipping"), 2600); });
      } else this.on(el, `#ch-${c.id}`, () => this.startChallenge(c));
    }
  }

  private startChallenge(c: Challenge): void {
    this.beginSpecial({ kind: "challenge", id: c.id }, { phrase: c.phrase, laps: c.laps, rivals: c.rivals, difficulty: c.difficulty, realism: c.realism }, "quick");
    this.weekend = null;
    this.run = this.runFor("quick", "race");
    this.audio.unlock();
    this.startGame();
  }

  private renderChampionship(): void {
    const c = this.champ;
    const pick = this.champPick;
    if (!isUnlocked(pick.difficulty, this.records)) pick.difficulty = highestUnlocked(this.records);
    const rows = c ? standings(c).map((r) => ({ name: r.name, points: r.points, wins: r.wins, me: r.id === ME })) : [];
    const landVehicles = VEHICLE_IDS.filter((v) => VEHICLES[v].domain === "land").map((v) => ({ value: v, label: VEHICLES[v].name }));
    const el = this.menuPanel(championshipHtml({
      season: c ? { round: c.done, of: c.rounds.length, over: isOver(c), next: nextPhrase(c), difficulty: c.difficulty, vehicle: VEHICLES[c.vehicle].name, rows } : null,
      locks: Object.fromEntries(DIFFICULTIES.map((d) => [d, isUnlocked(d, this.records) ? "" : lockReason(d)])) as Record<Difficulty, string>,
      chosen: pick.difficulty, vehicles: landVehicles, vehicle: pick.vehicle,
    }), "wide");
    this.on(el, "#back", () => this.go("race"));
    this.on(el, "#champ-go", () => this.startChampRound());
    this.on(el, "#champ-new", () => { this.champ = null; void save("championship", null); this.renderChampionship(); });
    this.on(el, "#champ-quit", () => {
      void (async () => {
        if (!(await this.confirmDialog("Abandon the season?", "The points so far are lost.", "Abandon it"))) return;
        this.champ = null; void save("championship", null); this.renderChampionship();
      })();
    });
    this.on(el, "#champ-start", () => {
      this.champ = newChampionship((Math.random() * 2 ** 32) >>> 0, pick.difficulty, pick.vehicle, this.settings.laps, this.settings.rivals);
      void save("championship", this.champ);
      this.startChampRound();
    });
    for (const d of DIFFICULTIES) {
      const b = el.querySelector<HTMLButtonElement>(`#cd-${d}`);
      if (!b) continue;
      if (isUnlocked(d, this.records)) this.on(el, `#cd-${d}`, () => { pick.difficulty = d; this.renderChampionship(); });
      else b.addEventListener("click", () => { el.querySelectorAll(".tipping").forEach((x) => x.classList.remove("tipping")); b.classList.add("tipping"); setTimeout(() => b.classList.remove("tipping"), 2600); });
    }
    wireControls(el, { change: (id, v) => { if (id === "champ-vehicle" && isVehicleId(v)) { pick.vehicle = v; this.renderChampionship(); } } });
  }

  /**
   * Hand out the trophies a session has earned (null: only the ones that come from the totals, such as circuits found), with a toast each, and say
   * when one opens something for the livery.
   */
  private award(r: RunSummary | null): void {
    const sum: RunSummary = r ?? { mode: "trial", position: null, field: 1, grid: null, laps: 0, difficulty: "easy", realism: false, pits: 0, emergencies: 0, safetyCar: false, rain: false, golfStars: 0, careerTier: this.career.tier };
    const got = newTrophies(sum, { ...this.stats, circuits: Object.keys(this.found).length }, this.trophies);
    if (!got.length) return;
    for (const t of got) {
      this.trophies[t.id] = Date.now();
      this.trophyCard("🏆", t.name, t.blurb, t.reward ? `New for the livery: ${REWARD_NAMES[t.reward]}` : "");
    }
    void save("trophies", this.trophies);
  }

  /** The atlas: the real circuits found and not yet, and the trophies. */
  private renderAtlas(): void {
    const real = CIRCUITS.filter((c) => !c.kart);
    const bestOn = (id: string): number | undefined => { let b: number | undefined; for (const [k, v] of Object.entries(this.best)) if (k.startsWith(`${id}:`) || k === id) b = b === undefined ? v : Math.min(b, v); return b; };
    const el = this.menuPanel(atlasHtml({
      circuits: real.map((c) => ({ name: this.found[c.id] ? c.name : null, km: c.lengthKm, best: this.found[c.id] ? (bestOn(c.id) !== undefined ? fmt(bestOn(c.id)!) : null) : null, fictional: !!c.fictional })),
      trophies: TROPHIES.map((t) => ({ name: t.name, blurb: t.blurb, when: this.trophies[t.id] ?? null, reward: t.reward ? REWARD_NAMES[t.reward] : null })),
    }), "wide");
    this.on(el, "#back", () => this.go("attack"));
  }

  /** The career: the ladder of rungs, and the season on the player's own. */
  private renderCareer(): void {
    const c = this.career, cur = c.current;
    const el = this.menuPanel(careerHtml({
      tiers: CAREER_TIERS.map((t, i) => ({ name: t.name, vehicle: VEHICLES[t.vehicle].plural, difficulty: DIFFICULTY_NAMES[t.difficulty], laps: t.laps, field: t.rivals + 1, state: i < c.tier ? "done" : i === c.tier ? "now" : "locked", best: c.best[i] ?? null })),
      season: cur ? { round: cur.done, of: cur.rounds.length, next: nextPhrase(cur), rows: standings(cur).slice(0, 8).map((r) => ({ name: r.name, points: r.points, wins: r.wins, me: r.id === ME })) } : null,
      promote: PROMOTE_PLACE,
    }), "wide");
    this.on(el, "#back", () => this.go("race"));
    this.on(el, "#career-start", () => { this.career = startSeason(this.career, (Math.random() * 2 ** 32) >>> 0); void save("career", this.career); this.startChampRound(true); });
    this.on(el, "#career-go", () => this.startChampRound(true));
    this.on(el, "#career-quit", () => {
      void (async () => {
        if (!(await this.confirmDialog("Abandon the season?", "The points so far are lost; the rung stays open.", "Abandon it"))) return;
        this.career = { ...this.career, current: null }; void save("career", this.career); this.renderCareer();
      })();
    });
  }

  /** The next round of the season (the career's, or the championship's): a qualifier, then the race. */
  private startChampRound(career = false): void {
    const c = career ? this.career.current : this.champ;
    const phrase = c ? nextPhrase(c) : null;
    if (!c || !phrase) return;
    this.beginSpecial({ kind: "champ", career }, { phrase, laps: c.laps, rivals: c.rivals, difficulty: c.difficulty, realism: true }, "weekend");
    this.weekend = skipTo(newWeekend(), "qualifying");
    this.practiceSecs = 0;
    this.run = this.runFor("weekend", "qualifying");
    this.audio.unlock();
    this.startGame();
  }

  // ---------- garage ----------
  private showGarage(): void {
    const car = this.settings.car;
    const liv: Livery = { ...DEFAULT_LIVERY, ...this.settings.livery };
    const hex = (c: number): string => `#${c.toString(16).padStart(6, "0")}`;
    const kindNow = this.pickVehicle(placeFor(this.settings.phrase).choices);
    const rewards = rewardsOf(this.trophies);
    const colours = [...LIVERY_COLORS, ...(rewards.has("gold") ? [GOLD] : []), ...(rewards.has("chrome") ? [CHROME] : [])];
    const stripes = [0, 1, 2, 3, ...(rewards.has("chequer") ? [4] : []), ...(rewards.has("chevron") ? [5] : [])];
    const swatches = (which: "primary" | "secondary", label: string) => `<div class="swatches" data-sw="${which}" role="group" aria-label="${label}">${colours.map((c) => `<button class="sw${c === liv[which] ? " on" : ""}" data-c="${c}" style="background:${hex(c)}" aria-label="${label} ${hex(c)}"></button>`).join("")}</div>`;
    // a small drawing of each stripe style, in the colours chosen
    const stripeArt = (n: number): string => {
      const r = (y0: number, y1: number) => `<rect x="9" y="${y0}" width="46" height="${y1 - y0}" fill="${hex(liv.secondary)}"/>`;
      const sq = (x: number, y: number) => `<rect x="${x}" y="${y}" width="6" height="6" fill="${hex(liv.secondary)}"/>`;
      const extra = n === 4 ? [3, 15].map((x0) => [0, 1].map((i) => [0, 1, 2, 3].map((j) => ((i + j) % 2 ? "" : sq(x0 + 6 * i + (x0 > 3 ? 31 : 0), 4 + 6 * j))).join("")).join("")).join("")
        : n === 5 ? [16, 28, 40].map((x) => `<path d="M${x} 16l-8-9h5l8 9-8 9h-5z" fill="${hex(liv.secondary)}"/>`).join("") : "";
      return `<svg viewBox="0 0 64 32" width="64" height="32" aria-hidden="true"><rect x="3" y="4" width="58" height="24" fill="${hex(liv.primary)}" stroke="#0b1020" stroke-width="2"/>${n === 1 ? r(13, 19) : n === 2 ? r(9, 13) + r(19, 23) : n === 3 ? r(5, 9) + r(23, 27) : extra}</svg>`;
    };
    const el = this.menuPanel(`
      <header class="tilehead"><button class="back" id="back">← Done</button><div><h2>Garage</h2>
        <p class="dim">Spend up to ${CAR_BUDGET} points. Every stat helps somewhere and costs somewhere else.</p>
        <p class="dim">${this.garageFrom === "home" ? "Your levels are scaled to suit whichever machine you race: pick one in the race setup." : (() => { const v = VEHICLES[this.pickVehicle(placeFor(this.settings.phrase).choices)]; return `For <b>${esc(this.settings.phrase)}</b> the field is <b>${esc(v.plural)}</b>, and your levels are scaled to suit. ${esc(v.blurb)}`; })()}</p></div></header>
      <div class="garage">
        <section class="gp hero" style="--c:${hex(liv.primary)}">
          <img id="livprev" alt="Your car" />
          <div class="herocap"><input id="name" type="text" value="${esc(car.name)}" maxlength="30" aria-label="Setup name" /><span class="dim">${esc(VEHICLES[kindNow].name)}</span></div>
        </section>
        <section class="gp setup" style="--c:#2fbf71">
          <h3>Setup <em class="${carCost(car) > CAR_BUDGET ? "bad" : ""}">${carCost(car)} / ${CAR_BUDGET} points</em></h3>
          ${STATS.map((st) => `<div class="statrow"><b>${STAT_LABEL[st]}</b><button class="sq" data-s="${st}" data-d="-1" aria-label="Less ${STAT_LABEL[st]}">−</button>
            <span class="segs" aria-label="${car[st]} of ${STAT_MAX}">${Array.from({ length: STAT_MAX }, (_, n) => `<i class="${n < car[st] ? "on" : ""}"></i>`).join("")}</span>
            <button class="sq" data-s="${st}" data-d="1" aria-label="More ${STAT_LABEL[st]}">+</button><em>${car[st]}</em></div>`).join("")}
          <div class="gactions"><button id="save">Save this setup</button><button id="reset">Reset</button></div>
        </section>
        <section class="gp paint" style="--c:#7a5cf0">
          <h3>Livery <em>how your car looks on the track</em></h3>
          <label>Body</label>${swatches("primary", "Body colour")}
          <label>Stripes and number</label>${swatches("secondary", "Stripe colour")}
          <div class="paintrow">
            <div><label>Stripes</label><div class="stripes">${stripes.map((n) => `<button class="sq stripe${n === liv.stripe ? " on" : ""}" data-stripe="${n}" aria-label="${["No stripe", "Centre stripe", "Twin stripes", "Side stripes", "Chequered", "Chevrons"][n]}">${stripeArt(n)}</button>`).join("")}</div></div>
            <div><label for="livnum">Number</label><input id="livnum" type="number" min="0" max="99" value="${liv.number || ""}" placeholder="#" /></div>
          </div>
        </section>
        <section class="gp saved" style="--c:#1fa5d8">
          <h3>Saved setups <em>${this.cars.length ? `${this.cars.length} kept` : "none yet"}</em></h3>
          ${this.cars.length ? this.cars.map((c, i) => `<div class="savedrow"><span>${esc(c.name)} <em>${c.accel}/${c.top}/${c.grip}/${c.brake}</em></span><button class="sq text" data-load="${i}">Use</button><button class="sq text" data-del="${i}">Delete</button></div>`).join("") : '<p class="dim">Press Save this setup to keep a set of stats you like.</p>'}
        </section>
      </div>`, "tiles");
    const name = el.querySelector<HTMLInputElement>("#name")!;
    name.addEventListener("input", () => { car.name = name.value; });
    // the livery: every change is kept and the picture of the car redrawn
    const prev = el.querySelector<HTMLImageElement>("#livprev")!;
    const kind = this.pickVehicle(placeFor(this.settings.phrase).choices);
    const paint = (): void => { this.settings.livery = { ...liv }; void this.view.carImage(kind, liv).then((u) => { prev.src = u; }).catch(() => {}); };
    paint();
    el.querySelectorAll<HTMLButtonElement>(".swatches .sw").forEach((b) => b.addEventListener("click", () => {
      liv[(b.parentElement!.dataset["sw"] as "primary" | "secondary")] = Number(b.dataset["c"]);
      this.settings.livery = { ...liv };
      this.persist(); this.showGarage();
    }));
    el.querySelectorAll<HTMLButtonElement>("button[data-stripe]").forEach((b) => b.addEventListener("click", () => { liv.stripe = Number(b.dataset["stripe"]) as Livery["stripe"]; this.persist(); this.settings.livery = { ...liv }; this.persist(); this.showGarage(); }));
    el.querySelector<HTMLInputElement>("#livnum")?.addEventListener("change", (e) => { liv.number = Math.max(0, Math.min(99, Math.floor(Number((e.target as HTMLInputElement).value)) || 0)); paint(); this.persist(); });
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
    this.on(el, "#back", () => { this.persist(); this.go(this.garageFrom); });
  }

  /** which cars were in the air at the last frame, to sound the take-off and the landing once */
  private airborne = new Map<string, boolean>();

  /** The machine for a track: the one chosen in setup if the track offers it, else its own (the first of its choices). */
  private pickVehicle(choices: VehicleId[]): VehicleId {
    // a Daily and a Championship race the machine they say; a Challenge the one it names, if the track has it
    { const c = this.special?.kind === "champ" ? this.season() : null; if (c && choices.includes(c.vehicle)) return c.vehicle; }
    if (this.special?.kind === "challenge") { const c = challengeById(this.special.id); return c?.vehicle && choices.includes(c.vehicle) ? c.vehicle : choices[0]!; }
    if (this.special?.kind === "daily" || this.special?.kind === "golf") return choices[0]!;
    if (this.special?.kind === "duel") { const v = this.special.vehicle; return choices.includes(v as VehicleId) ? (v as VehicleId) : choices[0]!; }
    const v = this.settings.vehicle;
    // a kart course starts on a kart: a machine picked for some other track is not carried over, only one picked while this course was in setup
    const phrase = normalizePhrase(this.settings.phrase);
    if (KART_CIRCUITS.has(circuitFor(phrase)?.id ?? "") && this.settings.vehiclePhrase !== phrase) return choices[0]!;
    return v && choices.includes(v) ? v : choices[0]!;
  }

  // ---------- a game ----------
  /** `resume`: the drawing a share link brought back, in which case the race itself starts from scratch. */
  private startGame(resume: Line | null = null, fromLink = false): void {
    const s = this.settings;
    const carErr = validateCar(s.car);
    if (carErr) { this.note = `Car: ${carErr}`; this.openMenu(); return; }
    // the title already built this track (and its scenery) behind the menu
    if (this.inGame || this.previewKey !== `${normalizePhrase(s.phrase)}|${s.obstacles}`) this.track = generateTrack(s.phrase, { obstacles: s.obstacles });
    this.vehicle = this.pickVehicle(vehicleChoicesForTrack(this.track));
    // a real circuit, found: it goes in the atlas
    if (this.track.circuit && !this.track.circuit.theme && !KART_CIRCUITS.has(this.track.circuit.id) && !this.found[this.track.circuit.id]) {
      this.found[this.track.circuit.id] = Date.now(); void save("found", this.found);
      this.trophyCard("🗺️", `Found: ${this.track.circuit.name}`, "A real circuit, in the atlas now", "");
      this.award(null);
    }
    this.preloadGhosts();
    this.ambient = null; this.previewKey = "";
    this.audio.setBiome(this.track.biome);
    this.play = null; this.audio.stopAll(); this.updateRain(0);
    this.view.clearCars();
    this.closeMenu();
    this.race = undefined;
    if (!fromLink) this.settings.pitPlan = [];
    this.planOpen = false;
    this.eventIdx = 0;
    this.pick = null;
    this.view.livery = this.settings.livery;
    this.view.setTrack(this.track);
    this.roughTrack = this.track.allSegments.some((s) => s.surface);
    this.view.resetCamera();
    this.inGame = true;
    this.menuBtn.style.display = "block";
    const n = this.track.segments.length;
    const phraseKey = normalizePhrase(s.phrase);
    let line = resume && resume.start && this.routeStarts(resume) ? resume : null;
    // nothing brought a line with it (a link, or one carried over from this visit): the one kept for this track, if it still fits
    if (!line && !(this.carry && this.carry.phrase === phraseKey)) {
      const kept = this.storedLine(phraseKey);
      if (kept && kept.start && this.routeStarts(kept)) line = kept;
    }
    this.shareLine = line ?? undefined;
    this.syncHash();
    void fromLink;
    const carried = !line && this.carry && this.carry.phrase === normalizePhrase(s.phrase) && isComplete(this.track, this.carry.line) && validateLine(this.track, this.carry.line).ok ? this.carry.line : null;
    if (carried) { this.currentLine = carried; this.shareLine = carried; this.lapNo = 0; this.syncHash(); this.showPicker(null); }
    else if (line && isComplete(this.track, line)) { this.currentLine = line; this.lapNo = 0; this.showPicker(null); }
    else if (line && line.segs.length > 0) {
      this.lapNo = 0;
      this.view.sky.setActive(false);
      this.draw = { mode: "lap", line, seg: line.segs.length, id: nextOf(this.track, idAt(line, line.segs.length - 1)), pts: [], end: null, queue: [], drag: null, warn: "" };
      this.renderDraw();
    } else this.beginLapDraw();
  }

  /** The line as the server will see it (points to 0.01), so the time shown here is the time it will get there. */
  private driven(): Line { return roundLine(this.currentLine); }

  /** What the player drives: their own stats in this track's kind of machine. */
  private playerCar(): CarConfig { return { ...this.settings.car, type: this.vehicle }; }

  /** What a lap costs the player's car in fuel in this session: the place's thirst and the multiplier the race really uses (`fuelMultFor`), as the race burns it. */
  private fuelLap(): number {
    const len = trackLength(this.track), place = BIOMES[this.track.biome].fuel;
    return fuelPerLap(this.playerCar(), this.run.laps, len) * place * fuelMultFor(this.playerCar(), this.run.laps, len, place, this.run.wearFuel);
  }

  /**
   * How fast the player's car goes round a line, for the speed colours and the predicted lap: a flying lap with no tyres, fuel or traffic. A lap still
   * being drawn is filled in the way "finish for me" would (only the part drawn is shown). Kept for the last line asked about: the map is redrawn on
   * every drag, but the line under it only changes when a segment is finished.
   */
  private lineProfile(line: Line | null): Profile | null {
    if (!line || !line.segs.length) return null;
    const car = this.playerCar(), key = `${this.track.phrase}|${this.vehicle}|${car.accel}${car.top}${car.grip}${car.brake}|${JSON.stringify(line)}`;
    if (this.speedKey === key) return this.speedProf;
    let prof: Profile | null = null;
    try { prof = buildProfile(this.track, isComplete(this.track, line) ? line : completeLine(this.track, line), car); } catch { prof = null; }
    this.speedKey = key; this.speedProf = prof;
    return prof;
  }
  private speedKey = "";

  /**
   * Where the player's line loses time against the best computer line, both driven by the player's own car on a flying lap with no traffic,
   * segment by segment: the three worst, and the whole lap. The segments are lit on the map. Empty when there is nothing to say.
   */
  private lineDeltas(): string {
    const line = this.me?.lines.at(-1) ?? this.currentLine;
    const mine = line ? this.lineProfile(line) : null;
    if (!line || !mine || !isComplete(this.track, line)) return "";
    let ref: Profile;
    try { ref = buildProfile(this.track, botLine(this.track, 5, 1), this.playerCar()); } catch { return ""; }
    const a = segmentTimes(mine), b = segmentTimes(ref);
    const worst = [...a].filter(([id]) => b.has(id)).map(([id, t]) => ({ id, d: realSeconds(t - b.get(id)!) })).filter((x) => x.d >= 0.05).sort((x, y) => y.d - x.d).slice(0, 3);
    const total = realSeconds(mine.ideal - ref.ideal);
    this.view.drawTrack(this.track, { visible: null, selected: new Set(worst.map((x) => x.id)) });
    const head = Math.abs(total) < 0.05 ? "as quick as" : total > 0 ? `<b class="bad">${total.toFixed(2)}s</b> a lap slower than` : `<b class="good">${(-total).toFixed(2)}s</b> a lap quicker than`;
    return `<div class="deltas" title="Both in your car, on a flying lap with nobody in the way"><span>Your line is ${head} the best computer line</span>${worst.length ? `<ul>${worst.map((x) => `<li>Seg ${this.posOf(line, x.id) + 1} <b class="bad">+${x.d.toFixed(2)}</b></li>`).join("")}</ul>` : ""}</div>`;
  }
  private speedProf: Profile | null = null;

  /** Draw a line in its speed colours (after `drawCurves`). */
  private drawSpeedLine(prof: Profile, keep?: (seg: number) => boolean, alpha = 1, width = 3.2): void {
    // (from the slowest point of the lap to the fastest, so the corners stand out whatever the car and the ground)
    let vmin = Infinity, vmax = 1;
    for (let i = 0; i < prof.n; i++) { vmin = Math.min(vmin, prof.vFly[i]!); vmax = Math.max(vmax, prof.vFly[i]!); }
    this.view.drawSpeed({ x: prof.x, y: prof.y, v: prof.vFly, vmin, vmax, closed: !prof.open, alpha, width, ...(keep ? { keep: (i: number) => keep(prof.seg[i]!) } : {}) });
  }

  private ghostQuery(limit: number): { phrase: string; vehicle: string; limit: number; time?: number } {
    const phrase = normalizePhrase(this.settings.phrase);
    const vehicle = this.pickVehicle(placeFor(phrase).choices);
    const tt = this.best[trialKey(phrase, vehicle)];
    // (other players' lines come from the server, which only ever runs fields of the size it allows)
    return { phrase, vehicle, limit: Math.min(limit, MAX_RACE_RIVALS), ...(tt !== undefined ? { time: tt } : {}) };
  }

  /** Ask the server for rivals ahead of time, so they are ready when the race starts. Silent if it cannot be reached. */
  private preloadGhosts(): void {
    if (this.flow === "trial" || this.special || !ghostsAllowed(this.settings.difficulty)) return;
    this.online.preload(this.ghostQuery(this.settings.rivals));
  }

  /** Other players' lines first (whatever has arrived), then computer-driven rivals for the rest of the places. */
  private makeRivals(count: number): Entrant[] {
    const out: Entrant[] = [];
    const d = this.run.difficulty;
    { const c = this.special?.kind === "champ" ? this.season() : null; if (c) return makeBots(this.track, this.vehicle, 0, count, d, rosterOf(c)); }
    // a duel: the challenger's lap and car, and nobody else (their line is the same on every lap: it is the lap they sent)
    if (this.special?.kind === "duel") return [{ id: "duel", name: this.special.name, car: { ...this.special.car, type: this.vehicle }, lines: [roundLine(this.special.line)] }];
    if (this.special || !ghostsAllowed(d)) return makeBots(this.track, this.vehicle, 0, count, d);
    const q = { ...this.ghostQuery(count), phrase: this.track.phrase, vehicle: this.vehicle };
    const t = this.best[trialKey(this.track.phrase, this.vehicle)];
    if (t !== undefined) q.time = t; else delete q.time;
    for (const g of this.online.ghosts(q, this.track).slice(0, count)) {
      // gridTime puts them where their own time says; no `bot` field, so nothing ever redraws their line
      out.push({ id: `ghost:${g.id}`, name: g.name, car: { ...g.car, type: this.vehicle }, lines: [g.line], gridTime: g.time });
    }
    return out.concat(makeBots(this.track, this.vehicle, out.length, count, d));
  }

  // ---------- drawing and editing ----------
  private beginLapDraw(): void {
    this.lapNo = 0;
    this.pick = null;
    this.view.sky.setActive(false);
    this.draw = { mode: "lap", line: null, seg: 0, id: 0, pts: [], end: null, queue: [], drag: null, warn: "" };
    this.renderDraw();
  }

  private joinPoint(d: DrawState): Vec2 | null { return d.line ? joinBefore(d.line, d.seg) : null; }

  /** Is this (partial) line a legal start of a route round the track? Used for lines that come from a link. */
  private routeStarts(line: Line): boolean {
    const t = this.track;
    for (let k = 0; k < line.segs.length; k++) {
      const id = idAt(line, k);
      if (k === 0 ? id !== 0 : !exitsAfter(t, idAt(line, k - 1)).includes(id)) return false;
    }
    return line.segs.length > 0 && !(nextOf(t, idAt(line, line.segs.length - 1)) === 0 && !isComplete(t, line)) && line.segs.length <= 128;
  }

  /** The last segment of a lap ends on the start line. */
  private isLast(d: DrawState): boolean { return nextOf(this.track, d.id) === 0; }

  private exitPoint(d: DrawState): Vec2 | null {
    const t = this.track;
    if (this.isLast(d)) return d.line?.start ?? null;
    if (d.end) return d.end;
    const j = this.joinPoint(d);
    return j ? projectToGate(t.allSegments[d.id]!.exit, d.pts.at(-1) ?? j) : null;
  }

  private handles(d: DrawState): { kind: HandleKind; i: number; p: Vec2 }[] {
    const out: { kind: HandleKind; i: number; p: Vec2 }[] = [];
    const j = this.joinPoint(d), e = this.exitPoint(d);
    if (j) out.push({ kind: "join", i: 0, p: j });
    d.pts.forEach((p, i) => out.push({ kind: "pt", i, p }));
    if (j && e) out.push({ kind: "end", i: 0, p: e });
    // where the road forks, the exit of the other way on is a handle too: drag the end to it, or tap it
    if (!this.isLast(d)) {
      const t = this.track;
      for (const c of t.allSegments[d.id]!.alt ?? []) out.push({ kind: "alt", i: c, p: t.allSegments[c]!.exit.mid });
    }
    return out;
  }

  private hit(d: DrawState, p: Vec2, touch = false): { kind: HandleKind; i: number } | null {
    const r = Math.max(4, (touch ? 26 : 11) / this.view.scale);
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
    const cell = t.allSegments[d.id]!, m = 8;
    // (at a fork the view takes in both exits, so there is a way on to see and tap, clear of the panel at the bottom)
    const alts = (cell.alt ?? []).map((c) => t.allSegments[c]!);
    // (the cell, widened to take in any road that spills out of it: a wide arc, a mapped circuit)
    const rect = alts.length ? segmentRect([cell, ...alts], m + 30) : t.free ? segmentRect([cell], m) : cellRect(cell, m);
    const key = `${d.mode}:${d.id}`;
    this.view.setFocus(rect, key !== this.focusKey);
    this.focusKey = key;
    // drawing a lap, only the road so far is shown in full, and, where it forks, the other way on too
    let visible: Set<number> | null = null;
    if (d.mode === "lap") {
      visible = new Set([d.id, ...(t.allSegments[d.id]!.alt ?? [])]);
      if (d.line) for (let k = 0; k < d.seg; k++) visible.add(idAt(d.line, k));
    }
    this.view.drawTrack(t, { visible, selected: d.mode === "amend" ? new Set([d.id]) : undefined });
    const curves: { pts: Vec2[]; color: number; width?: number; alpha?: number }[] = [];
    const pv = this.preview(d);
    if (pv) curves.push({ pts: pv.curve, color: pv.ok ? 0xffffff : 0xff5d6c, width: 3 });
    this.view.drawCurves([]);
    // the line so far in its speed colours (the segment being drawn is left out: it is the white or red preview)
    const prof = d.line ? this.lineProfile(d.line) : null;
    if (prof && d.line) {
      const drawn = new Set(d.line.segs.map((_, k) => idAt(d.line!, k)));
      if (d.mode === "lap") this.drawSpeedLine(prof, (sg) => drawn.has(sg) && sg !== d.id, 0.9, 2.6);
      else this.drawSpeedLine(prof, (sg) => sg !== d.id, 0.55, 2.4);
    } else if (d.mode === "lap" && d.line && d.line.segs.length) {
      curves.unshift({ pts: smooth([d.line.start, ...d.line.segs.flat()], false).map((x) => x.p), color: PLAYER_COLOR, width: 2, alpha: 0.55 });
    }
    this.view.drawCurvesOver(curves);
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
    const status = needStart ? `${coarse() ? "Tap" : "Click"} the white start line to place your start.` : pv ? (pv.ok ? '<span class="good">Line is clear</span>' : '<span class="bad">Line leaves the road or hits something</span>') : "";
    const forks = !this.isLast(d) && (this.track.allSegments[d.id]!.alt?.length ?? 0) > 0;
    const last = d.mode === "lap" && this.isLast(d) ? ' <span class="dim">· last segment: it returns to your start</span>' : forks ? ` <span class="dim">· the road splits here: ${coarse() ? "tap" : "click"} the faint diamond to take the other way, or drag the end onto it</span>` : "";
    this.bar.set([
      { id: "undo", label: "Undo", color: "orange", tip: "Take back the last point you placed (Backspace, or right-click a point to delete just that one).", onClick: () => this.undo() },
      ...(coarse() ? [{ id: "tool", label: TOOL_LABEL[this.tool], color: "cyan" as const, tip: "What a tap does: add a point, insert one on the line, or delete one.", onClick: () => { this.tool = TOOL_NEXT[this.tool]; this.renderDraw(); } }] : []),
      { id: "clear", label: "Clear", color: "pink", tip: "Remove every point you have placed in this segment and start it again.", onClick: () => { d.pts = []; d.end = d.mode === "amend" ? d.end : null; if (needStart) d.line = null; this.renderDraw(); } },
      ...(this.run.realism ? [{ id: "pits", label: "Pit strategy", color: "violet" as const, tip: "Queue pit stops: pick the lap and the tyre. Up to 5, one per lap.", onClick: () => this.togglePlan() }] : []),
      { id: "fin", label: "Finish segment", color: "yellow", wide: true, disabled: !(pv && pv.ok && !needStart), tip: "Lock in this segment (Enter). Click to place points; drag any point, the square (where it starts) or the diamond (where it ends) to move it along the road edge; Shift+click inserts a point.", onClick: () => this.finishSegment() },
      ...(d.mode === "amend" ? [{ id: "cancel", label: "Cancel", color: "grey" as const, tip: "Throw these edits away and go back to the map.", onClick: () => { this.draw = null; this.showPicker(null); } }] : []),
    ], `<b>${title}</b>${last}${this.special?.kind === "golf" && d.mode === "lap" ? ` <span class="golfpts">· ${(d.line ? linePoints(d.line) : 0) + d.pts.length} points so far, par ${golfPar(this.track)}</span>` : ""}<br/>${status}${d.warn ? `<br/><span class="bad">${esc(d.warn)}</span>` : ""}`);
    if (this.planOpen) this.renderPlan();
    this.updateTutorial();
  }

  // ---------- drawing actions, shared by pointer and gamepad ----------
  private deletePt(d: DrawState, i: number): void { d.pts.splice(i, 1); d.warn = ""; this.renderDraw(); }

  /** Start dragging a handle. A hollow fork diamond instead takes the other way on, and its end can be dragged from there. */
  private grab(d: DrawState, h: { kind: HandleKind; i: number }, p: Vec2): void {
    if (h.kind === "alt") {
      const t = this.track, was = d.end ?? this.exitPoint(d) ?? p;
      d.id = h.i;
      d.end = projectToGate(t.allSegments[h.i]!.exit, was);
      d.warn = "";
      d.drag = { kind: "end", i: 0 };
    } else d.drag = h;
    this.drawWorld();
  }

  /**
   * Why a waypoint cannot go at p, or null if it can: it has to be on the road being drawn (the way the line is checked later, with the kerb
   * allowed) and not crowd the start or end of the segment or another point, which only makes the line kink. `except` is a point being moved.
   */
  private pointProblem(d: DrawState, p: Vec2, except = -1): string | null {
    const t = this.track;
    const roads = [d.id, ...(t.allSegments[d.id]!.alt ?? [])].map((id) => t.allSegments[id]!);
    const onRoad = roads.some((seg) => {
      let best = -Infinity;
      for (let i = 0; i < seg.center.length - 1; i++) best = Math.max(best, halfAt(seg, (i + 0.5) / (seg.center.length - 1)) - distToSegment(p, seg.center[i]!, seg.center[i + 1]!));
      return best >= CAR_R - KERB_ALLOW;
    });
    if (!onRoad || !isDrivable(t, p)) return "A point has to be on the road.";
    const others = [this.joinPoint(d), this.exitPoint(d), ...d.pts.filter((_, i) => i !== except)];
    if (others.some((q) => q && Math.hypot(q.x - p.x, q.y - p.y) < MIN_NODE_GAP)) return "Too close to another point.";
    return null;
  }

  /** A click on empty road: the start point of the lap, or a new waypoint. */
  private placeAt(d: DrawState, p: Vec2): void {
    d.warn = "";
    if (d.mode === "lap" && d.seg === 0 && !d.line) d.line = beginLine(this.track, p);
    else {
      const why = d.line ? this.pointProblem(d, p) : null;
      if (why) { d.warn = why; this.renderDraw(); return; }
      this.insertPoint(d, p);
    }
    this.renderDraw();
  }

  /** Move whatever handle is being dragged to p. */
  private dragTo(d: DrawState, p: Vec2): void {
    if (!d.drag || !d.line) return;
    const t = this.track, last = this.isLast(d);
    if (d.drag.kind === "pt") {
      // a point being dragged stays where it was while the pointer is somewhere it could not go
      const why = this.pointProblem(d, p, d.drag.i);
      if (why) { if (d.warn !== why) { d.warn = why; this.renderDraw(); } return; }
      if (d.warn) { d.warn = ""; this.renderDraw(); }
      d.pts[d.drag.i] = p;
    }
    else if (d.drag.kind === "join") d.line = moveJoin(t, d.line, d.seg, p);
    else if (last) d.line = moveJoin(t, d.line, 0, p); // the last segment ends on the start line
    else {
      // where the road forks the end node snaps to whichever of the exits is nearer, and that is the way the lap goes on
      let id = d.id;
      let bd = Infinity;
      for (const c of [d.id, ...(t.allSegments[d.id]!.alt ?? [])]) {
        const q = projectToGate(t.allSegments[c]!.exit, p), dd = Math.hypot(q.x - p.x, q.y - p.y);
        if (dd < bd) { bd = dd; id = c; }
      }
      d.id = id;
      d.end = projectToGate(t.allSegments[id]!.exit, p);
    }
    this.drawWorld();
  }

  private releaseDrag(d: DrawState): void { d.drag = null; d.warn = ""; this.renderDraw(); }

  private onPointerDown(e: PointerEvent): void {
    const d = this.draw;
    const p = this.view.toWorld(e.clientX, e.clientY);
    const touch = e.pointerType === "touch";
    if (touch) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        // a second finger turns the gesture into pinch zoom and two-finger pan (while drawing, just the pan)
        this.pan = null;
        if (d && this.placed && performance.now() - this.placed.at < 450 && d.pts.length) { d.pts.pop(); this.renderDraw(); }
        this.cancelHold();
        if (d?.drag) { d.drag = null; }
        this.pinch = this.pinchNow();
        return;
      }
      if (this.touches.size > 1) return;
    }
    if (d) {
      if (e.button === 1 || (e.button === 0 && this.spaceDown && !touch)) {
        // middle button, or space and drag: slide the view a little
        this.pan = { lx: e.clientX, ly: e.clientY, sx: e.clientX, sy: e.clientY, moved: true, button: e.button, world: p };
        this.app.canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      if (e.button === 2) {
        const h = this.hit(d, p);
        if (h?.kind === "pt") this.deletePt(d, h.i); else this.undo();
        return;
      }
      if (e.button !== 0) return;
      const h = this.hit(d, p, touch);
      const tool = e.shiftKey ? "insert" : touch ? this.tool : "add";
      if (touch && tool === "delete") {
        if (h?.kind === "pt") { this.vibrate(); this.deletePt(d, h.i); }
        return;
      }
      if (h && !(touch && tool === "insert")) {
        this.grab(d, h, p);
        this.app.canvas.setPointerCapture(e.pointerId);
        if (touch && h.kind === "pt") this.startHold(e, h.i);
        return;
      }
      this.placeAt(d, p);
      if (touch) this.placed = { at: performance.now() };
    } else if (this.view.cameraMode === "overview") {
      // drag to pan; a click that did not move picks a segment
      this.pan = { lx: e.clientX, ly: e.clientY, sx: e.clientX, sy: e.clientY, moved: e.button !== 0, button: e.button, world: p };
      this.app.canvas.setPointerCapture(e.pointerId);
    }
  }

  private pinchNow(): { dist: number; cx: number; cy: number } {
    const [a, b] = [...this.touches.values()] as [{ x: number; y: number }, { x: number; y: number }];
    return { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  private vibrate(): void { try { navigator.vibrate?.(15); } catch { /* not supported */ } }

  /** Touch has no right-click: keep a finger still on a point for a moment and it is deleted. */
  private startHold(e: PointerEvent, i: number): void {
    this.cancelHold();
    const timer = window.setTimeout(() => {
      this.hold = null;
      const d = this.draw;
      if (!d?.drag || d.drag.kind !== "pt") return;
      d.pts.splice(i, 1); d.drag = null; d.warn = "";
      try { this.app.canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      this.vibrate();
      this.renderDraw();
    }, 500);
    this.hold = { timer, x: e.clientX, y: e.clientY };
  }

  private cancelHold(): void { if (this.hold) { clearTimeout(this.hold.timer); this.hold = null; } }

  private pickAt(p: Vec2): void {
    if (!this.pick) return;
    // where the road crosses itself a cell holds two segments: take the one whose road is nearer the click
    const here = this.track.cellSegments.get(`${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`);
    if (!here?.length) return;
    const near = (i: number) => Math.min(...this.track.allSegments[i]!.center.map((c) => Math.hypot(c.x - p.x, c.y - p.y)));
    // (only roads on the route the line takes can be edited: the rest are not part of the lap)
    const onLine = here.filter((i) => !this.currentLine || this.posOf(this.currentLine, i) >= 0);
    if (!onLine.length) { this.showPicker("That part of the track is not on your route."); return; }
    const idx = onLine.reduce((a, b) => (near(b) < near(a) ? b : a));
    const s = this.pick.selected;
    if (s.has(idx)) s.delete(idx);
    else if (new Set([...this.changedThisLap(), ...s, idx]).size <= this.pick.limit) s.add(idx);
    this.showPicker(this.pickMessage);
  }

  /** A new point bends the path between the two nodes nearest it, whatever order points were clicked in, so the line never doubles back. */
  private insertPoint(d: DrawState, p: Vec2): void {
    const j = this.joinPoint(d), e = this.exitPoint(d);
    if (!j || !e) { d.pts.push(p); return; }
    const poly = [j, ...d.pts, e];
    let best = 0, bd = Infinity;
    for (let i = 0; i < poly.length - 1; i++) {
      const dd = distToSegment(p, poly[i]!, poly[i + 1]!);
      if (dd < bd) { bd = dd; best = i; }
    }
    d.pts.splice(best, 0, p);
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.touches.size >= 2) {
      const n = this.pinchNow();
      this.view.zoomBy(n.dist / this.pinch.dist, n.cx, n.cy);
      this.view.panBy(n.cx - this.pinch.cx, n.cy - this.pinch.cy);
      this.pinch = n;
      return;
    }
    if (this.hold && Math.hypot(e.clientX - this.hold.x, e.clientY - this.hold.y) > 10) this.cancelHold();
    if (this.pan) {
      const q = this.pan;
      if (!q.moved && Math.hypot(e.clientX - q.sx, e.clientY - q.sy) > 6) q.moved = true;
      if (q.moved) this.view.panBy(e.clientX - q.lx, e.clientY - q.ly);
      q.lx = e.clientX; q.ly = e.clientY;
      return;
    }
    const d = this.draw;
    if (!d?.drag || !d.line) return;
    this.dragTo(d, this.view.toWorld(e.clientX, e.clientY));
  }

  private onPointerUp(e: PointerEvent): void {
    this.cancelHold();
    if (this.touches.delete(e.pointerId) && this.pinch) {
      if (this.touches.size < 2) this.pinch = null;
      this.pan = null;
      return;
    }
    if (this.pan) {
      const q = this.pan;
      this.pan = null;
      try { this.app.canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      if (!q.moved && q.button === 0) this.pickAt(q.world);
      return;
    }
    const d = this.draw;
    if (!d?.drag) return;
    try { this.app.canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    this.releaseDrag(d);
  }

  private undo(): void {
    const d = this.draw;
    if (!d) return;
    d.warn = "";
    if (d.pts.length) d.pts.pop();
    else if (d.mode === "lap" && d.seg > 0) {
      // go back into the previous segment and reopen its points
      const prev = d.line!.segs[d.seg - 1]!;
      const prevId = idAt(d.line!, d.seg - 1);
      d.line = makeLine(d.line!.start, d.line!.segs.slice(0, d.seg - 1), d.line!.path?.slice(0, d.seg - 1));
      d.seg--;
      d.id = prevId;
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
      d.line = setSegment(d.line!, d.seg, d.pts, end, true, d.id);
      const done = this.isLast(d);
      d.pts = []; d.end = null;
      d.seg++;
      if (!done) d.id = nextOf(this.track, d.id);
      this.shareLine = d.line;
      this.syncHash();
      if (done) { this.draw = null; this.finishedLine(d.line); return; }
    } else {
      // ending on the other exit of a fork takes the other road: everything after this segment is re-drawn along it
      const rerouted = d.id !== idAt(d.line!, d.seg);
      const candidate = rerouted ? completeLine(this.track, setSegment(d.line!, d.seg, d.pts, end, true, d.id)) : setSegment(d.line!, d.seg, d.pts, end, false, d.id);
      if (rerouted) d.queue = [];
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
      d.id = idAt(d.line, next);
      d.pts = d.line.segs[next]!.slice(0, -1);
      d.end = d.line.segs[next]!.at(-1)!;
    }
    d.warn = "";
    this.renderDraw();
  }

  /** Pause menu, while a lap is being drawn: keep the sound segments drawn so far and draw the rest (and repair the broken ones). */
  private finishTrackForMe(): void {
    const d = this.draw;
    if (!d || d.mode !== "lap") return;
    const line = completeLine(this.track, d.line);
    this.draw = null;
    this.closeMenu();
    this.finishedLine(line);
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
    // as the ids of the segments, to count against the picks on the map
    return changedSegments(this.me.lines[this.lapNo]!, this.currentLine).map((k) => idAt(this.currentLine!, k));
  }

  /** Where in a line the segment with this id is drawn, or -1 if the line does not go that way. */
  private posOf(line: Line, id: number): number {
    for (let k = 0; k < line.segs.length; k++) if (idAt(line, k) === id) return k;
    return -1;
  }

  /** The lap after the one in progress when the car stopped (lapNo is the lap it is finishing). */
  private nextLapIndex(): number { return this.race ? this.lapNo + 1 : 0; }

  /** What the tank and the plan say: the first lap, if any, on which the car would run dry. */
  private fuelProblem(next: number, fuel: number): number | null {
    if (this.settings.autoPit !== false) return null; // the pit wall brings the car in before it runs dry
    const per = this.fuelLap();
    return firstDryLap(per, this.run.laps, next, fuel, this.settings.pitPlan.map((p) => p.lap), TANK);
  }

  private updateRain(r: number): void {
    this.view.sky.setRain(r);
    this.audio.rain(r);
    // drops beading on the glass in heavy rain (a layer over the game, under the panels)
    let el = document.getElementById("raindrops");
    if (!el && r > 0) { el = document.createElement("div"); el.id = "raindrops"; this.ui.parentElement?.insertBefore(el, this.ui); }
    if (el) el.style.opacity = String(Math.max(0, Math.min(0.9, (r - 0.3) * 1.4)));
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
    this.view.drawTrack(this.track, { visible: null, selected: sel, bad });
    const prof = check.ok ? this.lineProfile(line) : null;
    if (prof) { this.view.drawCurves([]); this.drawSpeedLine(prof); }
    else this.view.drawCurves([{ pts: lapCurve(line, this.track.segments.length).map((x) => x.p), color: PLAYER_COLOR, width: 3 }]);
    if (this.race) this.drawCarsAt(this.race.tick);
    const next = this.nextLapIndex();
    const tooMany = !firstLap && changed.length > MAX_AMENDS;
    const real = this.run.realism;
    const me = this.race?.cars.find((c) => c.entrant.id === ME);
    // (in the box the stop being made refuels the car before it goes back out: judge the plan from the full tank it leaves with, not the one it came in on)
    const fuel = me && !me.boxed ? me.fuel : TANK;
    const dryAt = real ? this.fuelProblem(next, fuel) : null;
    // no title, no gauges and no notes here: the weather as three tiles, and a box only when something is wrong
    const warns: string[] = [];
    if (!check.ok) warns.push('<p class="bad">Your line leaves the road or hits something, in the red segments.</p>');
    if (dryAt !== null) warns.push(`<p class="bad">As planned you run dry on lap ${dryAt + 1}. Queue a stop before it.</p>`);
    if (tooMany) warns.push('<p class="bad">Too many segments changed. Revert and try again.</p>');
    if (message) warns.push(`<p class="bad">${esc(message)}</p>`);
    const rainTiles = firstLap && real ? this.forecastFor(this.track.phrase, this.run.laps, this.vehicle) : null;
    this.ui.innerHTML = `<div class="tl">${rainTiles ? weatherGrid(rainTiles, 75) : ""}${warns.length ? `<div class="panel warn">${warns.join("")}</div>` : ""}</div>`;
    const goLabel = firstLap ? (this.timed() ? "Go!" : "Race!") : "Back out";
    this.bar.set([
      { id: "edit", label: "Edit segments", color: "cyan", disabled: ![...sel].some((i) => this.posOf(line, i) >= 0), tip: "Redraw the segments you have selected on the map. Click segments to select them; scroll to zoom and drag to pan.", onClick: () => {
        const queue = [...sel].map((i) => this.posOf(line, i)).filter((k) => k >= 0).sort((a, b) => a - b);
        const first = queue.shift()!;
        this.pick = null;
        this.view.sky.setActive(false);
        this.draw = { mode: "amend", line, seg: first, id: idAt(line, first), pts: line.segs[first]!.slice(0, -1), end: line.segs[first]!.at(-1)!, queue, drag: null, warn: "" };
        this.renderDraw();
      } },
      ...(!firstLap && changed.length ? [{ id: "revert", label: "Revert", color: "orange" as const, tip: "Undo every change you have made to your line during this stop.", onClick: () => { this.currentLine = this.me.lines[this.lapNo]!; this.shareLine = this.currentLine; this.syncHash(); this.pick = null; this.showPicker(null); } }] : []),
      ...(real ? [{ id: "pits", label: `Pit strategy${this.queuedStops().length ? ` (${this.queuedStops().length})` : ""}`, color: "violet" as const, tip: "Queue pit stops: pick the lap and the tyre. Up to 5, one per lap, and none on the last lap.", onClick: () => this.togglePlan() }] : []),
      { id: "go", label: goLabel, color: "yellow", wide: true, disabled: !(check.ok && !tooMany), tip: firstLap ? (this.timed() ? "Start the session with this line." : "Start the race with this line.") : "Leave the pits and carry on with your line as it now is.", onClick: () => { this.pick = null; this.closePlan(); if (firstLap) this.startRace(); else this.resumeRace(); } },
    ], `${golfBar(this.golfScore(line))}${prof ? `<span class="predict">Flying lap <b>${fmt(prof.ideal)}</b> <i class="speedkey"><em>slow</em><em>fast</em></i></span> ` : ""}${firstLap ? `Select segments on the map to edit them, or go. ${this.timed() ? "" : `<span class="dim">Once the race starts you can only change your line during a pit stop.</span>`}` : `You are in the pits: change up to <b>${MAX_AMENDS}</b> segments before you go back out (<b>${used}</b> used).`} <span class="dim">Scroll to zoom, drag to pan.</span>`);
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
  private togglePlan(): void { if (this.planOpen) this.closePlan(); else { this.planOpen = true; this.planMsg = ""; if (!this.race) this.planLap = -1; this.renderPlan(); this.updateTutorial(); } }
  private closePlan(): void { this.planOpen = false; this.planLayer.innerHTML = ""; if (this.tutBackup) this.updateTutorial(); }

  /** How many stops can be queued now: five slots, of which the starting tyre takes the first until the race has started. */
  private queueCap(): number { return !this.race && this.run.realism ? MAX_PIT_STOPS - 1 : MAX_PIT_STOPS; }

  /** The stops still to come: the queue. Stops already made are history, and the five-stop limit applies only to these. */
  private queuedStops(): { lap: number; tyre: Compound; tactic?: Tactic }[] {
    const next = this.nextLapIndex();
    return this.settings.pitPlan.filter((p) => p.lap >= next);
  }

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
    // the first "stop" is the tyre the race starts on (always there, medium unless chosen)
    if (lap === -1) { if (this.race) return; s.startTyre = tyre; this.planMsg = ""; this.persist(); return this.afterPlanChange(); }
    if (this.queuedStops().length >= this.queueCap()) { this.planMsg = `You can queue at most ${MAX_PIT_STOPS} entries at a time, the starting tyre included.`; return this.renderPlan(); }
    if (s.pitPlan.some((p) => p.lap === lap)) { this.planMsg = `There is already a stop at the end of lap ${lap + 1}.`; return this.renderPlan(); }
    if (!this.freeStopLaps().includes(lap)) { this.planMsg = "That lap has gone, or is the last one."; return this.renderPlan(); }
    s.pitPlan.push({ lap, tyre, tactic: this.planTactic });
    s.pitPlan.sort((a, b) => a.lap - b.lap);
    this.planMsg = "";
    this.persist();
    this.afterPlanChange();
  }

  private removeStop(lap: number): void {
    if (lap < this.nextLapIndex()) return; // already behind us
    this.settings.pitPlan = this.settings.pitPlan.filter((p) => p.lap !== lap);
    this.syncPlan();
    this.planMsg = "";
    this.persist();
    this.afterPlanChange();
  }

  /** Hand the queued stops to the race: through `Race.setPlan` once it has begun, so a replay sees the change at the same tick. */
  private syncPlan(): void {
    if (this.race && this.me) this.race.setPlan(ME, this.settings.pitPlan);
    else if (this.me) this.me.pitPlan = this.settings.pitPlan;
  }

  private afterPlanChange(): void {
    this.syncPlan();
    if (this.draw) this.renderDraw(); else if (this.currentLine) this.showPicker(this.pickMessage);
    else this.renderPlan();
  }

  private renderPlan(): void {
    const s = this.settings, next = this.nextLapIndex();
    const queue = this.queuedStops(), free = this.freeStopLaps(), cap = this.queueCap(), full = queue.length >= cap;
    const startable = !this.race && this.run.realism; // before the race, "Start" is the first place a tyre can go
    const options = [...(startable ? [-1] : []), ...free];
    if (!options.includes(this.planLap)) this.planLap = options.find((l) => l >= this.planLap) ?? options[0] ?? next;
    const onStart = this.planLap === -1;
    const stopAt = new Map(queue.map((p) => [p.lap, p.tyre]));
    const cells = Array.from({ length: this.run.laps }, (_, l) => {
      const cls = [l < next ? "done" : l === next ? "now" : "", stopAt.has(l) ? "stop" : ""].join(" ");
      const col = stopAt.has(l) ? `style="--stop:#${COMPOUNDS[stopAt.get(l)!].color.toString(16).padStart(6, "0")}"` : "";
      return `<i class="${cls}" ${col} title="Lap ${l + 1}"></i>`;
    }).join("");
    const startSlot = startable ? `<div class="slot start">${tyreIcon(s.startTyre, 52)}<b>Start</b><span>${COMPOUNDS[s.startTyre].name} · ${TACTIC_INFO[s.startTactic ?? "balanced"].name}</span></div>` : "";
    const slots = startSlot + Array.from({ length: cap }, (_, i) => {
      const p = queue[i];
      if (!p) return `<div class="slot empty"><span>Stop ${i + 1}</span><em>empty</em></div>`;
      return `<div class="slot">${tyreIcon(p.tyre, 52)}<b>Lap ${p.lap + 1}</b><span>${COMPOUNDS[p.tyre].name} · ${TACTIC_INFO[p.tactic ?? "balanced"].name}</span><button class="rm" data-rm="${p.lap}" title="Take this stop out of the queue">✕</button></div>`;
    }).join("");
    const reason = full && !onStart ? `The queue is full: ${MAX_PIT_STOPS} places${startable ? ', the start included' : ''}. Once a stop is made, another can be added.` : free.length === 0 ? "No laps left to queue a stop on." : "";
    const can = options.length > 0 && (onStart || !full);
    this.planLayer.innerHTML = `<div class="panel plan">
      <div class="row"><h2 style="flex:1">Pit strategy <span class="dim" style="font-weight:400;font-size:13px">a stop gives fresh tyres and a full tank</span></h2><span class="dim" style="flex:0 0 auto">${queue.length + (startable ? 1 : 0)} / ${MAX_PIT_STOPS} queued</span><button id="planclose" class="big grey slim">Done</button></div>
      <label class="autopit"><input type="checkbox" id="autopit" ${s.autoPit !== false ? "checked" : ""} ${this.race ? "disabled" : ""}/> <b>Let the pit wall call the stops</b> <span class="dim">it brings you in for fuel, worn tyres or the wrong tyre for the road; the stops you queue here come first${this.race ? " (set before the start)" : ""}</span></label>
      <div class="timeline">${cells}</div>
      <div class="slots">${slots}</div>
      ${this.run.realism ? `<label>${onStart ? "Tactic to start with" : "Tactic after this stop"} <span class="dim">harder is quicker, but wears the tyres, heats them and burns fuel</span></label>${tacticChips("plan", onStart ? s.startTactic ?? "balanced" : this.planTactic)}` : ""}
      <label>${startable ? "Starting tyre, then pit stops" : "Add a stop"}</label>
      <div class="adder">
        <div class="lapstep"><button id="lapminus" ${can ? "" : "disabled"}>−</button><div><span class="dim">${onStart ? "when" : "end of lap"}</span><b>${options.length ? (onStart ? "Start" : this.planLap + 1) : "–"}</b></div><button id="lapplus" ${can ? "" : "disabled"}>+</button></div>
        <div class="tyrepick big">${COMPOUND_IDS.map((c) => `<button class="tyrebtn" data-add="${c}" ${can ? "" : "disabled"} title="${esc(COMPOUNDS[c].blurb)}">${tyreIcon(c, 74)}<span>${COMPOUNDS[c].name}</span></button>`).join("")}</div>
      </div>
      <p class="${reason || this.planMsg ? "bad" : "dim"}">${esc(reason || this.planMsg || (onStart ? "Pick a tyre to start the race on, or step to a lap to queue a stop." : "Pick the lap, then tap a tyre to queue the stop."))}</p>
    </div>`;
    const root = this.planLayer;
    root.querySelector("#planclose")?.addEventListener("click", () => this.closePlan());
    root.querySelector<HTMLInputElement>("#autopit")?.addEventListener("change", (e) => { s.autoPit = (e.target as HTMLInputElement).checked; this.persist(); this.afterPlanChange(); });
    const step = (dir: number) => { const i = options.indexOf(this.planLap); const j = Math.min(options.length - 1, Math.max(0, i + dir)); this.planLap = options[j] ?? this.planLap; this.planMsg = ""; this.renderPlan(); };
    root.querySelector("#lapminus")?.addEventListener("click", () => step(-1));
    root.querySelector("#lapplus")?.addEventListener("click", () => step(1));
    root.querySelectorAll<HTMLButtonElement>("[data-tac]").forEach((b) => b.addEventListener("click", () => {
      const t = b.dataset["tac"]!.split(":")[1];
      if (!isTactic(t)) return;
      if (onStart) { s.startTactic = t; this.persist(); this.afterPlanChange(); } else { this.planTactic = t; this.renderPlan(); }
    }));
    root.querySelectorAll<HTMLButtonElement>("[data-add]").forEach((b) => b.addEventListener("click", () => this.addStop(this.planLap, b.dataset["add"] as Compound)));
    root.querySelectorAll<HTMLButtonElement>("[data-rm]").forEach((b) => b.addEventListener("click", () => this.removeStop(Number(b.dataset["rm"]))));
  }

  // ---------- racing ----------
  private startRace(): void {
    const r = this.run, st = this.settings;
    this.rivalEntrants = r.rivals ? this.makeRivals(r.rivals) : [];
    const timed = this.timed();
    // practice and qualifying: the rivals are out on the track already, spread round it, and the player is on the line
    if (timed) this.rivalEntrants.forEach((e, i) => { e.startFrac = (i + 1) / (this.rivalEntrants.length + 1); });
    const tt = this.best[trialKey(st.phrase, this.vehicle)];
    // the race drives the line as the server stores it (points to 0.01), and the line on screen becomes that same line: a stop compares the two point
    // for point, and an unrounded line on screen counted every segment as changed, which left the car stuck in the pits
    const driven = this.driven();
    this.currentLine = driven; this.shareLine = driven;
    this.me = {
      id: ME, name: this.online.name, car: this.playerCar(), lines: Array.from({ length: r.laps }, () => driven), isPlayer: true,
      pitPlan: r.realism ? st.pitPlan : [], ...(r.realism && st.autoPit !== false ? { autoPit: true } : {}), startTyre: r.kind === "trial" ? "soft" : st.startTyre, ...(r.realism && st.startTactic ? { startTactic: st.startTactic } : {}),
      ...(timed ? { gridSlot: 0 } : {}),
      // a quick race is gridded by the time trial: without a time you start last
      ...(r.flow === "quick" ? { gridTime: quickGridTime(tt) } : {}),
      ...(this.special?.kind === "challenge" ? { gridTime: undefined, gridSlot: challengeById(this.special.id)?.back ? r.rivals : Math.floor(r.rivals / 2) } : {}),
    };
    const entrants = [this.me, ...this.rivalEntrants];
    // the race of a weekend starts from the qualifying order
    const grid = r.flow === "weekend" && r.kind === "race" ? this.weekend?.grid : undefined;
    if (grid) for (const e of entrants) if (grid[e.id] !== undefined) e.gridSlot = grid[e.id];
    const baseRules = r.kind !== "race" ? sessionRules(r.kind) : r.realism ? { ...sessionRules("race", { wearMult: { fuel: r.wearFuel, tyre: r.wearTyre }, mandatory: r.mandatory }), weather: true } : { realism: false, weather: false, flags: true };
    // the rubber the weekend's earlier sessions laid down stays on the road (not on hard, whose races the server replays from scratch)
    const rubber = r.flow === "weekend" && r.difficulty !== "hard" ? this.weekend?.rubber : undefined;
    const rules = { ...baseRules, ...(rubber ? { rubber } : {}), ...(r.elimination ? { elimination: true } : {}) };
    this.replayStart = { entrants: JSON.stringify(entrants), rules: rulesOut(rules) };
    this.race = new Race(this.track, entrants, r.laps, rules);
    this.lapNo = 0;
    this.view.clearSkids();
    this.skidTick = 0;
    this.runAndPlay(0);
  }

  /** Back out of the pits: the line as it now is is the line for every lap from here, and the bots read the road again. */
  private resumeRace(): void {
    const race = this.race!, next = this.lapNo + 1;
    const driven = this.driven();
    this.currentLine = driven; this.shareLine = driven; // (see startRace)
    if (next < this.run.laps) race.setLines(ME, next, this.run.laps - next, driven);
    race.setPlan(ME, this.settings.pitPlan);
    race.replanBots(next, this.run.laps - next);
    this.runAndPlay(race.tick);
  }

  /** Advance the start sequence by dt seconds: the lights come on one by one with a beep, then go out and the race begins. Returns the time the race may run. */
  private stepStart(st: StartSeq, dt: number): number {
    st.t += dt;
    const lit = st.t < START_FIRST ? 0 : Math.min(5, 1 + Math.floor((st.t - START_FIRST) / START_GAP));
    if (lit !== st.lit) { for (let i = st.lit + 1; i <= lit; i++) this.audio.startLight(i); st.lit = lit; this.showLights(lit); }
    if (st.t >= st.out) { this.finishStart(st); return st.t - st.out < dt ? st.t - st.out : 0; }
    return 0;
  }

  private finishStart(st: StartSeq): void {
    if (st.done) return;
    st.done = true; st.lit = 0;
    this.audio.startGo();
    this.showLights(0);
    window.setTimeout(() => this.endStartLights(), 900);
  }

  /** Draw the five lights, `n` of them red. */
  private showLights(n: number): void {
    this.lightsLayer.style.display = "flex";
    this.lightsLayer.innerHTML = Array.from({ length: 5 }, (_, i) => `<div class="slight${i < n ? " on" : ""}"><i></i></div>`).join("");
    this.lightsLayer.classList.toggle("go", n === 0);
  }

  private endStartLights(): void { this.lightsLayer.style.display = "none"; this.lightsLayer.innerHTML = ""; }

  /** Run the race up to the player's next pit stop (or to the end), then play it back. The race is worked out in one go, which can take
   *  a moment, so a loading box goes up first and the work starts once it has been drawn. */
  private runAndPlay(fromTick: number): void {
    this.showLoading(fromTick === 0 ? "Getting the race ready…" : "Back on track…");
    this.runToken = (this.runToken ?? 0) + 1;
    const token = this.runToken;
    window.setTimeout(() => {
      if (token !== this.runToken || !this.race) { this.hideLoading(); return; }
      try { this.runAndPlayNow(fromTick); } finally { this.hideLoading(); }
    }, 60);
  }
  private runToken = 0;

  private showLoading(text: string): void {
    let el = document.getElementById("loadingbox");
    if (!el) { el = document.createElement("div"); el.id = "loadingbox"; this.ui.parentElement?.appendChild(el); }
    el.innerHTML = `<div class="spinner"></div><b>${esc(text)}</b>`;
    el.style.display = "flex";
  }
  private hideLoading(): void { const el = document.getElementById("loadingbox"); if (el) el.style.display = "none"; }

  private runAndPlayNow(fromTick: number): void {
    const race = this.race!;
    this.sessionShown = false;
    const mine = race.cars.find((c) => c.entrant.id === ME)!;
    // A race is worked out a stretch at a time, ahead of the play head, so it starts at once and a big field does not make anyone wait.
    // (A practice or qualifying session needs everyone's laps for its results, so those are worked out in full first.)
    const stage = { toEnd: this.special?.kind === "replay" }; // (a replay runs straight through: nothing is edited at its stops)
    let state = race.advance(ME, stage, this.run.kind === "race" ? FIRST_TICKS : Infinity);
    if (state === "stop") this.lapNo = mine.lap;
    this.play = { tick: fromTick, end: race.tick, speed: 1, atStop: state === "stop", final: state !== "running", stage };
    // a race starts from the grid with the lights: five red, a pause, and out
    if (fromTick === 0 && this.run.kind === "race") this.play.start = { t: 0, lit: 0, out: START_FIRST + START_GAP * 4 + 0.8 + (phraseToSeed(this.settings.phrase) % 1000) / 1000, done: false };
    else this.endStartLights();
    // (the safety car is out at the play head if the last call before it was out, not in)
    this.scOn = false;
    for (const e of race.events) { if (e.tick >= fromTick) break; if (e.type === "sc") this.scOn = true; else if (e.type === "scEnd") this.scOn = false; }
    const first = race.events.findIndex((e) => e.tick >= fromTick);
    this.eventIdx = first < 0 ? race.events.length : first;
    this.skidTick = fromTick;
    this.ui.innerHTML = "";
    this.closePlan();
    this.view.drawTrack(this.track, { visible: null });
    this.view.drawCurves([{ pts: lapCurve(this.currentLine, this.track.segments.length).map((x) => x.p), color: PLAYER_COLOR, width: 1.5, alpha: 0.3 }]);
    this.view.clearCars();
    this.view.sky.setActive(true);
    this.audio.unlock();
    this.audio.setRacing(!this.menuOpen);
    this.drawCarsAt(fromTick);
    const me = race.cars.find((c) => c.entrant.id === ME)!;
    this.view.setFollow({ x: me.trace[fromTick * 3]!, y: me.trace[fromTick * 3 + 1]! });
    // the race controls are big buttons at the bottom
    // 1x is real-world pace; the next is the pace the game used to play at, then faster still
    const speeds = [1, 2, 4, 8, 16]; // multiples of real-world pace (the on-screen clock)
    this.bar.set([
      {
        id: "speed", label: "1×", color: "green", tip: `Change how fast the race plays: ${speeds.map((x) => `${x}×`).join(", ")}. Click for faster (after ${speeds.at(-1)}× it goes back to 1×), right click for slower. 1× is real-world pace.`,
        onClick: () => { const q = this.play; if (q) { q.speed = speeds[(speeds.indexOf(q.speed) + 1) % speeds.length]!; this.bar.setLabel("speed", `${q.speed}×`); } },
        onSecondary: () => { const q = this.play; if (q) { q.speed = speeds[Math.max(0, speeds.indexOf(q.speed) - 1)]!; this.bar.setLabel("speed", `${q.speed}×`); } },
      },
      { id: "skip", label: this.skipLabel(this.play), color: "blue", tip: "Jump ahead to your next pit stop, or to the end of the race.", onClick: () => { const q = this.play; if (q && q.start && !q.start.done) this.finishStart(q.start); else if (q) this.skipAhead(q); } },
      { id: "sound", label: this.audio.isMuted() ? "Sound off" : "Sound on", color: "violet", tip: "Turn the engines and effects on or off (M).", onClick: () => this.toggleMute() },
      ...(typeof MediaRecorder !== "undefined" ? [{ id: "rec", label: this.rec ? "■ Stop" : "● Record", color: "pink" as const, tip: "Record the race as a video clip (WebM, a minute at most), saved when you stop.", onClick: () => this.toggleRecord() }] : []),
    ]);
    this.updateTutorial();
  }

  /** Recording a clip of the race: the canvas as a video, saved as a WebM file when it stops (or after `REC_MAX_MS`). */
  private rec: { r: MediaRecorder; chunks: Blob[]; timer: number } | null = null;
  /** the safety car is out at the play head (from the race's events) */
  private scOn = false;
  private toggleRecord(): void {
    if (this.rec) { this.rec.r.stop(); return; }
    let stream: MediaStream;
    try { stream = (this.app.canvas as HTMLCanvasElement).captureStream(60); } catch { this.toast("This browser cannot record the game.", "bad"); return; }
    const type = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    const r = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 8_000_000 } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      if (this.rec) window.clearTimeout(this.rec.timer);
      this.rec = null;
      this.bar.setLabel("rec", "● Record");
      const blob = new Blob(chunks, { type: "video/webm" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `apex-draft-${normalizePhrase(this.track.phrase)}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`;
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      this.toast("Clip saved");
    };
    r.start(1000);
    this.rec = { r, chunks, timer: window.setTimeout(() => this.rec?.r.stop(), REC_MAX_MS) };
    this.bar.setLabel("rec", "■ Stop");
  }

  /** What the skip button says: the player's next stop if there is one coming (planned, or the one the race has reached), the end of the race if not. */
  private skipLabel(p: NonNullable<Game["play"]> | null): string {
    if (!p) return "Skip ahead";
    const mine = this.race?.cars.find((c) => c.entrant.id === ME);
    const planned = this.run.realism && !!mine && (this.me.pitPlan ?? []).some((x) => x.lap >= Math.max(0, mine.lap));
    return (p.final ? p.atStop : planned) ? "Skip to pit stop" : this.run.realism && this.me.autoPit ? "Skip ahead" : "Skip to end";
  }

  /** Work the race out for as long as a frame can spare, to stay a little ahead of the play head; at high speed it may have to wait for the sim. */
  private stream(p: NonNullable<Game["play"]>): void {
    const race = this.race!, mine = race.cars.find((c) => c.entrant.id === ME)!;
    const t0 = performance.now(), want = p.tick + STREAM_AHEAD + p.speed * 120;
    while (!p.final && race.tick < want && performance.now() - t0 < STREAM_MS) {
      const r = race.advance(ME, p.stage, 20);
      if (r !== "running") { p.final = true; p.atStop = r === "stop"; if (p.atStop) this.lapNo = mine.lap; }
    }
    p.end = race.tick;
    const label = this.skipLabel(p), b = this.bar.button("skip");
    if (b && b.textContent !== label) this.bar.setLabel("skip", label);
  }

  /** Jump to the next pit stop or the end of the race, working out whatever is left of it first (with the loading box up if that takes a while). */
  private skipAhead(p: NonNullable<Game["play"]>): void {
    if (p.final) { p.tick = p.end; return; }
    this.showLoading("Skipping ahead…");
    window.setTimeout(() => {
      try {
        const race = this.race;
        if (race && this.play === p) {
          const mine = race.cars.find((c) => c.entrant.id === ME)!;
          while (!p.final) { const r = race.advance(ME, p.stage, 2000); if (r !== "running") { p.final = true; p.atStop = r === "stop"; if (p.atStop) this.lapNo = mine.lap; } }
          p.end = race.tick; p.tick = p.end;
        }
      } finally { this.hideLoading(); }
    }, 30);
  }

  private colorOf(id: string): number {
    if (id === ME) return this.settings.livery?.primary ?? PLAYER_COLOR;
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
    const ratio = Math.abs(v * dh * 20) / cornerCap(c.entrant.car.type, st.aLat, v);
    const beta = c.btrace[i] ?? 0;
    // a boat's slip is the angle of its hull to its path; a car's is how hard its tyres work (or how far round they are slipping)
    const veh = VEHICLES[c.entrant.car.type ?? "rally"];
    const slip = veh?.domain === "water" ? clamp(Math.abs(beta) / 0.5, 0, 1) : Math.max(clamp((ratio - 0.88) / 0.12, 0, 1), clamp(Math.abs(beta) / (((veh?.slipDeg ?? 10) * Math.PI) / 180), 0, 1));
    // the front wheels point where the car is turning: the steering angle that gives this yaw rate at this speed on this wheelbase
    const wb = 0.6 * (veh?.length ?? 8), steer = Math.max(-0.6, Math.min(0.6, Math.atan((wb * dh * 20) / Math.max(v, 4))));
    return { v, acc, slip, beta, braking: acc < -0.5 * st.brake && v > 20, steer };
  }

  /** Where a car is part-way between two ticks, so a slow playback still moves smoothly. */
  private pose(c: RaceCar, tick: number): { x: number; y: number; h: number } {
    const last = c.trace.length / 3 - 1, k = Math.min(Math.floor(tick), last), n = Math.min(k + 1, last), f = n === k ? 0 : tick - k;
    let dh = c.trace[n * 3 + 2]! - c.trace[k * 3 + 2]!;
    if (dh > Math.PI) dh -= 2 * Math.PI; else if (dh < -Math.PI) dh += 2 * Math.PI;
    return { x: c.trace[k * 3]! + (c.trace[n * 3]! - c.trace[k * 3]!) * f, y: c.trace[k * 3 + 1]! + (c.trace[n * 3 + 1]! - c.trace[k * 3 + 1]!) * f, h: c.trace[k * 3 + 2]! + dh * f };
  }

  /** Names over the player and the other online racers. The player's wins whenever labels crowd; bots have none. */
  /** the cars directly ahead of and behind the player in the standings: their names are tagged on the map, AI or not */
  private neighbours = new Set<string>();

  private updateNameLabels(tick: number, dt: number): void {
    const race = this.race!;
    const me = race.cars.find((c) => c.entrant.id === ME);
    const here = me ? this.pose(me, tick) : null;
    const cars: { id: string; name: string; x: number; y: number; color: number; priority: number; always?: boolean }[] = [];
    for (const c of race.cars) {
      const id = c.entrant.id;
      const next = this.neighbours.has(id);
      if (id !== ME && !id.startsWith("ghost:") && !next) continue;
      const k = Math.min(Math.floor(tick), c.trace.length / 3 - 1);
      if (c.ptrace[k] === 3) continue; // out of the race and gone from the track
      const q = this.pose(c, tick);
      cars.push(id === ME
        ? { id, name: c.entrant.name, x: q.x, y: q.y, color: PLAYER_COLOR, priority: 0, always: true }
        : next ? { id, name: c.entrant.name, x: q.x, y: q.y, color: this.colorOf(id), priority: 0.5, always: true }
        : { id, name: c.entrant.name, x: q.x, y: q.y, color: ONLINE_COLOR, priority: 1 + (here ? Math.hypot(q.x - here.x, q.y - here.y) : 0) });
    }
    this.view.updateLabels(cars, dt);
  }

  private drawCarsAt(tick: number): void {
    for (const c of this.race!.cars) {
      const k = Math.min(Math.floor(tick), c.trace.length / 3 - 1), q = this.pose(c, tick);
      const m = this.motion(c, k);
      this.view.setCar(c.entrant.id, c.entrant.car.type, q.x, q.y, q.h, this.colorOf(c.entrant.id), c.gtrace[k] === 1, c.entrant.id === ME, m.braking || c.ptrace[k] === 2, c.ptrace[k] === 3, { v: c.vtrace[k] ?? 0, beta: c.btrace[k] ?? 0 }, m.steer, (c.ltrace[k] ?? 0) > 0, c.atrace[k] ?? 0);
    }
  }

  /** Rubber on the tarmac where the cars slid in corners or stood on the brakes. */
  private updateSkids(k: number): void {
    const out: Skid[] = [];
    for (let i = this.skidTick + 1; i <= k; i++) {
      if (i < 2 || i % 2) continue;
      for (const c of this.race!.cars) {
        if (i >= c.vtrace.length || c.gtrace[i] || c.vtrace[i]! < 8 || VEHICLES[c.entrant.car.type ?? "rally"]?.domain === "water") continue; // boats leave a wake, not rubber
        const m = this.motion(c, i);
        const strength = Math.max(m.slip * 0.42, m.braking ? 0.16 : 0);
        if (strength < 0.05) continue;
        const nx = -Math.sin(c.trace[i * 3 + 2]!), ny = Math.cos(c.trace[i * 3 + 2]!);
        for (const side of [-2.1, 2.1]) {
          out.push({ x0: c.trace[(i - 2) * 3]! + nx * side, y0: c.trace[(i - 2) * 3 + 1]! + ny * side, x1: c.trace[i * 3]! + nx * side, y1: c.trace[i * 3 + 1]! + ny * side, alpha: strength });
        }
      }
    }
    // dust off a rough surface, smoke from a slide and spray from a wet road, from the last few ticks only (a jump in the replay leaves none behind)
    const race = this.race!, snap = race.wetSnaps[Math.min(Math.floor(k / 60), race.wetSnaps.length - 1)];
    for (let i = Math.max(this.skidTick + 1, k - 5); i <= k; i++) {
      if (i < 2 || i % 3) continue;
      for (const c of race.cars) {
        if (i >= c.vtrace.length || c.gtrace[i] || c.vtrace[i]! < 20 || VEHICLES[c.entrant.car.type ?? "rally"]?.domain === "water") continue;
        const x = c.trace[i * 3]!, y = c.trace[i * 3 + 1]!, h = c.trace[i * 3 + 2]!, v = c.vtrace[i]!, vx = Math.cos(h) * v, vy = Math.sin(h) * v;
        const bx = x - Math.cos(h) * 3.5, by = y - Math.sin(h) * 3.5;
        const surf = this.roughTrack ? surfaceAt(this.track, x, y) : undefined;
        if (surf && surf !== "cobbles") this.view.puff("dust", bx, by, vx, vy, surf === "gravel" ? 0xc9c3b4 : 0xb08a5c);
        if (v > 30 && this.motion(c, i).slip > 0.9) this.view.puff("smoke", bx, by, vx, vy);
        if (snap && v > 40) { const cell = race.field.cellAt(x, y); if (cell >= 0 && snap[cell]! > 90) this.view.puff("spray", bx, by, vx, vy); }
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

  /** Cars the player is ahead of, to notice when one is passed; and when the last toast went up. */
  private ahead = new Map<string, boolean>();
  private lastToast = 0;
  private passesRace: Race | null = null;

  /** A toast when the player gets clear of another car (and one when they are passed, kept short). Only while the replay plays forward. */
  private watchPasses(me: RaceCar, k: number, race: Race, now: number): void {
    if (this.passesRace !== race) { this.passesRace = race; this.ahead.clear(); }
    if (k < 120 || (me.finishTime !== null && me.finishTime <= now)) return;
    for (const c of race.cars) {
      if (c === me || c.ghost) continue;
      const d = (me.prog[k] ?? 0) - (c.prog[k] ?? 0), was = this.ahead.get(c.entrant.id);
      if (d > 10) { if (was === false && now - this.lastToast > 0.9 && c.ptrace[k] !== 3) { this.toast(`Passed ${esc(c.entrant.name)}`, "good"); this.lastToast = now; } this.ahead.set(c.entrant.id, true); }
      else if (d < -10) this.ahead.set(c.entrant.id, false);
    }
  }

  /** A line of text that appears at the top of the screen for a moment. */
  /**
   * A trophy (or a circuit found), as a card in the top left corner: solid, so it reads as something earned and not a passing note, out of the way of
   * the race and the results, with a jingle. A few stack; each goes after a few seconds.
   */
  private trophyCard(icon: string, title: string, text: string, extra: string): void {
    let layer = document.getElementById("trophies");
    if (!layer) { layer = document.createElement("div"); layer.id = "trophies"; layer.setAttribute("aria-live", "polite"); this.toastLayer.parentElement?.appendChild(layer); }
    const el = document.createElement("div");
    el.className = "trophy-card";
    el.innerHTML = `<i aria-hidden="true">${icon}</i><div><b>${esc(title)}</b><span>${esc(text)}</span>${extra ? `<em>${esc(extra)}</em>` : ""}</div>`;
    // (each one a moment after the one before, so two earned together are two jingles and two cards, not one)
    const wait = Math.max(0, this.trophyFree - performance.now());
    this.trophyFree = performance.now() + wait + 700;
    window.setTimeout(() => {
      layer!.appendChild(el);
      while (layer!.children.length > 3) layer!.firstElementChild?.remove();
      this.audio.stinger("trophy");
      window.setTimeout(() => { el.classList.add("out"); window.setTimeout(() => el.remove(), 400); }, TROPHY_MS);
    }, wait);
  }
  private trophyFree = 0;

  private toast(text: string, cls = ""): void {
    const el = document.createElement("div");
    el.className = `toast ${cls}`;
    el.innerHTML = text;
    this.toastLayer.appendChild(el);
    while (this.toastLayer.children.length > 3) this.toastLayer.firstElementChild?.remove();
    setTimeout(() => el.remove(), 2200);
  }

  /** How tense the race is for the music: 0 early on, up toward 1 on the last lap or with a rival close behind or ahead. */
  private tension(me: RaceCar, k: number, race: Race, now: number): number {
    if (me.finishTime !== null && me.finishTime <= now) return 0;
    const lapLen = trackLength(this.track);
    const lap = Math.max(0, Math.floor((me.prog[k] ?? 0) / 1e5));
    let x = lap >= this.run.laps - 1 && this.run.laps > 1 ? 0.55 : lap >= this.run.laps - 2 && this.run.laps > 2 ? 0.2 : 0;
    for (const c of race.cars) {
      if (c === me || c.finishTime !== null && c.finishTime <= now) continue;
      const d = Math.abs((c.prog[k] ?? 0) - (me.prog[k] ?? 0));
      if (d < lapLen * 0.12) x = Math.max(x, 0.5 + 0.5 * (1 - d / (lapLen * 0.12)));
    }
    return x;
  }

  private updateAudio(k: number, now: number, speed: number): void {
    const race = this.race!;
    this.audio.setDucked(speed > 2); // faster than the pace the engines were made for
    const me = race.cars.find((c) => c.entrant.id === ME)!;
    const mk = Math.min(k, me.trace.length / 3 - 1);
    const fx = me.trace[mk * 3]!;
    const fy = me.trace[mk * 3 + 1]!;
    this.updatePlane(fx, fy);
    this.audio.setIntensity(this.tension(me, mk, race, now));
    this.watchPasses(me, mk, race, now);
    // you hear the engines of the cars you can see, as if your ears were where the camera is: zoomed out, more cars are on screen but
    // each is further off and quieter; zoomed in, fewer and louder. A car fades in and out at the edge of the screen.
    const view = this.view.visibleWorld();
    const near = clamp(Math.pow(view.scale / ENGINE_REF_SCALE, 0.9), ENGINE_MIN_GAIN, ENGINE_MAX_GAIN);
    const fade = 0.08 * Math.min(view.x1 - view.x0, view.y1 - view.y0);
    const heard: { c: (typeof race.cars)[number]; i: number; x: number; y: number; edge: number }[] = [];
    for (const c of race.cars) {
      if (c.finishTime !== null && c.finishTime <= now) { this.audio.hush(c.entrant.id); continue; }
      const i = Math.min(k, c.trace.length / 3 - 1);
      const x = c.trace[i * 3]!, y = c.trace[i * 3 + 1]!;
      const edge = clamp(Math.min(x - view.x0, view.x1 - x, y - view.y0, view.y1 - y) / fade, 0, 1);
      if (edge <= 0 || c.ptrace[i] === 3) { this.audio.hush(c.entrant.id); continue; }
      heard.push({ c, i, x, y, edge });
    }
    // a crowd of cars is not a crowd of full-volume engines
    const crowd = 1 / (1 + 0.06 * Math.max(0, heard.length - 1));
    const cx = (view.x0 + view.x1) / 2, half = Math.max(1, (view.x1 - view.x0) / 2);
    for (const { c, i, x, y, edge } of heard) {
      const m = this.motion(c, i), isMe = c.entrant.id === ME;
      const vol = near * edge * crowd * (isMe ? 1 : 0.8);
      const up = (c.atrace[i] ?? 0) > 0.04, was = this.airborne.get(c.entrant.id) ?? false;
      if (up !== was) { this.airborne.set(c.entrant.id, up); this.audio.air(up ? "up" : "down", vol); }
      const sh = c.shtrace[i];
      this.audio.update(c.entrant.id, c.entrant.car.type, { speed: m.v, accel: m.acc, slip: m.slip, vol, pan: (x - cx) / half, top: carStats(c.entrant.car).vTop, surface: this.roughTrack ? surfaceAt(this.track, x, y) : undefined, gear: sh === undefined ? undefined : sh & ~SHIFTING, cut: sh === undefined ? undefined : (sh & SHIFTING) !== 0 }, isMe);
    }
  }

  // ---------- gamepad ----------
  private clickBar(id: string): void { const b = document.getElementById(`bar-${id}`) as HTMLButtonElement | null; if (b && !b.disabled) b.click(); }

  private uiScopes(): HTMLElement[] {
    if (this.modal.style.display !== "none" && this.modal.childElementCount) return [this.modal];
    if (this.menuOpen) return [this.menuLayer];
    return [document.getElementById("bar"), this.ui, this.planOpen ? this.planLayer : null, this.tutLayer, this.menuBtn].filter((x): x is HTMLElement => !!x);
  }

  /** d-pad edges, or the left stick held past a threshold with auto-repeat */
  private navDir(f: PadFrame, dt: number): "up" | "down" | "left" | "right" | null {
    const press = (b: number, dir: "up" | "down" | "left" | "right") => (f.pressed.has(b as never) ? dir : null);
    const edge = press(BTN.UP, "up") ?? press(BTN.DOWN, "down") ?? press(BTN.LEFT, "left") ?? press(BTN.RIGHT, "right");
    if (edge) { this.padNav = { dir: edge, t: 0.35 }; return edge; }
    const dir = Math.abs(f.lx) > Math.abs(f.ly) ? (f.lx > 0.55 ? "right" : f.lx < -0.55 ? "left" : "") : f.ly > 0.55 ? "down" : f.ly < -0.55 ? "up" : "";
    if (!dir) { this.padNav = { dir: "", t: 0 }; return null; }
    if (dir !== this.padNav.dir) { this.padNav = { dir, t: 0.35 }; return dir; }
    this.padNav.t -= dt;
    if (this.padNav.t <= 0) { this.padNav.t = 0.14; return dir; }
    return null;
  }

  private padFrame(dt: number): void {
    const f = this.pad.poll();
    document.body.classList.toggle("pad", !!f && this.pad.active);
    const d = this.draw;
    const cursorMode = !!(d || this.pick) && !this.menuOpen && !(this.modal.style.display !== "none" && this.modal.childElementCount);
    if (!f || !this.pad.active || !cursorMode || this.padUi) this.view.drawCursor(null);
    if (!f) return;
    if (f.pressed.has(BTN.START)) { if (!(this.menuOpen && !this.inGame && this.screen === "home")) this.toggleMenu(); this.padUi = false; return; }

    // buttons: modal, menus, or the bar when the d-pad is walking it
    if (!cursorMode || this.padUi) {
      const scopes = this.uiScopes();
      const dir = this.navDir(f, dt);
      if (dir) moveFocus(scopes, dir);
      else if (f.pressed.has(BTN.A)) { if (!activateFocus(scopes)) moveFocus(scopes, "down"); }
      else if (f.pressed.has(BTN.B)) {
        if (this.modal.childElementCount) (this.modal.querySelector("#no") as HTMLElement | null)?.click();
        else if (this.menuOpen) this.handleBack();
        else if (this.padUi) { this.padUi = false; clearFocus(); }
      } else if (f.pressed.has(BTN.SELECT) && this.padUi) { this.padUi = false; clearFocus(); }
      if (!cursorMode && !this.menuOpen) this.padWorld(f, dt, null);
      return;
    }

    // the map: a cursor
    const c = this.app.canvas.getBoundingClientRect();
    if (!this.cur.init) { this.cur = { x: c.left + c.width / 2, y: c.top + c.height / 2, init: true }; }
    const p0 = this.view.toWorld(this.cur.x, this.cur.y);
    const near = d ? this.hit(d, p0, true) : null;
    const stick = Math.hypot(f.lx, f.ly);
    if (stick > 0) {
      const v = (near ? 220 : 560) * dt;
      this.cur.x = Math.min(c.right, Math.max(c.left, this.cur.x + f.lx * v));
      this.cur.y = Math.min(c.bottom, Math.max(c.top, this.cur.y + f.ly * v));
    } else if (near && !d!.drag) {
      // settle onto the handle under the cursor
      const h = this.handles(d!).find((q) => q.kind === near.kind && q.i === near.i);
      if (h) { const q = this.view.toClient(h.p); this.cur.x += (q.x - this.cur.x) * Math.min(1, dt * 18); this.cur.y += (q.y - this.cur.y) * Math.min(1, dt * 18); }
    }
    this.padWorld(f, dt, this.cur);
    const p = this.view.toWorld(this.cur.x, this.cur.y);
    const hover = d ? this.hit(d, p, true) : null;

    if (f.pressed.has(BTN.SELECT)) { this.padUi = true; moveFocus(this.uiScopes(), "down"); return; }
    if (d) {
      if (f.pressed.has(BTN.A)) {
        this.pad.rumble(25, 0.35);
        if (hover) { this.padSel = -1; this.grab(d, hover, p); } else this.placeAt(d, p);
      } else if (f.pressed.has(BTN.X)) { this.pad.rumble(25, 0.35); this.placeAt(d, p); }
      else if (f.pressed.has(BTN.LB) && hover?.kind === "pt") this.deletePt(d, hover.i);
      else if (f.pressed.has(BTN.B)) this.undo();
      else if (f.pressed.has(BTN.Y)) this.finishSegment();
      else if (f.pressed.has(BTN.LEFT) || f.pressed.has(BTN.RIGHT)) {
        const hs = this.handles(d);
        const at = hover ? hs.findIndex((q) => q.kind === hover.kind && q.i === hover.i) : -1;
        this.padSel = cycle(at >= 0 ? at : this.padSel, hs.length, f.pressed.has(BTN.RIGHT) ? 1 : -1);
        const h = hs[this.padSel];
        if (h) { const q = this.view.toClient(h.p); this.cur.x = q.x; this.cur.y = q.y; }
      }
      if (d.drag && f.held.has(BTN.A) && stick > 0) this.dragTo(d, this.view.toWorld(this.cur.x, this.cur.y));
      if (f.released.has(BTN.A) && d.drag) this.releaseDrag(d);
    } else {
      if (f.pressed.has(BTN.A)) this.pickAt(p);
      else if (f.pressed.has(BTN.Y)) this.clickBar("go");
      else if (f.pressed.has(BTN.X)) this.clickBar("edit");
      else if (f.pressed.has(BTN.B)) this.clickBar("revert");
    }
    this.view.drawCursor(this.pad.active && this.draw === d ? this.view.toWorld(this.cur.x, this.cur.y) : null, !!hover, f.held.has(BTN.A));
  }

  /** right stick pans the map, triggers zoom; racing also has Y to skip ahead and the d-pad for speed */
  private padWorld(f: PadFrame, dt: number, at: { x: number; y: number } | null): void {
    if (f.rx || f.ry) this.view.panBy(-f.rx * 420 * dt, -f.ry * 420 * dt);
    if (f.rt || f.lt) {
      const c = this.app.canvas.getBoundingClientRect();
      this.view.zoomBy(Math.exp((f.rt - f.lt) * dt * 1.6), at?.x ?? c.left + c.width / 2, at?.y ?? c.top + c.height / 2);
    }
    if (!at && this.play) {
      if (f.pressed.has(BTN.Y)) this.clickBar("skip");
      if (f.pressed.has(BTN.RIGHT) || f.pressed.has(BTN.LEFT)) this.clickBar("speed");
    }
  }

  private onFrame(dt: number): void {
    this.clock += dt;
    this.padFrame(dt);
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
    // stopped in the pits with the map showing (no playback): the names still follow their cars as the view is zoomed and panned, so the tag sits on the car in its box
    if (!p && this.race && this.inGame && !this.menuOpen && (this.pick || this.draw)) { this.updateNameLabels(this.race.tick, dt); return; }
    if (!p || !this.race || (this.menuOpen && this.inGame)) return; // the menu pauses the race
    const race = this.race;
    if (!p.final) this.stream(p);
    p.tick = Math.min(p.end, p.tick + ((p.start && !p.start.done ? this.stepStart(p.start, dt) : dt) * 60 * p.speed) / WORLD_TIME);
    const k = Math.floor(p.tick);
    const now = k / 60;
    this.drawCarsAt(p.tick);
    this.updateNameLabels(p.tick, dt);
    this.updateSkids(k);
    const me = race.cars.find((c) => c.entrant.id === ME)!;
    const mi = Math.min(k, me.trace.length / 3 - 1);
    const meDone = (me.finishTime !== null && me.finishTime <= now) || me.ptrace[mi] === 3;
    // slowly in on the player, and back out to the whole track once they finish
    const at = this.pose(me, p.tick);
    this.view.setFollow(meDone ? null : { x: at.x, y: at.y });
    this.view.setCrew(me.ptrace[mi] === 2 ? at : null);
    // the crowd as you go past the line, the wheel guns in your box, the radio when you are let go
    while (this.eventIdx < race.events.length && race.events[this.eventIdx]!.tick <= k) {
      const ev = race.events[this.eventIdx++]!;
      if (ev.type === "bump") {
        this.view.spark(ev.x ?? 0, ev.y ?? 0, ev.strength ?? 0);
        if (p.speed <= 2 && (ev.id === ME || ev.other === ME)) this.audio.bump(ev.strength ?? 0);
        continue;
      }
      if (ev.type === "sc") { this.scOn = true; this.toast("<b>Safety car</b>: the road is blocked. Hold your place, the field closes up", "sc"); continue; }
      if (ev.type === "scEnd") { this.scOn = false; this.toast("<b>Safety car in</b>: racing again", "good"); continue; }
      if (ev.type === "elim") { const who = race.cars.find((c) => c.entrant.id === ev.id); this.toast(ev.id === ME ? "<b>You're out!</b> Last on the road as the leader started the lap" : `<b>${esc(who?.entrant.name ?? "")}</b> is out`, ev.id === ME ? "bad" : ""); continue; }
      if (ev.id !== ME || p.speed > 2) continue;
      if (ev.type === "cross") this.audio.cheer();
      else if (ev.type === "pitStart") this.audio.drill(realSeconds(pitStopTime(this.vehicle)));
      else if (ev.type === "pitEnd") this.audio.goGoGo();
    }
    this.updateAudio(k, now, p.speed);

    const standing = [...race.cars].map((c) => {
      const done = c.finishTime !== null && c.finishTime <= now;
      return { c, key: done ? 1e12 - (c.finishTime as number) : (c.prog[Math.min(k, c.prog.length - 1)] ?? 0) };
    }).sort((a, b) => b.key - a.key);
    this.neighbours.clear();
    const here = standing.findIndex(({ c }) => c === me);
    for (const i of [here - 1, here + 1]) if (here >= 0 && i >= 0 && i < standing.length) this.neighbours.add(standing[i]!.c.entrant.id);
    const lap = Math.min(this.run.laps, Math.max(1, Math.floor(((me.prog[mi] ?? 0) + 1e5) / 1e5)));
    const rain = race.rainTrace[Math.min(Math.floor(k / 60), race.rainTrace.length - 1)] ?? 0;
    this.view.setWet(race.wetSnaps[Math.min(Math.floor(k / 60), race.wetSnaps.length - 1)] ?? null, rain);
    this.updateRain(rain);
    // a timed session is over for the player when the cool-down lap begins: results and editing are up at once, and the
    // car carries on round behind them
    if (this.timed() && !this.sessionShown && now >= (me.lapStart[this.run.laps - 1] ?? Infinity)) {
      this.sessionShown = true;
      this.showSessionResults(race.results(), true);
    }
    if (this.sessionShown) {
      if (p.final && p.tick >= p.end) { this.play = null; this.drawCarsAt(p.end); this.audio.stopAll(); this.updateRain(0); this.bar.clear(); }
      return;
    }
    // the panel is built once and only its contents change
    let el = this.ui.querySelector<HTMLElement>(".panel.top");
    if (!el || !el.querySelector("#hud-head")) {
      el = this.show("top hud", `<h2 id="hud-head"></h2><div id="hud-weather"></div><div id="hud-best"></div><div id="hud-laps"></div><div id="hud-status"></div><table id="hud-table"></table><div id="hud-elim"></div><div id="hud-gauges" class="bubbles"></div>`);
    }
    const set = (sel: string, html: string) => { const n = el!.querySelector(sel); if (n && n.innerHTML !== html) n.innerHTML = html; };
    set("#hud-head", `${this.lapText(lap)} <span class="dim">${fmt(now)}</span>${this.scOn ? ' <span class="scflag">SAFETY CAR</span>' : ""}`);
    const fc = this.forecastFor(this.track.phrase, this.run.laps, this.vehicle);
    set("#hud-weather", fc ? weatherGrid(fc, 75, Math.min(2, Math.floor(((lap - 1) / this.run.laps) * 3))) : "");
    // a time trial or practice: the best lap in a box of its own, with the last three laps listed under it, newest first
    if (this.timed()) {
      const times: { n: number; t: number }[] = [];
      for (let k = 1; k <= this.run.laps - 2; k++) {
        const a = me.lapStart[k], b = me.lapStart[k + 1];
        if (a !== undefined && b !== undefined && b <= now) times.push({ n: k, t: b - a });
      }
      const best = times.length ? Math.min(...times.map((x) => x.t)) : null;
      set("#hud-best", `<div class="best-box"><span>Best lap</span><b>${best === null ? "–" : fmt(best)}</b></div>`);
      set("#hud-laps", `<ul class="lap-list">${times.slice(-3).reverse().map((x) => `<li class="${x.t === best ? "best" : ""}"><span>Lap ${x.n}</span><b>${fmt(x.t)}</b></li>`).join("") || '<li class="dim"><span>No laps timed yet</span></li>'}</ul>`);
      set("#hud-table", "");
    } else {
      set("#hud-best", ""); set("#hud-laps", "");
    }
    // five rows: the leader, last place, the car ahead of you, you, the car behind (see standingsRows), each with how far it is from you in time
    if (!this.timed()) {
      // an elimination race lists only the cars still in; the ones out are counted in a small box under the table
      const isOut = (c: RaceCar) => !!this.run.elimination && c.elim > 0 && c.finishTime !== null && c.finishTime <= now;
      const outCars = standing.filter(({ c }) => isOut(c)).map(({ c }) => c);
      const listed = outCars.length ? standing.filter(({ c }) => !isOut(c)) : standing;
      const mePos = Math.max(0, listed.findIndex(({ c }) => c.entrant.id === ME));
      const rows = standingsRows(listed.length, mePos);
      // the splits are worked out every half second or so, and again when a different car turns up in the list
      if (k - this.splitTick >= SPLIT_EVERY || k < this.splitTick || rows.some((i) => !this.splits.has(listed[i]!.c.entrant.id))) {
        this.splitTick = k; this.splits.clear();
        const lapLen = trackLength(this.track);
        for (const i of rows) {
          const c = listed[i]!.c;
          if (c === me) continue;
          const laps = lapsApart(me.prog, c.prog, k, lapLen);
          const t = laps === 0 ? splitSeconds(me.prog, c.prog, k, lapLen) : null, secs = t === null ? 0 : realSeconds(Math.abs(t));
          this.splits.set(c.entrant.id, laps !== 0 ? `<span class="gap ${laps > 0 ? "ahead" : "behind"}">${laps > 0 ? "+" : "−"}${Math.abs(laps)} lap${Math.abs(laps) > 1 ? "s" : ""}</span>` : t === null ? "" : t >= 0 ? `<span class="gap ahead">+${secs.toFixed(1)}</span>` : `<span class="gap behind">−${secs.toFixed(1)}</span>`);
        }
        this.splits.set(ME, "");
      }
      set("#hud-table", rows.map((i, n) => { const c = listed[i]!.c; return `<tr class="${c.entrant.id === ME ? "me" : ""} ${n > 0 && i - rows[n - 1]! > 1 ? "gap" : ""}"><td>${i + 1}</td><td><span style="color:${hex(this.colorOf(c.entrant.id))}">■</span> ${esc(c.entrant.name)}</td><td class="num">${this.splits.get(c.entrant.id) ?? ""}</td></tr>`; }).join(""));
      if (this.run.elimination) {
        const last = outCars.reduce<RaceCar | null>((a, c) => (!a || c.elim > a.elim ? c : a), null);
        set("#hud-elim", isOut(me) ? `<div class="elimbox me">✕ You're out · P${race.cars.length - me.elim + 1}</div>`
          : outCars.length ? `<div class="elimbox">✕ <b>${outCars.length}</b> out · ${listed.length} left${last ? ` · last: ${esc(last.entrant.name)}` : ""}</div>` : `<div class="elimbox">${listed.length} in · the back of the field goes out every lap</div>`);
      }
    }
    if (this.run.realism) {
      const fuel = me.ftrace[mi] ?? 100, tyre = me.ttrace[mi] ?? 1, per = this.fuelLap();
      const comp = (["soft", "medium", "wet"] as const)[me.ctrace[mi] ?? 1]!;
      const col = `#${COMPOUNDS[comp].color.toString(16).padStart(6, "0")}`;
      const lowFuel = fuel < per * 0.5;
      const temp = me.tmtrace[mi] ?? 0.4, [tlo, thi] = COMPOUNDS[comp].window, tcol = temp < tlo ? "#6fb4ff" : temp > thi ? "#ff5d6c" : "#5fe08a";
      set("#hud-gauges", bubble("bub-fuel", FUEL_ICON, fuel / 100, lowFuel ? "#ff5d6c" : "#5fe08a", lowFuel) + bubble("bub-tyre", TYRE_SMALL, tyre, tyre < 0.4 ? "#ff5d6c" : col, tyre < 0.4) + bubble("bub-temp", TEMP_ICON, temp, tcol, temp < tlo || temp > thi));
      const code = me.ptrace[mi];
      set("#hud-status", fuel <= 0 && code !== 2 ? '<p class="bad">Out of fuel! Limping to the pits</p>' : code === 2 ? '<p class="good">In the pits…</p>' : code === 1 ? '<p class="dim">Pit lane: speed limit</p>' : fuel < per * 0.5 ? '<p class="bad">Fuel low</p>' : "");
    }
    const sb = this.bar.button("sound");
    if (sb) { const t = this.audio.isMuted() ? "Sound off" : "Sound on"; if (sb.title !== t) this.bar.setLabel("sound", t); }
    if (p.final && p.tick >= p.end) {
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
    this.race = undefined; this.play = null; this.pick = null; this.sessionShown = false;
    this.audio.stopAll(); this.updateRain(0); this.bar.clear();
    this.view.clearCars(); this.view.clearSkids();
    this.eventIdx = 0;
    this.showPicker(null);
  }

  /** Tell the server about this run, once. It times the line itself and, for a race, replays it; nothing here says how it went. */
  private reportRun(): void {
    const r = this.run, race = this.race;
    if (!race || this.reported === race || r.flow === "tutorial") return;
    this.reported = race;
    const car = this.playerCar();
    this.online.uploadLine(this.track.phrase, this.vehicle, car, this.me.lines[0]!);
    if (r.kind !== "race" || this.special || r.elimination || r.difficulty !== "hard" || r.rivals > MAX_RACE_RIVALS) return; // only the hard field is one the server can replay // the server will not replay a field bigger than it allows
    this.online.uploadRace({
      kind: r.flow === "weekend" ? "weekend" : "quick", phrase: this.track.phrase, vehicle: this.vehicle, car, laps: r.laps, rivals: r.rivals, realism: r.realism, lines: this.me.lines,
      wearFuel: r.wearFuel, wearTyre: r.wearTyre, mandatory: r.mandatory, startTyre: this.me.startTyre, startTactic: this.me.startTactic, pitPlan: this.me.pitPlan, autoPit: this.me.autoPit,
      ghostIds: this.rivalEntrants.filter((e) => e.id.startsWith("ghost:")).map((e) => e.id.slice(6)),
    });
  }

  private showResults(): void {
    this.rec?.r.stop(); // (a clip ends with the race)
    this.bar.clear();
    const race = this.race!;
    const res = race.results();
    if (this.special?.kind === "replay") { this.showReplayEnd(this.special.rep, res); return; }
    if (this.timed()) this.showSessionResults(res); else this.showRaceResults(res);
    // the camera is already easing back out to the whole track
    this.view.setFollow(null);
    this.updateTutorial();
  }

  /** Time trial, practice and qualifying: out lap, timed laps, cool-down lap. */
  private showSessionResults(res: CarResult[], early = false): void {
    this.reportRun();
    const r = this.run, kind = r.kind as Exclude<SessionKind, "race">;
    if (r.flow === "weekend" && this.weekend && this.race) this.weekend.rubber = this.race.rubberOut();
    const mine = res.find((x) => x.isPlayer)!;
    const time = sessionBest(mine.lapTimes, kind);
    if (kind === "trial" && time !== null && !early) {
      const golf = this.golfScore(this.me?.lines.at(-1) ?? null);
      this.award({ mode: this.special?.kind === "golf" ? "golf" : this.special?.kind === "daily" ? "daily" : "trial", position: null, field: 1, grid: null, laps: r.laps, difficulty: r.difficulty, realism: false, pits: 0, emergencies: 0, safetyCar: false, rain: false, golfStars: golf?.stars ?? 0, careerTier: this.career.tier });
    }
    const name = this.sessionTitle();
    // seen early, the cool-down lap is still being driven and has no time yet
    const shown = early ? mine.lapTimes.slice(0, -1) : mine.lapTimes;
    const laps = shown.map((t, i) => {
      const label = i === 0 ? "Out lap" : i === mine.lapTimes.length - 1 ? "Cool-down" : `Lap ${i}`;
      const timedLap = i > 0 && i < mine.lapTimes.length - 1;
      return `<tr class="${timedLap && t === time ? "me" : ""}"><td>${label}</td><td class="num">${fmt(t)}</td></tr>`;
    }).join("") + (early ? '<tr><td>Cool-down</td><td class="num dim">driving…</td></tr>' : "");
    // the last three timed laps, newest first (the out lap and the cool-down lap have no time that counts)
    const timedLaps = shown.map((t, i) => ({ n: i, t })).filter((x) => x.n > 0 && x.n < mine.lapTimes.length - 1);
    const lastLaps = timedLaps.slice(-3).reverse().map((x) => `<li class="${x.t === time ? "best" : ""}"><span>Lap ${x.n}</span><b>${fmt(x.t)}</b></li>`).join("");
    let extra = "", buttons = "", dailyDate_ = "";
    if (kind === "trial") {
      const key = trialKey(this.settings.phrase, this.vehicle);
      if (time !== null && (this.best[key] === undefined || time < this.best[key]!)) {
        this.best[key] = time;
        void save("best", this.best);
        extra = '<p class="good">New time trial record for this track!</p>';
      }
      extra += this.best[key] !== undefined ? `<p class="dim">Your best on this track: <b>${fmt(this.best[key])}</b></p>` : "";
      if (this.special?.kind === "daily" && time !== null) {
        const d = this.special.date, before = this.dailyRec.days[d];
        this.dailyRec = recordDaily(this.dailyRec, d, time);
        void save("daily", this.dailyRec);
        const streak = dailyStreak(this.dailyRec, d);
        extra += `<p class="${before === undefined || time < before ? "good" : "dim"}">Daily ${d}: <b>${fmt(this.dailyRec.days[d])}</b>${streak > 1 ? ` · ${streak} days in a row` : ""}</p><div id="daily-board" class="dim">Checking today's board…</div>`;
        dailyDate_ = d;
      }
      const golf = this.golfScore(this.me?.lines.at(-1) ?? null);
      if (golf) {
        const ph = this.track.phrase, was = this.golfRec[ph];
        const better = !was || golf.stars > was.stars || (golf.stars === was.stars && golf.stars > 0 && golf.points < was.points);
        if (better && golf.stars > 0) { this.golfRec[ph] = { stars: golf.stars, points: golf.points }; void save("golf", this.golfRec); }
        extra = `<div class="golfres"><p>⛳ <b>${golf.points}</b> points, par ${golf.par}: ${golf.stars ? `<b class="good">${"★".repeat(golf.stars)}${"☆".repeat(3 - golf.stars)}</b>` : '<span class="bad">the line misses the target</span>'}</p><p class="dim">Its flying lap ${fmt(golf.lap)} against the target ${fmt(golf.target)}.${better && golf.stars ? " A new best on today's course!" : was ? ` Today's best: ${"★".repeat(was.stars)} in ${was.points} points.` : ""}</p></div>` + extra;
      }
      buttons = `<button class="primary" id="again">Edit line &amp; try again</button>${this.special?.kind === "golf" ? "" : this.duelButton("Challenge a friend")}<button id="res-menu">Menu</button>`;
    } else if (kind === "practice") {
      this.practiceSecs += early ? this.race!.cars.find((c) => c.entrant.id === ME)!.lapStart[r.laps - 1]! : this.race!.time;
      const w = this.weekend ?? newWeekend();
      this.weekend = { ...w, practice: time !== null && (w.practice === undefined || time < w.practice) ? time : w.practice };
      const left = Math.max(0, PRACTICE_SECONDS - this.practiceSecs);
      extra = `<p class="dim">Best practice time: <b>${fmt(this.weekend.practice)}</b> · ${left > 0 ? `${Math.ceil(realSeconds(left) / 60)} min of practice left` : "practice time is up"}</p>`;
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
    const el = this.show("side", `
      <h2>${esc(name)}</h2>
      <p class="dim">${esc(this.track.phrase)} · ${esc(VEHICLES[this.vehicle].plural)}</p>
      ${kind === "qualifying" ? `<p style="font-size:26px;margin:8px 0"><b>${fmt(time)}</b> <span class="dim" style="font-size:13px">${time === null ? "no timed lap set" : "best timed lap"}</span></p>
      <table>${laps}</table>` : `<div class="best-box"><span>Best lap</span><b>${time === null ? "–" : fmt(time)}</b></div>
      <ul class="lap-list">${lastLaps || '<li class="dim"><span>No laps timed</span></li>'}</ul>`}${extra}
      ${this.lineDeltas()}
      ${buttons}`);
    this.wireDuelButton(el);
    this.on(el, "#res-menu", () => this.showMenu());
    if (dailyDate_) void this.online.daily(dailyDate_).then((b) => {
      const box = el.querySelector("#daily-board");
      if (!box) return;
      box.innerHTML = !b ? "The online board is not reachable right now." : b.top.length === 0 ? "You are the first on today's board." : `<table><tr><th>#</th><th>Driver</th><th class="num">Time</th></tr>${b.top.slice(0, 8).map((x, i) => `<tr class="${x.me ? "me" : ""}"><td>${i + 1}</td><td>${esc(x.name)}</td><td class="num">${fmt(x.time)}</td></tr>`).join("")}</table>${b.rank && b.rank > 8 ? `<p class="dim">You are ${b.rank}${["th", "st", "nd", "rd"][b.rank % 100 > 10 && b.rank % 100 < 14 ? 0 : b.rank % 10 < 4 ? b.rank % 10 : 0]} of ${b.total}.</p>` : ""}`;
    });
    this.on(el, "#again", () => { this.audio.unlock(); this.rerun(); });
    this.on(el, "#next", () => {
      if (kind === "practice") {
        this.weekend = finishSession(this.weekend ?? newWeekend(), "practice", this.weekend?.practice ?? null);
        this.startWeekendSession("qualifying");
      } else this.startWeekendSession("race");
    });
  }

  private showRaceResults(res: CarResult[]): void {
    this.reportRun();
    const mine = res.find((r) => r.isPlayer)!;
    const key = this.bestKey(this.track.phrase);
    let record = "";
    if (!mine.dnf && mine.finishTime !== null && (this.best[key] === undefined || mine.finishTime < this.best[key]!)) {
      this.best[key] = mine.finishTime;
      void save("best", this.best);
      record = '<p class="good" title="for this track and these rules">New best time</p>';
    }
    const fastest = mine.lapTimes.length ? Math.min(...mine.lapTimes) : null;
    const lapKey = this.lapKey(this.track.phrase);
    if (fastest !== null && (this.best[lapKey] === undefined || fastest < this.best[lapKey]!)) { this.best[lapKey] = fastest; void save("best", this.best); }
    const r = this.run;
    let earned = "";
    if (r.flow !== "tutorial" && !mine.dnf) {
      const rk = recordKey(this.track.phrase, this.vehicle);
      const before = starsFor(this.records, rk), open = DIFFICULTIES.filter((d) => isUnlocked(d, this.records));
      this.records = recordFinish(this.records, rk, r.difficulty, mine.position);
      void save("records", this.records);
      const opened = DIFFICULTIES.filter((d) => isUnlocked(d, this.records) && !open.includes(d));
      if (starsFor(this.records, rk) > before) earned += `<p class="good">${"★".repeat(starsFor(this.records, rk))} on this track</p>`;
      for (const d of opened) earned += `<p class="good">${d[0]!.toUpperCase() + d.slice(1)} unlocked!</p>`;
    }
    // a Challenge: judged from the finished race
    if (this.special?.kind === "challenge" && this.race) {
      const ch = challengeById(this.special.id);
      if (ch) {
        const out = evaluate(ch.goal, mine, { overtakes: overtakeCount(this.race, ME), contacts: contactCount(this.race, ME), reference: ch.goal.kind === "pace" ? referenceTime(ch.phrase, this.vehicle, ch.laps) : undefined });
        const had = this.challenges.stars[ch.id] ?? 0;
        this.challenges = recordChallenge(this.challenges, ch.id, out.stars);
        void save("challenges", this.challenges);
        earned += out.stars ? `<p class="good">${esc(ch.title)}: ${"★".repeat(out.stars)}${"☆".repeat(3 - out.stars)}${out.stars > had ? " (new best)" : ""}</p>` : `<p class="bad">${esc(ch.title)}: goal missed. ${esc(goalText(ch.goal))}</p>`;
        this.audio.stinger(out.stars > 0 ? "goal" : "round");
      }
    }
    // a round of the Championship: score it
    let season = "";
    const sea = this.special?.kind === "champ" ? this.season() : null;
    const inCareer = this.special?.kind === "champ" && !!this.special.career;
    if (sea && !isOver(sea)) {
      const done = applyRound(sea, res.map((x) => ({ id: x.id, name: x.name, position: x.position })));
      this.saveSeason(done);
      const rows = standings(done);
      season = `<h3>Season standings · round ${done.done} of ${done.rounds.length}</h3><table><tr><th>#</th><th>Driver</th><th class="num">Points</th></tr>${rows.slice(0, 8).map((x, i) => `<tr class="${x.id === ME ? "me" : ""}"><td>${i + 1}</td><td>${esc(x.name)}</td><td class="num">${x.points}</td></tr>`).join("")}</table>`;
      if (isOver(done)) season += `<p class="good">${rows[0]?.id === ME ? "You are the champion!" : `${esc(rows[0]?.name ?? "")} wins the championship.`}</p>`;
      if (isOver(done) && inCareer) {
        const place = rows.findIndex((x) => x.id === ME) + 1, was = this.career.tier;
        this.career = finishSeason(this.career, place);
        void save("career", this.career);
        season += this.career.tier > was ? `<p class="good">P${place} in the season: <b>promoted to ${esc(CAREER_TIERS[this.career.tier]!.name)}</b>!</p>` : place <= PROMOTE_PLACE ? `<p class="good">P${place}: the top of the ladder. Run it again for the title.</p>` : `<p class="dim">P${place} in the season: a top-${PROMOTE_PLACE} finish moves you up. Run the season again.</p>`;
      }
    }
    if (r.flow === "weekend" && this.weekend) this.weekend = finishSession(this.weekend, "race", null);
    if (r.flow === "tutorial" && this.tutBackup) { this.tutBackup.tutorialDone = true; this.persist(); }
    const crossed = crossedPlace(res, ME);
    const rival = res.find((x) => x.id === "duel");
    if (!this.special || this.special.kind !== "replay") {
      // (the trophies wait for the win's fanfare to finish, so the two are heard one after the other)
      if (mine.position === 1) this.trophyFree = Math.max(this.trophyFree, performance.now() + 1100);
      const mode: TrophyMode = this.special?.kind === "champ" ? (this.special.career ? "career" : "champ") : this.special?.kind === "duel" ? "duel" : this.special?.kind === "challenge" ? "challenge" : r.elimination ? "elim" : r.flow === "weekend" ? "weekend" : "race";
      this.stats = { races: this.stats.races + 1, wins: this.stats.wins + (mine.position === 1 ? 1 : 0) }; void save("stats", this.stats);
      const race = this.race!;
      this.award({ mode, position: mine.position, field: res.length, grid: mine.slot + 1, laps: r.laps, difficulty: r.difficulty, realism: r.realism, pits: mine.pits, emergencies: mine.emergencies, safetyCar: race.events.some((e) => e.type === "sc"), rain: race.rainTrace.some((x) => x > 0.3), golfStars: 0, careerTier: this.career.tier });
    }
    const title = this.special?.kind === "duel" && rival ? (mine.position === 1 ? `You beat ${esc(rival.name)}!` : `${esc(rival.name)}'s line wins`) : mine.position === 1 ? "You won!" : mine.eliminated ? `Out in P${mine.position}` : `You finished P${mine.position}`;
    // (with tyres and fuel in play the classification adds time penalties, so it can differ from the order the cars crossed the line in)
    const orderNote = !r.elimination && crossed !== null && crossed !== mine.position ? `<p class="dim">You crossed the line <b>P${crossed}</b>; with the time penalties (a car that never stopped in the pits, or never ran a required tyre, is given one) you are classified <b>P${mine.position}</b>.</p>` : "";
    if (mine.position === 1 && !mine.dnf && this.special?.kind !== "challenge") this.audio.stinger("win");
    const when = (x: CarResult) => x.eliminated ? `<span class="dim">out, lap ${x.lapTimes.length + 1}</span>` : (fmt(x.finishTime) + (x.penalty ? ` <span class="bad">+${realSeconds(x.penalty).toFixed(1)}</span>` : ""));
    const grid = r.flow === "weekend" ? this.weekend?.grid?.[ME] : undefined;
    const noStop = mine.penalty - mine.missing.length * pitPenalty(this.vehicle);
    // compact, so it fits a phone on its side: the place, your time, chips for what you earned, the podium and you, the rest behind a toggle
    const winner = res[0]!, gapTo = (x: CarResult) => (x.finishTime !== null && winner.finishTime !== null && x !== winner && !x.eliminated ? `+${realSeconds(x.finishTime - winner.finishTime).toFixed(1)}` : when(x));
    const ahead = mine.position === 1 && res[1]?.finishTime != null && mine.finishTime !== null ? `ahead by <b>${realSeconds(res[1].finishTime - mine.finishTime).toFixed(1)}s</b>` : mine.position > 1 && !mine.eliminated ? `<b>${gapTo(mine)}s</b> to the winner` : "";
    const shown = [...new Set([0, 1, 2, mine.position - 1])].filter((i) => i < res.length).sort((a, b) => a - b);
    const row = (x: CarResult, full: boolean) => `<tr class="${x.isPlayer ? "me" : ""}"><td>${x.position}</td><td>${esc(x.name)}</td>${full ? `<td class="num">${x.pits}${x.emergencies ? ` <span class="bad" title="emergency refuel">!</span>` : ""}</td><td class="num">${when(x)}</td><td class="num">${fmt(x.lapTimes.length ? Math.min(...x.lapTimes) : null)}</td>` : `<td class="num">${x === winner ? when(x) : gapTo(x)}</td>`}</tr>`;
    const brief = shown.map((i, k) => `${k > 0 && i - shown[k - 1]! > 1 ? '<tr class="gap"><td></td><td class="dim">…</td><td></td></tr>' : ""}${row(res[i]!, false)}`).join("");
    const chips = `${record}${earned}`;
    const el = this.show("center results", `
      <div class="res-head"><b class="res-place ${mine.position === 1 ? "p1" : mine.position <= 3 ? "pod" : ""}">P${mine.position}</b><div><h2>${r.flow === "weekend" ? "Race weekend · " : ""}${title}</h2>
        <p class="dim">${esc(this.track.phrase)} · ${r.laps} lap${r.laps > 1 ? "s" : ""} · ${esc(VEHICLES[this.vehicle].plural)}${r.realism ? (r.wearFuel > 1 || r.wearTyre > 1 ? ` · fuel ${r.wearFuel}× · tyres ${r.wearTyre}×` : "") : ""}${grid !== undefined ? ` · from P${grid + 1}` : ""}${r.flow !== "tutorial" ? ` · ${r.difficulty}` : ""}</p></div></div>
      <div class="res-stats"><span>Time <b>${when(mine)}</b></span><span>Best lap <b>${fmt(fastest)}</b></span>${ahead ? `<span>${ahead}</span>` : ""}</div>
      ${chips ? `<div class="res-chips">${chips}</div>` : ""}${orderNote}
      ${mine.emergencies ? `<p class="bad small">Ran dry ${mine.emergencies === 1 ? "once" : `${mine.emergencies} times`}: a slow limp to the pits and a long stop.</p>` : ""}
      ${noStop > 0 ? `<p class="bad small">+${realSeconds(noStop).toFixed(1)}s: you never stopped in the pits.</p>` : ""}
      ${mine.missing.length ? `<p class="bad small">+${realSeconds(mine.missing.length * pitPenalty(this.vehicle)).toFixed(1)}s: you never ran ${mine.missing.map((c) => COMPOUNDS[c].name).join(" or ")} tyres.</p>` : ""}
      <table class="res-brief">${brief}</table>
      <details class="res-more"><summary>Full results and your laps</summary>
        <table><tr><th>#</th><th>Driver</th><th class="num">Stops</th><th class="num">Time</th><th class="num">Best lap</th></tr>${res.map((x) => row(x, true)).join("")}</table>
        <p class="dim">Your laps: ${mine.lapTimes.map(fmt).join(" · ")}</p></details>
      ${this.lineDeltas()}
      ${season}
      <div class="res-btns">${this.special?.kind === "champ" ? `<button class="primary" id="next-round">${(() => { const c = this.season(); return !c || isOver(c) ? (inCareer ? "Career" : "Final standings") : "Next round"; })()}</button>` : `<button class="primary" id="again">${r.flow === "weekend" ? "Weekend again" : "Race again"}</button>`}${this.keepThisRace(title, mine.position) ? '<button id="watch">Replay</button>' : ""}${this.duelButton(this.special?.kind === "duel" ? "Send your line back" : "Challenge a friend")}<button id="res-menu">Menu</button></div>`);
    this.on(el, "#res-menu", () => this.showMenu());
    this.wireDuelButton(el);
    this.on(el, "#watch", () => { const rep = this.replays[0]; if (rep) this.watchReplay(rep); });
    this.on(el, "#next-round", () => { const c = this.season(); if (!c || isOver(c)) { this.showMenu(); this.go(inCareer ? "career" : "championship"); } else this.startChampRound(inCareer); });
    this.on(el, "#again", () => {
      this.audio.unlock();
      if (r.flow === "weekend") { this.weekend = newWeekend(); this.practiceSecs = 0; this.run = this.runFor("weekend", "practice"); }
      this.startGame();
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
      else if (d.pts.length === 0) { step = "2 · Draw"; text = `Click along the road to place points. The curve runs through them and the car has to drive it. <b>White</b> means clear, <b>red</b> means the line leaves the road.${TUT_TIPS[d.seg - 1] ? `<br><span class="tut-tip">${TUT_TIPS[d.seg - 1]}</span>` : ""}`; }
      else if (pv && !pv.ok) { step = "2 · Draw"; text = "That part is <b>red</b>: it leaves the road. Drag a point back onto the tarmac, or press <b>Backspace</b> to undo."; }
      else { step = "3 · Lock it in"; text = `Looks good. Press <b>Finish segment</b> (or <b>Enter</b>) and carry on to the next square of track. ${d.seg === n - 1 ? "This is the last one: it returns to your start." : `${n - d.seg} to go.`}${TUT_TIPS[d.seg - 1] ? `<br><span class="tut-tip">${TUT_TIPS[d.seg - 1]}</span>` : ""}`; }
    } else if (this.play) {
      step = "5 · Race"; text = "Your car drives the line you drew. <b>1×</b> changes the speed. It will stop at your pit stop, where you can change your line.";
    } else if (this.race && this.pick) {
      step = "6 · In the pits"; text = "You are in the pits. Select up to <b>3 segments</b> on the map, press <b>Edit segments</b> and redraw them, then <b>Back out</b>. You can also queue more stops.";
    } else if (this.pick && !this.race) {
      step = "4 · Plan";
      text = this.settings.pitPlan.length === 0
        ? "Your lap is drawn, in its speed colours, with the <b>flying lap</b> it is worth: red is slow, green fast. Click segments on the map to select them and <b>Edit segments</b> to redraw the slow ones. Open <b>Pit strategy</b> and queue a stop for fresh tyres and fuel, then press <b>Race!</b>"
        : "Stop queued. A pit stop is the only time you can change your line mid-race. Press <b>Race!</b>";
    } else if (this.race && !this.play) {
      step = "Done"; text = "Tutorial complete. Draw, race, pit, adjust. Try <b>Quick Race</b> next, or a <b>Race Weekend</b>.";
    }
    if (!text) { el.style.display = "none"; return; }
    if (coarse()) text = text.replace(/<b>Shift\+click<\/b> on the line/, "the <b>Tool</b> button set to insert, then a tap on the line,").replace(/<b>right-click<\/b> a point/, "holding a point").replace(/Click/g, "Tap").replace(/click/g, "tap").replace(/press <b>Backspace<\/b> to undo/, "press <b>Undo</b>").replace(/ \(or <b>Enter<\/b>\)/, "");
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
      this.draw = { mode: "amend", line: guide, seg: segments, id: segments, pts: guide.segs[segments]!.slice(0, -1), end: guide.segs[segments]!.at(-1)!, queue: [], drag: null, warn: "" };
      this.renderDraw();
      return;
    }
    let line = beginLine(this.track, guide.start);
    for (let i = 0; i < segments; i++) line = setSegment(line, i, guide.segs[i]!.slice(0, -1), guide.segs[i]!.at(-1)!, true);
    this.draw = { mode: "lap", line, seg: segments, id: segments, pts: guide.segs[segments]!.slice(0, 3), end: null, queue: [], drag: null, warn: "" };
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
    // (the race is worked out a moment after it starts, so wait for it)
    const park = (): void => {
      const p = this.play;
      if (!p) { window.setTimeout(park, 100); return; }
      p.tick = Math.min(p.end - 1, Math.floor((opts.atSeconds ?? 12) * 60));
      this.skidTick = 0;
      this.updateSkids(Math.floor(p.tick));
      this.drawCarsAt(Math.floor(p.tick));
      const me = this.race!.cars.find((c) => c.entrant.id === ME)!;
      const k = Math.floor(p.tick);
      this.view.setFollow(opts.zoomed === false ? null : { x: me.trace[k * 3]!, y: me.trace[k * 3 + 1]! });
      if (opts.zoomed !== false) this.view.snapCamera();
    };
    park();
  }
}

/** The view for a segment in its cell: the cell and a margin, grown (and re-centred) to hold any road that runs outside the cell. */
function cellRect(cell: Segment, m: number): { x: number; y: number; w: number; h: number } {
  let x0 = cell.cx * CELL - m, y0 = cell.cy * CELL - m, x1 = x0 + CELL + 2 * m, y1 = y0 + CELL + 2 * m;
  const e = ROAD_HALF + 2;
  for (const p of cell.center) { x0 = Math.min(x0, p.x - e); y0 = Math.min(y0, p.y - e); x1 = Math.max(x1, p.x + e); y1 = Math.max(y1, p.y + e); }
  const size = Math.max(x1 - x0, y1 - y0);
  return { x: (x0 + x1) / 2 - size / 2, y: (y0 + y1) / 2 - size / 2, w: size, h: size };
}

/** The view for segments that are not tied to a cell (a mapped circuit, or the two ways on at a fork): their road and a margin, as near square as the road allows. */
function segmentRect(segs: { center: Vec2[] }[], m: number): { x: number; y: number; w: number; h: number } {
  const pts = segs.flatMap((s) => s.center);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const size = Math.max(x1 - x0, y1 - y0, CELL) + 2 * (ROAD_HALF + m);
  return { x: (x0 + x1) / 2 - size / 2, y: (y0 + y1) / 2 - size / 2, w: size, h: size };
}

const coarse = (): boolean => matchMedia("(pointer: coarse)").matches;
const TOOL_LABEL = { add: "Tap: add", insert: "Tap: insert", delete: "Tap: delete" } as const;
const TOOL_NEXT = { add: "insert", insert: "delete", delete: "add" } as const;
