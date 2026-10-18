import { describe, expect, it } from "vitest";
import { Race, SURFACES, botLine, buildProfile, cachedTrack, checkTrack, defaultCar, generateTrack, isNight, validateLine } from "@apex/sim";

const phrases = Array.from({ length: 300 }, (_, i) => `quiet-fox-${i}-hugs`);

describe("landscape", () => {
  it("gives the same ground to the same phrase", () => {
    for (const p of phrases.slice(0, 40)) {
      const a = generateTrack(p), b = generateTrack(p);
      expect(JSON.stringify(a.segments.map((s) => [s.elev, s.surface, s.bank, s.tunnel]))).toBe(JSON.stringify(b.segments.map((s) => [s.elev, s.surface, s.bank, s.tunnel])));
    }
  });

  it("leaves the layout of every phrase alone", () => {
    for (const p of phrases.slice(0, 60)) {
      const withL = generateTrack(p), without = generateTrack(p, { landscape: false });
      expect(withL.segments.map((s) => [s.kind, s.center])).toEqual(without.segments.map((s) => [s.kind, s.center]));
      expect(without.segments.every((s) => !s.elev && !s.surface && !s.bank && !s.tunnel)).toBe(true);
    }
  });

  it("gives a share of tracks each feature, and the hills close the loop", () => {
    const tracks = phrases.map((p) => generateTrack(p));
    const share = (f: (t: ReturnType<typeof generateTrack>) => boolean) => tracks.filter(f).length / tracks.length;
    expect(share((t) => t.segments.some((s) => s.elev))).toBeGreaterThan(0.15);
    expect(share((t) => t.segments.some((s) => s.surface))).toBeGreaterThan(0.02);
    expect(share((t) => t.segments.some((s) => s.bank))).toBeGreaterThan(0.03);
    expect(share((t) => t.segments.some((s) => s.tunnel))).toBeGreaterThan(0.01);
    for (const t of tracks) {
      const n = t.segments.length;
      if (!t.segments[0]!.elev) continue;
      for (let j = 0; j < n; j++) {
        const a = t.segments[j]!.elev!, b = t.segments[(j + 1) % n]!.elev!;
        expect(a.at(-1)).toBeCloseTo(b[0]!, 1); // a segment ends at the height the next begins at
      }
    }
  });

  it("never touches the start straight, and keeps every track valid", () => {
    for (const p of phrases) {
      const t = generateTrack(p), n = t.segments.length;
      expect(checkTrack(t)).toEqual([]);
      for (const j of [0, 1, n - 1, n - 2]) expect(t.segments[j]!.surface === undefined && !t.segments[j]!.tunnel).toBe(true);
    }
  });

  it("gives a mapped circuit the real ground it was read from, and the oval its banking, and no surfaces", () => {
    const monza = cachedTrack("monza");
    expect(monza.segments.every((s) => s.elev && !s.surface)).toBe(true);
    const h = monza.segments.flatMap((s) => s.elev!);
    expect(Math.max(...h) - Math.min(...h)).toBeGreaterThan(4);
    expect(generateTrack("oval").segments.some((s) => s.bank)).toBe(true);
  });

  it("closes the loop of a circuit's hills, climbs Spa and Laguna Seca, and leaves the kart courses flat", () => {
    for (const id of ["spa-francorchamps", "laguna-seca", "nurburgring-nordschleife", "interlagos"]) {
      const t = cachedTrack(id), n = t.segments.length;
      for (let j = 0; j < n; j++) expect(t.segments[j]!.elev!.at(-1), `${id} ${j}`).toBeCloseTo(t.segments[(j + 1) % n]!.elev![0]!, 1);
      const h = t.segments.flatMap((s) => s.elev!);
      expect(Math.max(...h) - Math.min(...h), id).toBeGreaterThan(8);
    }
    expect(cachedTrack("luigi-raceway").segments.every((s) => !s.elev)).toBe(true);
  });

  it("banks Daytona's ends and Zandvoort's last turn, and puts Monaco's tunnel in", () => {
    expect(cachedTrack("daytona").segments.some((s) => s.bank)).toBe(true);
    expect(cachedTrack("zandvoort").segments.some((s) => s.bank)).toBe(true);
    expect(cachedTrack("monaco").segments.some((s) => s.tunnel)).toBe(true);
    expect(cachedTrack("monza").segments.some((s) => s.bank || s.tunnel)).toBe(false);
  });

  it("puts a crest or dip on some straights: zero at both gates, a few units high between", () => {
    let crests = 0;
    for (const p of phrases) {
      const t = generateTrack(p);
      for (const s of t.segments) {
        if (!s.elev || !(s.kind === "straight" || s.kind === "kink" || s.kind === "sweepS" || s.kind === "bendy")) continue;
        const peak = Math.max(...s.elev.map(Math.abs));
        if (peak >= 2 && Math.abs(s.elev[0]! + s.elev.at(-1)!) < Math.abs(s.elev[s.elev.length >> 1]!)) crests++;
      }
    }
    expect(crests).toBeGreaterThan(5);
  });

  it("lets bot lines stay on the road", () => {
    for (const p of phrases.slice(0, 25)) {
      const t = cachedTrack(p);
      expect(validateLine(t, botLine(t, 5, 0.6)).ok).toBe(true);
    }
  });

  it("makes uphill slower to accelerate and downhill slower to stop", () => {
    const t = phrases.map((p) => cachedTrack(p)).find((x) => x.segments.some((s) => s.elev))!;
    const prof = buildProfile(t, botLine(t, 5, 1), defaultCar());
    expect(Math.min(...prof.accelMul)).toBeLessThan(1);
    expect(Math.max(...prof.accelMul)).toBeGreaterThan(1);
    expect(Math.min(...prof.brakeMul)).toBeLessThan(1);
  });

  it("takes grip off a rough surface, less from a machine built for it, and adds it on a bank", () => {
    const t = phrases.map((p) => generateTrack(p)).find((x) => x.segments.some((s) => s.surface))!;
    const line = botLine(t, 5, 1);
    const rally = buildProfile(t, line, { ...defaultCar(), type: "rally" }), formula = buildProfile(t, line, { ...defaultCar(), type: "formula" });
    expect(Math.min(...rally.gripMul)).toBeLessThan(1);
    expect(Math.min(...rally.gripMul)).toBeGreaterThan(Math.min(...formula.gripMul)); // the rally car loses less
    const b = phrases.map((p) => generateTrack(p)).find((x) => x.segments.some((s) => s.bank))!;
    expect(Math.max(...buildProfile(b, botLine(b, 5, 1), defaultCar()).gripMul)).toBeGreaterThan(1);
    expect(Object.keys(SURFACES).length).toBe(3);
  });

  it("keeps rain off a tunnel", () => {
    const t = phrases.map((p) => generateTrack(p)).find((x) => x.segments.some((s) => s.tunnel))!;
    const race = new Race(t, [{ id: "me", name: "Me", car: defaultCar(), lines: [botLine(t, 5, 1)], isPlayer: true }], 1, { realism: true, weather: true });
    for (let i = 0; i < 4; i++) race.field.update(10, 1, []);
    const roofed = t.segments.findIndex((s) => s.tunnel);
    const open = t.segments.findIndex((s) => !s.tunnel);
    const per = race.field.cells / t.allSegments.length;
    expect(race.field.wet[roofed * per + 3]).toBe(0);
    expect(race.field.wet[open * per + 3]).toBeGreaterThan(0.3);
  });

  it("runs some tracks in the dark, the same for everyone", () => {
    const dark = phrases.filter((_, i) => isNight(i * 977 + 13)).length;
    expect(dark).toBeGreaterThan(20); expect(dark).toBeLessThan(120);
    expect(isNight(12345)).toBe(isNight(12345));
  });
});
