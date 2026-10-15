import { describe, expect, it } from "vitest";
import {
  Race, Rng, botLine, buildProfile, checkTrack, completeLine, defaultCar, exitsAfter, generateTrack, isComplete, nextOf, randomPhrase, routesOf, validateLine,
  type Track,
} from "@apex/sim";
import { minClearance } from "../packages/sim/src/branches.ts";

const funPhrases = (n: number, seed = 5) => { const r = new Rng(seed); return Array.from({ length: n }, () => `fun-${randomPhrase(r)}`); };
const withBranches = (n: number): Track[] => funPhrases(200, 17).map((p) => generateTrack(p)).filter((t) => t.branches.length > 0).slice(0, n);

describe("shortcuts", () => {
  it("turn up on fun tracks only, and are well formed", () => {
    for (let i = 0; i < 80; i++) expect(generateTrack(randomPhrase(new Rng(i + 1))).branches).toEqual([]);
    const ts = withBranches(20);
    expect(ts.length).toBe(20);
    for (const t of ts) {
      expect(checkTrack(t), t.phrase).toEqual([]);
      expect(minClearance(t)).toBeGreaterThanOrEqual(3.99);
      for (const b of t.branches) {
        const F = t.segments[b.fork]!, first = t.allSegments[b.segs[0]!]!;
        expect(F.alt).toEqual([first.index]);
        expect(first.alt).toEqual([F.index]);
        expect(b.segs.length + 0).toBeLessThan(b.rejoin - b.fork + 1);   // shorter in cells than the ring road it replaces
        expect(nextOf(t, b.segs.at(-1)!)).toBe((b.rejoin + 1) % t.segments.length);
      }
    }
  });
  it("give routes that all close on the start line", () => {
    for (const t of withBranches(10)) {
      const rs = routesOf(t);
      expect(rs.length).toBe(2 ** t.branches.length);
      for (const r of rs) {
        expect(r[0]).toBe(0);
        for (let k = 1; k < r.length; k++) expect(exitsAfter(t, r[k - 1]!)).toContain(r[k]);
        expect(nextOf(t, r.at(-1)!)).toBe(0);
      }
    }
  });
  it("can be driven by a line on every route, and a shorter route is a shorter lap", () => {
    for (const t of withBranches(8)) {
      const lines = routesOf(t).map((route) => botLine(t, 3, 1, { route }));
      for (const [k, line] of lines.entries()) {
        expect(isComplete(t, line), `${t.phrase} route ${k}`).toBe(true);
        expect(validateLine(t, line).ok, `${t.phrase} route ${k}`).toBe(true);
      }
      const lens = lines.map((l) => buildProfile(t, l, defaultCar()).length);
      const ring = lens[routesOf(t).findIndex((r) => r.every((id, k) => id === k))]!;
      expect(Math.min(...lens)).toBeLessThan(ring);
    }
  });
  it("rank cars by where they are on the ring, whichever way they went", () => {
    for (const t of withBranches(6)) {
      const lines = routesOf(t).map((route) => botLine(t, 3, 1, { route }));
      for (const line of lines) {
        const p = buildProfile(t, line, defaultCar());
        expect(p.canon).toBeTruthy();
        const c = p.canon!;
        for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThanOrEqual(c[i - 1]! - 1e-6);   // never goes backwards
        expect(c[c.length - 1]!).toBeGreaterThan(c[0]! + 0.8 * 100);
      }
    }
  });
  it("race: a full grid takes both ways, finishes, and is ranked sensibly", () => {
    for (const t of withBranches(4)) {
      const es = Array.from({ length: 16 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, car: defaultCar(), lines: [botLine(t, i + 1, 0.2 + 0.05 * i)], isPlayer: i === 0 }));
      const r = new Race(t, es, 3, { realism: false });
      r.runToEnd();
      expect(r.cars.every((c) => c.finishTime !== null), t.phrase).toBe(true);
      const used = new Set(es.map((e) => (e.lines[0]!.path ? "short" : "ring")));
      expect(used.size).toBeGreaterThanOrEqual(1);
      const res = r.results();
      for (let i = 1; i < res.length; i++) expect(res[i]!.finishTime ?? Infinity).toBeGreaterThanOrEqual(res[i - 1]!.finishTime ?? Infinity);
    }
  });
  it("complete a half-drawn lap along the route already taken", () => {
    for (const t of withBranches(5)) {
      const b = t.branches[0]!;
      const route = routesOf(t).find((r) => r.includes(b.segs[0]!))!;
      const full = botLine(t, 5, 1, { route });
      const cut = b.segs[0]! === route[b.fork] ? b.fork + 2 : b.fork + 1;
      const partial = { start: full.start, segs: full.segs.slice(0, cut), path: full.path?.slice(0, cut) };
      const done = completeLine(t, partial);
      expect(isComplete(t, done)).toBe(true);
      expect(done.path?.slice(0, cut) ?? route.slice(0, cut)).toEqual(route.slice(0, cut));
    }
  });
});

import { decodeShare, encodeShare, parseLineFile, serializeLineFile, type ShareState } from "@apex/sim";

describe("saving a lap that takes a shortcut", () => {
  const state = (line?: ShareState["line"]): ShareState => ({
    phrase: "fun-healthy-bear-eats-tuna", laps: 3, mode: "race", rivals: 5, car: { ...defaultCar(), name: "Me" }, obstacles: false, realism: false, playing: true,
    startTyre: "medium", pitPlan: [], line,
  });
  it("round-trips the route in a share link", () => {
    for (const t of withBranches(3)) {
      const route = routesOf(t).find((r) => r.some((id) => id >= t.segments.length))!;
      const line = botLine(t, 9, 1, { route });
      expect(line.path).toEqual(route);
      const back = decodeShare(encodeShare(state(line)));
      expect(typeof back).toBe("object");
      const l = (back as ShareState).line!;
      expect(l.path).toEqual(route);
      expect(l.segs.length).toBe(line.segs.length);
      expect(isComplete(t, l)).toBe(true);
    }
  });
  it("leaves the route out for a lap round the ring, and still opens a version 4 link", () => {
    const t = generateTrack("quiet-fox-hugs-kites");
    const ring = botLine(t, 2, 1);
    expect(ring.path).toBeUndefined();
    const code = encodeShare(state(ring));
    const back = decodeShare(code) as ShareState;
    expect(back.line!.path).toBeUndefined();
    // a link from before shortcuts: same layout, version byte 4
    const bytes = Buffer.from(code.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    bytes[0] = 4;
    const old = bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const o = decodeShare(old) as ShareState;
    expect(o.line!.segs.length).toBe(ring.segs.length);
  });
  it("round-trips the route in a line file, and opens version 1 files", () => {
    const t = withBranches(1)[0]!;
    const route = routesOf(t).find((r) => r.some((id) => id >= t.segments.length))!;
    const line = botLine(t, 9, 1, { route });
    const text = serializeLineFile({ phrase: t.phrase, name: "me", car: defaultCar(), lines: [line] });
    const back = parseLineFile(text);
    expect(typeof back).toBe("object");
    expect((back as { lines: { path?: number[] }[] }).lines[0]!.path).toEqual(route);
    const v1 = JSON.stringify({ ...JSON.parse(serializeLineFile({ phrase: "quiet-fox-hugs-kites", name: "me", car: defaultCar(), lines: [botLine(generateTrack("quiet-fox-hugs-kites"), 1, 1)] })), v: 1 });
    expect(typeof parseLineFile(v1)).toBe("object");
  });
});
