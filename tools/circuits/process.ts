import type { Pt } from "./osm.ts";

export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

export const length = (p: Pt[], closed = true): number => {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += dist(p[i - 1]!, p[i]!);
  return closed && p.length > 1 ? s + dist(p.at(-1)!, p[0]!) : s;
};

/** `n` points evenly spaced by arc length round a closed loop, starting at the first point. */
export function resample(p: Pt[], n: number): Pt[] {
  const L = length(p), step = L / n;
  const out: Pt[] = [];
  let seg = 0, into = 0;
  const at = (i: number) => p[i % p.length]!;
  for (let k = 0; k < n; k++) {
    let want = k * step;
    while (seg < p.length && want > into + dist(at(seg), at(seg + 1)) + 1e-9) { into += dist(at(seg), at(seg + 1)); seg++; }
    const a = at(seg), b = at(seg + 1), d = dist(a, b) || 1;
    const u = Math.min(1, Math.max(0, (want - into) / d));
    out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    want = 0;
  }
  return out;
}

/** Light smoothing that keeps the loop closed: each point moves toward the middle of its neighbours. */
export function smoothLoop(p: Pt[], passes: number, k = 0.5): Pt[] {
  let cur = p.map((q) => ({ ...q }));
  const n = cur.length;
  for (let it = 0; it < passes; it++) {
    cur = cur.map((q, i) => {
      const a = cur[(i + n - 1) % n]!, b = cur[(i + 1) % n]!;
      return { x: q.x + ((a.x + b.x) / 2 - q.x) * k, y: q.y + ((a.y + b.y) / 2 - q.y) * k };
    });
  }
  return cur;
}

export interface Limits {
  /** the tightest turn the road may make (radius of the centre line, units) */
  rMin: number;
  /** the least distance between two parts of the road that are not near each other along it */
  gap: number;
  /** parts of the road closer than this along it are not "other" parts of it */
  near: number;
  /** points (by index) that may lie on each other: where the road crosses itself on a bridge */
  exempt?: (i: number, j: number) => boolean;
}

export interface Report { minRadius: number; minGap: number; worstDrift: number; meanDrift: number; iterations: number }

/** Radius of curvature at each point of a closed polyline (the circumscribed circle of the point and its neighbours). */
export function radii(p: Pt[], hop = 1): number[] {
  const n = p.length;
  return p.map((q, i) => {
    const a = p[(i + n - hop) % n]!, b = p[(i + hop) % n]!;
    const ab = dist(a, q), bc = dist(q, b), ca = dist(b, a);
    const cross = Math.abs((q.x - a.x) * (b.y - a.y) - (q.y - a.y) * (b.x - a.x));
    return cross < 1e-9 ? Infinity : (ab * bc * ca) / (2 * cross);
  });
}

const wrap = (a: number): number => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/** Solve the small dense system A x = b (Gaussian elimination with pivoting). */
function solve(A: number[][], b: number[]): number[] {
  const m = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < m; c++) {
    let piv = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    const d = M[c]![c]! || 1e-12;
    for (let r = c + 1; r < m; r++) { const f = M[r]![c]! / d; for (let k = c; k <= m; k++) M[r]![k]! -= f * M[c]![k]!; }
  }
  const x = new Array<number>(m).fill(0);
  for (let r = m - 1; r >= 0; r--) { let s = M[r]![m]!; for (let k = r + 1; k < m; k++) s -= M[r]![k]! * x[k]!; x[r] = s / (M[r]![r]! || 1e-12); }
  return x;
}

/**
 * One bending pass. The loop is described by how much it turns at each point; wherever that is more than a road of radius
 * `rMin` can turn, the excess is spread to the points either side (so the bend gets longer and wider, the total turning stays
 * the same), and the loop is rebuilt from those turns. The rebuilt loop is then moved, turned and gently warped (a few slow
 * waves in the heading) to lie as close as it can to `target` while staying closed.
 */
