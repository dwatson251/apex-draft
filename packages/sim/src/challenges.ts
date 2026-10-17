import type { CarResult, Race } from "./race.ts";
import type { Difficulty } from "./difficulty.ts";
import type { VehicleId } from "./vehicles.ts";

/**
 * Races with a goal. Each has three tiers, bronze to gold, worth 1 to 3 stars; the stars are their own count, apart from the
 * stars a track earns for the difficulty it was raced at. Goals are judged from the finished race (`evaluate`), nothing more.
 */

export type GoalKind =
  | "win" // finish at or better than a place
  | "gain" // places gained since the grid
  | "overtakes" // cars passed on the road
  | "clean" // contacts with other cars, at most
  | "nopit" // finish at or better than a place without a pit stop
  | "pace"; // finish within a share of a reference time (see `challengeReference`)

export interface Goal {
  kind: GoalKind;
  /** the three tiers, bronze first: places, counts, or time multiples */
  tiers: [number, number, number];
}

export interface Challenge {
  id: string;
  title: string;
  blurb: string;
  phrase: string;
  /** the machine, if the track offers it; the track's own if left out */
  vehicle?: VehicleId;
  laps: number;
  rivals: number;
  difficulty: Difficulty;
  realism: boolean;
  /** start from the back of the grid */
  back?: boolean;
  goal: Goal;
}

export const CHALLENGES: readonly Challenge[] = [
  { id: "first-win", title: "First to the flag", blurb: "Win a short race.", phrase: "brave-owl-rides-melons", laps: 2, rivals: 5, difficulty: "easy", realism: false, goal: { kind: "win", tiers: [3, 2, 1] } },
  { id: "from-the-back", title: "Back of the grid", blurb: "Start last and make up places.", phrase: "quiet-fox-hugs-kites", laps: 3, rivals: 7, difficulty: "easy", realism: false, back: true, goal: { kind: "gain", tiers: [2, 4, 6] } },
  { id: "clean-sheet", title: "Clean sheet", blurb: "Finish without touching anybody.", phrase: "healthy-bear-eats-tuna", laps: 3, rivals: 7, difficulty: "medium", realism: false, goal: { kind: "clean", tiers: [4, 2, 0] } },
  { id: "pace-setter", title: "Pace setter", blurb: "Match the pace of a good driver over a race.", phrase: "river-bend-runs-wild", laps: 3, rivals: 3, difficulty: "easy", realism: false, goal: { kind: "pace", tiers: [1.25, 1.12, 1] } },
  { id: "carving-through", title: "Carving through", blurb: "Pass as many cars as you can.", phrase: "lucky-fox-chases-owls", laps: 4, rivals: 9, difficulty: "medium", realism: false, back: true, goal: { kind: "overtakes", tiers: [4, 7, 10] } },
  { id: "one-and-done", title: "No stops", blurb: "Win with tyres and fuel to manage, on one set.", phrase: "calm-wolf-finds-pears", laps: 3, rivals: 5, difficulty: "medium", realism: true, goal: { kind: "nopit", tiers: [4, 2, 1] } },
  { id: "podium-hard", title: "Hard-won podium", blurb: "Reach the podium against the best rivals.", phrase: "swift-hare-spots-plums", laps: 3, rivals: 7, difficulty: "hard", realism: false, goal: { kind: "win", tiers: [3, 2, 1] } },
  { id: "tight-lines", title: "Tight lines", blurb: "Match a good lap time with others in your way.", phrase: "tiny-crow-paints-barns", laps: 4, rivals: 7, difficulty: "medium", realism: false, goal: { kind: "pace", tiers: [1.3, 1.18, 1.08] } },
  { id: "fight-back", title: "Fight back", blurb: "Gain places from the back of a big field.", phrase: "bold-lynx-builds-docks", laps: 4, rivals: 11, difficulty: "hard", realism: false, back: true, goal: { kind: "gain", tiers: [3, 6, 9] } },
  { id: "tidy-race", title: "Keep it tidy", blurb: "A full field, a long race, and no contact.", phrase: "wise-mole-fixes-clocks", laps: 5, rivals: 9, difficulty: "hard", realism: false, goal: { kind: "clean", tiers: [6, 3, 1] } },
];

export const challengeById = (id: string): Challenge | undefined => CHALLENGES.find((c) => c.id === id);

