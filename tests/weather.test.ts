import { describe, expect, it } from "vitest";
import {
  COMPOUNDS, Rng, WetField, botLine, generateTrack, rainAt, randomPhrase, spinRate, tyreGrip, weatherFor, wearRate,
  type BiomeId,
} from "@apex/sim";

describe("tyre compounds", () => {
  it("dry: soft grips most, medium is standard, wet is worst", () => {
    expect(tyreGrip("soft", 0, 0)).toBeGreaterThan(tyreGrip("medium", 0, 0));
    expect(tyreGrip("medium", 0, 0)).toBeCloseTo(1, 2);
    expect(tyreGrip("medium", 0, 0)).toBeGreaterThan(tyreGrip("wet", 0, 0));
  });
  it("soaked: slicks have almost nothing and wets are far better", () => {
    expect(tyreGrip("soft", 1, 0)).toBeLessThan(0.15);
    expect(tyreGrip("medium", 1, 0)).toBeLessThan(0.15);
    expect(tyreGrip("wet", 1, 0)).toBeGreaterThan(0.9);
  });
  it("slicks lose grip steadily as the road gets wetter, wets gain it", () => {
    let prev = tyreGrip("medium", 0, 0);
    for (const w of [0.2, 0.4, 0.6, 0.8, 1]) { const g = tyreGrip("medium", w, 0); expect(g).toBeLessThanOrEqual(prev); prev = g; }
    expect(tyreGrip("wet", 0.5, 0)).toBeGreaterThan(tyreGrip("wet", 0, 0));
  });
  it("in the wet a heavily driven line is slippery, in the dry it is a little better", () => {
    expect(tyreGrip("wet", 0.8, 1)).toBeLessThan(tyreGrip("wet", 0.8, 0));
    expect(tyreGrip("medium", 0.5, 1)).toBeLessThan(tyreGrip("medium", 0.5, 0));
    expect(tyreGrip("medium", 0, 1)).toBeGreaterThan(tyreGrip("medium", 0, 0));
  });
  it("wear: soft fastest in the dry, wets wear quickly in the dry but slowest of all in the wet", () => {
    expect(wearRate("soft", 0)).toBeGreaterThan(wearRate("medium", 0));
    expect(wearRate("wet", 0)).toBeGreaterThan(wearRate("medium", 0));
    expect(wearRate("wet", 1)).toBeLessThan(wearRate("medium", 0)); // even slower than a medium in the dry
    expect(wearRate("wet", 1)).toBeLessThan(wearRate("medium", 1));
    expect(COMPOUNDS.wet.wearWet).toBeLessThan(COMPOUNDS.medium.wearDry);
  });
  it("spin only when grip has collapsed, and more as it falls", () => {
    expect(spinRate(0.9)).toBe(0);
    expect(spinRate(0.1)).toBeGreaterThan(spinRate(0.3));
    expect(spinRate(0.1)).toBeLessThan(0.1); // a low chance
  });
});

describe("weather", () => {
  it("is the same for the same seed and laps, and different otherwise", () => {
    const a = weatherFor(12345, 20, "grass"), b = weatherFor(12345, 20, "grass");
    expect(a).toEqual(b);
    const kinds = new Set<string>();
    for (let i = 0; i < 60; i++) kinds.add(JSON.stringify(weatherFor(i * 7919, 20, "grass")));
    expect(kinds.size).toBeGreaterThan(10);
  });
  it("by place: the moon never rains, the desert rarely, elsewhere often", () => {
    const rainy = (b: BiomeId) => Array.from({ length: 300 }, (_, i) => weatherFor(i * 104729 + 1, 12, b).showers.length > 0).filter(Boolean).length / 300;
    expect(rainy("moon")).toBe(0);
    expect(rainy("desert")).toBeLessThan(0.3);
    expect(rainy("grass")).toBeGreaterThan(0.4);
  });
  it("showers fit inside the race and rain eases in and out", () => {
    for (let i = 0; i < 200; i++) {
      const laps = 3 + (i % 48), w = weatherFor(i * 31337, laps, "grass");
      for (const s of w.showers) { expect(s.start).toBeGreaterThanOrEqual(0); expect(s.end).toBeLessThanOrEqual(laps); expect(s.end).toBeGreaterThan(s.start); }
    }
    const w = { showers: [{ start: 2, end: 6, intensity: 0.8 }] };
    expect(rainAt(w, 1)).toBe(0);
    expect(rainAt(w, 4)).toBeCloseTo(0.8, 5);
    expect(rainAt(w, 2.1)).toBeLessThan(rainAt(w, 4));
    expect(rainAt(w, 7)).toBe(0);
  });
});

