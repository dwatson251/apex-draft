import { add, mul, norm, perp, sub, v2, type Vec2 } from "./vec.ts";

/** Samples along a segment: SAMPLES intervals, so SAMPLES + 1 points. */
export const SAMPLES = 24;

/** A gate: where a segment meets the next, with the way the road is going and the way across it. */
export interface GateGeom { mid: Vec2; dir: Vec2; n: Vec2 }
export const gateAt = (mid: Vec2, dir: Vec2): GateGeom => ({ mid, dir, n: perp(dir) });

export type StraightShape = "straight" | "bendy" | "kink" | "chicane";

/**
 * Sideways offset from the straight line between two gates, as a function of how far along (0 to 1). Every shape has zero
 * offset and zero slope at both ends, so it joins its neighbours square-on.
 *  - bendy: one S, a lobe each way (amplitude 20)
 *  - kink: a gentle one-way bow (amplitude 14)
 *  - chicane: a quick S in the middle of the cell with straight run-in and run-out (amplitude 18)
 */
export function straightOffset(shape: StraightShape, t: number, sign: 1 | -1): number {
  switch (shape) {
    case "bendy": return sign * 20 * Math.sin(2 * Math.PI * t) * Math.sin(Math.PI * t);
    case "kink": return sign * 14 * Math.sin(Math.PI * t) ** 2;
    case "chicane": return sign * 18 * Math.sin(2 * Math.PI * t) * Math.sin(Math.PI * t) ** 2;
    default: return 0;
  }
}

/** The centre line of a straight-cell shape between two points. */
export function straightCentre(shape: StraightShape, p0: Vec2, p2: Vec2, sign: 1 | -1): Vec2[] {
  const n = perp(norm(sub(p2, p0)));
  const out: Vec2[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    out.push(add(v2(p0.x + (p2.x - p0.x) * t, p0.y + (p2.y - p0.y) * t), mul(n, straightOffset(shape, t, sign))));
  }
  return out;
}

/** A circular arc cut into equal parts: the gates between the parts and the centre line of each part. */
export interface ArcWindow {
  /** the gates between consecutive parts (parts - 1 of them) */
  gates: GateGeom[];
  /** the centre line of each part, SAMPLES + 1 points */
  centres: Vec2[][];
  radius: number;
}

function arcWindow(C: Vec2, R: number, a0: number, sgn: 1 | -1, total: number, parts: number): ArcWindow {
  const at = (a: number) => v2(C.x + Math.cos(a) * R, C.y + Math.sin(a) * R);
  const dirAt = (a: number) => v2(-Math.sin(a) * sgn, Math.cos(a) * sgn);
  const gates: GateGeom[] = [];
  const centres: Vec2[][] = [];
  for (let k = 0; k < parts; k++) {
    const pts: Vec2[] = [];
    for (let i = 0; i <= SAMPLES; i++) pts.push(at(a0 + sgn * total * ((k + i / SAMPLES) / parts)));
    centres.push(pts);
    if (k < parts - 1) { const a = a0 + sgn * total * ((k + 1) / parts); gates.push(gateAt(at(a), dirAt(a))); }
  }
  return { gates, centres, radius: R };
}

/**
 * A wide 180 degree turn through three cells: a semicircle from the entry gate to the exit gate, which face each other.
 * Radius 100 when the cells are 100 across: the old pattern was two tight corners joined by a straight.
 */
export function uturnWindow(entry: GateGeom, exit: GateGeom): ArcWindow {
  const C = v2((entry.mid.x + exit.mid.x) / 2, (entry.mid.y + exit.mid.y) / 2);
  const R = Math.hypot(entry.mid.x - exit.mid.x, entry.mid.y - exit.mid.y) / 2;
  const d = sub(exit.mid, entry.mid);
  const sgn: 1 | -1 = entry.dir.x * d.y - entry.dir.y * d.x > 0 ? 1 : -1;
  return arcWindow(C, R, Math.atan2(entry.mid.y - C.y, entry.mid.x - C.x), sgn, Math.PI, 3);
}

/**
 * A long fast quarter turn through three cells (straight, corner, straight): an arc of radius 1.5 cells from the entry gate
 * to the exit gate, where the old pattern was a tight corner of radius 0.5 cells.
 */
export function sweeperWindow(entry: GateGeom, exit: GateGeom): ArcWindow {
  const d = sub(exit.mid, entry.mid);
  const R = d.x * entry.dir.x + d.y * entry.dir.y; // how far along the entry direction the exit is: 150 in the standard pattern
  const sgn: 1 | -1 = entry.dir.x * d.y - entry.dir.y * d.x > 0 ? 1 : -1;
  // the centre lies to the side the road turns toward, a radius away from the entry gate
  const toward = sgn === 1 ? v2(-entry.dir.y, entry.dir.x) : v2(entry.dir.y, -entry.dir.x);
  const C = add(entry.mid, mul(toward, R));
  return arcWindow(C, R, Math.atan2(entry.mid.y - C.y, entry.mid.x - C.x), sgn, Math.PI / 2, 3);
}
