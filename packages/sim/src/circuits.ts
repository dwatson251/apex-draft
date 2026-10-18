import type { BiomeId } from "./biomes.ts";
import { CIRCUIT_DATA } from "./circuitData.ts";
import { KART_CIRCUIT_LIST } from "./karts.ts";
import { KART_ROSTER } from "./kartroster.ts";

/**
 * The hidden circuits. Most are real ones laid out from a mapped line (`FREE`, below; the data is OpenStreetMap, see
 * docs/CIRCUIT_CREDITS.md). The rest are drawn on the cell grid: each is a loop of cells given as a route (one letter per move: E, S, W,
 * N, with screen y pointing down) from the first cell after the start line, and a few cells say what they are besides a corner or a
 * straight. A `window` lays a wide arc (`uturn` or `sweeper`) over three cells starting there. Those shapes are not from a map.
 */
/** In a route, "chicane" marks a chicane: `build` lays it as two cells, a `chicaneA` and the `chicaneB` beside it. */
export type CircuitKind = "straight" | "bendy" | "kink" | "esses" | "chicaneA" | "chicaneB" | "cross" | "bridge" | "under" | "corner" | "sharp";

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
  /** a circuit laid out from a mapped line (x, y, x, y, ... in game units, the first point on the start line) rather than cells */
  free?: number[];
  /** one of the Mario Kart courses (karts.ts): its pieces and look come from KART_INFO */
  kart?: boolean;
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
  kinds: Record<number, CircuitKind | "chicane">;
  windows?: { at: number; piece: "uturn" | "sweeper" }[];
  /** other things people might type */
  aliases?: string[];
}

/** A route written as runs: "E4 S2" is EEEESS. */
const runs = (text: string): string => text.split(/\s+/).map((t) => t[0]!.repeat(Number(t.slice(1)))).join("");

const MOVE: Record<string, [number, number]> = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };

/**
 * A chicane takes two cells, the swing out and the swing back, so each chicane in a spec becomes a pair of straight cells: the one
 * named and the one after it (or the one before, if that is the better fit). One that fits nowhere is a set of esses.
 */
function chicanePairs(s: Spec): Record<number, CircuitKind> {
  const n = s.route.length;
  const out: Record<number, CircuitKind> = {};
  const windowed = new Set<number>();
  for (const w of s.windows ?? []) for (let k = 0; k < 3; k++) windowed.add(w.at + k);
  const straight = (j: number) => s.route[(j + n - 1) % n] === s.route[j];
  // a cell can take half a chicane if it is a plain straight that nothing else has claimed
  const open = (j: number) => j > 0 && j < n - 1 && straight(j) && !windowed.has(j) && out[j] === undefined && (s.kinds[j] === undefined || s.kinds[j] === "chicane");
  for (const key of Object.keys(s.kinds)) {
    const i = Number(key), k = s.kinds[i]!;
    if (k !== "chicane" && out[i] === undefined) out[i] = k;
  }
  for (const key of Object.keys(s.kinds).map(Number).sort((a, b) => a - b)) {
    if (s.kinds[key] !== "chicane" || out[key] !== undefined) continue;
    if (open(key) && open(key + 1)) { out[key] = "chicaneA"; out[key + 1] = "chicaneB"; }
    else if (open(key - 1) && open(key)) { out[key - 1] = "chicaneA"; out[key] = "chicaneB"; }
    else out[key] = "esses";
  }
  return out;
}

function build(s: Spec): Circuit {
  const cells: [number, number, CircuitKind][] = [];
  let [x, y] = s.from;
  const n = s.route.length;
  const kinds = chicanePairs(s);
  for (let i = 0; i < n; i++) {
    const turn = s.route[(i + n - 1) % n] !== s.route[i];
    cells.push([x, y, kinds[i] ?? (turn ? "corner" : "straight")]);
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
    id: "demolition-derby", name: "Demolition Derby", lengthKm: 0.9, blurb: "Two crossroads where the track runs over itself. Pick your moment.",
    cols: 11, rows: 5, biome: "desert", from: [6, 2],
    // a chain of three loops: the straight in the middle is crossed twice, once at each end (cells 2 and 28, and 10 and 20 for the
    // other pass); the two end loops are fast wide turns
    route: runs("E4 S2 W2 N4 W6 S4 W2 N2 E6"),
    kinds: { 2: "cross", 10: "cross", 20: "cross", 28: "cross" },
    windows: [{ at: 4, piece: "uturn" }, { at: 22, piece: "uturn" }],
    aliases: ["demolition", "derby", "demo-derby", "demolition-derby-arena"],
  },
];

/**
 * The circuits laid out from a mapped line (circuitData.ts, made by tools/circuits). The shape is the real one, scaled to the
 * game and eased only where a car could not drive it. Autodrome Lago Maggiore is the exception: it is a fictional circuit, traced from
 * its published map (tools/circuits/trace.ts).
 */