function bend(P: Pt[], target: Pt[], rMin: number, pinned: (i: number) => boolean): Pt[] {
  const n = P.length, ds = length(P) / n, phiMax = ds / rMin;
  const theta0 = P.map((q, i) => { const r = P[(i + 1) % n]!; return Math.atan2(r.y - q.y, r.x - q.x); });
  const phi = theta0.map((t, i) => wrap(t - theta0[(i + n - 1) % n]!));
  for (let pass = 0; pass < 20000; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      const v = phi[i]!;
      if (Math.abs(v) <= phiMax) continue;
      const ex = v - Math.sign(v) * phiMax;
      phi[i] = Math.sign(v) * phiMax;
      phi[(i + n - 1) % n]! += ex / 2; phi[(i + 1) % n]! += ex / 2;
      moved = true;
    }
    if (!moved) break;
  }
  // headings of the edges, from the first one
  const theta = new Float64Array(n);
  theta[0] = theta0[0]!;
  for (let i = 1; i < n; i++) theta[i] = theta[i - 1]! + phi[i]!;
  // basis of heading changes: all edges together (a turn), then slow waves
  const HARMONICS = 14;
  const basis: ((k: number) => number)[] = [() => 1];
  for (let m = 1; m <= HARMONICS; m++) { basis.push((k) => Math.cos((2 * Math.PI * m * k) / n), (k) => Math.sin((2 * Math.PI * m * k) / n)); }
  const m = 2 + basis.length;
  let origin = { x: P[0]!.x, y: P[0]!.y };
  const build = (th: Float64Array, o: Pt) => {
    const X: Pt[] = [{ x: o.x, y: o.y }];
    for (let i = 0; i < n; i++) { const q = X[i]!; X.push({ x: q.x + ds * Math.cos(th[i]!), y: q.y + ds * Math.sin(th[i]!) }); }
    return X; // n + 1 points; the last should land on the first
  };
  const CLOSE = 30;
  const JTJ = new Float64Array(m * m), JTr = new Float64Array(m), colX = new Float64Array(m), colY = new Float64Array(m);
  for (let gn = 0; gn < 6; gn++) {
    const X = build(theta, origin);
    JTJ.fill(0); JTr.fill(0);
    // each position depends on the origin (columns 0 and 1) and, through the headings before it, on every heading parameter
    const dX = new Float64Array(2 * basis.length);
    const acc = (rx: number, ry: number, w: number, withHeadings: boolean, origin2: boolean) => {
      colX.fill(0); colY.fill(0);
      if (origin2) { colX[0] = 1; colY[1] = 1; }
      if (withHeadings) for (let b = 0; b < basis.length; b++) { colX[2 + b] = dX[2 * b]!; colY[2 + b] = dX[2 * b + 1]!; }
      for (let a = 0; a < m; a++) {
        const ax = colX[a]!, ay = colY[a]!;
        if (ax === 0 && ay === 0) continue;
        JTr[a]! += w * (ax * rx + ay * ry);
        for (let b = a; b < m; b++) JTJ[a * m + b]! += w * (ax * colX[b]! + ay * colY[b]!);
      }
    };
    for (let i = 0; i < n; i++) {
      acc(X[i]!.x - target[i]!.x, X[i]!.y - target[i]!.y, pinned(i) ? 400 : 1, true, true);
      const sx = -ds * Math.sin(theta[i]!), sy = ds * Math.cos(theta[i]!);
      for (let b = 0; b < basis.length; b++) { const f = basis[b]!(i); dX[2 * b]! += sx * f; dX[2 * b + 1]! += sy * f; }
    }
    // closure: the last point must be the first (only the headings can change that)
    acc(X[n]!.x - X[0]!.x, X[n]!.y - X[0]!.y, CLOSE * CLOSE, true, false);
    const A: number[][] = [];
    for (let a = 0; a < m; a++) { A.push([]); for (let b = 0; b < m; b++) A[a]!.push(a <= b ? JTJ[a * m + b]! : JTJ[b * m + a]!); A[a]![a]! += 1e-6; }
    const delta = solve(A, Array.from(JTr, (v) => -v));
    origin = { x: origin.x + delta[0]!, y: origin.y + delta[1]! };
    for (let i = 0; i < n; i++) { let d = 0; for (let b = 0; b < basis.length; b++) d += delta[2 + b]! * basis[b]!(i); theta[i]! += d; }
  }
  const X = build(theta, origin);
  // whatever closure error is left is shared out along the loop
  const ex = X[n]!.x - X[0]!.x, ey = X[n]!.y - X[0]!.y;
  return X.slice(0, n).map((q, i) => ({ x: q.x - (ex * i) / n, y: q.y - (ey * i) / n }));
}

