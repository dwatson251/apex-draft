import type { BiomeId } from "./biomes.ts";

/**
 * Real circuits, drawn on the cell grid. Each is a loop of cells given as a route (one letter per move: E, S, W, N, with
 * screen y pointing down) from the first cell after the start line, and a few cells say what they are besides a corner or a
 * straight. A `window` lays a wide arc (`uturn` or `sweeper`) over three cells starting there. The shapes are simplified
 * to fit: the right sort of corner in the right order and direction, not a survey. Nothing here is copied from a map.
 */
export type CircuitKind = "straight" | "bendy" | "kink" | "chicane" | "esses" | "corner" | "sharp";

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
    id: "daytona", name: "Daytona", lengthKm: 5.7, blurb: "Tri-oval kink, Turn 1, the infield esses and chicanes, then the high banking home.",
    cols: 10, rows: 6, biome: "grass", from: [4, 5],
    // 2 tri-oval kink, 5 turn 1, 6 esses, 8 chicane, 9 the kink, 10-12 the horseshoe, 17 Le Mans chicane, 20 bus stop,
    // 22-24 the banking (a uturn)
    route: "EEEEENNNNNWWSSSWWWWWWWSSEEEE", kinds: { 2: "kink", 5: "sharp", 6: "esses", 8: "chicane", 9: "kink", 10: "sharp", 12: "sharp", 13: "chicane", 17: "chicane", 20: "esses" },
    windows: [{ at: 22, piece: "uturn" }],
    aliases: ["daytona-road-course", "daytona-international-speedway", "daytona-speedway"],
  },
  {
    id: "le-mans", name: "Circuit de la Sarthe", lengthKm: 13.6, blurb: "Tertre Rouge, the Mulsanne straight and its chicanes, Arnage, the Porsche curves. Squashed to fit.",
    cols: 14, rows: 4, biome: "grass", from: [6, 3],
    // 3-4 Dunlop, 5-7 Tertre Rouge (a sweeper), 9 and 12 the Mulsanne chicanes, 16 Mulsanne corner, 17 Indianapolis,
    // 18 Arnage, 19-22 the Porsche curves, 23-24 the Ford chicanes
    route: "WWWNNNEEEEEEEEEESSWWWWWSWW",
    kinds: { 4: "chicane", 9: "chicane", 12: "chicane", 17: "esses", 18: "sharp", 19: "esses", 20: "esses", 21: "kink" },
    windows: [{ at: 5, piece: "sweeper" }],
    aliases: ["circuit-de-la-sarthe", "sarthe", "le-mans-24-hours", "24-hours-of-le-mans"],
  },
  {
    id: "lago-maggiore", name: "Autodrome Lago Maggiore", lengthKm: 5.8, blurb: "Full course: a hard left at Turn 1, S-bends, a long back straight, the banked hairpin and the banked final turn.",
    cols: 10, rows: 6, biome: "grass", from: [6, 5],
    // 3 turn 1, 4-5 turns 2 to 4, 7 turn 5, 11-12 the S-bends, 13-16 the long straight, 17-19 the banked hairpin (a uturn),
    // 20-22 the esses, 24-26 the banked final turn (a sweeper)
    route: "EEENNWWNNNWWWWWWWSSEEESSSEEE",
    kinds: { 3: "sharp", 4: "chicane", 6: "esses", 7: "sharp", 8: "kink", 11: "esses", 12: "esses", 15: "kink", 20: "chicane", 21: "esses", 22: "sharp" },
    windows: [{ at: 17, piece: "uturn" }, { at: 24, piece: "sweeper" }],
    aliases: ["autodrome-lago-maggiore", "lago-maggiore-full", "maggiore"],
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
