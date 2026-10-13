import { Rng } from "./rng.ts";

export type BiomeId = "grass" | "desert" | "snow" | "city" | "moon";

/** Where the track is. It sets the scenery and how the surface behaves: every number multiplies the car's own. */
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
}

export const BIOMES: Record<BiomeId, Biome> = {
  grass: { id: "grass", name: "Countryside", blurb: "Good tarmac and nothing to complain about.", grip: 1, brake: 1, accel: 1, wear: 1, fuel: 1, weight: 28 },
  desert: { id: "desert", name: "Desert", blurb: "Sand blows across the road: less grip, hard on tyres, thirsty in the heat.", grip: 0.88, brake: 0.9, accel: 0.96, wear: 1.25, fuel: 1.12, weight: 18 },
  snow: { id: "snow", name: "Snow and ice", blurb: "Slippery. Cars slide in the corners and take forever to stop, but the tyres last.", grip: 0.72, brake: 0.62, accel: 0.9, wear: 0.65, fuel: 1.05, weight: 18 },
  city: { id: "city", name: "City streets", blurb: "Grippy, grimy tarmac between the tower blocks. Rubber wears quickly.", grip: 1.06, brake: 1.05, accel: 1, wear: 1.15, fuel: 1, weight: 22 },
  moon: { id: "moon", name: "The Moon", blurb: "Low gravity: the car floats on its tyres. Little grip, little braking, great acceleration, barely any wear.", grip: 0.66, brake: 0.55, accel: 1.18, wear: 0.4, fuel: 0.9, weight: 14 },
};

export const BIOME_IDS = Object.keys(BIOMES) as BiomeId[];
export const biomeOf = (id: BiomeId | undefined): Biome => BIOMES[id ?? "grass"] ?? BIOMES.grass;

/** The place for a track's seed. The same seed always gives the same answer. */
export function biomeForSeed(seed: number): BiomeId {
  const rng = new Rng((seed ^ 0xb10be5ed) >>> 0);
  rng.next();
  const total = BIOME_IDS.reduce((a, id) => a + BIOMES[id].weight, 0);
  let r = rng.next() * total;
  for (const id of BIOME_IDS) { r -= BIOMES[id].weight; if (r < 0) return id; }
  return "grass";
}
