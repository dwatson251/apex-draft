import { podiumIcon, weatherPill } from "../hudicons.ts";
import { CHALLENGES, DIFFICULTIES, DIFFICULTY_NAMES, FIELD_SIZES, MAX_WEAR_MULT, ROUNDS, STARS, TACTICS, TACTIC_INFO, goalText, maxStars, pointsFor, type Challenge, type Compound, type Difficulty, type Tactic } from "@apex/sim";
import { TILE_ART, tile, type TileSpec } from "./tileart.ts";
import { compoundChips, copyField, dropdown, esc, stepper, toggle, type Opt } from "./controls.ts";

/** The menu screens as HTML. Pure functions of plain data: `Game` owns the state and wires the events. */

export type Flow = "trial" | "quick" | "weekend";

export function homeHtml(o: { version: string; quit: boolean; note: string; challenges: string }): string {
  const t = (spec: TileSpec) => tile(spec, esc);
  return `
    <header class="tilehead"><h1 class="logo">APEX <span>DRAFT</span></h1><p class="tagline">Draw the racing line. The car has to drive it.</p></header>
    <div class="tilegrid home6">
      ${t({ id: "h-race", art: "race", colour: "#ff6a2b", title: "Race", sub: "Quick Race, Race Weekend, Championship", size: "xl" })}
      ${t({ id: "h-play", art: "play", colour: "#ff3d7f", title: "Play now", sub: "A random track, three laps, seven rivals: draw and go", size: "w2" })}
      ${t({ id: "h-attack", art: "attack", colour: "#f2b705", title: "Time Attack", sub: "Time Trial and the Daily" })}
      ${t({ id: "h-challenges", art: "challenges", colour: "#8cc63f", title: "Challenges", sub: o.challenges })}
      ${t({ id: "h-garage", art: "garage", colour: "#2fbf71", title: "Garage", sub: "Tune and paint your car" })}
      ${t({ id: "h-tutorial", art: "tutorial", colour: "#1fa5d8", title: "Tutorial", sub: "Learn on the oval" })}
      ${t({ id: "h-settings", art: "settings", colour: "#7a5cf0", title: "Settings", sub: "Sound and controls", ...(o.quit ? {} : { size: "w2" as const }) })}
      ${o.quit ? t({ id: "h-quit", art: "quit", colour: "#8a93a8", title: "Quit", sub: "Close the game" }) : ""}
    </div>
    ${o.note ? `<p class="bad note">${esc(o.note)}</p>` : ""}
    <p class="ver">v${esc(o.version)}</p>`;
}

/** A group of modes behind one tile on the home screen: Race (against rivals) or Time Attack (against the clock). */
export function groupHtml(kind: "race" | "attack", o: { daily: string; champ: string }): string {
  const t = (spec: TileSpec) => tile(spec, esc);
  const head = (title: string, sub: string) => `<header class="tilehead"><button class="back" id="back">← Back</button><div><h2>${title}</h2><p class="dim">${sub}</p></div></header>`;
  return kind === "race"
    ? `${head("Race", "Rivals on the track")}<div class="tilegrid group">
        ${t({ id: "h-quick", art: "quick", colour: "#ff6a2b", title: "Quick Race", sub: "One race: rivals, tyres and fuel" })}
        ${t({ id: "h-weekend", art: "weekend", colour: "#e0409a", title: "Race Weekend", sub: "Practice, qualifier, race" })}
        ${t({ id: "h-champ", art: "champ", colour: "#d6283f", title: "Championship", sub: o.champ })}</div>`
    : `${head("Time Attack", "You, the track and the clock")}<div class="tilegrid group two">
        ${t({ id: "h-trial", art: "trial", colour: "#f2b705", title: "Solo Time Trial", sub: "Any track, as many tries as you like" })}
        ${t({ id: "h-daily", art: "daily", colour: "#14b8a6", title: "Daily", sub: o.daily })}</div>`;
}

const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  easy: "Rivals drive at two thirds of their pace. No tyres or fuel to manage.",
  medium: "Rivals drive at four fifths of their pace.",
  hard: "Rivals drive flat out, and other players' lines may join the field.",
};

export const starsText = (n: number, of = 3): string => "★".repeat(n) + "☆".repeat(of - n);

const DIFFICULTY_COLOUR: Record<Difficulty, string> = { easy: "#2fbf71", medium: "#f2b705", hard: "#e9453b" };

/** The three difficulties as tiles: a locked one is dimmed and cannot be picked, and says what opens it (on hover, or when tapped). `prefix` names their ids. */
export function difficultyTiles(prefix: string, current: Difficulty, locks: Record<Difficulty, string>): string {
  return `<div class="tilegrid group">${DIFFICULTIES.map((d) => {
    const lock = locks[d];
    return `<button class="tile${d === current && !lock ? " on" : ""}${lock ? " locked" : ""}" id="${prefix}-${d}" style="--c:${DIFFICULTY_COLOUR[d]}" ${lock ? `aria-disabled="true" aria-label="${DIFFICULTY_NAMES[d]}, locked. ${esc(lock)}" data-tip="${esc(lock)}"` : ""}>
      <span class="art">${TILE_ART[d]}</span><i class="tstars">${"★".repeat(STARS[d])}</i><b>${DIFFICULTY_NAMES[d]}</b><span class="sub">${DIFFICULTY_BLURB[d]}</span></button>`;
  }).join("")}</div>`;
}

