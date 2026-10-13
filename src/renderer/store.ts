import type { CarConfig } from "@apex/sim";

declare global {
  interface Window {
    apex?: {
      get(key: string): Promise<unknown>;
      set(key: string, value: unknown): Promise<boolean>;
      exportLine(suggested: string, text: string): Promise<boolean>;
      importLines(): Promise<string[]>;
      version(): Promise<string>;
    };
  }
}

/** Saved through Electron when present, otherwise localStorage (plain browser dev). */
export async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    if (window.apex) return ((await window.apex.get(key)) as T) ?? fallback;
    const raw = localStorage.getItem(`apex-draft-${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

export async function save(key: string, value: unknown): Promise<void> {
  try {
    if (window.apex) await window.apex.set(key, value);
    else localStorage.setItem(`apex-draft-${key}`, JSON.stringify(value));
  } catch { /* storage is a convenience */ }
}

export interface Settings { phrase: string; laps: number; mode: "trial" | "race"; rivals: number; car: CarConfig }
/** best finishing time per phrase+laps */
export type Best = Record<string, number>;
