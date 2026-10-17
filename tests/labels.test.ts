import { describe, expect, it } from "vitest";
import { declutterLabels, type LabelItem } from "../src/renderer/labels.ts";

const screen = { width: 1280, height: 800 };
const item = (id: string, x: number, y: number, o: Partial<LabelItem> = {}): LabelItem => ({ id, x, y, w: 70, priority: 1, ...o });
const by = (r: ReturnType<typeof declutterLabels>) => Object.fromEntries(r.map((p) => [p.id, p]));

describe("name label declutter", () => {
  it("shows everything when there is room", () => {
    const r = by(declutterLabels([item("me", 200, 300, { always: true, priority: 0 }), item("a", 600, 300), item("b", 900, 500)], screen));
    expect(r["me"]).toMatchObject({ text: true, arrow: true, lift: 0 });
    expect(r["a"]).toMatchObject({ text: true, arrow: true });
    expect(r["b"]).toMatchObject({ text: true, arrow: true });
  });

  it("always keeps the player's name, even when others sit right on top of it, and is placed first", () => {
    const items = [item("a", 400, 300, { priority: 1 }), item("b", 405, 302, { priority: 2 }), item("me", 402, 301, { always: true, priority: 0 })];
    const r = by(declutterLabels(items, screen));
    expect(r["me"]).toMatchObject({ text: true, arrow: true, lift: 0 });
    expect(r["a"]!.text).toBe(false);
  });

  it("lifts a name over a neighbour's before dropping it, then drops the name and keeps the arrow", () => {
    // two cars side by side: their arrows fit, their names overlap
    const r = by(declutterLabels([item("me", 400, 300, { always: true, priority: 0 }), item("a", 440, 300)], screen));
    expect(r["a"]!.arrow).toBe(true);
    expect(r["a"]!.text).toBe(true);
    expect(r["a"]!.lift).toBeGreaterThan(0);
    // a crowd leaves no room to lift
    const crowd = [item("me", 400, 300, { always: true, priority: 0 }), ...Array.from({ length: 6 }, (_, i) => item(`c${i}`, 410 + i * 14, 300, { priority: 1 + i }))];
    const rc = declutterLabels(crowd, screen);
    expect(rc.find((p) => p.id === "me")!.text).toBe(true);
    expect(rc.some((p) => p.arrow && !p.text)).toBe(true);
  });

  it("hides the least important arrows when they pile up, and anything off screen", () => {
    const pile = Array.from({ length: 8 }, (_, i) => item(`p${i}`, 600 + i, 400, { priority: i + 1 }));
    const r = declutterLabels([item("me", 600, 400, { always: true, priority: 0 }), ...pile], screen);
    expect(r.find((p) => p.id === "me")!.arrow).toBe(true);
    expect(r.filter((p) => p.arrow).length).toBeLessThan(5);
    expect(by(declutterLabels([item("gone", -500, 100), item("below", 300, 2000)], screen))["gone"]).toMatchObject({ arrow: false, text: false });
  });

  it("is deterministic and keeps every id", () => {
    const items = [item("b", 300, 300, { priority: 2 }), item("a", 310, 300, { priority: 2 }), item("me", 305, 300, { always: true, priority: 0 })];
    expect(declutterLabels(items, screen)).toEqual(declutterLabels([...items].reverse(), screen));
    expect(declutterLabels(items, screen).map((p) => p.id).sort()).toEqual(["a", "b", "me"]);
  });

  it("keeps the names that are never dropped, lifting them clear of each other where it can", () => {
    const r = by(declutterLabels([item("me", 300, 300, { always: true, priority: 0 }), item("next", 305, 300, { always: true, priority: 0.5 }), item("other", 302, 300, { priority: 2 })], screen));
    expect(r.me!.text && r.me!.arrow).toBe(true);
    expect(r.next!.text && r.next!.arrow).toBe(true);
    expect(r.next!.lift).toBeGreaterThan(r.me!.lift);
    expect(r.other!.text).toBe(false);
  });
});