/** The step before a Quick Race or Race Weekend's setup. */

export interface SetupData {
  flow: Flow;
  /** the difficulty chosen, for a race */
  difficulty: Difficulty | null;
  /** the difficulties the player has opened, to choose from; and what opens the next one, if one is still locked */
  unlocked: Difficulty[];
  nextLock: string;
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
    <div class="chips">${d.chips}${d.difficulty && d.record ? `<span class="chip stars" title="Stars for this track: one for Easy, two for Medium, three for Hard">${starsText(d.record.stars)}</span>${d.record.place ? `<span class="chip podium" title="Best finish on this track">${podiumIcon(d.record.place)}</span>` : ""}` : ""}${d.forecast ? weatherPill(d.forecast) : ""}</div>
    ${d.flow === "trial" ? '<div class="chips"><span class="chip dim">Soft tyres</span><span class="chip dim">No wear or fuel</span><span class="chip dim">No rivals</span></div>' : ""}
    ${race ? `<div class="opts">
      <div class="opt"><span>Rivals <em>${esc(DIFFICULTY_BLURB[d.difficulty ?? "easy"])}</em></span>${dropdown("difficulty", d.difficulty ?? "easy", d.unlocked.map((x) => ({ value: x, label: DIFFICULTY_NAMES[x] })), { label: "How hard the rivals drive" })}</div>
      ${d.nextLock ? `<p class="dim info lock-note">🔒 ${esc(d.nextLock)}</p>` : ""}
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


/** The Challenges list: each goal with its three tiers, the stars won so far, and one to start it. */
export function challengesHtml(o: { stars: Record<string, number>; total: number }): string {
  const star = (n: number) => `<i class="cstars">${starsText(n)}</i>`;
  const row = (c: Challenge) => `<button class="chrow" id="ch-${c.id}"><b>${esc(c.title)}</b>${star(o.stars[c.id] ?? 0)}<span>${esc(c.blurb)}</span><em>${esc(goalText(c.goal))} · ${c.laps} lap${c.laps > 1 ? "s" : ""} · ${DIFFICULTY_NAMES[c.difficulty]}</em></button>`;
  return `
    <div class="head"><button class="back" id="back">← Back</button><div><h2>Challenges</h2><p class="dim">${o.total} of ${maxStars()} stars. They count apart from the stars a track earns.</p></div></div>
    <div class="chlist">${CHALLENGES.map(row).join("")}</div>`;
}

export interface SeasonRow { name: string; points: number; wins: number; me: boolean }

/** The Championship screen: starting a season, or where the season stands and the next round. */
export function championshipHtml(o: {
  season: { round: number; of: number; over: boolean; next: string | null; difficulty: Difficulty; vehicle: string; rows: SeasonRow[] } | null;
  locks: Record<Difficulty, string>;
  chosen: Difficulty;
  vehicles: { value: string; label: string }[];
  vehicle: string;
}): string {
  const table = (rows: SeasonRow[]) => `<table><tr><th>#</th><th>Driver</th><th class="num">Wins</th><th class="num">Points</th></tr>${rows.map((r, i) => `<tr class="${r.me ? "me" : ""}"><td>${i + 1}</td><td>${esc(r.name)}</td><td class="num">${r.wins}</td><td class="num">${r.points}</td></tr>`).join("")}</table>`;
  const head = '<div class="head"><button class="back" id="back">← Back</button><div><h2>Championship</h2>';
  if (o.season) {
    const s = o.season;
    return `${head}<p class="dim">${esc(s.vehicle)} · ${DIFFICULTY_NAMES[s.difficulty]} · ${s.over ? "season over" : `round ${s.round + 1} of ${s.of}`}</p></div></div>
      ${s.over ? `<p class="good">Season complete. ${s.rows[0]?.me ? "You are the champion!" : `${esc(s.rows[0]?.name ?? "")} takes the title.`}</p>` : `<p>Next: <b>${esc(s.next ?? "")}</b></p>`}
      ${s.rows.length ? table(s.rows) : '<p class="dim">No rounds raced yet. Points: ' + [1, 2, 3, 4, 5].map((p) => pointsFor(p)).join(" · ") + ' ...</p>'}
      <div class="bigbtns">${s.over ? '<button class="big yellow wide" id="champ-new">New season</button>' : '<button class="big yellow wide" id="champ-go">' + (s.round === 0 ? "Start the season" : "Next round") + '</button><button class="big" id="champ-quit">Abandon</button>'}</div>`;
  }
  return `${head}<p class="dim">${ROUNDS} races on linked tracks: same machine, same rivals, points for the places. Each round is a qualifier, then the race.</p></div></div>
    ${difficultyTiles("cd", o.chosen, o.locks)}
    <label>Machine</label>${dropdown("champ-vehicle", o.vehicle, o.vehicles.map((v) => ({ value: v.value, label: v.label })), { label: "Machine" })}
    <div class="bigbtns"><button class="big yellow wide" id="champ-start">Start a season</button></div>`;
}

/** The tactic chips (attack, balanced, defend) for the start of a race or a pit stop. */
export function tacticChips(id: string, current: Tactic): string {
  return `<div class="chips tactics" role="group" aria-label="Tactic">${TACTICS.map((t) => `<button class="chip tac${t === current ? " on" : ""}" data-tac="${id}:${t}" title="${esc(TACTIC_INFO[t].blurb)}">${TACTIC_INFO[t].name}</button>`).join("")}</div>`;
}
