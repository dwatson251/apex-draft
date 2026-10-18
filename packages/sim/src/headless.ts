import { botLine } from "./bots.ts";
import { isTactic, type Tactic } from "./tactics.ts";
import { RIVAL_PACE, SKILL_RANGE, type Difficulty } from "./difficulty.ts";
import { STATS, defaultCar, validateCar, type CarConfig } from "./car.ts";
import { isComplete, validateLine, type Line } from "./line.ts";
import { MAX_PIT_STOPS, Race, type CarResult, type Entrant, type RaceRules } from "./race.ts";
import { Rng } from "./rng.ts";
import { normalizePhrase } from "./seed.ts";
import { quickGridTime, sessionBest, sessionLaps, sessionRules, type SessionOptions } from "./session.ts";
import { isCompound, type Compound } from "./tyres.ts";
import { generateTrack, placeFor, trackLength, type Track } from "./track.ts";
import { isVehicleId, type VehicleId } from "./vehicles.ts";

/**
 * The sim as a service: whole sessions in one call, no game around them. The server uses these to time uploaded lines and to replay
 * races, and the game uses the same ones, so a time means the same thing on both sides. Everything here is deterministic.
 */

const RIVAL_NAMES = ["Nova", "Kestrel", "Dash", "Pebble", "Orbit", "Rook", "Ember", "Sable", "Juno", "Flint", "Mako", "Wren", "Zephyr", "Quill", "Tango", "Bolt", "Cinder", "Maple", "Onyx", "Pixel", "Ripley", "Sprocket", "Tundra", "Vesper", "Willow", "Yarrow", "Atlas", "Biscuit", "Comet", "Drift", "Echo", "Fennel"];

// ---------- tracks ----------
const cache = new Map<string, Track>();
/** Every circuit, kart course and a few hundred random tracks a day pass through here: sixty-four was one cache's worth when there were a dozen circuits. */
const CACHE_MAX = 256;

/** A track as the game plays it (no obstacles), built once and kept: building one costs 10 to 110 ms, running a lap about 50. Never mutate it. */
export function cachedTrack(phrase: string): Track {
  const key = normalizePhrase(phrase);
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  const t = generateTrack(key, { obstacles: false });
  cache.set(key, t);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return t;
}

// ---------- rivals ----------
/** The computer-driven rivals for slots `from` up to `to`, the same ones on every machine: drawn from the track, never from a clock. */
export function makeBots(track: Track, vehicle: VehicleId, from: number, to: number, difficulty: Difficulty = "hard", roster?: number): Entrant[] {
  if (roster !== undefined) return rosterBots(track, vehicle, from, to, difficulty, roster);
  const rng = new Rng(track.seed ^ 0xa5a5a5a5);
  const names = [...RIVAL_NAMES];
  const out: Entrant[] = [];
  for (let i = from; i < to; i++) {
    const car: CarConfig = { name: "Bot", accel: 6, top: 6, grip: 6, brake: 6, type: vehicle };
    for (let k = 0; k < 8; k++) {
      const a = rng.pick(STATS.filter((x) => car[x] > 3));
      const b = rng.pick(STATS.filter((x) => car[x] < 9 && x !== a));
      car[a]--; car[b]++;
    }
    const [lo, hi] = SKILL_RANGE[difficulty];
    const skill = lo + (hi - lo) * rng.next();
    const seed = rng.int(2 ** 30);
    out.push({ id: `bot${i}`, name: names.splice(rng.int(names.length), 1)[0] ?? `Bot ${i}`, car, lines: [botLine(track, seed, skill)], bot: { seed, skill }, ...(RIVAL_PACE[difficulty] < 1 ? { pace: RIVAL_PACE[difficulty] * (0.97 + 0.06 * rng.next()) } : {}) });
  }
  return out;
}

/**
 * The same rivals on every track: a roster seed fixes each one's name, car and skill by its place in the field (the line it
 * draws is still its own for each track). A championship uses one so that the season table follows the same drivers.
 */
