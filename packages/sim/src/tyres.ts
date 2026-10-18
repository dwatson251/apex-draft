/**
 * Three kinds of tyre. Softs grip most in the dry and wear fastest (about 5 laps, to a medium's 10); mediums are the standard; wets are for rain: poor in
 * the dry (and they wear quickly there) but the only thing that works on a soaked track, where they last about 15 laps.
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
  /** the temperature range (0 to 1, see `tempGrip`) the tyre grips best in */
  window: readonly [number, number];
  /** colour for the interface */
  color: number;
  blurb: string;
}

export const COMPOUNDS: Record<Compound, CompoundInfo> = {
  soft: { id: "soft", name: "Soft", dryGrip: 1.06, wearDry: 1.95, wearWet: 2.2, window: [0.52, 0.78], color: 0xff4a4a, blurb: "Most grip in the dry, wears fastest. Useless in the wet." },
  medium: { id: "medium", name: "Medium", dryGrip: 1, wearDry: 1, wearWet: 1.4, window: [0.4, 0.85], color: 0xffd84a, blurb: "The standard tyre. Standard grip in the dry. Poor once it rains." },
  wet: { id: "wet", name: "Wet", dryGrip: 0.84, wearDry: 2.6, wearWet: 0.74, window: [0.2, 0.7], color: 0x4aa8ff, blurb: "For rain. About 15 laps on a wet track; wears out in a few laps on a dry one." },
};

export const isCompound = (x: unknown): x is Compound => x === "soft" || x === "medium" || x === "wet";

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Grip for a tyre on a piece of road, relative to a standard tyre on dry tarmac.
 * `wet` is how soaked the road is (0 to 1), `use` how much traffic has driven that bit (0 to 1): in the wet a heavily
 * driven line is polished and slippery, in the dry it is rubbered in and grips a little better. `rubber` (0 to 1) is the
 * rubber that dry running lays down over a session: it only helps on a dry road and builds slowly.
 */
/** Most extra grip a fully rubbered-in dry road gives. */
export const RUBBER_GRIP = 0.04;

export function tyreGrip(compound: Compound, wet: number, use: number, rubber = 0): number {
  let g: number;
  if (compound === "wet") g = COMPOUNDS.wet.dryGrip + (1.02 - COMPOUNDS.wet.dryGrip) * smooth(0, 0.6, wet);
  else g = COMPOUNDS[compound].dryGrip * (1 - 0.93 * smooth(0.2, 0.95, wet)); // slicks: near nothing when soaked
  if (wet > 0.25) g *= 1 - 0.25 * use * smooth(0.25, 0.75, wet);
  else if (wet < 0.15) g *= 1 + (0.03 * use + RUBBER_GRIP * rubber) * (1 - wet / 0.15);
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

/** Most grip a tyre loses for being as far outside its temperature window as `TEMP_SPAN` (cold or overheated). */
export const TEMP_GRIP_LOSS = 0.08;
export const TEMP_SPAN = 0.25;
/** Where a tyre starts, on the grid or fresh out of the pits, before the road has warmed it. */
export const TEMP_START = 0.4;

/** Grip for a tyre at a temperature: 1 inside its window, falling smoothly the further outside (colder or hotter) it is. Not a stand-alone grip: it multiplies `tyreGrip`. */
export function tempGrip(compound: Compound, temp: number): number {
  const [lo, hi] = COMPOUNDS[compound].window;
  const out = temp < lo ? lo - temp : temp > hi ? temp - hi : 0;
  return 1 - TEMP_GRIP_LOSS * smooth(0, TEMP_SPAN, out);
}