export interface ChallengeExtras {
  /** cars passed on the road */
  overtakes: number;
  /** contacts with other cars */
  contacts: number;
  /** the reference time for a `pace` goal */
  reference?: number;
}

export interface ChallengeOutcome {
  /** 0 to 3 */
  stars: number;
  /** what was achieved, in the goal's own unit */
  value: number;
}

/** How many of the three tiers a result reaches, and the number it was judged on. */
export function evaluate(goal: Goal, mine: CarResult, extras: ChallengeExtras): ChallengeOutcome {
  if (mine.dnf || mine.finishTime === null) return { stars: 0, value: Infinity };
  const [a, b, c] = goal.tiers;
  const reached = (ok: (t: number) => boolean): number => (ok(c) ? 3 : ok(b) ? 2 : ok(a) ? 1 : 0);
  switch (goal.kind) {
    case "win": return { stars: reached((t) => mine.position <= t), value: mine.position };
    case "nopit": return { stars: mine.pits === 0 ? reached((t) => mine.position <= t) : 0, value: mine.position };
    case "gain": { const g = mine.slot + 1 - mine.position; return { stars: reached((t) => g >= t), value: g }; }
    case "overtakes": return { stars: reached((t) => extras.overtakes >= t), value: extras.overtakes };
    case "clean": return { stars: reached((t) => extras.contacts <= t), value: extras.contacts };
    case "pace": {
      const ref = extras.reference ?? Infinity, ratio = mine.finishTime / ref;
      return { stars: reached((t) => ratio <= t), value: ratio };
    }
  }
}

/** How a goal's number reads: the tiers as text for the list. */
export function goalText(goal: Goal): string {
  const [a, b, c] = goal.tiers;
  switch (goal.kind) {
    case "win": return `Finish P${a} · P${b} · P${c}`;
    case "nopit": return `No stops, finish P${a} · P${b} · P${c}`;
    case "gain": return `Gain ${a} · ${b} · ${c} places`;
    case "overtakes": return `Pass ${a} · ${b} · ${c} cars`;
    case "clean": return `At most ${a} · ${b} · ${c} contacts`;
    case "pace": return `Within ${Math.round((a - 1) * 100)}% · ${Math.round((b - 1) * 100)}% · ${Math.round((c - 1) * 100)}% of a good pace`;
  }
}

/**
 * Cars the player passed: every time they went from behind to clear ahead of another car (a few units of margin, so a nose-to-nose
 * battle is not counted over and over). Pit-lane passes count like any other.
 */
export function overtakeCount(race: Race, meId: string): number {
  const me = race.cars.find((c) => c.entrant.id === meId);
  if (!me) return 0;
  const MARGIN = 6, STEP = 6;
  let count = 0;
  for (const o of race.cars) {
    if (o === me) continue;
    let state = 0; // -1 behind, 1 ahead
    for (let k = 0; k < me.prog.length && k < o.prog.length; k += STEP) {
      const d = me.prog[k]! - o.prog[k]!;
      if (d > MARGIN) { if (state === -1) count++; state = 1; }
      else if (d < -MARGIN) state = -1;
    }
  }
  return count;
}

/** Contacts the player had with other cars. */
export const contactCount = (race: Race, meId: string): number => race.events.filter((e) => e.type === "bump" && (e.id === meId || e.other === meId)).length;

export interface ChallengeStore { stars: Record<string, number> }

export const totalStars = (s: ChallengeStore): number => Object.values(s.stars).reduce((a, b) => a + b, 0);
export const maxStars = (): number => CHALLENGES.length * 3;

/** The stars after a result: only a better one replaces an earlier one. */
export function recordChallenge(s: ChallengeStore, id: string, stars: number): ChallengeStore {
  if (!challengeById(id) || stars <= (s.stars[id] ?? 0)) return s;
  return { stars: { ...s.stars, [id]: Math.min(3, stars) } };
}

export function normaliseChallenges(x: unknown): ChallengeStore {
  const out: ChallengeStore = { stars: {} };
  const raw = x && typeof x === "object" ? (x as { stars?: unknown }).stars : null;
  if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (challengeById(k) && typeof v === "number" && v >= 1) out.stars[k] = Math.min(3, Math.floor(v));
  return out;
}
