import { Rng } from "./rng.ts";
import type { BiomeId } from "./biomes.ts";

/** A spell of rain, in laps from the start of the race. */
export interface Shower { start: number; end: number; intensity: number }
export interface Weather { showers: Shower[] }

/** Chance that a race has any rain at all. The moon has no weather. */
const RAINY: Record<BiomeId, number> = { grass: 0.55, city: 0.55, snow: 0.5, desert: 0.15, moon: 0 };

/**
 * The weather for a race, from the track's seed and the number of laps: the same phrase and lap count always rain at the
 * same moments. Showers are laid out in laps so that a long race gets long showers.
 */
export function weatherFor(seed: number, laps: number, biome: BiomeId): Weather {
  const rng = new Rng((seed ^ 0x57e47e47) >>> 0);
  rng.next();
  const showers: Shower[] = [];
  if (!rng.chance(RAINY[biome])) return { showers };
  const count = Math.max(1, Math.min(4, 1 + rng.int(1 + Math.floor(laps / 8) + 1)));
  const slot = laps / count;
  for (let i = 0; i < count; i++) {
    const length = Math.max(0.8, slot * rng.range(0.25, biome === "desert" ? 0.35 : 0.6));
    const start = i * slot + rng.range(0.05, Math.max(0.06, slot - length - 0.05));
    showers.push({ start, end: Math.min(laps, start + length), intensity: biome === "desert" ? rng.range(0.4, 0.7) : rng.range(0.5, 1) });
  }
  return { showers };
}

/** How hard it is raining, 0 to 1, `lap` laps into the race. Showers ease in and out over about half a lap. */
export function rainAt(w: Weather, lap: number): number {
  let r = 0;
  for (const s of w.showers) {
    if (lap < s.start - 0.01 || lap > s.end + 0.01) continue;
    const ease = Math.min(1, (lap - s.start) / 0.5 + 0.0001, (s.end - lap) / 0.5 + 0.0001);
    r = Math.max(r, s.intensity * Math.max(0, ease));
  }
  return r;
}
