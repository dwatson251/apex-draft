/**
 * Three kinds of tyre. Softs grip most in the dry and wear fastest; mediums are the standard; wets are for rain: poor in
 * the dry (and they wear quickly there) but the only thing that works on a soaked track, where they last longest.
 */
export type Compound = "soft" | "medium" | "wet";
export const COMPOUND_IDS: readonly Compound[] = ["soft", "medium", "wet"];

export interface CompoundInfo {
  id: Compound;
  name: string;
  /** grip on a dry track, standard tyre = 1 */
  dryGrip: number;
  /** wear rate on a dry track, standard tyre = 1 */
  wearDry: number;
  /** wear rate on a soaked track */
  wearWet: number;
  /** colour for the interface */
  color: number;
  blurb: string;
}

export const COMPOUNDS: Record<Compound, CompoundInfo> = {
  soft: { id: "soft", name: "Soft", dryGrip: 1.06, wearDry: 1.6, wearWet: 1.8, color: 0xff4a4a, blurb: "Most grip in the dry, wears fastest. Useless in the wet." },
  medium: { id: "medium", name: "Medium", dryGrip: 1, wearDry: 1, wearWet: 1.4, color: 0xffd84a, blurb: "The standard tyre. Standard grip in the dry. Poor once it rains." },
  wet: { id: "wet", name: "Wet", dryGrip: 0.84, wearDry: 2.2, wearWet: 0.6, color: 0x4aa8ff, blurb: "For rain. Wears quickly in the dry, but slowest of all on a wet track." },
};

export const isCompound = (x: unknown): x is Compound => x === "soft" || x === "medium" || x === "wet";

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Grip for a tyre on a piece of road, relative to a standard tyre on dry tarmac.
 * `wet` is how soaked the road is (0 to 1), `use` how much traffic has driven that bit (0 to 1): in the wet a heavily
 * driven line is polished and slippery, in the dry it is rubbered in and grips a little better.
 */
export function tyreGrip(compound: Compound, wet: number, use: number): number {
  let g: number;
  if (compound === "wet") g = COMPOUNDS.wet.dryGrip + (1.02 - COMPOUNDS.wet.dryGrip) * smooth(0, 0.6, wet);
  else g = COMPOUNDS[compound].dryGrip * (1 - 0.93 * smooth(0.2, 0.95, wet)); // slicks: near nothing when soaked
  if (wet > 0.25) g *= 1 - 0.25 * use * smooth(0.25, 0.75, wet);
  else if (wet < 0.15) g *= 1 + 0.03 * use * (1 - wet / 0.15);
  return g;
}

/** How fast this tyre wears at this wetness, relative to a medium on a dry track. */
export function wearRate(compound: Compound, wet: number): number {
  const c = COMPOUNDS[compound];
  return c.wearDry + (c.wearWet - c.wearDry) * smooth(0, 0.5, wet);
}

/** Per second chance of a spin for a car in a bend whose grip has collapsed. */
export function spinRate(grip: number): number {
  return grip >= 0.35 ? 0 : 0.06 * ((0.35 - grip) / 0.35);
}
