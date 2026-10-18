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
  /** overrides for the fit (`rMin`, `gap`, `near`, `harmonics`), for a circuit the usual limits distort */
  limits?: { rMin?: number; gap?: number; near?: number; harmonics?: number };
  /** the lap crosses itself (a bridge over the road under it): the fit lets the two roads lie on each other there, and the game puts a bridge */
  crosses?: boolean;
  /** mend gaps in the mapped lap of up to this many metres (as `relation.bridge`, for a circuit mapped without one) */
  bridge?: number;
  /** how many rounds the fit may take to pull the road apart and the bends open (default 60) */
  rounds?: number;
  /** how far (in samples) the start line may move to find a straight; default 90 */
  startSearch?: number;
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
  { id: "suzuka", crosses: true, bbox: [34.8231,136.5157,34.8631,136.5657], ref: [34.8431, 136.5407], via: 175231434, km: 5.807, startPit: 120917578, scale: 0.9, biome: "grass" },
  { id: "interlagos", limits: { gap: 60, near: 110 }, rounds: 120, bbox: [-23.7236,-46.7247,-23.6836,-46.6747], ref: [-23.7036, -46.6997], via: 807691486, km: 4.309, startPit: 33779109, scale: 0.9, biome: "grass" },
  { id: "imola", bbox: [44.3239,11.6917,44.3639,11.7417], ref: [44.3439, 11.7167], via: 1021771405, km: 4.909, startPit: 196368195, scale: 0.9, biome: "grass" },
  { id: "zandvoort", bbox: [52.3688,4.5159,52.4088,4.5659], ref: [52.3888, 4.5409], via: 24626850, km: 4.259, startSearch: 300, scale: 0.9, biome: "grass" },
  { id: "cota", bbox: [30.1078,-97.6711,30.1578,-97.6111], ref: [30.1328, -97.6411], via: 118258939, km: 5.513, startPit: 514836373, scale: 0.9, biome: "grass" },
  { id: "red-bull-ring", bbox: [47.1997,14.7397,47.2397,14.7897], ref: [47.2197, 14.7647], via: 347958266, km: 4.318, startPit: 289111668, scale: 0.9, biome: "grass" },
  { id: "brands-hatch", bbox: [51.3419,0.2431,51.3719,0.2831], ref: [51.3569, 0.2631], via: 25804824, km: 3.908, startPit: 4906930, scale: 0.9, biome: "grass" },
  { id: "mugello", bbox: [43.9775,11.3469,44.0175,11.3969], ref: [43.9975, 11.3719], via: 881284125, km: 5.245, startSearch: 300, scale: 0.9, biome: "grass" },
  { id: "sebring", bbox: [27.4254,-81.385,27.4754,-81.325], ref: [27.4504, -81.355], via: 1315957541, km: 6.019, startPit: 1041888710, scale: 0.9, biome: "grass" },
  { id: "road-america", bbox: [43.7727,-88.0196,43.8227,-87.9596], ref: [43.7977, -87.9896], via: 110527567, km: 6.515, startSearch: 300, scale: 0.9, biome: "grass" },
  { id: "hungaroring", bbox: [47.5589,19.2236,47.5989,19.2736], ref: [47.5789, 19.2486], via: 231328650, km: 4.381, startSearch: 300, scale: 0.9, biome: "grass" },
  { id: "paul-ricard", limits: { gap: 62 }, rounds: 200, bbox: [43.2256,5.7617,43.2756,5.8217], ref: [43.2506, 5.7917], via: 686705508, km: 5.842, startSearch: 300, scale: 0.9, biome: "grass" },
  { id: "nurburgring-gp", limits: { gap: 58, near: 60 }, rounds: 120, bbox: [50.3056,6.9075,50.3656,6.9875], ref: [50.3356, 6.9475], via: 27852990, km: 5.148, startPit: 30815119, scale: 0.9, biome: "grass" },
  { id: "nurburgring-sprint", bbox: [50.3056,6.9075,50.3656,6.9875], ref: [50.3356, 6.9475], via: 27852990, km: 3.629, startPit: 30815119, scale: 0.9, biome: "grass" },
  { id: "nurburgring-nordschleife", limits: { gap: 60, near: 60, harmonics: 70 }, rounds: 80, bbox: [50.2606,6.8375,50.4106,7.0575], ref: [50.3356, 6.9475], via: 41395652, km: 20.832, startPit: 32894842, scale: 0.9, biome: "grass" },
  { id: "fuji", bbox: [35.3516, 138.902, 35.3916, 138.952], ref: [35.3716, 138.927], via: 148622740, closed: { way: 148622740, direction: "cw" }, km: 4.563, startSearch: 300, scale: 0.9, biome: "grass" },
  { id: "gilles-villeneuve", bbox: [45.48, -73.5528, 45.52, -73.4928], ref: [45.5, -73.5228], via: 136717490, closed: { way: 136717490, direction: "cw" }, km: 4.361, startSearch: 300, scale: 0.9, biome: "grass" },
];
