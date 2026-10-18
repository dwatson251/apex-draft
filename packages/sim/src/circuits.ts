import type { BiomeId } from "./biomes.ts";
import { CIRCUIT_DATA } from "./circuitData.ts";
import { KART_CIRCUIT_LIST, KART_INFO, type KartShape } from "./karts.ts";
import type { KartRow } from "./kartroster.ts";
import { METRES_PER_UNIT } from "./scale.ts";
import { KART_CIRCUITS } from "./vehicles.ts";

/**
 * The hidden circuits. Most are real ones laid out from a mapped line (`FREE`, below; the data is OpenStreetMap, see
 * docs/CIRCUIT_CREDITS.md). The rest are drawn on the cell grid: each is a loop of cells given as a route (one letter per move: E, S, W,
 * N, with screen y pointing down) from the first cell after the start line, and a few cells say what they are besides a corner or a
 * straight. A `window` lays a wide arc (`uturn` or `sweeper`) over three cells starting there. Those shapes are not from a map.
 */
/** In a route, "chicane" marks a chicane: `build` lays it as two cells, a `chicaneA` and the `chicaneB` beside it. */
export type CircuitKind = "straight" | "bendy" | "kink" | "esses" | "sweepS" | "chicaneA" | "chicaneB" | "cross" | "bridge" | "under" | "corner" | "sharp";

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
  /** a made-up circuit (from a game) rather than a real one */
  fictional?: boolean;
  /** the lap crosses itself (a bridge over the road under it) */
  crosses?: boolean;
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
interface FreeSpec { id: string; name: string; lengthKm: number; blurb: string; biome: BiomeId; aliases?: string[]; fictional?: boolean; crosses?: boolean }
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
  { id: "suzuka", name: "Suzuka", lengthKm: 5.81, biome: "grass", crosses: true, aliases: ["suzuka-circuit", "suzuka-international-racing-course", "suzuka-japan", "japanese-grand-prix"], blurb: "The figure of eight: the Esses, Degner, the Spoon curve, 130R and the Casio Triangle, with the back straight passing over the road beneath it." },
  { id: "interlagos", name: "Autódromo José Carlos Pace (Interlagos)", lengthKm: 4.31, biome: "grass", aliases: ["interlagos-brazil", "autodromo-jose-carlos-pace", "sao-paulo", "brazilian-gp"], blurb: "Anti-clockwise and downhill: the Senna S, the Descida do Lago, Ferradura, Laranjinha, Pinheirinho, Bico de Pato and the climb to the pits." },
  { id: "imola", name: "Imola", lengthKm: 4.91, biome: "grass", aliases: ["autodromo-enzo-e-dino-ferrari", "autodromo-internazionale-enzo-e-dino-ferrari", "imola-circuit", "san-marino-gp"], blurb: "Tamburello and Villeneuve, Tosa, Piratella, Acque Minerali, the Variante Alta and Rivazza." },
  { id: "zandvoort", name: "Circuit Zandvoort", lengthKm: 4.26, biome: "coast", aliases: ["circuit-park-zandvoort", "cm-com-circuit-zandvoort", "zandvoort-circuit", "dutch-gp"], blurb: "Dune circuit: Tarzanbocht, Hugenholtzbocht, Scheivlak, Hans Ernst and the final turn onto the start straight." },
  { id: "cota", name: "Circuit of the Americas", lengthKm: 5.51, biome: "grass", aliases: ["circuit-of-the-americas", "austin", "austin-texas", "us-gp"], blurb: "A blind climb to Turn 1, the Maggotts-Becketts-style esses, the long back straight into Turn 12 and the stadium section." },
  { id: "red-bull-ring", name: "Red Bull Ring", lengthKm: 4.32, biome: "alpine", aliases: ["spielberg", "osterreichring", "a1-ring", "styrian-gp", "austrian-gp"], blurb: "Short and steep in the Styrian hills: three fast straights, tight corners and the climb to Turn 3." },
  { id: "brands-hatch", name: "Brands Hatch GP", lengthKm: 3.91, biome: "grass", aliases: ["brands-hatch-gp", "brands-hatch-grand-prix", "brands"], blurb: "Paddock Hill Bend, Druids, Graham Hill Bend, Surtees, Hawthorns, Westfield, Dingle Dell and Clearways." },
  { id: "mugello", name: "Autodromo del Mugello", lengthKm: 5.25, biome: "grass", aliases: ["mugello-circuit", "autodromo-internazionale-del-mugello", "tuscan-gp"], blurb: "Arrabbiata 1 and 2, Casanova and Savelli, the Biondetti chicane and the long start straight in Tuscany." },
  { id: "sebring", name: "Sebring International Raceway", lengthKm: 6.02, biome: "grass", aliases: ["sebring-raceway", "sebring-international", "sebring-12-hours", "12-hours-of-sebring"], blurb: "Bumpy airfield concrete: the Hairpin, Ullman Straight, Gendebien Bend, the Le Mans Curve and Sunset Bend." },
  { id: "road-america", name: "Road America", lengthKm: 6.52, biome: "grass", aliases: ["road-america-elkhart-lake", "elkhart-lake", "elkhart"], blurb: "Wisconsin's fast road course: Turn 1, the Carousel, Canada Corner, the Kink and Hurry Downs." },
  { id: "hungaroring", name: "Hungaroring", lengthKm: 4.38, biome: "grass", aliases: ["hungaroring-circuit", "budapest", "hungarian-gp"], blurb: "Tight and twisty, like a kart track in a bowl: one long straight and a slow corner after another." },
  { id: "paul-ricard", name: "Circuit Paul Ricard", lengthKm: 5.84, biome: "coast", aliases: ["circuit-paul-ricard", "le-castellet", "french-gp", "paul-ricard-gp"], blurb: "The Mistral straight with its chicane, Signes and the S de la Verrerie, in the south of France." },
  { id: "nurburgring-gp", name: "Nürburgring GP", lengthKm: 5.15, biome: "alpine", aliases: ["nurburgring", "nuerburgring", "n-rburgring", "n-rburgring-gp", "nurburgring-grand-prix", "nuerburgring-gp", "nurburgring-gp-strecke", "eifel-gp"], blurb: "The Grand Prix circuit: the Castrol-S, Mercedes Arena, Dunlop Kehre and the Veedol chicane." },
  { id: "nurburgring-sprint", name: "Nürburgring Sprint", lengthKm: 3.63, biome: "alpine", aliases: ["nurburgring-sprintstrecke", "nuerburgring-sprint", "n-rburgring-sprint", "nurburgring-short", "nurburgring-short-gp"], blurb: "The short Sprintstrecke layout of the Grand Prix circuit." },
  { id: "nurburgring-nordschleife", name: "Nürburgring Nordschleife", lengthKm: 20.83, biome: "alpine", aliases: ["nordschleife", "nurburgring-nordschleife", "nuerburgring-nordschleife", "n-rburgring-nordschleife", "green-hell", "the-green-hell", "nurburgring-north-loop"], blurb: "The Green Hell at full scale: the Hatzenbach, Flugplatz, Schwedenkreuz, Adenauer Forst, Karussell, Pflanzgarten and the Döttinger Höhe straight." },
  { id: "fuji", name: "Fuji Speedway", lengthKm: 4.56, biome: "alpine", aliases: ["fuji-speedway", "fuji-international-speedway", "fuji-gp", "japanese-gp"], blurb: "Under the mountain: the Dunlop corner, the long start straight, 300R, Coca-Cola and Advan corners and the final chicane." },
  { id: "gilles-villeneuve", name: "Circuit Gilles Villeneuve", lengthKm: 4.36, biome: "city", aliases: ["circuit-gilles-villeneuve", "montreal", "canadian-gp", "ile-notre-dame"], blurb: "Island park roads in Montréal: the Senna chicane, the hairpin, the long straights and the Wall of Champions." },
  { id: "trial-mountain", name: "Trial Mountain Circuit", lengthKm: 5.43, biome: "alpine", fictional: true, aliases: ["trial-mountain-circuit", "trial-mountain-gt7"], blurb: "A fictional mountain circuit from Gran Turismo, rebuilt for GT7: fifteen turns, a very long back straight and a chicane before the pits." },
  { id: "high-speed-ring", name: "High Speed Ring", lengthKm: 4.35, biome: "grass", fictional: true, aliases: ["high-speed-ring-gt7", "highspeed-ring"], blurb: "A fictional circuit from Gran Turismo: six big corners and fast straights between them." },
  { id: "dragon-trail", name: "Dragon Trail Seaside", lengthKm: 5.21, biome: "coast", fictional: true, aliases: ["dragon-trail-seaside", "seaside"], blurb: "A fictional seaside circuit in Croatia, from Gran Turismo: a long run down the coast, Nicola and Andrea at the top and the Smrt-šikanu chicane." },
  { id: "lago-maggiore", name: "Autodrome Lago Maggiore", lengthKm: 5.81, biome: "grass", fictional: true, aliases: ["autodrome-lago-maggiore", "lago-maggiore-full", "maggiore"], blurb: "A fictional Grand Prix circuit by the lake: a hard left at Turn 1, fast S-bends, a banked hairpin at the foot of a long descent, two long straights and the banked final turn." },
];
const freeCircuit = (f: FreeSpec): Circuit => {
  const free = CIRCUIT_DATA[f.id];
  if (!free) throw new Error(`${f.id}: no map data`);
  return { id: f.id, name: f.name, lengthKm: f.lengthKm, blurb: f.blurb, cols: 0, rows: 0, biome: f.biome, cells: [], start: 0, free, ...(f.fictional ? { fictional: true } : {}), ...(f.crosses ? { crosses: true } : {}) };
};

