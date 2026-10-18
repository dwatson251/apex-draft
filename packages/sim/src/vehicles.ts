import { Rng } from "./rng.ts";

export type VehicleId = "kart" | "formula" | "rally" | "muscle" | "truck" | "tank"
  | "superbike" | "buggy" | "electric" | "dragster"
  | "touring" | "prototype" | "gt3" | "gt4" | "hypercar" | "stock" | "classic" | "rallycross"
  | "jetski" | "speedboat" | "hovercraft" | "airboat";

/** Land machines grip the road; water machines slide on it. */
export type Domain = "land" | "water";

/**
 * What kind of machine this is. Multipliers apply on top of the car's four stat levels, and are set so that level 10 is the
 * real machine: `top` is mph / 225 and `accel`, `grip` (lateral) and `brake` are launch, lateral and braking g divided by 1.025,
 * 1.595 and 1.823 (see scale.ts). `PACE` in car.ts lifts the three g stats by 1.35 for lap times, and the formula, GT3, prototype, GT4,
 * touring and superbike multipliers include a small extra calibration (docs/DESIGN.md, "Lap-time calibration").
 *
 * Real figures behind each (top mph, 0-60 launch g, peak lateral g, braking g, peak slip angle):
 * kart 80/0.9/1.6/1.0/9°, formula 230/1.05/4.0/4.0/4°, rally 125/0.8/1.2/1.3/18°, muscle 180/0.75/1.0/1.05/10°,
 * truck 110/0.7/0.8/0.9/8°, tank 45/0.13/0.4/0.5/3°, superbike 186/1.05/1.5/1.3/6°, Ariel Nomad-class buggy 110/0.7/0.9/0.9/16°,
 * electric 190/1.4/1.2/1.3/6°, dragster 335/4.0/0.6/1.0/7°, sit-down PWC (Sea-Doo RXP-X) 67/0.75/0.8/0.4/25°, offshore powerboat 120/0.55/0.5/0.3/12°,
 * racing hovercraft 70/0.7/0.25/0.2/40°, racing airboat 70/0.45/0.3/0.2/30°.
 * Racing classes: touring (BTCC/TCR) 160/0.7/1.5/1.5/8°, prototype (LMP2/DPi) 205/1.1/3.0/3.0/5°,
 * GT3 190/0.85/1.9/1.9/7°, GT4 155/0.65/1.4/1.4/9°, hypercar (Group C, LMH/LMDh, GT7 Gr.1) 225/1.15/3.3/3.3/5°,
 * stock car (NASCAR, V8 Supercar) 190/0.8/1.6/1.7/10°. The formula car is the F1 car.
 */
export interface Vehicle {
  id: VehicleId;
  name: string;
  /** plural, for "Race day: tanks" */
  plural: string;
  blurb: string;
  accel: number;
  top: number;
  grip: number;
  brake: number;
  /** tyre (or track) wear per lap */
  wear: number;
  /** fuel use per lap */
  fuel: number;
  /** relative weight: a tank shoves a kart about */
  mass: number;
  /** drawn size, units */
  length: number;
  width: number;
  /** engine sound: pitch multiplier and how buzzy it is, 0 to 1 */
  pitch: number;
  buzz: number;
  /** relative odds when a phrase picks the field (0: only a circuit that names the class has it) */
  weight: number;
  domain: Domain;
  /** 0..1: how loose it is, i.e. how slowly a drift recovers */
  slip: number;
  /** the slip angle it reaches at the limit of grip, in degrees: hull to path (boats) or tyres' slip angle (cars) */
  slipDeg: number;
  /** 0..1: how much of a surface's grip and braking penalty it ignores */
  terrain: number;
  /** seconds stopped in the box for a tyre change and a fill of fuel (shown seconds), from the real class's service: see PIT TIMES */
  pitSecs: number;
  /** extra acceleration from a standing start, fading out by 30% of top speed */
  launch: number;
}

