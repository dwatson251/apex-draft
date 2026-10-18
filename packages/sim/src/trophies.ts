import type { Difficulty } from "./difficulty.ts";

/**
 * Trophies: pure checks on a summary of a session just finished and the player's totals. The game keeps which it has and when; some open a paint or a
 * pattern for the livery (`reward`).
 */
export type TrophyMode = "race" | "weekend" | "champ" | "career" | "elim" | "duel" | "trial" | "daily" | "golf" | "challenge";

export interface RunSummary {
  mode: TrophyMode;
  /** finishing place in a race (1 first), null for a timed session */
  position: number | null;
  /** cars in the race, the player included */
  field: number;
  /** the player's place on the grid, 1 on pole */
  grid: number | null;
  laps: number;
  difficulty: Difficulty;
  realism: boolean;
  pits: number;
  emergencies: number;
  /** the safety car came out, and it rained, at some point */
  safetyCar: boolean;
  rain: boolean;
  /** Line Golf stars, 0 to 3 */
  golfStars: number;
  /** the career rung the player is on after this session (0 is karting) */
  careerTier: number;
}

export interface Totals { races: number; wins: number; circuits: number }

export type TrophyReward = "gold" | "chrome" | "chequer" | "chevron";
export interface Trophy { id: string; name: string; blurb: string; reward?: TrophyReward; check(r: RunSummary, t: Totals): boolean }

const raced = (r: RunSummary) => r.position !== null;
const won = (r: RunSummary) => r.position === 1;

export const TROPHIES: readonly Trophy[] = [
  { id: "lights-out", name: "Lights out", blurb: "Finish a race.", check: (r) => raced(r) },
  { id: "top-step", name: "Top step", blurb: "Win a race.", check: (r) => won(r) },
  { id: "flat-out", name: "Flat out", blurb: "Win a race on Hard.", reward: "gold", check: (r) => won(r) && r.difficulty === "hard" },
  { id: "from-the-back", name: "From the back", blurb: "Win from the back of a grid of eight or more.", check: (r) => won(r) && r.field >= 8 && r.grid === r.field },
  { id: "through-the-pack", name: "Through the pack", blurb: "Win a race of 32 cars or more.", check: (r) => won(r) && r.field >= 32 },
  { id: "last-standing", name: "Last one standing", blurb: "Win an elimination race.", reward: "chequer", check: (r) => r.mode === "elim" && won(r) },
  { id: "settled", name: "Settled on the track", blurb: "Win a duel.", check: (r) => r.mode === "duel" && won(r) },
  { id: "under-yellow", name: "Under yellow", blurb: "Win a race the safety car came out in.", check: (r) => won(r) && r.safetyCar },
  { id: "rain-master", name: "Rain master", blurb: "Win a race it rained in.", check: (r) => won(r) && r.rain },
  { id: "long-haul", name: "The long haul", blurb: "Finish a race of 25 laps or more with tyres and fuel.", check: (r) => raced(r) && r.realism && r.laps >= 25 },
  { id: "pit-wall", name: "Pit wall", blurb: "Win a race with tyres and fuel, two stops or more and no emergency refuel.", check: (r) => won(r) && r.realism && r.pits >= 2 && r.emergencies === 0 },
  { id: "par", name: "Par for the course", blurb: "Three stars in Line Golf.", check: (r) => r.mode === "golf" && r.golfStars === 3 },
  { id: "daily-driver", name: "Daily driver", blurb: "Set a time in the Daily.", check: (r) => r.mode === "daily" },
  { id: "moving-up", name: "Moving up", blurb: "Reach touring cars in the career.", check: (r) => r.careerTier >= 1 },
  { id: "gt-driver", name: "GT driver", blurb: "Reach GT3 in the career.", reward: "chevron", check: (r) => r.careerTier >= 3 },
  { id: "hypercar", name: "Top of the ladder", blurb: "Reach hypercars in the career.", check: (r) => r.careerTier >= 6 },
  { id: "tourist", name: "Tourist", blurb: "Find 10 of the hidden real circuits.", check: (_r, t) => t.circuits >= 10 },
  { id: "globetrotter", name: "Globetrotter", blurb: "Find 25 of the hidden real circuits.", reward: "chrome", check: (_r, t) => t.circuits >= 25 },
  { id: "regular", name: "Regular", blurb: "Win 25 races.", check: (_r, t) => t.wins >= 25 },
];

/** The trophies this session earns that the player does not have yet. */
export function newTrophies(r: RunSummary, t: Totals, have: Readonly<Record<string, number>>): Trophy[] {
  return TROPHIES.filter((x) => !have[x.id] && x.check(r, t));
}

/** The livery rewards the player's trophies have opened. */
export function rewardsOf(have: Readonly<Record<string, number>>): Set<TrophyReward> {
  return new Set(TROPHIES.filter((x) => x.reward && have[x.id]).map((x) => x.reward!));
}
