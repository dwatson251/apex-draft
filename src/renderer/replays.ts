import type { Entrant, RaceEdit, RaceRules, VehicleId } from "@apex/sim";
import { load, save } from "./store.ts";

/**
 * A race kept to be watched again. The sim is deterministic, so a replay is what went into the race and nothing of what came out: the entrants as they
 * were at the start (lines and all), the rules, and the changes made at the stops (`Race.edits`). It is run again to watch. A race from another
 * SIM_VERSION would not come out the same, so it is kept but not played.
 */
export interface Replay {
  id: string;
  /** when it was raced, ms since 1970 */
  when: number;
  version: number;
  phrase: string;
  obstacles: boolean;
  vehicle: VehicleId;
  laps: number;
  /** the game's session settings for the race (its RunConfig), so the heads-up display reads as it did */
  run: unknown;
  rules: RaceRules;
  entrants: Entrant[];
  edits: RaceEdit[];
  title: string;
  place: number;
  /** the race's fingerprint, to check the replay came out the same */
  hash: string;
}

/** The most races kept: the newest, as the oldest drop off. */
export const MAX_REPLAYS = 5;
/** A race bigger than this (as JSON) is not kept: a long race of a big field with dense lines. */
export const MAX_REPLAY_BYTES = 3_000_000;

/** The rules as JSON can carry them (the weekend's rubber is a byte array). */
export const rulesOut = (r: RaceRules): RaceRules => ({ ...r, ...(r.rubber ? { rubber: Array.from(r.rubber) as unknown as Uint8Array } : {}) });
export const rulesIn = (r: RaceRules): RaceRules => ({ ...r, ...(r.rubber ? { rubber: Uint8Array.from(r.rubber as unknown as number[]) } : {}) });

export async function loadReplays(): Promise<Replay[]> {
  const x = await load<unknown>("replays", []);
  return Array.isArray(x) ? (x as Replay[]).filter((r) => r && typeof r.phrase === "string" && Array.isArray(r.entrants) && Array.isArray(r.edits)) : [];
}

/** Keep a race, newest first. Returns the list as it now is. */
export async function keepReplay(list: Replay[], r: Replay): Promise<Replay[]> {
  if (JSON.stringify(r).length > MAX_REPLAY_BYTES) return list;
  const next = [r, ...list.filter((x) => x.id !== r.id)].slice(0, MAX_REPLAYS);
  await save("replays", next);
  return next;
}
