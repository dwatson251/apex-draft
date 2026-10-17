import { podiumIcon, weatherPill } from "../hudicons.ts";
import { DIFFICULTIES, DIFFICULTY_NAMES, FIELD_SIZES, MAX_WEAR_MULT, STARS, type Compound, type Difficulty } from "@apex/sim";
import { compoundChips, copyField, dropdown, esc, stepper, toggle, type Opt } from "./controls.ts";

/** The menu screens as HTML. Pure functions of plain data: `Game` owns the state and wires the events. */

export type Flow = "trial" | "quick" | "weekend";

export function homeHtml(o: { version: string; quit: boolean; note: string }): string {
  return `
    <h1 class="logo">APEX <span>DRAFT</span></h1>
    <p class="tagline">Draw the racing line. The car has to drive it.</p>
    <div class="home">
      <button class="hb h-yellow" id="h-trial"><b>Solo Time Trial</b><span>You, the track and the clock</span></button>
      <button class="hb h-orange" id="h-quick"><b>Quick Race</b><span>Rivals, tyres and fuel</span></button>
      <button class="hb h-pink" id="h-weekend"><b>Race Weekend</b><span>Practice, qualifier, race</span></button>
      <button class="hb h-cyan" id="h-tutorial"><b>Tutorial</b><span>Learn on the oval</span></button>
      <button class="hb h-green" id="h-garage"><b>Garage</b><span>Tune your car</span></button>
      <button class="hb h-violet" id="h-settings"><b>Settings</b><span>Sound and controls</span></button>
      ${o.quit ? '<button class="hb h-grey" id="h-quit"><b>Quit</b><span>Close the game</span></button>' : ""}
    </div>
    ${o.note ? `<p class="bad note">${esc(o.note)}</p>` : ""}
    <p class="ver">v${esc(o.version)}</p>`;
}

const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  easy: "Rivals drive at two thirds of their pace. No tyres or fuel to manage.",
  medium: "Rivals drive at four fifths of their pace.",
  hard: "Rivals drive flat out, and other players' lines may join the field.",
};

export const starsText = (n: number, of = 3): string => "★".repeat(n) + "☆".repeat(of - n);

/** The step before a Quick Race or Race Weekend's setup. A locked difficulty is dimmed and cannot be picked; `locks` says what opens it. */
export function difficultyHtml(o: { flow: Flow; current: Difficulty; locks: Record<Difficulty, string> }): string {
  return `
    <div class="head"><button class="back" id="back">← Back</button><div><h2>${o.flow === "weekend" ? "Race Weekend" : "Quick Race"}</h2><p class="dim">How hard should the rivals drive?</p></div></div>
    <div class="diffs">${DIFFICULTIES.map((d) => {
      const lock = o.locks[d];
      return `<button class="diff d-${d}${d === o.current && !lock ? " current" : ""}${lock ? " locked" : ""}" id="d-${d}" ${lock ? `aria-disabled="true" title="${esc(lock)}"` : ""}><b>${DIFFICULTY_NAMES[d]}</b><i>${starsText(STARS[d], 3).replace(/☆/g, "")}</i><span>${DIFFICULTY_BLURB[d]}</span>${lock ? `<em>🔒 ${esc(lock)}</em>` : ""}</button>`;
    }).join("")}</div>
    <p class="dim info" id="d-hint" aria-live="polite"></p>`;
}

export interface SetupData {
  flow: Flow;
  /** the difficulty chosen, for a race */
  difficulty: Difficulty | null;
  /** easy has no realism: the toggle and the wear options are not shown */
  noRealism: boolean;
  /** stars and best place on this track and machine, for a race */
  record: { stars: number; place: number | null } | null;
  phrase: string;
  /** chips for the circuit, surface and vehicle, already HTML */
  chips: string;
  blurb: string;
  /** rain at the start, middle and end of the race, or null with nothing to forecast */
  forecast: [boolean, boolean, boolean] | null;
  laps: number;
  rivals: number;
  realism: boolean;
  wearFuel: number;
  wearTyre: number;
  mandatory: Compound[];
  carLine: string;
  /** the best time on this track, shown for the time trial; empty if none */
  bestLine: string;
  /** how the grid will be set, shown on a quick race */
  gridLine: string;
  note: string;
}

const TITLES: Record<Flow, { title: string; sub: string; go: string }> = {
  trial: { title: "Solo Time Trial", sub: "Out lap, one flying lap, cool-down lap. Your time is kept for this track.", go: "Start" },
  quick: { title: "Quick Race", sub: "A single race against rivals.", go: "Start race" },
  weekend: { title: "Race Weekend", sub: "Practice, qualify, then race from where you qualified.", go: "Start weekend" },
};

const nums = (from: number, to: number): Opt[] => Array.from({ length: to - from + 1 }, (_, i) => ({ value: String(from + i), label: String(from + i) }));
const mult = (): Opt[] => nums(1, MAX_WEAR_MULT).map((o) => ({ value: o.value, label: `${o.value}×` }));

