import { CHAMP_VERSION, championshipRounds, normaliseChampionship, type Championship } from "./championship.ts";
import { CIRCUITS } from "./circuits.ts";
import type { Difficulty } from "./difficulty.ts";
import { Rng } from "./rng.ts";
import { placeFor } from "./track.ts";
import type { VehicleId } from "./vehicles.ts";

/**
 * The career: a ladder of seasons, one machine a rung, from karts to hypercars. A season is a championship (championship.ts) with the rung's machine,
 * difficulty, laps and field; finish it in the top `PROMOTE_PLACE` and the next rung opens, otherwise the rung is run again on new tracks. The top
 * rungs race the real circuits. Pure state, like the championship.
 */
export interface CareerTier { id: string; name: string; vehicle: VehicleId; difficulty: Difficulty; laps: number; rivals: number; circuits: boolean }

export const CAREER_TIERS: readonly CareerTier[] = [
  { id: "kart", name: "Karting", vehicle: "kart", difficulty: "easy", laps: 3, rivals: 7, circuits: false },
  { id: "touring", name: "Touring cars", vehicle: "touring", difficulty: "easy", laps: 4, rivals: 7, circuits: false },
  { id: "gt4", name: "GT4", vehicle: "gt4", difficulty: "medium", laps: 4, rivals: 15, circuits: false },
  { id: "gt3", name: "GT3", vehicle: "gt3", difficulty: "medium", laps: 5, rivals: 15, circuits: false },
  { id: "prototype", name: "Prototypes", vehicle: "prototype", difficulty: "hard", laps: 5, rivals: 15, circuits: true },
  { id: "formula", name: "Formula", vehicle: "formula", difficulty: "hard", laps: 6, rivals: 15, circuits: true },
  { id: "hypercar", name: "Hypercars", vehicle: "hypercar", difficulty: "hard", laps: 6, rivals: 15, circuits: true },
];
/** A season finished this high or better opens the next rung. */
export const PROMOTE_PLACE = 3;
export const CAREER_ROUNDS = 4;
export const CAREER_VERSION = 1;

export interface Career {
  v: number;
  /** the rung the player is on (the highest open) */
  tier: number;
  /** the best season finish on each rung, or null for none yet */
  best: (number | null)[];
  /** the season in progress on `tier`, if any */
  current: Championship | null;
  seasons: number;
}

export const newCareer = (): Career => ({ v: CAREER_VERSION, tier: 0, best: CAREER_TIERS.map(() => null), current: null, seasons: 0 });

/** The tracks of a season on a rung: random phrases that offer the machine, or (top rungs) real circuits that do, drawn from the seed. */
export function careerRounds(seed: number, tier: CareerTier, count = CAREER_ROUNDS): string[] {
  if (!tier.circuits) return championshipRounds(seed, tier.vehicle, count);
  const pool = CIRCUITS.filter((c) => !c.kart && placeFor(c.id).choices.includes(tier.vehicle)).map((c) => c.id);
  const rng = new Rng((seed ^ 0xca5ee1) >>> 0), out: string[] = [];
  while (out.length < Math.min(count, pool.length)) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]!);
  return out;
}

/** Start a season on the player's rung. */
export function startSeason(c: Career, seed: number): Career {
  const t = CAREER_TIERS[c.tier]!;
  const season: Championship = { v: CHAMP_VERSION, seed: seed >>> 0, difficulty: t.difficulty, vehicle: t.vehicle, laps: t.laps, rivals: t.rivals, rounds: careerRounds(seed, t), done: 0, results: [] };
  return { ...c, current: season };
}

/** The season is over and the player finished `place`: record it, and move up a rung for a top-three finish (not past the top). */
export function finishSeason(c: Career, place: number): Career {
  const best = [...c.best];
  best[c.tier] = Math.min(best[c.tier] ?? Infinity, place);
  const up = place <= PROMOTE_PLACE && c.tier < CAREER_TIERS.length - 1;
  return { ...c, best, tier: up ? c.tier + 1 : c.tier, current: null, seasons: c.seasons + 1 };
}

export function normaliseCareer(x: unknown): Career {
  const out = newCareer();
  if (!x || typeof x !== "object") return out;
  const c = x as Partial<Career>;
  if (c.v !== CAREER_VERSION) return out;
  out.tier = Math.min(CAREER_TIERS.length - 1, Math.max(0, Math.floor(Number(c.tier)) || 0));
  out.best = CAREER_TIERS.map((_, i) => { const b = Array.isArray(c.best) ? c.best[i] : null; return typeof b === "number" && b >= 1 ? Math.floor(b) : null; });
  out.current = c.current ? normaliseChampionship(c.current) : null;
  out.seasons = Math.max(0, Math.floor(Number(c.seasons)) || 0);
  return out;
}
