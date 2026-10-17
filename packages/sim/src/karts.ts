import type { Circuit } from "./circuits.ts";
import type { FxType } from "./fx.ts";
import { KART_DATA } from "./kartdata.ts";
import { KART_ROSTER } from "./kartroster.ts";
import { METRES_PER_UNIT } from "./scale.ts";

/**
 * The Mario Kart courses as circuits: the roster (kartroster.ts, names and themes) with the shape of each (kartdata.ts, made by tools/mariokart from hand-placed
 * waypoints). A fan approximation of each layout, in this game's own units; nothing here comes from the games' files or pictures.
 */

/** The themes a course may have (the renderer draws each one in its own colours and scenery). */
export const KART_THEMES = ["meadow", "beach", "desert", "snow", "castle", "ghost", "rainbow", "jungle", "city", "mine", "volcano", "tech", "sweets", "retro", "sky", "water", "factory"] as const;
export type KartTheme = typeof KART_THEMES[number];

/** A piece laid on part of a lap: where it starts and how long it is, as fractions of the lap, from the start line. */
export interface KartFx { at: number; len: number; type: FxType; power?: number }

export interface KartShape {
  /** x, y, x, y, ... in game units round the loop, the first point on the start line (like circuitData.ts) */
  points: number[];
  fx?: KartFx[];
}

/** What a course says about its look and rules beyond its shape. */
export interface KartInfo { theme: string; game: string; gameTitle: string; cup: string; laps: number; fx: KartFx[] }

/** The theme and rules of a kart circuit by id, for the track and the renderer. */
export const KART_INFO = new Map<string, KartInfo>();

/** The kart circuits with a shape, in roster order. A roster course without a shape is not offered yet. */
export const KART_CIRCUIT_LIST: Circuit[] = [];
for (const r of KART_ROSTER) {
  const d = KART_DATA[r.id];
  if (!d) continue;
  let len = 0;
  for (let i = 0; i < d.points.length; i += 2) len += Math.hypot(d.points[(i + 2) % d.points.length]! - d.points[i]!, d.points[(i + 3) % d.points.length]! - d.points[i + 1]!);
  KART_INFO.set(r.id, { theme: r.theme, game: r.game, gameTitle: r.gameTitle, cup: r.cup, laps: r.laps, fx: d.fx ?? [] });
  KART_CIRCUIT_LIST.push({
    id: r.id, name: r.name, lengthKm: Math.round((len * METRES_PER_UNIT) / 10) / 100, blurb: r.blurb, cols: 0, rows: 0, biome: r.biome, cells: [], start: 0,
    free: d.points, kart: true,
  });
}
