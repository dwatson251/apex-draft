import type { Livery } from "./cars.ts";
import type { CarConfig, Compound, Difficulty, Tactic, VehicleId } from "@apex/sim";

declare global {
  interface Window {
    apex?: {
      // Electron provides all of these; the Android shell (platform.ts) provides only version.
      get?(key: string): Promise<unknown>;
      set?(key: string, value: unknown): Promise<boolean>;
      version?(): Promise<string>;
      quit?(): Promise<void>;
    };
  }
}

/** Saved through Electron when present, otherwise localStorage (plain browser dev, Android). */
export async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    if (window.apex?.get) return ((await window.apex.get(key)) as T) ?? fallback;
    const raw = localStorage.getItem(`apex-draft-${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

export async function save(key: string, value: unknown): Promise<void> {
  try {
    if (window.apex?.set) await window.apex.set(key, value);
    else localStorage.setItem(`apex-draft-${key}`, JSON.stringify(value));
  } catch { /* storage is a convenience */ }
}

export interface Settings {
  phrase: string;
  laps: number;
  mode: "trial" | "race";
  rivals: number;
  car: CarConfig;
  /** the machine chosen in race setup, when the track offers it (else the track's own) */
  vehicle?: VehicleId;
  muted?: boolean;
  musicOff?: boolean;
  /** tyre wear, fuel and pit stops */
  realism: boolean;
  /** which decision about realism the saved value follows */
  realismVersion?: number;
  /** boxes and water on the road */
  obstacles: boolean;
  startTyre: Compound;
  /** which game the setup screen was last on */
  flow?: "trial" | "quick" | "weekend";
  /** how many times faster fuel burns and tyres wear, 1 to 40 (realism only) */
  wearFuel?: number;
  wearTyre?: number;
  /** compounds every car must run (realism only) */
  mandatory?: Compound[];
  /** how hard the rivals drive in a Quick Race or Race Weekend */
  difficulty: Difficulty;
  /** the player's paint: shown on their own car only */
  livery?: Livery;
  /** experimental: cars take gaps to go past slower ones (see RaceRules.overtake) */
  overtake?: boolean;
  /** experimental: how much room cars take side by side and following: 0 normal, 1 tight, 2 tightest (RaceRules.room) */
  room?: 0 | 1 | 2;
  tutorialDone?: boolean;
  /** pit stops queued: the end of lap `lap` (counting from 0), on this tyre */
  pitPlan: { lap: number; tyre: Compound; tactic?: Tactic }[];
  /** how to drive the first stint (realism only); balanced if left out */
  startTactic?: Tactic;
}
/** best finishing time per phrase+laps */
export type Best = Record<string, number>;