function rosterBots(track: Track, vehicle: VehicleId, from: number, to: number, difficulty: Difficulty, roster: number): Entrant[] {
  const names = new Rng((roster ^ 0x7e57ab1e) >>> 0);
  const order = [...RIVAL_NAMES];
  for (let i = order.length - 1; i > 0; i--) { const j = names.int(i + 1); [order[i], order[j]] = [order[j]!, order[i]!]; }
  const out: Entrant[] = [];
  for (let i = from; i < to; i++) {
    const rng = new Rng((roster ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);
    const car: CarConfig = { name: "Bot", accel: 6, top: 6, grip: 6, brake: 6, type: vehicle };
    for (let k = 0; k < 8; k++) {
      const a = rng.pick(STATS.filter((x) => car[x] > 3));
      const b = rng.pick(STATS.filter((x) => car[x] < 9 && x !== a));
      car[a]--; car[b]++;
    }
    const [lo, hi] = SKILL_RANGE[difficulty];
    const skill = lo + (hi - lo) * rng.next();
    const seed = new Rng((track.seed ^ roster ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0).int(2 ** 30);
    const pace = RIVAL_PACE[difficulty] < 1 ? RIVAL_PACE[difficulty] * (0.97 + 0.06 * rng.next()) : undefined;
    out.push({ id: `bot${i}`, name: order[i % order.length] ?? `Bot ${i}`, car, lines: [botLine(track, seed, skill)], bot: { seed, skill }, ...(pace !== undefined ? { pace } : {}) });
  }
  return out;
}

// ---------- a solo timed lap ----------
export interface TrialInput { phrase: string; vehicle: string; car: CarConfig; line: Line }
export type TrialResult = { ok: true; phrase: string; vehicle: VehicleId; time: number; lapTimes: number[] } | { ok: false; error: string };

/**
 * The Time Trial, alone on the road: out lap, timed lap, cool-down lap, the line driven on each. Returns the timed lap.
 * Every check the game makes before a race is made here too, so a line that comes back ok is one the game could have driven.
 */
export function timeTrial(i: TrialInput): TrialResult {
  const phrase = normalizePhrase(i.phrase);
  if (!phrase || phrase.length > 80) return { ok: false, error: "bad track phrase" };
  if (!isVehicleId(i.vehicle)) return { ok: false, error: "unknown vehicle" };
  if (!placeFor(phrase).choices.includes(i.vehicle)) return { ok: false, error: "that machine is not available on this track" };
  const carErr = validateCar(i.car);
  if (carErr) return { ok: false, error: `car: ${carErr}` };
  const track = cachedTrack(phrase);
  if (!isComplete(track, i.line)) return { ok: false, error: "the line does not go all the way round" };
  if (!validateLine(track, i.line).ok) return { ok: false, error: "the line leaves the road" };
  const laps = sessionLaps("trial");
  const car: CarConfig = { ...defaultCar(), ...i.car, name: String(i.car.name).slice(0, 40), type: i.vehicle };
  const me: Entrant = { id: "me", name: "Driver", car, lines: Array.from({ length: laps }, () => i.line), isPlayer: true, startTyre: "soft", gridSlot: 0 };
  const race = new Race(track, [me], laps, sessionRules("trial"));
  race.runToEnd();
  const res = race.results().find((r) => r.isPlayer);
  if (!res || res.dnf) return { ok: false, error: "the car did not finish" };
  const time = sessionBest(res.lapTimes, "trial");
  if (time === null || !Number.isFinite(time) || time <= 0) return { ok: false, error: "no timed lap" };
  return { ok: true, phrase, vehicle: i.vehicle, time, lapTimes: res.lapTimes };
}

// ---------- a whole race ----------
/** A rival that is another player's recorded line. `time` is their solo time on this track, which places them on the grid. */
export interface GhostRival { id: string; name: string; car: CarConfig; line: Line; time: number }

export interface RaceInput {
  phrase: string;
  vehicle: string;
  car: CarConfig;
  /** the distinct lines the player drove, and which of them each lap used */
  lines: Line[];
  lapLine: number[];
  laps: number;
  realism: boolean;
  wearFuel?: number;
  wearTyre?: number;
  mandatory?: Compound[];
  startTyre?: Compound;
  startTactic?: Tactic;
  pitPlan?: { lap: number; tyre?: Compound; tactic?: Tactic }[];
  /** the pit wall calls the stops the player did not queue (see `Entrant.autoPit`) */
  autoPit?: boolean;
  ghosts: GhostRival[];
  /** rivals in all (ghosts included); the rest are computer-driven */
  rivals: number;
  /** the player's own solo time on this track, which grids them in a quick race (none: they start last) */
  playerTime: number | null;
}

export interface Standing { id: string; name: string; isPlayer: boolean; ghost: boolean; position: number; finishTime: number | null; rawTime: number | null; dnf: boolean; bestLap: number | null }
export type RaceOutcome = { ok: true; phrase: string; vehicle: VehicleId; standings: Standing[]; player: Standing } | { ok: false; error: string };

export const MAX_RACE_LAPS = 50;
/** The most race distance (units) a race run for the server may cover: a lap of the Nordschleife is 18 thousand, so it allows 16 laps of it, and 50 of anything up to six thousand. */
export const MAX_RACE_UNITS = 300_000;
/** The most laps the server will run on this track. */
export const maxLapsFor = (t: Track): number => Math.max(1, Math.min(MAX_RACE_LAPS, Math.floor(MAX_RACE_UNITS / trackLength(t))));
export const MAX_RACE_RIVALS = 31;

/** Run a race to the end with the player's lines against recorded ghosts and bots. */
export function runRace(i: RaceInput): RaceOutcome {
  const phrase = normalizePhrase(i.phrase);
  if (!phrase || phrase.length > 80) return { ok: false, error: "bad track phrase" };
  if (!isVehicleId(i.vehicle)) return { ok: false, error: "unknown vehicle" };
  if (!placeFor(phrase).choices.includes(i.vehicle)) return { ok: false, error: "that machine is not available on this track" };
  const carErr = validateCar(i.car);
  if (carErr) return { ok: false, error: `car: ${carErr}` };
  if (!Number.isInteger(i.laps) || i.laps < 1 || i.laps > MAX_RACE_LAPS) return { ok: false, error: "bad lap count" };
  if (!Number.isInteger(i.rivals) || i.rivals < 1 || i.rivals > MAX_RACE_RIVALS) return { ok: false, error: "bad rival count" };
  if (!i.lines.length || i.lapLine.length !== i.laps || !i.lapLine.every((k) => Number.isInteger(k) && k >= 0 && k < i.lines.length)) return { ok: false, error: "bad lap lines" };
  const track = cachedTrack(phrase);
  if (i.laps > maxLapsFor(track)) return { ok: false, error: `at most ${maxLapsFor(track)} laps on this track` };
  for (const l of i.lines) {
    if (!isComplete(track, l)) return { ok: false, error: "a line does not go all the way round" };
    if (!validateLine(track, l).ok) return { ok: false, error: "a line leaves the road" };
  }
  const plan = (i.pitPlan ?? []).slice(0, MAX_PIT_STOPS).filter((p) => Number.isInteger(p.lap) && p.lap >= 1 && p.lap <= i.laps && (p.tyre === undefined || isCompound(p.tyre)) && (p.tactic === undefined || isTactic(p.tactic)));
  const vehicle = i.vehicle;
  const me: Entrant = {
    id: "me", name: "Driver", car: { ...i.car, name: String(i.car.name).slice(0, 40), type: vehicle },
    lines: i.lapLine.map((k) => i.lines[k]!), isPlayer: true,
    pitPlan: i.realism ? plan : [], ...(i.realism && i.autoPit === true ? { autoPit: true } : {}), startTyre: i.startTyre && isCompound(i.startTyre) ? i.startTyre : "medium", ...(i.startTactic && isTactic(i.startTactic) ? { startTactic: i.startTactic } : {}),
    gridTime: quickGridTime(i.playerTime),
  };
  const ghosts: Entrant[] = i.ghosts.slice(0, i.rivals).map((g, n) => ({ id: `ghost:${g.id}`, name: g.name, car: { ...g.car, type: vehicle }, lines: [g.line], gridTime: g.time, bestLap: g.time }));
  const bots = makeBots(track, vehicle, ghosts.length, i.rivals);
  const rules: RaceRules = i.realism ? { ...sessionRules("race", { wearMult: { fuel: i.wearFuel ?? 1, tyre: i.wearTyre ?? 1 }, mandatory: i.mandatory ?? [] } as SessionOptions), weather: true } : { realism: false, weather: false };
  const race = new Race(track, [me, ...ghosts, ...bots], i.laps, rules);
  race.runToEnd();
  const ghostIds = new Set(ghosts.map((g) => g.id));
  const standings: Standing[] = race.results().map((r: CarResult) => ({
    id: r.id, name: r.name, isPlayer: !!r.isPlayer, ghost: ghostIds.has(r.id), position: r.position, finishTime: r.dnf ? null : r.finishTime, rawTime: r.dnf ? null : r.rawTime, dnf: r.dnf,
    bestLap: r.lapTimes.length ? Math.min(...r.lapTimes) : null,
  }));
  const player = standings.find((s) => s.isPlayer);
  return player ? { ok: true, phrase, vehicle, standings, player } : { ok: false, error: "the player did not race" };
}

// ---------- a reference time for pace goals ----------
const REFERENCE = new Map<string, number>();

/** How long a good, clean driver (a skill-0.8 line in the standard car, alone) takes over `laps` laps: the yardstick for a challenge's pace goal. */
export function referenceTime(phrase: string, vehicle: VehicleId, laps: number): number {
  const key = `${normalizePhrase(phrase)}:${vehicle}:${laps}`;
  const hit = REFERENCE.get(key);
  if (hit !== undefined) return hit;
  const track = cachedTrack(phrase);
  const car: CarConfig = { ...defaultCar(), type: vehicle };
  const race = new Race(track, [{ id: "ref", name: "Reference", car, lines: [botLine(track, 0x7e4, 0.8)], gridSlot: 0 }], laps, { realism: false, weather: false });
  race.runToEnd();
  const t = race.results()[0]?.finishTime ?? Infinity;
  REFERENCE.set(key, t);
  return t;
}