export const VEHICLES: Record<VehicleId, Vehicle> = {
  kart: { id: "kart", mass: 0.45, name: "Go-kart", plural: "go-karts", blurb: "Tiny, sticky and slow in a straight line. Sips fuel, barely wears its tyres.", accel: 0.878, top: 0.356, grip: 1.003, brake: 0.549, wear: 0.6, fuel: 0.55, length: 5.2, width: 3.6, pitch: 1.5, buzz: 0.9, weight: 20, domain: "land", slip: 0.35, terrain: 0, pitSecs: 12, slipDeg: 9, launch: 0 },
  // a 1960s Grand Prix car (Lotus 49: 180 mph, about 0.85 g off the line, 1.6 g in a bend, 1.2 g braking): no wings, skinny tyres, a lot of slide
  classic: { id: "classic", mass: 0.55, name: "Classic F1", plural: "classic F1 cars", blurb: "A cigar on skinny tyres: no wings, a big engine and not much grip. It slides; let it.", accel: 0.796, top: 0.8, grip: 0.963, brake: 0.632, wear: 0.9, fuel: 1.1, length: 7.6, width: 3.2, pitch: 1.6, buzz: 0.5, weight: 0, domain: "land", slip: 0.4, terrain: 0, pitSecs: 30, slipDeg: 10, launch: 0 },
  // a World RX supercar (about 600 hp in a hatchback: 1.4 g off the line, 130 mph, 1.4 g of grip on mixed ground)
  rallycross: { id: "rallycross", mass: 0.85, name: "Rallycross car", plural: "rallycross cars", blurb: "Six hundred horsepower in a hatchback: brutal off the line, at home on dirt and tarmac alike.", accel: 1.365, top: 0.578, grip: 0.878, brake: 0.767, wear: 1.2, fuel: 1.1, length: 7.4, width: 3.2, pitch: 1.1, buzz: 0.5, weight: 0, domain: "land", slip: 0.6, terrain: 0.5, pitSecs: 20, slipDeg: 20, launch: 0.3 },
  formula: { id: "formula", mass: 0.6, name: "Formula car", plural: "formula cars", blurb: "Huge grip, huge brakes, huge top speed. Eats tyres and fuel.", accel: 0.983, top: 1.022, grip: 2.408, brake: 2.106, wear: 1.6, fuel: 1.2, length: 10, width: 3.6, pitch: 2, buzz: 0.6, weight: 15, domain: "land", slip: 0.1, terrain: 0, pitSecs: 8, slipDeg: 4, launch: 0 },
  rally: { id: "rally", mass: 0.9, name: "Rally car", plural: "rally cars", blurb: "A good all-rounder with nothing to apologise for.", accel: 0.78, top: 0.556, grip: 0.752, brake: 0.713, wear: 1, fuel: 1, length: 8, width: 3.2, pitch: 1, buzz: 0.4, weight: 20, domain: "land", slip: 0.6, terrain: 0, pitSecs: 25, slipDeg: 18, launch: 0 },
  muscle: { id: "muscle", mass: 1.15, name: "Muscle car", plural: "muscle cars", blurb: "Fast in a line, loose in the corners, and thirsty.", accel: 0.731, top: 0.8, grip: 0.627, brake: 0.576, wear: 1.2, fuel: 1.3, length: 8.4, width: 3.4, pitch: 0.7, buzz: 0.3, weight: 15, domain: "land", slip: 0.5, terrain: 0, pitSecs: 14, slipDeg: 10, launch: 0 },
  truck: { id: "truck", mass: 2, name: "Truck", plural: "trucks", blurb: "Slow to get going and slow to stop, but it keeps going.", accel: 0.683, top: 0.489, grip: 0.502, brake: 0.494, wear: 0.8, fuel: 1.4, length: 10.4, width: 3.9, pitch: 0.55, buzz: 0.2, weight: 15, domain: "land", slip: 0.3, terrain: 0, pitSecs: 45, slipDeg: 8, launch: 0 },
  tank: { id: "tank", mass: 4, name: "Tank", plural: "tanks", blurb: "Crawls. Barely wears its tracks. Drinks fuel.", accel: 0.127, top: 0.2, grip: 0.251, brake: 0.274, wear: 0.1, fuel: 1.5, length: 14, width: 6, pitch: 0.4, buzz: 0.1, weight: 15, domain: "land", slip: 0.1, terrain: 0, pitSecs: 90, slipDeg: 3, launch: 0 },
  superbike: { id: "superbike", mass: 0.25, name: "Superbike", plural: "superbikes", blurb: "Light, quick and grippy. Sips fuel, but gets shoved about by anything bigger.", accel: 1.147, top: 0.827, grip: 1.053, brake: 0.799, wear: 0.7, fuel: 0.5, length: 6.4, width: 2.2, pitch: 1.8, buzz: 0.7, weight: 10, domain: "land", slip: 0.3, terrain: 0, pitSecs: 28, slipDeg: 6, launch: 0 },
  buggy: { id: "buggy", mass: 0.8, name: "Dune buggy", plural: "dune buggies", blurb: "Big wheels and long travel: sand, snow and moondust hardly slow it. Tarmac is dull.", accel: 0.683, top: 0.489, grip: 0.564, brake: 0.494, wear: 0.9, fuel: 0.9, length: 7, width: 3.6, pitch: 1.2, buzz: 0.5, weight: 10, domain: "land", slip: 0.6, terrain: 0.6, pitSecs: 45, slipDeg: 16, launch: 0 },
  electric: { id: "electric", mass: 1.3, name: "Electric GT", plural: "electric GTs", blurb: "Silent punch from a standstill and almost no running cost. Heavy on its tyres.", accel: 1.365, top: 0.844, grip: 0.752, brake: 0.713, wear: 1.4, fuel: 0.3, length: 8.8, width: 3.5, pitch: 1.3, buzz: 0.1, weight: 10, domain: "land", slip: 0.25, terrain: 0, pitSecs: 40, slipDeg: 6, launch: 0 },
  dragster: { id: "dragster", mass: 0.9, name: "Dragster", plural: "dragsters", blurb: "Savage off the line and fastest in a straight. Corners and brakes are an afterthought.", accel: 3.901, top: 1.489, grip: 0.376, brake: 0.549, wear: 1.3, fuel: 1.6, length: 13.4, width: 3.5, pitch: 0.8, buzz: 0.3, weight: 8, domain: "land", slip: 0.4, terrain: 0, pitSecs: 30, slipDeg: 7, launch: 0.5 },
  touring: { id: "touring", mass: 1, name: "Touring car", plural: "touring cars", blurb: "A BTCC-style saloon: tough, sideways and close racing. Fast enough, nothing special in a straight line.", accel: 0.724, top: 0.711, grip: 0.996, brake: 0.872, wear: 1.1, fuel: 1, length: 8.4, width: 3.5, pitch: 1.1, buzz: 0.4, weight: 10, domain: "land", slip: 0.45, terrain: 0, pitSecs: 20, slipDeg: 8, launch: 0 },
  prototype: { id: "prototype", mass: 0.75, name: "Prototype", plural: "prototypes", blurb: "An endurance prototype: low, wide and glued down by its downforce. Quick everywhere, hard on fuel.", accel: 0.998, top: 0.911, grip: 1.749, brake: 1.531, wear: 1.2, fuel: 1.4, length: 9.6, width: 3.8, pitch: 1.4, buzz: 0.5, weight: 10, domain: "land", slip: 0.15, terrain: 0, pitSecs: 45, slipDeg: 5, launch: 0 },
  gt3: { id: "gt3", mass: 1.1, name: "GT3 car", plural: "GT3 cars", blurb: "A road-car shape in race trim: strong brakes, lots of grip and a big wing. The sports-car class everyone races.", accel: 0.812, top: 0.844, grip: 1.167, brake: 1.021, wear: 1.2, fuel: 1.1, length: 8.6, width: 3.6, pitch: 0.9, buzz: 0.4, weight: 10, domain: "land", slip: 0.3, terrain: 0, pitSecs: 40, slipDeg: 7, launch: 0 },
  gt4: { id: "gt4", mass: 1.05, name: "GT4 car", plural: "GT4 cars", blurb: "The entry-level sports car: a mildly tuned road car with a small wing. Forgiving, cheap to run, and easy to slide.", accel: 0.685, top: 0.689, grip: 0.948, brake: 0.829, wear: 0.9, fuel: 0.9, length: 9, width: 3.4, pitch: 0.85, buzz: 0.35, weight: 10, domain: "land", slip: 0.4, terrain: 0, pitSecs: 40, slipDeg: 9, launch: 0 },
  hypercar: { id: "hypercar", mass: 0.8, name: "Hypercar", plural: "hypercars", blurb: "A Le Mans hypercar: a hybrid prototype with more power and more downforce than the class below it. The fastest thing on a long straight that still turns.", accel: 1.043, top: 1, grip: 1.924, brake: 1.683, wear: 1.3, fuel: 1.5, length: 9.8, width: 3.8, pitch: 1.5, buzz: 0.5, weight: 0, domain: "land", slip: 0.15, terrain: 0, pitSecs: 45, slipDeg: 5, launch: 0 },
  stock: { id: "stock", mass: 1.35, name: "Stock car", plural: "stock cars", blurb: "A heavy V8 saloon built to be raced door to door: strong, loose at the limit, hard on its tyres and thirsty.", accel: 0.741, top: 0.844, grip: 0.953, brake: 0.886, wear: 1.3, fuel: 1.4, length: 9, width: 3.7, pitch: 0.75, buzz: 0.3, weight: 0, domain: "land", slip: 0.5, terrain: 0, pitSecs: 14, slipDeg: 10, launch: 0 },
  jetski: { id: "jetski", mass: 0.3, name: "Jet ski", plural: "jet skis", blurb: "Tiny and twitchy. It slides wide in every corner and snaps back.", accel: 0.731, top: 0.298, grip: 0.502, brake: 0.219, wear: 0, fuel: 0.7, length: 6, width: 2.4, pitch: 1.5, buzz: 0.8, weight: 20, domain: "water", slip: 0.8, terrain: 1, pitSecs: 25, slipDeg: 25, launch: 0 },
  speedboat: { id: "speedboat", mass: 0.8, name: "Speedboat", plural: "speedboats", blurb: "A balanced hull. Fast in a straight, and it drifts when you carry speed into a turn.", accel: 0.536, top: 0.533, grip: 0.313, brake: 0.165, wear: 0, fuel: 1.1, length: 12, width: 4.4, pitch: 0.8, buzz: 0.3, weight: 25, domain: "water", slip: 0.55, terrain: 1, pitSecs: 60, slipDeg: 12, launch: 0 },
  hovercraft: { id: "hovercraft", mass: 1, name: "Hovercraft", plural: "hovercraft", blurb: "Rides a cushion of air, so nothing grips and everything slides. Huge drifts, slow recovery.", accel: 0.683, top: 0.311, grip: 0.157, brake: 0.11, wear: 0, fuel: 1, length: 9, width: 5, pitch: 0.6, buzz: 0.2, weight: 15, domain: "water", slip: 1, terrain: 1, pitSecs: 30, slipDeg: 40, launch: 0 },
  airboat: { id: "airboat", mass: 1.2, name: "Airboat", plural: "airboats", blurb: "A fan on a flat hull. Loud, heavy and slow to stop, with a moderate drift.", accel: 0.439, top: 0.311, grip: 0.188, brake: 0.11, wear: 0, fuel: 1.2, length: 9.6, width: 4, pitch: 0.9, buzz: 0.4, weight: 15, domain: "water", slip: 0.65, terrain: 1, pitSecs: 30, slipDeg: 30, launch: 0 },
};

