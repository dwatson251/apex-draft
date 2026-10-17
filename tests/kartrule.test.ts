import { describe, expect, it } from "vitest";
import { KART_CIRCUITS, KART_ROSTER, MAX_CHOICES, VEHICLES, phraseToSeed, vehicleChoices } from "@apex/sim";

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