/** Push apart the parts of the road that are not next to each other along it. Returns how many pairs were too close. */
function separate(P: Pt[], lim: Limits, pinned: (i: number) => boolean): number {
  const n = P.length, spacing = length(P) / n, nearIdx = Math.ceil(lim.near / spacing);
  let bad = 0;
  for (let rep = 0; rep < 4; rep++) {
    const dx = new Float64Array(n), dy = new Float64Array(n);
    bad = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (Math.min(j - i, n - (j - i)) <= nearIdx || lim.exempt?.(i, j)) continue;
      const a = P[i]!, b = P[j]!, ex = b.x - a.x, ey = b.y - a.y;
      if (Math.abs(ex) >= lim.gap || Math.abs(ey) >= lim.gap) continue;
      const d = Math.hypot(ex, ey);
      if (d >= lim.gap) continue;
      bad++;
      const push = ((lim.gap - d) / Math.max(d, 1e-6)) * 0.5 * 1.1;
      const pi = pinned(i), pj = pinned(j);
      if (pi && pj) continue;
      const wi = pj ? 1 : pi ? 0 : 0.5, wj = pi ? 1 : pj ? 0 : 0.5; // a pinned point stays and the other one gives way
      dx[i] -= ex * push * wi; dy[i] -= ey * push * wi; dx[j] += ex * push * wj; dy[j] += ey * push * wj;
    }
    P.forEach((q, i) => { q.x += dx[i]!; q.y += dy[i]!; });
  }
  return bad;
}

/**
 * Bend a closed loop of evenly spaced points the least that makes it a road the game can use: no turn tighter than `rMin`, and
 * no two parts of the road, not close along it, nearer than `gap`. Alternates `bend` (which keeps to the turning limit and the
 * length, and stays near where the points were) with pushing apart whatever is too close, until both hold.
 */
export function fit(original: Pt[], lim: Limits, rounds = 40, pinHalf = 0): { points: Pt[]; report: Report } {
  const nn = original.length;
  const pinned = (i: number) => pinHalf > 0 && Math.min(i, nn - i) <= pinHalf;
  let P = original.map((q) => ({ ...q }));
  let target = original.map((q) => ({ ...q }));
  let it = 0;
  for (; it < rounds; it++) {
    const t0 = Date.now();
    P = bend(P, target, lim.rMin, pinned);
    if (process.env.FITLOG) console.log('  round', it, Date.now() - t0, 'ms');
    P = resample(P, original.length);
    const q = P.map((p) => ({ ...p }));
    const bad = separate(q, lim, pinned);
    const r = measure(P, original, lim);
    if (!bad && r.minRadius >= lim.rMin * 0.9) break;
    target = q; P = q;
  }
  return { points: P, report: { ...measure(P, original, lim), iterations: it } };
}

export function measure(p: Pt[], original: Pt[], lim: Limits): Report {
  const n = p.length, spacing = length(p) / n, nearIdx = Math.ceil(lim.near / spacing);
  let minGap = Infinity;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (Math.min(j - i, n - (j - i)) <= nearIdx || lim.exempt?.(i, j)) continue;
    minGap = Math.min(minGap, dist(p[i]!, p[j]!));
  }
  // radius over a few steps, so the noise of single points does not count
  const hop = Math.max(1, Math.round(12 / spacing));
  const rs = radii(p, hop);
  let drift = 0, worst = 0;
  p.forEach((q, i) => { const d = dist(q, original[i]!); drift += d; worst = Math.max(worst, d); });
  return { minRadius: Math.min(...rs), minGap, worstDrift: worst, meanDrift: drift / n, iterations: 0 };
}

/**
 * Make the road dead straight for `half` points either side of point `at`, easing back into the rest over `blend` points. The pit lane
 * runs alongside the start straight and is a straight line, so the road there has to be one.
 */
export function straighten(p: Pt[], at: number, half: number, blend: number): Pt[] {
  const n = p.length, spacing = length(p) / n;
  const a = p[(at - half + n) % n]!, b = p[(at + half) % n]!, len = dist(a, b) || 1;
  const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const mid = p[at]!;
  const out = p.map((q) => ({ ...q }));
  for (let k = -(half + blend); k <= half + blend; k++) {
    const i = (at + k + n) % n;
    const line = { x: mid.x + dir.x * k * spacing, y: mid.y + dir.y * k * spacing };
    const over = Math.max(0, Math.abs(k) - half) / blend;
    const w = 1 - over * over * (3 - 2 * over);
    out[i] = { x: line.x * w + p[i]!.x * (1 - w), y: line.y * w + p[i]!.y * (1 - w) };
  }
  return out;
}