/*
 * PIT TIMES (pitSecs): a full service, tyres and fuel, in seconds stopped, from the real class. F1 in the refuelling era and IndyCar
 * are 6-10 s (4.6 s fastest IndyCar stop, tyres and about 84 L); NASCAR four tyres and fuel 13-16 s (8.6 s best); modern F1, with
 * no fuel, 2.5 s. Endurance sports cars are slower because fuel flows at a regulated rate: a prototype takes about 45 s and a GT car
 * about 40 s (British GT sets minimum stops of 2-3 minutes, which include the lane). The rest are scaled from those: a touring car with
 * a mandatory tyre change 20 s, a rally service crew 25 s, a heavy truck 45 s and a tank 90 s.
 */
export const VEHICLE_IDS = Object.keys(VEHICLES) as VehicleId[];
export const vehicleOf = (type: VehicleId | undefined): Vehicle => VEHICLES[type ?? "rally"] ?? VEHICLES.rally;
export const isVehicleId = (x: unknown): x is VehicleId => typeof x === "string" && x in VEHICLES;

/**
 * The machine each real circuit races, by the class most associated with it: Donington's touring cars, Daytona's prototypes,
 * Spa's GT3, Lago Maggiore's GT4 and Silverstone's F1. The other circuits are named for their best-known class too. The
 * Oval and the Demolition Derby are not racing-class events, so they keep the random pool.
 */
