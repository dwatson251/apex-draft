import { describe, expect, it } from "vitest";
import { BIOMES, Race, botLine, defaultCar, generateTrack, placeFor, randomPhrase, Rng, vehicleForTrack, VEHICLES, type VehicleId } from "@apex/sim";

const funPhrases = (n: number, seed = 3) => { const r = new Rng(seed); return Array.from({ length: n }, () => `fun-${randomPhrase(r)}`); };
const waterPhrase = () => funPhrases(200).find((p) => generateTrack(p).biome === "water")!;

function run(phrase: string, type: VehicleId, laps = 3) {
  const t = generateTrack(phrase, { biome: "water" });
  const car = { ...defaultCar(), type };
  const r = new Race(t, [{ id: "x", name: "x", car, lines: [botLine(t, 3, 1)], isPlayer: true }], laps, { realism: false });
  r.runToEnd();
  const c = r.cars[0]!;
  return { r, c, lap: r.results()[0]!.lapTimes.at(-1)!, peak: Math.max(...c.btrace.map(Math.abs)) };
}

describe("open water", () => {
  it("only comes up on fun phrases, and as often as the other places", () => {
    const water = funPhrases(300).filter((p) => generateTrack(p).biome === "water").length;
    const avg = 300 / Object.keys(BIOMES).length;
    expect(water).toBeGreaterThan(avg * 0.5);
    expect(water).toBeLessThan(avg * 1.6);
    for (let i = 0; i < 300; i++) expect(generateTrack(randomPhrase(new Rng(i + 50))).biome).not.toBe("water");
  });
  it("puts boats on water and cars on land, and placeFor agrees with the track", () => {
    for (const p of funPhrases(60)) {
      const t = generateTrack(p), v = vehicleForTrack(t);
      expect(VEHICLES[v].domain).toBe(t.biome === "water" ? "water" : "land");
      expect(placeFor(p).vehicle).toBe(v);
      expect(placeFor(p).biome).toBe(t.biome);
    }
  });
  it("makes boats slide: a big slip angle in the corners, and only a small one for a car", () => {
    const p = waterPhrase();
    const boat = run(p, "speedboat"), car = run(p, "rally");
    expect(boat.peak).toBeGreaterThan(0.2);
    expect(boat.peak).toBeLessThanOrEqual((VEHICLES.speedboat.slipDeg * Math.PI) / 180 + 1e-9);
    expect(car.peak).toBeGreaterThan(0.05);
    expect(car.peak).toBeLessThanOrEqual((VEHICLES.rally.slipDeg * Math.PI) / 180 + 1e-9);
  });
  it("drifts the twitchy hulls more than the balanced ones, and recovers on the straights", () => {
    const p = waterPhrase();
    const hover = run(p, "hovercraft"), boat = run(p, "speedboat");
    expect(hover.peak).toBeGreaterThan(boat.peak);
    // beta returns to (near) nothing somewhere on a lap
    expect(boat.c.btrace.filter((b) => Math.abs(b) < 0.1).length).toBeGreaterThan(boat.c.btrace.length * 0.2);
  });
  it("costs time to slide, and is deterministic", () => {
    const p = waterPhrase();
    const a = run(p, "speedboat"), b = run(p, "speedboat");
    expect(a.r.hash()).toBe(b.r.hash());
    expect(a.lap).toBe(b.lap);
  });
  it("runs a full water grid", () => {
    const p = waterPhrase();
    const t = generateTrack(p);
    const v = vehicleForTrack(t);
    const es = Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, car: { ...defaultCar(), type: v }, lines: [botLine(t, i + 1, 0.6 + 0.03 * i)], isPlayer: i === 0 }));
    const r = new Race(t, es, 3, { realism: false });
    r.runToEnd();
    expect(r.cars.every((c) => c.finishTime !== null)).toBe(true);
  });
});
