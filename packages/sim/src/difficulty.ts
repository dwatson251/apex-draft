/**
 * Difficulty for the Quick Race and the Race Weekend: how hard the computer-driven rivals try, and whether other players' lines
 * may be in the field. Pure rules; the game keeps the `Records` and the server never sees any of it, because a race is only
 * uploaded on hard, which is the field the server replays.
 */

export type Difficulty = "easy" | "medium" | "hard";
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
export const isDifficulty = (x: unknown): x is Difficulty => x === "easy" || x === "medium" || x === "hard";

/** Stars for finishing a race at each difficulty. */
export const STARS: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

/** The range a rival's skill is drawn from, [low, high] of 0 to 1. Hard is the range every rival has always had. */
export const SKILL_RANGE: Record<Difficulty, readonly [number, number]> = { easy: [0.1, 0.5], medium: [0.4, 0.8], hard: [0.65, 1] };

/** The share of its pace a rival drives at; hard rivals drive flat out, as they always have. Their skill is drawn from the range above and a little jitter on top. */
export const RIVAL_PACE: Record<Difficulty, number> = { easy: 0.66, medium: 0.8, hard: 1 };

export const ghostsAllowed = (d: Difficulty): boolean => d === "hard";
export const realismAllowed = (d: Difficulty): boolean => d !== "easy";

export const DIFFICULTY_NAMES: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

/** What a player has done on a track and machine: the best finishing place at each difficulty. */
export type TrackRecord = Partial<Record<Difficulty, number>>;
export type Records = Record<string, TrackRecord>;

export const recordKey = (phrase: string, vehicle: string): string => `${phrase.trim().toLowerCase().replace(/\s+/g, " ")}:${vehicle}`;

/** `records` with a finish in `position` (1 = won) at difficulty `d` on `key`. Only a better place replaces an earlier one. */
export function recordFinish(records: Records, key: string, d: Difficulty, position: number): Records {
  const prev = records[key]?.[d];
  if (prev !== undefined && prev <= position) return records;
  return { ...records, [key]: { ...records[key], [d]: position } };
}

/** The stars earned on a track: the most for any difficulty a race was finished at. */
export function starsFor(records: Records, key: string): number {
  const r = records[key];
  return r ? Math.max(0, ...DIFFICULTIES.filter((d) => r[d] !== undefined).map((d) => STARS[d])) : 0;
}

/** The best place on a track at any difficulty, or null if it has not been raced. */
export function bestPlace(records: Records, key: string): number | null {
  const v = Object.values(records[key] ?? {});
  return v.length ? Math.min(...(v as number[])) : null;
}

const needs: Record<Difficulty, Difficulty | null> = { easy: null, medium: "easy", hard: "medium" };

/** Medium opens with a win at easy, hard with a win at medium, on any track. */
export function isUnlocked(d: Difficulty, records: Records): boolean {
  const n = needs[d];
  return n === null || Object.values(records).some((r) => r[n] === 1);
}

export const lockReason = (d: Difficulty): string => (needs[d] ? `Win a race on ${DIFFICULTY_NAMES[needs[d]!]} to unlock` : "");

/** The hardest difficulty that is open. */
export const highestUnlocked = (records: Records): Difficulty => [...DIFFICULTIES].reverse().find((d) => isUnlocked(d, records)) ?? "easy";

/** Drops anything in stored data that is not a place against a known difficulty. */
export function normaliseRecords(x: unknown): Records {
  const out: Records = {};
  if (!x || typeof x !== "object") return out;
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const r: TrackRecord = {};
    for (const d of DIFFICULTIES) {
      const p = (v as Record<string, unknown>)[d];
      if (typeof p === "number" && Number.isInteger(p) && p >= 1 && p <= 64) r[d] = p;
    }
    if (Object.keys(r).length) out[k] = r;
  }
  return out;
}
