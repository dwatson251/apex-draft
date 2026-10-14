import { MAX_RIVALS, MAX_WEAR_MULT, type Compound } from "@apex/sim";
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
      <button class="hb h-violet" id="h-settings"><b>Settings</b><span>Sound and controls</span></button>
      ${o.quit ? '<button class="hb h-grey" id="h-quit"><b>Quit</b><span>Close the game</span></button>' : ""}
    </div>
    ${o.note ? `<p class="bad note">${esc(o.note)}</p>` : ""}
    <p class="ver">v${esc(o.version)}</p>`;
}

export interface SetupData {
  flow: Flow;
  phrase: string;
  /** chips for the circuit, surface and vehicle, already HTML */
  chips: string;
  blurb: string;
  forecast: string;
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
  importCount: number;
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
    <div class="chips">${d.chips}</div>
    <p class="dim blurb">${esc(d.blurb)}</p>
    ${d.forecast ? `<p class="forecast">☁ ${esc(d.forecast)}</p>` : ""}
    ${d.flow === "trial" ? '<div class="chips"><span class="chip dim">Soft tyres</span><span class="chip dim">No wear or fuel</span><span class="chip dim">No rivals</span></div>' : ""}
    ${race ? `<div class="opts">
      <div class="opt"><span>Laps</span>${stepper("laps", d.laps, 1, 50)}</div>
      <div class="opt"><span>Rivals</span>${dropdown("rivals", String(d.rivals), nums(1, MAX_RIVALS), { label: "Rivals" })}</div>
      ${d.flow === "quick" ? `<div class="opt"><span>Realism <em>tyres, fuel, pit stops, weather</em></span>${toggle("realism", d.realism)}</div>` : ""}
      ${wear ? `<div class="opt"><span>Fuel use</span>${dropdown("wearFuel", String(d.wearFuel), mult(), { label: "Fuel use" })}</div>
      <div class="opt"><span>Tyre wear</span>${dropdown("wearTyre", String(d.wearTyre), mult(), { label: "Tyre wear" })}</div>
      <div class="opt wide"><span>Tyres you must use</span>${compoundChips("mandatory", d.mandatory)}</div>` : ""}
    </div>` : ""}
    <p class="dim info">${esc(d.carLine)}${d.bestLine ? ` · ${d.bestLine}` : ""}${race && d.importCount ? ` · Imported rival lines: <b>${d.importCount}</b>` : ""}</p>
    ${d.gridLine ? `<p class="dim info">${d.gridLine}</p>` : ""}
    ${d.note ? `<p class="bad note">${esc(d.note)}</p>` : ""}
    <div class="bigbtns">
      <button class="big yellow wide" id="go">${t.go}</button>
      <button class="big cyan" id="garage">Garage</button>
      ${race ? '<button class="big blue" id="import">Import lines</button>' : ""}
    </div>`;
}

export function settingsHtml(o: { muted: boolean; music: boolean; version: string; fromGame: boolean }): string {
  const key = (k: string, what: string) => `<div class="keyrow"><kbd>${k}</kbd><span>${what}</span></div>`;
  return `
    <div class="head"><button class="back" id="back">← Back</button><div><h2>Settings</h2></div></div>
    <div class="opts one">
      <div class="opt"><span>Sound effects</span>${toggle("sound", !o.muted)}</div>
      <div class="opt"><span>Music</span>${toggle("music", o.music)}</div>
    </div>
    <label>Controls</label>
    <div class="keys">
      ${key("Click", "place a point")}${key("Drag", "move a point, or pan the map")}${key("Right-click", "delete a point")}${key("Shift-click", "insert a point")}
      ${key("Enter", "finish a segment")}${key("Backspace", "undo")}${key("Scroll", "zoom the map")}${key("M", "mute")}${key("Esc", "menu / back")}
    </div>
    <div class="bigbtns"><button class="big grey" id="tutorial-reset">Reset tutorial</button></div>
    <p class="ver">v${esc(o.version)}</p>`;
}

export function pauseHtml(o: { title: string; sub: string }): string {
  return `
    <h2 class="pause-title">${esc(o.title)}</h2>
    <p class="dim center-text">${esc(o.sub)}</p>
    <div class="bigbtns col">
      <button class="big yellow wide" id="resume">Resume</button>
      <button class="big orange" id="restart">Redraw track</button>
      <button class="big violet" id="p-settings">Settings</button>
      <button class="big grey" id="quit">Quit to menu</button>
    </div>`;
}
