import { describe, expect, it } from "vitest";
import { BTN, GamepadInput, cycle, pickNeighbour, shapeStick } from "../src/renderer/input/gamepad.ts";

const fake = (axes: number[], down: number[] = []): Gamepad =>
  ({ index: 0, connected: true, id: "Xbox 360 Controller (STANDARD GAMEPAD)", axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), touched: false, value: down.includes(i) ? 1 : 0 })) }) as unknown as Gamepad;

describe("gamepad input", () => {
  it("ignores stick drift and reaches full deflection", () => {
    expect(shapeStick(0.1, 0.1)).toEqual([0, 0]);
    const [x, y] = shapeStick(1, 0);
    expect(x).toBeCloseTo(1); expect(y).toBeCloseTo(0);
    expect(Math.abs(shapeStick(0.4, 0)[0])).toBeLessThan(0.4);
  });

  it("reports button edges once, and marks the pad active", () => {
    let pad = fake([0, 0, 0, 0]);
    const g = new GamepadInput(() => [pad]);
    expect(g.poll()!.pressed.size).toBe(0);
    expect(g.active).toBe(false);
    pad = fake([0, 0, 0, 0], [BTN.A]);
    expect(g.poll()!.pressed.has(BTN.A)).toBe(true);
    expect(g.poll()!.pressed.size).toBe(0);
    pad = fake([0, 0, 0, 0]);
    expect(g.poll()!.released.has(BTN.A)).toBe(true);
    expect(g.active).toBe(true);
    expect(g.family).toBe("xbox");
  });

  it("returns null with no pad", () => {
    expect(new GamepadInput(() => []).poll()).toBeNull();
  });

  it("cycles handles both ways and wraps", () => {
    expect(cycle(-1, 4, 1)).toBe(0);
    expect(cycle(-1, 4, -1)).toBe(3);
    expect(cycle(3, 4, 1)).toBe(0);
    expect(cycle(0, 4, -1)).toBe(3);
    expect(cycle(0, 0, 1)).toBe(-1);
  });

  it("moves focus to the nearest item in the pressed direction", () => {
    const items = [{ x: 100, y: 0 }, { x: 200, y: 5 }, { x: 0, y: 100 }, { x: -50, y: 0 }];
    const o = { x: 0, y: 0 };
    expect(pickNeighbour(o, items, "right")).toBe(0);
    expect(pickNeighbour(o, items, "down")).toBe(2);
    expect(pickNeighbour(o, items, "left")).toBe(3);
    expect(pickNeighbour(o, items, "up")).toBeNull();
  });
});