describe("a wet track", () => {
  const t = generateTrack("brave-owl-rides-melons", { biome: "grass" });
  const line = botLine(t, 3, 1);
  const onLine = (n: number) => { const pts: { x: number; y: number }[] = []; for (const seg of line.segs) for (const p of seg) pts.push(p); return pts.slice(0, n); };
  const mean = (f: WetField) => f.wet.reduce((a, b) => a + b, 0) / f.cells;

  it("gets wet in the rain and dries, slowly, without it", () => {
    const f = new WetField(t);
    for (let k = 0; k < 600; k++) f.update(0.1, 1, []);   // a minute of heavy rain
    expect(mean(f)).toBeGreaterThan(0.8);
    const wet = mean(f);
    for (let k = 0; k < 600; k++) f.update(0.1, 0, []);   // a minute of sun
    expect(mean(f)).toBeLessThan(wet);
    expect(mean(f)).toBeGreaterThan(wet * 0.7);            // but only a little
    for (let k = 0; k < 9000; k++) f.update(0.1, 0, []);  // fifteen more
    expect(mean(f)).toBeLessThan(0.05);
  });

  it("dries quicker where cars drive: the line they take becomes the dry line", () => {
    const f = new WetField(t), cars = onLine(40);
    for (let k = 0; k < 600; k++) f.update(0.1, 1, []);
    for (let k = 0; k < 600; k++) f.update(0.1, 0, cars.map((p) => ({ x: p.x, y: p.y })));
    const drivenCells = new Set(cars.map((p) => f.cellAt(p.x, p.y)).filter((c) => c >= 0));
    let driven = 0, untouched = 0, nd = 0, nu = 0;
    for (let i = 0; i < f.cells; i++) if (drivenCells.has(i)) { driven += f.wet[i]!; nd++; } else { untouched += f.wet[i]!; nu++; }
    expect(driven / nd).toBeLessThan((untouched / nu) * 0.6);
    // and those bins are the ones with use on them
    for (const c of drivenCells) expect(f.use[c]).toBeGreaterThan(0.1);
  });

  it("in the rain the busiest line is the slipperiest for a car on wets, and the quiet bit is better", () => {
    const f = new WetField(t), cars = onLine(40);
    for (let k = 0; k < 900; k++) f.update(0.1, 1, cars.map((p) => ({ x: p.x, y: p.y })));
    const hot = f.cellAt(cars[10]!.x, cars[10]!.y);
    let quiet = -1;
    for (let i = 0; i < f.cells && quiet < 0; i++) if (f.use[i]! < 0.01 && f.wet[i]! > 0.5) quiet = i;
    expect(quiet).toBeGreaterThanOrEqual(0);
    expect(tyreGrip("wet", f.wet[hot]!, f.use[hot]!)).toBeLessThan(tyreGrip("wet", f.wet[quiet]!, f.use[quiet]!) + 1e-9);
  });

  it("maps every point of a racing line to a bin, and snapshots what it holds", () => {
    const f = new WetField(t);
    for (const p of onLine(60)) expect(f.cellAt(p.x, p.y)).toBeGreaterThanOrEqual(0);
    expect(f.cellAt(-500, -500)).toBe(-1);
    expect(f.snapshot().length).toBe(f.cells * 2);
    expect(randomPhrase(new Rng(1)).length).toBeGreaterThan(5);
  });
});

import { Race, defaultCar, type Compound, type Entrant } from "@apex/sim";