interface FreeSpec { id: string; name: string; lengthKm: number; blurb: string; biome: BiomeId; aliases?: string[] }
const FREE: FreeSpec[] = [
  { id: "donington-park", name: "Donington Park National", lengthKm: 3.17, biome: "grass", aliases: ["donington", "donington-national", "donington-park-national"], blurb: "The National circuit: Redgate, the Craner Curves, the Old Hairpin, Starkey's, McLeans and Coppice, then the short cut to Goddards." },
  { id: "donington-park-gp", name: "Donington Park GP", lengthKm: 4.02, biome: "grass", aliases: ["donington-gp", "donington-grand-prix", "donington-park-grand-prix"], blurb: "The full Grand Prix loop: Redgate, the Craner Curves, the Old Hairpin, Coppice, the Fogarty Esses and the Melbourne loop onto the Wheatcroft Straight." },
  { id: "daytona", name: "Daytona", lengthKm: 5.73, biome: "grass", aliases: ["daytona-road-course", "daytona-international-speedway", "daytona-speedway"], blurb: "The road course: the tri-oval front stretch, a hard left into the infield, the International Horseshoe, the Dogleg and the West Horseshoe, the Le Mans chicane, then the banking home." },
  { id: "spa-francorchamps", name: "Circuit de Spa-Francorchamps", lengthKm: 7.0, biome: "grass", aliases: ["spa", "circuit-de-spa-francorchamps", "spa-francorchamps-belgium", "spa-belgium"], blurb: "La Source, Eau Rouge and Raidillon, the Kemmel straight, Les Combes, Pouhon, Blanchimont and the Bus Stop." },
  { id: "circuit-de-barcelona-catalunya", name: "Circuit de Barcelona-Catalunya", lengthKm: 4.66, biome: "grass", aliases: ["circuit-de-barcelona", "barcelona", "barcelona-catalunya", "catalunya", "montmelo"], blurb: "A long start straight, Elf and Renault, the long Repsol and Seat turns and the loop through the infield." },
  { id: "monza", name: "Monza", lengthKm: 5.79, biome: "grass", aliases: ["autodromo-nazionale-monza", "autodromo-di-monza", "monza-circuit"], blurb: "The Temple of Speed: down the straight, the Rettifilo chicane, Curva Grande, the Lesmos, Ascari and the Parabolica." },
  { id: "silverstone", name: "Silverstone", lengthKm: 5.89, biome: "grass", aliases: ["silverstone-circuit", "silverstone-gp", "silverstone-grand-prix"], blurb: "Abbey and Farm, Village and the Loop, Brooklands and Luffield, Copse, Maggotts-Becketts-Chapel, the Hangar Straight, Stowe and Club." },
  { id: "laguna-seca", name: "Laguna Seca", lengthKm: 3.6, biome: "desert", aliases: ["weathertech-raceway-laguna-seca", "mazda-raceway-laguna-seca", "laguna"], blurb: "Short and steep: the Andretti hairpin, the Rahal Straight, the Corkscrew drop and Rainey Curve." },
  { id: "le-mans", name: "Circuit de la Sarthe", lengthKm: 13.63, biome: "grass", aliases: ["circuit-de-la-sarthe", "sarthe", "le-mans-24-hours", "24-hours-of-le-mans", "circuit-des-24-heures-du-mans", "24-heures-du-mans"], blurb: "Dunlop, the Esses, Tertre Rouge, the Mulsanne straight and its chicane, Mulsanne corner, Indianapolis, Arnage, the Porsche curves and the Ford chicanes. Squeezed down to a third of its size." },
  { id: "monaco", name: "Monaco", lengthKm: 3.34, biome: "city", aliases: ["circuit-de-monaco", "monte-carlo", "monaco-gp", "monaco-grand-prix"], blurb: "Sainte Dévote, the climb past the Casino, the Grand Hotel hairpin, the tunnel, the chicane, the pool and La Rascasse. There is nowhere to hide." },
  { id: "willow-springs", name: "Willow Springs", lengthKm: 4.0, biome: "desert", aliases: ["big-willow", "willow", "willow-springs-international-raceway"], blurb: "Big Willow: huge sweepers in the high desert." },
  { id: "lago-maggiore", name: "Autodrome Lago Maggiore", lengthKm: 5.81, biome: "grass", aliases: ["autodrome-lago-maggiore", "lago-maggiore-full", "maggiore"], blurb: "A fictional Grand Prix circuit by the lake: a hard left at Turn 1, fast S-bends, a banked hairpin at the foot of a long descent, two long straights and the banked final turn." },
];
const freeCircuit = (f: FreeSpec): Circuit => {
  const free = CIRCUIT_DATA[f.id];
  if (!free) throw new Error(`${f.id}: no map data`);
  return { id: f.id, name: f.name, lengthKm: f.lengthKm, blurb: f.blurb, cols: 0, rows: 0, biome: f.biome, cells: [], start: 0, free };
};

export const CIRCUITS: Circuit[] = [...SPECS.map(build), ...FREE.map(freeCircuit), ...KART_CIRCUIT_LIST];
const BY_PHRASE = new Map<string, Circuit>();
SPECS.forEach((s, i) => { for (const p of [s.id, ...(s.aliases ?? [])]) BY_PHRASE.set(p, CIRCUITS[i]!); });
FREE.forEach((f, i) => { for (const p of [f.id, ...(f.aliases ?? [])]) BY_PHRASE.set(p, CIRCUITS[SPECS.length + i]!); });
for (const [i, c] of KART_CIRCUIT_LIST.entries()) {
  const row = KART_ROSTER.find((r) => r.id === c.id)!;
  for (const p of [c.id, ...row.aliases]) BY_PHRASE.set(p, CIRCUITS[SPECS.length + FREE.length + i]!);
}

/** The circuit a (normalised) phrase names, if any. Random phrases are four words and never match. */
export const circuitFor = (phrase: string): Circuit | undefined => BY_PHRASE.get(phrase);

/**
 * What the Random button does on a circuit: the next one of its own kind, round and round (a Mario Kart course goes to the next Mario Kart course, a real or
 * hidden circuit to the next of those). Undefined when the phrase is not a circuit, and Random draws a new phrase as usual.
 */
export function nextCircuit(phrase: string): string | undefined {
  const here = circuitFor(phrase.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
  if (!here) return undefined;
  const group = CIRCUITS.filter((c) => !!c.kart === !!here.kart);
  return group[(group.indexOf(here) + 1) % group.length]!.id;
}
