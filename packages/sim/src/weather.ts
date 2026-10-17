import { Rng } from "./rng.ts";
import type { BiomeId } from "./biomes.ts";
import { carStats, defaultCar } from "./car.ts";
import { estimateTime } from "./routetime.ts";
import type { Track } from "./track.ts";
import type { VehicleId } from "./vehicles.ts";

/** A spell of rain, in seconds of racing from the start. */
export interface Shower { start: number; end: number; intensity: number }
export interface Weather { showers: Shower[] }

/** Chance that a race has any rain at all. The moon has no weather. */
const RAINY: Record<BiomeId, number> = { grass: 0.55, city: 0.55, snow: 0.5, desert: 0.15, moon: 0, water: 0 };

/** Seconds a shower takes to build and to fade. */
const EASE = 30;

/**
 * How long a race of `laps` laps should take on this track, in seconds of racing, for the standard car of this vehicle class: the
 * same answer for the same track, vehicle and lap count, whoever is driving and however they choose to race. The weather is laid out
 * on this clock and not on laps, so a shower comes at the same moment however quickly or slowly the laps go by.
 */
export function raceDuration(track: Track, vehicle: VehicleId, laps: number): number {
  const s = carStats({ ...defaultCar(), type: vehicle });
  const lap = estimateTime(track.segments, 80, undefined, { top: s.vTop, aLat: s.aLat, accel: s.accel, brake: s.brake });
  return Math.max(60, lap * Math.max(1, laps));
}

/**
 * The weather for a race, from the track's seed and its estimated duration in seconds: the same phrase, vehicle and lap count always
 * rain at the same moments. A long race gets more, and longer, showers.
 */
export function weatherFor(seed: number, duration: number, biome: BiomeId): Weather {
  const rng = new Rng((seed ^ 0x57e47e47) >>> 0);
  rng.next();
  const showers: Shower[] = [];
  if (!rng.chance(RAINY[biome])) return { showers };
  const count = Math.max(1, Math.min(4, 1 + rng.int(1 + Math.floor(duration / 600) + 1)));
  const slot = duration / count;
  for (let i = 0; i < count; i++) {
    const length = Math.max(EASE * 2, slot * rng.range(0.25, biome === "desert" ? 0.35 : 0.6));
    const start = i * slot + rng.range(0.02 * slot, Math.max(0.03 * slot, slot - length - 0.02 * slot));
    showers.push({ start, end: Math.min(duration, start + length), intensity: biome === "desert" ? rng.range(0.4, 0.7) : rng.range(0.5, 1) });
  }
  return { showers };
}

/** How hard it is raining, 0 to 1, `time` seconds into the race. Showers ease in and out over half a minute. */
export function rainAt(w: Weather, time: number): number {
  let r = 0;
  for (const s of w.showers) {
    if (time < s.start - 0.01 || time > s.end + 0.01) continue;
    const ease = Math.min(1, (time - s.start) / EASE + 0.0001, (s.end - time) / EASE + 0.0001);
    r = Math.max(r, s.intensity * Math.max(0, ease));
  }
  return r;
}

export type RacePhase = "beginning" | "middle" | "end";

/**
 * What a forecaster would say, and no more: when rain is expected, as the beginning, the middle or the end of the race.
 * It never says which lap, how hard, or for how long. A shower counts toward the phase it starts in.
 */
export function forecast(w: Weather, duration: number): RacePhase[] {
  const out = new Set<RacePhase>();
  for (const sh of w.showers) {
    const at = duration > 0 ? sh.start / duration : 0;
    out.add(at < 1 / 3 ? "beginning" : at < 2 / 3 ? "middle" : "end");
  }
  return (["beginning", "middle", "end"] as const).filter((p) => out.has(p));
}

/** The forecast as a sentence. */
export function forecastText(phases: RacePhase[]): string {
  if (phases.length === 0) return "No rain expected.";
  const name = (p: RacePhase) => (p === "beginning" ? "at the beginning of the race" : p === "middle" ? "in the middle of the race" : "near the end of the race");
  if (phases.length === 1) return `Rain expected ${name(phases[0]!)}.`;
  const parts = phases.map(name);
  return `Rain expected ${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}.`;
}