export const CIRCUIT_VEHICLES: Record<string, VehicleId> = {
  "donington-park": "touring", "donington-park-gp": "touring",
  "daytona": "prototype", "le-mans": "prototype",
  "spa-francorchamps": "gt3", "laguna-seca": "gt3",
  "lago-maggiore": "gt4", "willow-springs": "gt4",
  "silverstone": "formula", "monza": "formula", "circuit-de-barcelona-catalunya": "formula", "monaco": "formula",
  "suzuka": "formula", "interlagos": "formula", "gilles-villeneuve": "formula", "fuji": "gt3", "imola": "formula", "zandvoort": "formula", "cota": "formula", "red-bull-ring": "formula", "hungaroring": "formula",
  "brands-hatch": "gt3", "mugello": "gt3", "paul-ricard": "gt3", "road-america": "stock",
  "nurburgring-gp": "gt3", "nurburgring-sprint": "gt3", "nurburgring-nordschleife": "hypercar",
  "sebring": "prototype",
  "trial-mountain": "gt3", "high-speed-ring": "hypercar", "dragon-trail": "gt3",
};

/** The kart courses (filled by `installKartCourses` when the kart pack is installed): they race karts, whatever else is offered beside them. */
export const KART_CIRCUITS: Set<string> = new Set();

