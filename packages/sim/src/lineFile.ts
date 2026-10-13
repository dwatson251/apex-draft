import { validateCar, type CarConfig } from "./car.ts";
import type { Line } from "./line.ts";
import { normalizePhrase } from "./seed.ts";

export const LINE_FILE_VERSION = 1;

/** A shareable set of lap lines for one track, keyed by its seed phrase. */
export interface LineFile {
  v: number;
  phrase: string;
  name: string;
  car: CarConfig;
  lines: Line[];
}

export function serializeLineFile(f: Omit<LineFile, "v">): string {
  const round = (n: number) => Math.round(n * 100) / 100;
  const pt = (p: { x: number; y: number }) => [round(p.x), round(p.y)];
  return JSON.stringify({
    v: LINE_FILE_VERSION, phrase: normalizePhrase(f.phrase), name: f.name, car: f.car,
    lines: f.lines.map((l) => ({ start: pt(l.start), segs: l.segs.map((s) => s.map(pt)) })),
  });
}

const isPt = (a: unknown): a is [number, number] => Array.isArray(a) && a.length === 2 && a.every((n) => typeof n === "number" && Number.isFinite(n));

export function parseLineFile(text: string): LineFile | string {
  let raw: any;
  try { raw = JSON.parse(text); } catch { return "not valid JSON"; }
  if (!raw || raw.v !== LINE_FILE_VERSION) return "unsupported line file version";
  if (typeof raw.phrase !== "string" || !raw.phrase) return "missing track phrase";
  if (typeof raw.name !== "string") return "missing name";
  const car = raw.car as CarConfig;
  if (!car || typeof car.name !== "string") return "missing car";
  const carErr = validateCar(car);
  if (carErr) return `car: ${carErr}`;
  if (!Array.isArray(raw.lines) || raw.lines.length < 1 || raw.lines.length > 12) return "needs 1 to 12 lap lines";
  const lines: Line[] = [];
  for (const l of raw.lines) {
    if (!l || !isPt(l.start) || !Array.isArray(l.segs) || l.segs.length > 64) return "bad line";
    const segs = [];
    for (const s of l.segs) {
      if (!Array.isArray(s) || s.length < 1 || s.length > 2000 || !s.every(isPt)) return "bad line segment";
      segs.push(s.map(([x, y]: [number, number]) => ({ x, y })));
    }
    lines.push({ start: { x: l.start[0], y: l.start[1] }, segs });
  }
  return { v: raw.v, phrase: normalizePhrase(raw.phrase), name: raw.name.slice(0, 40), car: { name: String(car.name).slice(0, 40), accel: car.accel, top: car.top, grip: car.grip, brake: car.brake }, lines };
}