describe("tyres and weather in a race", () => {
  const t = generateTrack("brave-owl-rides-melons", { biome: "grass" });
  const solo = (tyre: Compound, opts: { rain?: boolean; plan?: { lap: number; tyre?: Compound }[]; laps?: number } = {}) => {
    const e: Entrant = { id: "x", name: "x", car: defaultCar(), lines: [botLine(t, 3, 1)], isPlayer: true, startTyre: tyre, pitPlan: opts.plan };
    const r = new Race(t, [e], opts.laps ?? 3);
    if (opts.rain) { r.weather.showers.push({ start: 0, end: opts.laps ?? 3, intensity: 1 }); r.field.wet.fill(1); }
    return r;
  };

  it("in a downpour slicks crawl and wets keep going", () => {
    const lap = (tyre: Compound) => { const r = solo(tyre, { rain: true }); r.runToEnd(); return r.results()[0]!.lapTimes[1]!; };
    const dry = (() => { const r = solo("medium"); r.runToEnd(); return r.results()[0]!.lapTimes[1]!; })();
    const medium = lap("medium"), wet = lap("wet"), soft = lap("soft");
    expect(wet).toBeLessThan(dry * 1.35);        // wets cope
    expect(medium).toBeGreaterThan(wet * 1.6);   // slicks do not
    expect(soft).toBeGreaterThan(wet * 1.6);
  });

  it("in the dry soft is quicker than medium, and wets are slowest", () => {
    const lap = (tyre: Compound) => { const r = solo(tyre, { rain: false }); r.weather.showers.length = 0; r.runToEnd(); return r.results()[0]!.lapTimes[1]!; };
    expect(lap("soft")).toBeLessThan(lap("medium"));
    expect(lap("medium")).toBeLessThan(lap("wet"));
  });

  it("wear follows the tyre: soft fastest in the dry, wet slowest in the wet", () => {
    const wearAfter = (tyre: Compound, rain: boolean) => { const r = solo(tyre, { rain }); if (!rain) r.weather.showers.length = 0; r.runLap("x", 0); return 1 - r.cars[0]!.tyre; };
    expect(wearAfter("soft", false)).toBeGreaterThan(wearAfter("medium", false));
    expect(wearAfter("wet", false)).toBeGreaterThan(wearAfter("medium", false));
    expect(wearAfter("wet", true)).toBeLessThan(wearAfter("medium", false));
  });

  it("a planned stop swaps the tyre, and the stop has a lap to run to", () => {
    const r = solo("medium", { plan: [{ lap: 0, tyre: "wet" }], laps: 3 });
    r.runToEnd();
    expect(r.cars[0]!.pits).toBe(1);
    expect(r.cars[0]!.compound).toBe("wet");
  });

  it("with weather off nothing gets wet", () => {
    const e: Entrant = { id: "x", name: "x", car: defaultCar(), lines: [botLine(t, 3, 1)], isPlayer: true };
    const r = new Race(t, [e], 4, { realism: true, weather: false });
    r.runToEnd();
    expect(r.field.wet.every((w) => w === 0)).toBe(true);
    expect(r.events.some((ev) => ev.type === "rain")).toBe(false);
  });

  it("is deterministic, rain and all", () => {
    const make = () => { const r = solo("medium", { rain: true, laps: 4 }); r.runToEnd(); return r.hash(); };
    expect(make()).toBe(make());
  });

  it("a rainy seed really rains and dries: the field is wet at some time and the events say so", () => {
    let found = "";
    for (let i = 0; i < 300 && !found; i++) { const p = randomPhrase(new Rng(i + 900)); const tr = generateTrack(p, { biome: "grass" }); if (weatherFor(tr.seed, 6, "grass").showers.length >= 1) found = p; }
    expect(found).not.toBe("");
    const tr = generateTrack(found, { biome: "grass" });
    const e: Entrant = { id: "x", name: "x", car: defaultCar(), lines: [botLine(tr, 3, 1)], isPlayer: true, startTyre: "wet" };
    const r = new Race(tr, [e], 6);
    r.runToEnd();
    expect(r.events.some((ev) => ev.type === "rain")).toBe(true);
    expect(Math.max(...r.wetSnaps.map((s) => Math.max(...s.slice(0, r.field.cells))))).toBeGreaterThan(40);
    expect(r.rainTrace.length).toBeGreaterThan(30);
  });

  it("a fifty-lap race with four stops finishes, with fuel and tyres scaled to suit", () => {
    const es: Entrant[] = Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, car: defaultCar(), lines: [botLine(t, i + 1, 0.6 + 0.1 * i)], isPlayer: i === 0, pitPlan: i === 0 ? [11, 23, 35, 45].map((lap) => ({ lap })) : undefined }));
    const r = new Race(t, es, 50, { realism: true, weather: false });
    r.runToEnd();
    const me = r.results().find((x) => x.isPlayer)!;
    expect(me.dnf).toBe(false);
    expect(me.pits).toBe(4);
    expect(r.results().every((x) => !x.dnf)).toBe(true);
    // without stops a car would run dry long before the end
    const none: Entrant[] = [{ id: "n", name: "n", car: defaultCar(), lines: [botLine(t, 2, 1)], isPlayer: true, pitPlan: [] }];
    const r2 = new Race(t, none, 50, { realism: true, weather: false });
    r2.runToEnd();
    expect(r2.results()[0]!.dnf).toBe(true);
  });
});
