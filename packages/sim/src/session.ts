import { clampWear, type CarResult, type RaceRules } from "./race.ts";
import { normalizePhrase } from "./seed.ts";
import type { Compound } from "./tyres.ts";

/**
 * The kinds of session. Trial, practice and qualifying are all "an outlap, some timed laps, a cooldown lap":
 * the first and last laps of the Race do not count, the ones between do.
 */
export type SessionKind = "trial" | "practice" | "qualifying" | "race";

export const TIMED_LAPS: Record<Exclude<SessionKind, "race">, number> = { trial: 1, practice: 1, qualifying: 3 };
/** Practice stops by itself after this long, seconds. */
export const PRACTICE_SECONDS = 600;

/** Laps in the Race for a timed session: out, timed, cool down. */
export const sessionLaps = (kind: Exclude<SessionKind, "race">): number => TIMED_LAPS[kind] + 2;

export interface SessionOptions {
  wearMult?: { fuel: number; tyre: number };
  mandatory?: Compound[];
}

/** Rules for the Race that runs a session: tyres and fuel only matter in the race. */
export function sessionRules(kind: SessionKind, o: SessionOptions = {}): RaceRules {
  if (kind !== "race") return { realism: false, weather: false };
  return { realism: true, flags: true, wearMult: { fuel: clampWear(o.wearMult?.fuel), tyre: clampWear(o.wearMult?.tyre) }, mandatory: o.mandatory ?? [] };
}

/** A session's time: the best of its timed laps, with the outlap and the cooldown lap left out. Null if none was set. */
export function sessionBest(lapTimes: number[], kind: Exclude<SessionKind, "race">): number | null {
  const timed = lapTimes.slice(1, 1 + TIMED_LAPS[kind]);
  return timed.length ? Math.min(...timed) : null;
}

/**
 * Where the Time Trial time for a track lives in the `best` store: one for each machine, as a time in one is no use in another.
 * Without a machine it is the key older versions used, which `migrateBest` moves.
 */
export const trialKey = (phrase: string, vehicle?: string): string => `tt:${normalizePhrase(phrase)}${vehicle ? `:${vehicle}` : ""}`;

/**
 * Times set before the machine was a choice were all set in the track's own (`defaultFor`): give them that machine's key. If a time
 * is already stored for the machine the quicker of the two is kept, and everything that is not a Time Trial key is left alone.
 */
export function migrateBest(best: Record<string, number>, defaultFor: (phrase: string) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(best)) {
    const m = /^tt:([^:]+)$/.exec(k);
    if (!m) out[k] = v;
  }
  for (const [k, v] of Object.entries(best)) {
    const m = /^tt:([^:]+)$/.exec(k);
    if (!m) continue;
    const key = trialKey(m[1]!, defaultFor(m[1]!));
    out[key] = key in out ? Math.min(out[key]!, v) : v;
  }
  return out;
}

/**
 * Where a car crossed the line, 1 for the first, from the results: by its time on the road, before any penalty. The classification (`position`) can
 * differ, since with tyres and fuel in play a car that never stopped is given a penalty and one that did is not. Null for a car that did not finish.
 */
export function crossedPlace(results: { id: string; rawTime: number | null }[], id: string): number | null {
  const mine = results.find((r) => r.id === id);
  if (!mine || mine.rawTime === null) return null;
  return 1 + results.filter((r) => r.id !== id && r.rawTime !== null && r.rawTime < mine.rawTime!).length;
}

export interface TimedCar { id: string; time: number | null }

/** Grid places (0 = pole) from session times: quickest first, and those with no time at the back. Ties keep input order. */
export function gridFromTimes(cars: TimedCar[]): Map<string, number> {
  const ranked = cars.map((c, i) => ({ ...c, i })).sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || a.i - b.i);
  return new Map(ranked.map((c, slot) => [c.id, slot]));
}

/** Compounds from `mandatory` that a stint history never used. */
export const missingCompounds = (used: Compound[], mandatory: Compound[]): Compound[] => mandatory.filter((m) => !used.includes(m));

export type WeekendPhase = "practice" | "qualifying" | "race" | "done";

export interface Weekend {
  phase: WeekendPhase;
  /** the player's best time in each session, once it has been run */
  practice?: number;
  qualifying?: number;
  /** the grid the race starts from, car id -> place */
  grid?: Record<string, number>;
  /** the rubber the sessions so far have laid on the road, for the next one to start with */
  rubber?: Uint8Array;
}

export const newWeekend = (): Weekend => ({ phase: "practice" });

/** What the weekend looks like after a session ends. `times` are every car's session time (qualifying) and ignored otherwise. */
export function finishSession(w: Weekend, kind: SessionKind, playerTime: number | null, times: TimedCar[] = []): Weekend {
  if (kind === "practice" && w.phase === "practice") return { ...w, phase: "qualifying", practice: playerTime ?? undefined };
  if (kind === "qualifying" && w.phase === "qualifying") {
    return { ...w, phase: "race", qualifying: playerTime ?? undefined, grid: Object.fromEntries(gridFromTimes(times)) };
  }
  if (kind === "race" && w.phase === "race") return { ...w, phase: "done" };
  return w;
}

/** Skip straight to a phase (the player may skip practice). */
export function skipTo(w: Weekend, phase: WeekendPhase): Weekend {
  const order: WeekendPhase[] = ["practice", "qualifying", "race", "done"];
  return order.indexOf(phase) > order.indexOf(w.phase) ? { ...w, phase } : w;
}

/**
 * Quick Race places the player by their Time Trial time on this track. With no time they are placed as the computer drivers are, by the lap time
 * of the line they drew (undefined: `Race` grids by the line's ideal lap). They used to start last, which read as a punishment for not having
 * run a Time Trial first.
 */
export const quickGridTime = (playerTT: number | null | undefined): number | undefined => playerTT ?? undefined;

export type { CarResult };
