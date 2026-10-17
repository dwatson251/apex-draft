import { isDifficulty, type Difficulty } from "./difficulty.ts";
import { Rng } from "./rng.ts";
import { normalizePhrase, randomPhrase } from "./seed.ts";
import { placeFor } from "./track.ts";
import { isVehicleId, type VehicleId } from "./vehicles.ts";

/**
 * A season: a few races on tracks drawn from a seed, the same machine and the same rivals all the way (see `makeBots`' roster),
 * points for the places and a table at the end. Pure state; the game runs each round as a qualifying session and a race.
 */

export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;
export const pointsFor = (position: number): number => POINTS[position - 1] ?? 0;
export const ROUNDS = 5;
export const CHAMP_VERSION = 1;

export interface RoundResult { phrase: string; places: { id: string; name: string; position: number }[] }

export interface Championship {
  v: number;
  seed: number;
  difficulty: Difficulty;
  vehicle: VehicleId;
  laps: number;
  rivals: number;
  /** the track of each round */
  rounds: string[];
  /** rounds finished: the next to run is `rounds[done]` */
  done: number;
  results: RoundResult[];
}

/** `count` tracks that offer `vehicle`, drawn from the seed. */
export function championshipRounds(seed: number, vehicle: VehicleId, count = ROUNDS): string[] {
  const rng = new Rng((seed ^ 0xc4a3b10) >>> 0);
  const out: string[] = [];
  for (let tries = 0; out.length < count && tries < 2000; tries++) {
    const phrase = randomPhrase(rng);
    if (!out.includes(phrase) && placeFor(phrase).choices.includes(vehicle)) out.push(phrase);
  }
  return out;
}

export function newChampionship(seed: number, difficulty: Difficulty, vehicle: VehicleId, laps = 3, rivals = 7): Championship {
  return { v: CHAMP_VERSION, seed: seed >>> 0, difficulty, vehicle, laps, rivals, rounds: championshipRounds(seed, vehicle), done: 0, results: [] };
}

/** The roster seed that fixes the season's rivals. */
export const rosterOf = (c: Championship): number => (c.seed ^ 0x5ea5011) >>> 0;
export const isOver = (c: Championship): boolean => c.done >= c.rounds.length;
export const nextPhrase = (c: Championship): string | null => c.rounds[c.done] ?? null;

/** The season after a round: every driver's place in it. */
export function applyRound(c: Championship, places: RoundResult["places"]): Championship {
  if (isOver(c)) return c;
  return { ...c, done: c.done + 1, results: [...c.results, { phrase: c.rounds[c.done]!, places: places.map((p) => ({ ...p })) }] };
}

export interface SeasonRow { id: string; name: string; points: number; wins: number; best: number; rounds: number }

/** The table: points, then wins, then best finish, then name. */
export function standings(c: Championship): SeasonRow[] {
  const by = new Map<string, SeasonRow>();
  for (const r of c.results) {
    for (const p of r.places) {
      const s = by.get(p.id) ?? { id: p.id, name: p.name, points: 0, wins: 0, best: Infinity, rounds: 0 };
      s.points += pointsFor(p.position); s.wins += p.position === 1 ? 1 : 0; s.best = Math.min(s.best, p.position); s.rounds++;
      by.set(p.id, s);
    }
  }
  return [...by.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.best - b.best || a.name.localeCompare(b.name));
}

export function normaliseChampionship(x: unknown): Championship | null {
  if (!x || typeof x !== "object") return null;
  const c = x as Partial<Championship>;
  if (c.v !== CHAMP_VERSION || !Number.isFinite(c.seed) || !isDifficulty(c.difficulty) || !isVehicleId(c.vehicle)) return null;
  if (!Array.isArray(c.rounds) || !c.rounds.every((r) => typeof r === "string" && normalizePhrase(r) === r) || c.rounds.length === 0 || c.rounds.length > 12) return null;
  const done = Math.min(c.rounds.length, Math.max(0, Math.floor(Number(c.done)) || 0));
  const results = (Array.isArray(c.results) ? c.results : []).slice(0, done).map((r): RoundResult => ({
    phrase: String(r?.phrase ?? ""), places: (Array.isArray(r?.places) ? r.places : []).slice(0, 64).map((p) => ({ id: String(p?.id ?? "").slice(0, 40), name: String(p?.name ?? "").slice(0, 40), position: Math.max(1, Math.floor(Number(p?.position)) || 1) })),
  }));
  if (results.length !== done) return null;
  return { v: CHAMP_VERSION, seed: (c.seed as number) >>> 0, difficulty: c.difficulty, vehicle: c.vehicle, laps: Math.min(50, Math.max(1, Math.floor(Number(c.laps)) || 3)), rivals: Math.min(63, Math.max(1, Math.floor(Number(c.rivals)) || 7)), rounds: c.rounds as string[], done, results };
}
