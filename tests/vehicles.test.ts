import { describe, expect, it } from "vitest";
import { pitStopTime, VEHICLES, VEHICLE_IDS, CIRCUIT_VEHICLES, vehicleForSeed, vehicleForTrack, placeFor, generateTrack, carStats, defaultCar } from "@apex/sim";
import { GEARS } from "../src/renderer/gearbox.ts";
import { WORLD_TIME } from "../src/renderer/scale.ts";

describe("every vehicle class", () => {
  it("has a gearbox", () => {
    for (const id of VEHICLE_IDS) expect(GEARS[id], id).toBeTruthy();
  });
  it("picks land machines for land and boats for water, deterministically", () => {
    const seenWater = new Set<string>(), seenLand = new Set<string>();
    for (let s = 1; s < 400; s++) {
      const l = vehicleForSeed(s * 7919), w = vehicleForSeed(s * 7919, "water");
      expect(VEHICLES[l].domain).toBe("land");
      expect(VEHICLES[w].domain).toBe("water");
      expect(vehicleForSeed(s * 7919, "water")).toBe(w);
      seenLand.add(l); seenWater.add(w);
    }
    expect(seenWater.size).toBe(VEHICLE_IDS.filter((i) => VEHICLES[i].domain === "water").length);
    expect(seenLand.size).toBe(VEHICLE_IDS.filter((i) => VEHICLES[i].domain === "land").length);
  });
  it("keeps its character", () => {
    const top = (t: (typeof VEHICLE_IDS)[number]) => carStats({ ...defaultCar(), type: t });
    expect(top("dragster").vTop).toBeGreaterThan(top("formula").vTop * 0.95);
    expect(top("dragster").aLat).toBeLessThan(top("rally").aLat * 0.6);
    expect(VEHICLES.electric.fuel).toBeLessThan(VEHICLES.kart.fuel);
    expect(VEHICLES.hovercraft.slip).toBeGreaterThan(VEHICLES.speedboat.slip);
    for (const id of VEHICLE_IDS) if (VEHICLES[id].domain === "land") expect(VEHICLES[id].slip).toBeLessThanOrEqual(0.6);
  });
  it("races the right class at each famous circuit, and keeps the class in the random pool", () => {
    const want: Record<string, string> = { "donington-park": "touring", daytona: "prototype", "spa-francorchamps": "gt3", "lago-maggiore": "gt4", silverstone: "formula" };
    for (const [id, v] of Object.entries(want)) {
      expect(CIRCUIT_VEHICLES[id], id).toBe(v);
      const t = generateTrack(id);
      expect(t.circuit?.id).toBe(id);
      expect(vehicleForTrack(t), id).toBe(v);
      expect(placeFor(id).vehicle, id).toBe(v);
    }
    const seen = new Set<string>();
    for (let s = 1; s < 600; s++) seen.add(vehicleForSeed(s * 104729));
    for (const id of ["touring", "prototype", "gt3", "gt4"]) expect(seen.has(id), id).toBe(true);
  });
  it("tunes the racing classes: prototypes out-corner GT3, which out-corner GT4 and touring cars", () => {
    const s = (t: (typeof VEHICLE_IDS)[number]) => carStats({ ...defaultCar(), type: t });
    expect(s("prototype").aLat).toBeGreaterThan(s("gt3").aLat);
    expect(s("gt3").aLat).toBeGreaterThan(s("gt4").aLat);
    expect(s("gt3").vTop).toBeGreaterThan(s("gt4").vTop);
    expect(s("formula").vTop).toBeGreaterThan(s("prototype").vTop);
  });
  it("has a pit stop for its own class: a full service takes real time, longest for the heavy and the endurance machines", () => {
    for (const id of VEHICLE_IDS) expect(VEHICLES[id].pitSecs, id).toBeGreaterThanOrEqual(8);
    const shown = (id: (typeof VEHICLE_IDS)[number]) => pitStopTime(id) * WORLD_TIME;
    expect(shown("rally")).toBeCloseTo(25, 6);
    expect(shown("prototype")).toBeGreaterThan(shown("formula") * 3);
    expect(shown("gt3")).toBeGreaterThan(shown("touring"));
    expect(shown("tank")).toBeGreaterThan(shown("truck"));
  });
});
