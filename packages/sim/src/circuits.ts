import type { BiomeId } from "./biomes.ts";

/**
 * Real circuits, drawn on the cell grid. Each is a loop of cells given as a route (one letter per move: E, S, W, N, with
 * screen y pointing down) from the first cell after the start line, and a few cells say what they are besides a corner or a
 * straight. A `window` lays a wide arc (`uturn` or `sweeper`) over three cells starting there. The shapes are simplified
 * to fit: the right sort of corner in the right order and direction, not a survey. Nothing here is copied from a map.
 */
export type CircuitKind = "straight" | "bendy" | "kink" | "chicane" | "corner" | "sharp";

export interface Circuit {
  id: string;
  name: string;
  lengthKm: number;
  blurb: string;
  cols: number;
  rows: number;
  biome: BiomeId;
  /** the loop of cells with the kind of each, in driving order; the first cell is the one after the start line */
  cells: [number, number, CircuitKind][];
  /** index in `cells` of the segment after the start line */
  start: number;
  windows?: { at: number; piece: "uturn" | "sweeper" }[];
}

interface Spec {
  id: string;
  name: string;
  lengthKm: number;
  blurb: string;
  cols: number;
  rows: number;
  biome: BiomeId;
  from: [number, number];
  route: string;
  kinds: Record<number, CircuitKind>;
  windows?: { at: number; piece: "uturn" | "sweeper" }[];
  /** other things people might type */
  aliases?: string[];
}

const MOVE: Record<string, [number, number]> = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };

function build(s: Spec): Circuit {
  const cells: [number, number, CircuitKind][] = [];
  let [x, y] = s.from;
  const n = s.route.length;
  for (let i = 0; i < n; i++) {
    const turn = s.route[(i + n - 1) % n] !== s.route[i];
    cells.push([x, y, s.kinds[i] ?? (turn ? "corner" : "straight")]);
    const m = MOVE[s.route[i]!]!;
    x += m[0];
    y += m[1];
  }
  if (x !== s.from[0] || y !== s.from[1]) throw new Error(`${s.id}: the route does not close`);
  return { id: s.id, name: s.name, lengthKm: s.lengthKm, blurb: s.blurb, cols: s.cols, rows: s.rows, biome: s.biome, cells, start: 0, windows: s.windows };
}

const SPECS: Spec[] = [
  {
    id: "oval", name: "The Oval", lengthKm: 0.8, blurb: "Left, left, left, left. Slipstream is everything.",
    cols: 8, rows: 3, biome: "grass", from: [3, 2],
    // front straight east along the bottom, a wide banked-style turn at each end, back straight west along the top
    route: "EEEENNWWWWWWWSSEEE", kinds: {},
    windows: [{ at: 4, piece: "uturn" }, { at: 13, piece: "uturn" }],
    aliases: ["stadium-oval", "speedway"],
  },
  {
    id: "donington-park", name: "Donington Park", lengthKm: 4, blurb: "Redgate, the Craner Curves, the Old Hairpin and a long run home.",
    cols: 6, rows: 5, biome: "grass", from: [2, 0],
    // 3 Redgate, 5 Craner Curves, 6-7 Old Hairpin, 9 Starkey's, 11 Schwantz, 13 McLeans, 14 Fogarty Esses, 15 Melbourne, 18 Goddards
    route: "EEESSSWNNWWSSWWNNNEE", kinds: { 3: "sharp", 5: "bendy", 6: "sharp", 7: "sharp", 9: "corner", 11: "corner", 13: "corner", 14: "chicane", 15: "sharp", 18: "sharp" },
    aliases: ["donington", "donington-gp"],
  },
  {
    id: "daytona", name: "Daytona", lengthKm: 5.7, blurb: "A tri-oval, a twisty infield and the high banking home.",
    cols: 7, rows: 5, biome: "grass", from: [3, 4],
    // 1 tri-oval kink, 3 turn 1, 4-5 esses, 7 horseshoe, 9 chicane, 10-12 infield hairpin, 14 bus stop, 15-17 banking
    route: "EEENNNNWWWSSWWWSSEEE", kinds: { 1: "kink", 3: "sharp", 4: "bendy", 5: "chicane", 7: "sharp", 9: "chicane", 10: "sharp", 12: "sharp", 14: "chicane" },
    windows: [{ at: 15, piece: "uturn" }],
    aliases: ["daytona-road-course", "daytona-international-speedway"],
  },
  {
    id: "willow-springs", name: "Willow Springs", lengthKm: 4, blurb: "Big Willow: huge sweepers in the high desert.",
    cols: 7, rows: 5, biome: "desert", from: [3, 0],
    // 2-4 and 6-8 and 13-15 are sweepers; 9 and 11 the tight ones between
    route: "EEESSSSWWNNWWWNNEE", kinds: { 9: "sharp", 11: "sharp" },
    windows: [{ at: 2, piece: "sweeper" }, { at: 6, piece: "sweeper" }, { at: 13, piece: "sweeper" }],
    aliases: ["big-willow", "willow"],
  },
];

export const CIRCUITS: Circuit[] = SPECS.map(build);
const BY_PHRASE = new Map<string, Circuit>();
SPECS.forEach((s, i) => { for (const p of [s.id, ...(s.aliases ?? [])]) BY_PHRASE.set(p, CIRCUITS[i]!); });

/** The circuit a (normalised) phrase names, if any. Random phrases are four words and never match. */
export const circuitFor = (phrase: string): Circuit | undefined => BY_PHRASE.get(phrase);
