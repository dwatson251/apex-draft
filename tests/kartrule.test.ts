import { describe, expect, it } from "vitest";
import { KART_CIRCUITS, MAX_CHOICES, VEHICLES, phraseToSeed, vehicleChoices } from "@apex/sim";
import { KART_ROSTER } from "../packages/sim/src/kartpack.ts";

describe("the kart rule", () => {
  const ids = [...KART_CIRCUITS];

  it("knows every course in the roster, once", () => {
    expect(ids.length).toBe(KART_ROSTER.length);
    expect(ids.length).toBeGreaterThan(100);
  });

  it("offers a kart first and three other classes, the same every time", () => {
    for (const id of ids) {
      const a = vehicleChoices(phraseToSeed(id), "land", id), b = vehicleChoices(phraseToSeed(id), "land", id);
      expect(a, id).toEqual(b);
      expect(a[0], id).toBe("kart");
      expect(a.length, id).toBe(MAX_CHOICES);
      expect(new Set(a).size, id).toBe(MAX_CHOICES);
      for (const v of a) expect(VEHICLES[v].domain, `${id} ${v}`).toBe("land");
    }
  });

  it("draws the other classes from every land class, not only the race cars", () => {
    const seen = new Set<string>();
    for (const id of ids) for (const v of vehicleChoices(phraseToSeed(id), "land", id).slice(1)) seen.add(v);
    expect(seen.size).toBeGreaterThan(6);
    expect([...seen].some((v) => !["touring", "gt3", "gt4", "prototype", "formula"].includes(v))).toBe(true);
  });

  it("does not change what a real circuit or an ordinary track offers", () => {
    expect(vehicleChoices(phraseToSeed("monza"), "land", "monza")[0]).toBe("formula");
    expect(vehicleChoices(12345, "land")[0]).not.toBeUndefined();
  });

  it("gives no four-word alias or clashing name", () => {
    const seen = new Set<string>();
    for (const r of KART_ROSTER) for (const a of [r.id, ...r.aliases]) {
      expect(a, a).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(seen.has(a), a).toBe(false);
      seen.add(a);
    }
  });
});

describe("Random on a circuit", () => {
  it("cycles through the circuits of its own kind", async () => {
    const { nextCircuit, CIRCUITS } = await import("@apex/sim");
    const real = CIRCUITS.filter((c) => !c.kart), kart = CIRCUITS.filter((c) => c.kart);
    let p = real[0]!.id;
    const seen = new Set<string>();
    for (let i = 0; i < real.length; i++) { p = nextCircuit(p)!; seen.add(p); expect(CIRCUITS.find((c) => c.id === p)!.kart).toBeFalsy(); }
    expect(seen.size).toBe(real.length);
    if (kart.length) {
      let q = kart[0]!.id;
      const ks = new Set<string>();
      for (let i = 0; i < kart.length; i++) { q = nextCircuit(q)!; ks.add(q); expect(CIRCUITS.find((c) => c.id === q)!.kart).toBe(true); }
      expect(ks.size).toBe(kart.length);
    }
    expect(nextCircuit("quiet-fox-hugs-kites")).toBeUndefined();
    expect(nextCircuit("Monza")).toBeDefined();
  });
});
