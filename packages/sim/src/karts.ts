import type { Circuit } from "./circuits.ts";
import type { FxType } from "./fx.ts";

/**
 * Kart courses as circuits. The machinery lives here; the courses themselves are a fan pack (kartpack.ts: the Mario Kart roster in kartroster.ts and the shape
 * of each in kartdata.ts, made by tools/mariokart from hand-placed waypoints) that is only installed in dev, in tests and in a build that asks for it
 * (`installKartPack`). Without it there are no kart courses: their names are ordinary phrases.
 */

/** The themes a course may have (the renderer draws each one in its own colours and scenery). */
export const KART_THEMES = ["meadow", "beach", "desert", "snow", "castle", "ghost", "rainbow", "jungle", "city", "mine", "volcano", "tech", "sweets", "retro", "sky", "water", "factory"] as const;
export type KartTheme = typeof KART_THEMES[number];

/** A piece laid on part of a lap: where it starts and how long it is, as fractions of the lap, from the start line. */
export interface KartFx { at: number; len: number; type: FxType; power?: number }

/** A climb along a lap: from `at` for `len` (fractions of the lap) the road rises by `h` world units, eased (a negative `h` comes back down). The climbs of a lap add up to nothing. */
export interface KartClimb { at: number; len: number; h: number }

export interface KartShape {
  /** x, y, x, y, ... in game units round the loop, the first point on the start line (like circuitData.ts) */
  points: number[];
  fx?: KartFx[];
  climb?: KartClimb[];
}

/** What a course says about its look and rules beyond its shape. */
export interface KartInfo { theme: string; game: string; gameTitle: string; cup: string; laps: number; fx: KartFx[]; climb: KartClimb[] }

/** The theme and rules of a kart circuit by id, for the track and the renderer. Empty until a pack is installed. */
export const KART_INFO = new Map<string, KartInfo>();

/** The kart circuits with a shape, in roster order. A roster course without a shape is not offered yet. Empty until a pack is installed. */
export const KART_CIRCUIT_LIST: Circuit[] = [];