export function setupHtml(d: SetupData): string {
  const t = TITLES[d.flow];
  const race = d.flow !== "trial";
  const wear = race && d.realism;
  return `
    <div class="head"><button class="back" id="back">← Back</button><div><h2>${t.title}</h2><p class="dim">${t.sub}</p></div></div>
    ${d.flow === "weekend" ? '<div class="sessions"><span>Practice</span><i></i><span>Qualifier</span><i></i><span>Race</span></div>' : ""}
    <label>Track phrase</label>
    <div class="row">${copyField("phrase", d.phrase)}<button id="rand" class="pill pink">Random</button></div>
    <div class="chips">${d.chips}${d.forecast ? weatherPill(d.forecast) : ""}</div>
    ${d.difficulty ? `<div class="chips"><span class="chip diff-chip d-${d.difficulty}">${DIFFICULTY_NAMES[d.difficulty]}</span>${d.record ? `<span class="chip stars" title="Stars for this track: one for Easy, two for Medium, three for Hard">${starsText(d.record.stars)}</span>${d.record.place ? `<span class="chip podium" title="Best finish on this track">${podiumIcon(d.record.place)}</span>` : ""}` : ""}</div>` : ""}
    ${d.flow === "trial" ? '<div class="chips"><span class="chip dim">Soft tyres</span><span class="chip dim">No wear or fuel</span><span class="chip dim">No rivals</span></div>' : ""}
    ${race ? `<div class="opts">
      <div class="opt"><span>Laps</span>${stepper("laps", d.laps, 1, 50)}</div>
      <div class="opt"><span>Players</span>${dropdown("rivals", String(d.rivals), FIELD_SIZES.map((n) => ({ value: String(n - 1), label: String(n) })), { label: "Players on the grid, you included" })}</div>
      ${d.flow === "quick" && !d.noRealism ? `<div class="opt"><span>Realism <em>tyres, fuel, pit stops, weather</em></span>${toggle("realism", d.realism)}</div>` : ""}
      ${wear ? `<div class="opt"><span>Fuel use</span>${dropdown("wearFuel", String(d.wearFuel), mult(), { label: "Fuel use" })}</div>
      <div class="opt"><span>Tyre wear</span>${dropdown("wearTyre", String(d.wearTyre), mult(), { label: "Tyre wear" })}</div>
      <div class="opt wide"><span>Tyres you must use</span>${compoundChips("mandatory", d.mandatory)}</div>` : ""}
    </div>` : ""}
    <p class="dim info">${esc(d.carLine)}${d.bestLine ? ` · ${d.bestLine}` : ""}</p>
    ${d.gridLine ? `<p class="dim info">${d.gridLine}</p>` : ""}
    ${d.note ? `<p class="bad note">${esc(d.note)}</p>` : ""}
    <div class="bigbtns">
      <button class="big yellow wide" id="go">${t.go}</button>
      <button class="big cyan" id="garage">Garage</button>
    </div>`;
}

export function settingsHtml(o: { muted: boolean; music: boolean; version: string; fromGame: boolean; name: string; nameMax: number }): string {
  const key = (k: string, what: string) => `<div class="keyrow"><kbd>${k}</kbd><span>${what}</span></div>`;
  return `
    <div class="head"><button class="back" id="back">← Back</button><div><h2>Settings</h2></div></div>
    <label for="player-name">Your name <span class="dim">shown above your car and on the website</span></label>
    <input id="player-name" class="fancy" type="text" value="${esc(o.name)}" maxlength="${o.nameMax}" spellcheck="false" autocomplete="off" />
    <div class="opts one">
      <div class="opt"><span>Sound effects</span>${toggle("sound", !o.muted)}</div>
      <div class="opt"><span>Music</span>${toggle("music", o.music)}</div>
    </div>
    <label>Controls</label>
    <div class="keys">
      ${matchMedia("(pointer: coarse)").matches
        ? `${key("Tap", "place a point")}${key("Drag a point", "move it")}${key("Hold a point", "delete it")}${key("Tap: insert", "add a point on the line")}
      ${key("Pinch", "zoom the map")}${key("Two fingers", "pan the map")}${key("Undo", "take back a point")}${key("Back", "menu / back")}`
        : `${key("Click", "place a point")}${key("Drag", "move a point, or pan the map")}${key("Right-click", "delete a point")}${key("Shift-click", "insert a point")}
      ${key("Enter", "finish a segment")}${key("Backspace", "undo")}${key("Scroll", "zoom the map")}${key("M", "mute")}${key("Esc", "menu / back")}`}
    </div>
    <label>Gamepad</label>
    <div class="keys">
      ${key("Left stick", "move the cursor")}${key("A", "place a point, or grab one (hold to drag)")}${key("X", "insert a point")}${key("LB", "delete the point under the cursor")}
      ${key("B", "undo")}${key("Y", "finish a segment")}${key("D-pad ◀ ▶", "step through the points")}${key("Right stick", "pan the map")}
      ${key("LT / RT", "zoom")}${key("Select", "walk the buttons with the d-pad")}${key("Start", "menu / back")}
    </div>
    <div class="bigbtns"><button class="big grey" id="tutorial-reset">Reset tutorial</button></div>
    <p class="ver">v${esc(o.version)}</p>`;
}

export function pauseHtml(o: { title: string; sub: string; finish?: boolean }): string {
  return `
    <h2 class="pause-title">${esc(o.title)}</h2>
    <p class="dim center-text">${esc(o.sub)}</p>
    <div class="bigbtns col">
      <button class="big yellow wide" id="resume">Resume</button>
      ${o.finish ? '<button class="big cyan" id="finish-track">Finish track for me</button>' : ""}
      <button class="big orange" id="restart">Redraw track</button>
      <button class="big violet" id="p-settings">Settings</button>
      <button class="big grey" id="quit">Quit to menu</button>
    </div>`;
}