/** The machines for a track's race day. The same seed always gives the same answer. */
export function vehicleForSeed(seed: number, domain: Domain = "land"): VehicleId {
  const rng = new Rng((seed ^ 0x7e41c1e5) >>> 0);
  rng.next();
  const ids = VEHICLE_IDS.filter((id) => VEHICLES[id].domain === domain);
  const total = ids.reduce((a, id) => a + VEHICLES[id].weight, 0);
  let r = rng.next() * total;
  for (const id of ids) { r -= VEHICLES[id].weight; if (r < 0) return id; }
  return ids[0];
}

/** The tarmac race cars a real circuit may be raced with, besides the one it is known for. */
export const RACING_CLASSES: readonly VehicleId[] = ["touring", "gt3", "gt4", "prototype", "formula", "hypercar", "stock", "classic"];

/** The most machines a track offers. */
export const MAX_CHOICES = 4;

/**
 * The machines a track offers, the first being its own (what `vehicleForSeed` or `CIRCUIT_VEHICLES` says). A real circuit adds other
 * race cars; any other track adds more of the machines that suit its surface, drawn at the same odds as the default, so a road track
 * never offers a boat and a water track only boats. Always the same list for the same track.
 */
export function vehicleChoices(seed: number, domain: Domain = "land", circuitId?: string): VehicleId[] {
  const kart = !!circuitId && KART_CIRCUITS.has(circuitId);
  // a kart course offers a kart first and then three other classes drawn as on any other track (not just race cars)
  const first = kart ? "kart" : (circuitId && CIRCUIT_VEHICLES[circuitId]) || vehicleForSeed(seed, domain);
  const rng = new Rng((seed ^ 0x3c1f9a57) >>> 0);
  rng.next();
  const out: VehicleId[] = [first];
  if (!kart && circuitId && CIRCUIT_VEHICLES[circuitId]) {
    const rest = RACING_CLASSES.filter((id) => id !== first);
    while (out.length < MAX_CHOICES && rest.length) out.push(rest.splice(Math.floor(rng.next() * rest.length), 1)[0]!);
    return out;
  }
  // (a class with no weight is only for the circuits that name it)
  const pool = VEHICLE_IDS.filter((id) => VEHICLES[id].domain === domain && id !== first && VEHICLES[id].weight > 0);
  while (out.length < MAX_CHOICES && pool.length) {
    const total = pool.reduce((a, id) => a + VEHICLES[id].weight, 0);
    let r = rng.next() * total, k = 0;
    for (; k < pool.length - 1; k++) { r -= VEHICLES[pool[k]!].weight; if (r < 0) break; }
    out.push(pool.splice(k, 1)[0]!);
  }
  // a rally or buggy track offers a rallycross car too, in the last place (it has no odds of its own, so no track's own machine changes)
  if (!kart && (first === "rally" || first === "buggy") && domain === "land") { if (out.length >= MAX_CHOICES) out[out.length - 1] = "rallycross"; else out.push("rallycross"); }
  return out;
}