export const CIRCUITS: Circuit[] = [...SPECS.map(build), ...FREE.map(freeCircuit)];
const BY_PHRASE = new Map<string, Circuit>();
/** A phrase names one circuit; two circuits claiming the same alias is a mistake, so it stops the build rather than letting the later one win. */
const claim = (p: string, c: Circuit): void => {
  const had = BY_PHRASE.get(p);
  if (had && had !== c) throw new Error(`the phrase "${p}" names both ${had.id} and ${c.id}`);
  BY_PHRASE.set(p, c);
};
SPECS.forEach((s, i) => { for (const p of [s.id, ...(s.aliases ?? [])]) claim(p, CIRCUITS[i]!); });
FREE.forEach((f, i) => { for (const p of [f.id, ...(f.aliases ?? [])]) claim(p, CIRCUITS[SPECS.length + i]!); });

/**
 * Add kart courses (a roster and the shape of each) to the circuits: they get their names and aliases as phrases, and race karts. Called once, by
 * `installKartPack` (kartpack.ts); a second call with the same courses does nothing. Install before any track is built: tracks are cached by phrase.
 */
export function installKartCourses(roster: readonly KartRow[], data: Readonly<Record<string, KartShape>>): void {
  for (const r of roster) {
    const d = data[r.id];
    if (!d || KART_INFO.has(r.id)) continue;
    let len = 0;
    for (let i = 0; i < d.points.length; i += 2) len += Math.hypot(d.points[(i + 2) % d.points.length]! - d.points[i]!, d.points[(i + 3) % d.points.length]! - d.points[i + 1]!);
    KART_INFO.set(r.id, { theme: r.theme, game: r.game, gameTitle: r.gameTitle, cup: r.cup, laps: r.laps, fx: d.fx ?? [], climb: d.climb ?? [] });
    const c: Circuit = {
      id: r.id, name: r.name, lengthKm: Math.round((len * METRES_PER_UNIT) / 10) / 100, blurb: r.blurb, cols: 0, rows: 0, biome: r.biome, cells: [], start: 0,
      free: d.points, kart: true,
    };
    KART_CIRCUIT_LIST.push(c);
    CIRCUITS.push(c);
    KART_CIRCUITS.add(r.id);
    for (const p of [r.id, ...r.aliases]) claim(p, c);
  }
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
