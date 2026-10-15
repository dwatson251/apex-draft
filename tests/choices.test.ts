import { describe, expect, it } from "vitest";
import {
  CIRCUITS, CIRCUIT_VEHICLES, MAX_CHOICES, RACING_CLASSES, VEHICLES, generateTrack, migrateBest, placeFor, trialKey, vehicleChoices, vehicleChoicesForTrack,
  vehicleForSeed,
} from "@apex/sim";

describe("the machines a track offers", () => {
  it("are at most four, all different, with the track's own first, and always the same for the same seed", () => {
    for (let s = 1; s < 300; s++) for (const domain of ["land", "water"] as const) {
      const c = vehicleChoices(s * 7919, domain);
      expect(c.length).toBeGreaterThanOrEqual(2);
      expect(c.length).toBeLessThanOrEqual(MAX_CHOICES);
      expect(new Set(c).size).toBe(c.length);
      expect(c[0]).toBe(vehicleForSeed(s * 7919, domain));
      expect(vehicleChoices(s * 7919, domain)).toEqual(c);
    }
  });
  it("never put a boat on a road or a car on the water", () => {
    for (let s = 1; s < 300; s++) {
      for (const id of vehicleChoices(s * 104729, "land")) expect(VEHICLES[id].domain).toBe("land");
      for (const id of vehicleChoices(s * 104729, "water")) expect(VEHICLES[id].domain).toBe("water");
    }
  });
  it("are a handful of race cars on a real circuit, the one it is known for first", () => {
    for (const c of CIRCUITS) {
      const track = generateTrack(c.id);
      const choices = vehicleChoicesForTrack(track), own = CIRCUIT_VEHICLES[c.id];
      expect(choices, c.id).toEqual(placeFor(c.id).choices);
      expect(choices.length).toBeLessThanOrEqual(MAX_CHOICES);
      if (own) {
        expect(choices[0], c.id).toBe(own);
        for (const id of choices) expect(RACING_CLASSES, `${c.id} ${id}`).toContain(id);
        expect(choices.length).toBe(MAX_CHOICES);
      }
    }
  });
  it("agree with what a phrase says about its track, the first being its vehicle", () => {
    for (const p of ["quiet-fox-hugs-kites", "fun-wobbly-hippo-guards-lanterns", "monza", "oval"]) {
      const place = placeFor(p);
      expect(place.vehicle).toBe(place.choices[0]);
      expect(vehicleChoicesForTrack(generateTrack(p))).toEqual(place.choices);
    }
  });
});

describe("lap times for a track and a vehicle", () => {
  it("are kept apart by vehicle, and a phrase is normalised", () => {
    expect(trialKey("Brave Owl", "gt3")).toBe("tt:brave-owl:gt3");
    expect(trialKey("brave-owl", "gt3")).not.toBe(trialKey("brave-owl", "gt4"));
    expect(trialKey("brave-owl")).toBe("tt:brave-owl");
  });
  it("move the old ones, set before the vehicle was a choice, to the track's own vehicle", () => {
    const best = { "tt:brave-owl": 61.2, "tt:monza": 80.5, "brave-owl:3:rc": 190, "brave-owl:lap:xc": 60 };
    const out = migrateBest(best, (p) => (p === "monza" ? "formula" : "rally"));
    expect(out).toEqual({ "tt:brave-owl:rally": 61.2, "tt:monza:formula": 80.5, "brave-owl:3:rc": 190, "brave-owl:lap:xc": 60 });
    // done twice it changes nothing, and a time already stored for the vehicle is not lost to a slower old one
    expect(migrateBest(out, () => "rally")).toEqual(out);
    expect(migrateBest({ "tt:a": 70, "tt:a:rally": 65 }, () => "rally")).toEqual({ "tt:a:rally": 65 });
    expect(migrateBest({ "tt:a": 60, "tt:a:rally": 65 }, () => "rally")).toEqual({ "tt:a:rally": 60 });
  });
});
