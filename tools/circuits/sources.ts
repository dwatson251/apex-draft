import type { BiomeId } from "../../packages/sim/src/biomes.ts";

/**
 * Where each real circuit comes from in OpenStreetMap, and how it is turned into a game track.
 * Data: (c) OpenStreetMap contributors, ODbL (see docs/CIRCUIT_CREDITS.md).
 */
export interface Source {
  /** the circuit's id in the game */
  id: string;
  /** a bounding box round the circuit: south, west, north, east */
  bbox: [number, number, number, number];
  /** the origin for local metres */
  ref: [number, number];
  /** a way that is on the lap (the loop is searched for through it) */
  via: number;
  /** ways to leave out, ways that must be on the lap */
  avoid?: number[];
  require?: number[];
  /** how long the real lap is, to choose between layouts, in kilometres */
  km: number;
  /** the start line: halfway along a pit lane way (projected onto the lap), or this far along a way of the lap */
  startPit?: number;
  startWay?: { way: number; at: number };
  /** units per metre (so the lap is km * 1000 * scale units long) */
  scale: number;
  biome: BiomeId;
  /** how the highways are tagged, when it is not highway=raceway */
  query?: string;
  /** the lap is the ways of this OpenStreetMap relation (a mapped circuit), whose one-way tags are ignored; it is driven this way round */
  relation?: { id: number; direction: "cw" | "ccw"; tolerance?: number; bridge?: number };
  /** the lap is this one closed way, and it is driven this way round (OpenStreetMap does not say) */
  closed?: { way: number; direction: "cw" | "ccw" };
}

export const SOURCES: Source[] = [
  { id: "spa-francorchamps", bbox: [50.415, 5.945, 50.455, 5.995], ref: [50.4372, 5.9714], via: 126835638, km: 7.004, startPit: 323851541, scale: 0.8, biome: "grass" },
  { id: "silverstone", bbox: [52.06, -1.045, 52.095, -0.995], ref: [52.0786, -1.0169], via: 3571477, km: 5.891, startWay: { way: 3571477, at: 0.5 }, scale: 0.9, biome: "grass" },
  { id: "monza", bbox: [45.6, 9.26, 45.64, 9.31], ref: [45.62, 9.281], via: 19842206, km: 5.793, startPit: 38168747, scale: 0.9, biome: "grass" },
  { id: "circuit-de-barcelona-catalunya", bbox: [41.555, 2.235, 41.585, 2.285], ref: [41.57, 2.261], via: 831804327, require: [1560896061], km: 4.657, startPit: 178416729, scale: 0.9, biome: "grass" },
  { id: "laguna-seca", bbox: [36.575, -121.765, 36.595, -121.74], ref: [36.5841, -121.7535], via: 10464852, km: 3.602, startPit: 109859349, scale: 0.95, biome: "desert" },
  { id: "donington-park-gp", bbox: [52.82, -1.395, 52.842, -1.355], ref: [52.8306, -1.375], via: 242867013, require: [28381201], km: 4.02, startWay: { way: 242867013, at: 0.5 }, scale: 0.9, biome: "grass" },
  { id: "donington-park", bbox: [52.82, -1.395, 52.842, -1.355], ref: [52.8306, -1.375], via: 242867013, require: [27131003], km: 3.17, startWay: { way: 242867013, at: 0.5 }, scale: 0.95, biome: "grass" },
  { id: "willow-springs", bbox: [34.86, -118.285, 34.885, -118.25], ref: [34.8725, -118.2667], via: 10440074, closed: { way: 10440074, direction: "cw" }, km: 4, startWay: { way: 10440074, at: 0 }, scale: 0.9, biome: "desert" },
  { id: "monaco", bbox: [43.722, 7.405, 43.748, 7.438], ref: [43.7347, 7.4206], via: 4230891, avoid: [850261588, 1388331347], relation: { id: 148194, direction: "cw", tolerance: 4, bridge: 30 }, km: 3.337, startPit: 850261588, scale: 1.3, biome: "city" },
  { id: "le-mans", bbox: [47.9, 0.15, 48.0, 0.27], ref: [47.956, 0.2073], via: 159588880, avoid: [257063576, 258179494, 849478718, 354149765, 777192900, 777192901], relation: { id: 2126739, direction: "cw", tolerance: 4 }, km: 13.626, startPit: 777192901, scale: 0.45, biome: "grass" },
  { id: "daytona", bbox: [29.17, -81.09, 29.2, -81.05], ref: [29.1853, -81.0707], via: 352070316, require: [198466856], km: 5.73, startPit: 198465570, scale: 0.9, biome: "grass" },
];
