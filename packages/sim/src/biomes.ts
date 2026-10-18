import { Rng } from "./rng.ts";

export type BiomeId = "grass" | "desert" | "snow" | "city" | "moon" | "water" | "alpine" | "coast" | "jungle" | "volcano";

/**
 * Where the track is. It sets the scenery and how the surface behaves: every number multiplies the car's own. `alpine`, `coast`, `jungle` and `volcano` have
 * weight 0: circuits name them, and random phrases come to them through `SPLITS` (a share of the countryside and the desert), so the other places keep theirs.
 */
export interface Biome {
  id: BiomeId;
  name: string;
  blurb: string;
  /** cornering grip */
  grip: number;
  brake: number;
  accel: number;
  /** tyre wear */
  wear: number;
  /** fuel use */
  fuel: number;
  /** relative odds when a phrase picks a place */
  weight: number;
  /** what the course is made of: boats race on water, everything else on land */
  domain: "land" | "water";
}

export const BIOMES: Record<BiomeId, Biome> = {
  grass: { id: "grass", name: "Countryside", blurb: "Good tarmac and nothing to complain about.", grip: 1, brake: 1, accel: 1, wear: 1, fuel: 1, weight: 28, domain: "land" },
  desert: { id: "desert", name: "Desert", blurb: "Sand blows across the road: less grip, hard on tyres, thirsty in the heat.", grip: 0.88, brake: 0.9, accel: 0.96, wear: 1.25, fuel: 1.12, weight: 18, domain: "land" },
  snow: { id: "snow", name: "Snow and ice", blurb: "Slippery. Cars slide in the corners and take forever to stop, but the tyres last.", grip: 0.72, brake: 0.62, accel: 0.9, wear: 0.65, fuel: 1.05, weight: 18, domain: "land" },
  city: { id: "city", name: "City streets", blurb: "Grippy, grimy tarmac between the tower blocks. Rubber wears quickly.", grip: 1.06, brake: 1.05, accel: 1, wear: 1.15, fuel: 1, weight: 22, domain: "land" },
  moon: { id: "moon", name: "The Moon", blurb: "Low gravity: the car floats on its tyres. Little grip, little braking, great acceleration, barely any wear.", grip: 0.66, brake: 0.55, accel: 1.18, wear: 0.4, fuel: 0.9, weight: 14, domain: "land" },
  alpine: { id: "alpine", name: "Mountains and forest", blurb: "Pine forest and cool air on damp tarmac: a touch less grip, kind to the tyres, and rain is never far away.", grip: 0.97, brake: 0.98, accel: 0.99, wear: 0.95, fuel: 1.03, weight: 0, domain: "land" },
  coast: { id: "coast", name: "Coast", blurb: "Sea wind and sand on warm tarmac: hard on the tyres, and a little loose where it blows across.", grip: 0.98, brake: 0.99, accel: 1, wear: 1.1, fuel: 1, weight: 0, domain: "land" },
  jungle: { id: "jungle", name: "Jungle", blurb: "Hot, wet and green: the road is slick with damp, mud washes across it, and it rains more often than not.", grip: 0.93, brake: 0.95, accel: 0.98, wear: 1.05, fuel: 1.06, weight: 0, domain: "land" },
  volcano: { id: "volcano", name: "Volcano", blurb: "Black basalt and ash under a smoking peak: rough on the tyres, a little loose, and the lakes are lava.", grip: 0.92, brake: 0.94, accel: 0.97, wear: 1.3, fuel: 1.08, weight: 0, domain: "land" },
  water: { id: "water", name: "Open water", blurb: "A course of buoys on the water. Nothing grips: boats carry their speed into the corners and slide wide.", grip: 1, brake: 1, accel: 1, wear: 0, fuel: 1, weight: 20, domain: "water" },
};

export const BIOME_IDS = Object.keys(BIOMES) as BiomeId[];
export const biomeOf = (id: BiomeId | undefined): Biome => BIOMES[id ?? "grass"] ?? BIOMES.grass;

/** The place for a track's seed. The same seed always gives the same answer. Open water only turns up on `fun-` seeds, as likely as any other place. */
export function biomeForSeed(seed: number, fun = false): BiomeId {
  const rng = new Rng((seed ^ 0xb10be5ed) >>> 0);
  rng.next();
  const ids = BIOME_IDS.filter((id) => fun || BIOMES[id].domain === "land");
  const total = ids.reduce((a, id) => a + BIOMES[id].weight, 0);
  let r = rng.next() * total;
  let picked: BiomeId = "grass";
  for (const id of ids) { r -= BIOMES[id].weight; if (r < 0) { picked = id; break; } }
  // some of the countryside and the desert is somewhere else: decided on a stream of its own, so every other phrase keeps its place
  const split = SPLITS[picked];
  if (split) {
    let u = new Rng((seed ^ 0x51a7e5) >>> 0).next();
    for (const [id, share] of split) { u -= share; if (u < 0) return id; }
  }
  return picked;
}

/** The share of each place that becomes another (see `biomeForSeed`). */
export const SPLITS: Partial<Record<BiomeId, [BiomeId, number][]>> = {
  grass: [["alpine", 0.16], ["jungle", 0.16], ["coast", 0.12]],
  desert: [["volcano", 0.25], ["coast", 0.15]],
};

/** A surface multiplier as a machine feels it: `terrain` 0 takes all of the penalty (or bonus), 1 takes none. */
export const terrainMul = (m: number, terrain: number): number => (m < 1 ? 1 - (1 - m) * (1 - terrain) : m);
