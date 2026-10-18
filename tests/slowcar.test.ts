import { describe, expect, it } from "vitest";
import { Race, botLine, cachedTrack, defaultCar, makeBots, placeFor, type Entrant, type RaceCar } from "@apex/sim";

/**
 * A car far slower than the rest, on the grid in front of them. Nobody steers off their line to pass it: every car drives the line it was given (the
 * computer drivers' stand for real drivers' lines), and getting past is done by drawing a line that goes past. A wreck is still steered round.
 */
describe("cars behind a far slower one", () => {
  const phrase = "alpha", t = cachedTrack(phrase), v = placeFor(phrase).vehicle;
  const slowCar = (line = botLine(t, 3, 0.9)): Entrant => ({ id: "slow", name: "Slow", car: { ...defaultCar(), type: v }, lines: [line], bot: { seed: 3, skill: 0.9 }, pace: 0.12, gridSlot: 0 });

  it("keep to their lines, computer drivers and player alike, and do not hit it hard", () => {
    const line = botLine(t, 3, 0.9);
    const me: Entrant = { id: "me", name: "Me", car: { ...defaultCar(), type: v }, lines: [line], isPlayer: true, gridSlot: 1 };
    const bot: Entrant = { id: "bot", name: "Bot", car: { ...defaultCar(), type: v }, lines: [line], bot: { seed: 3, skill: 0.9 }, gridSlot: 2 };
    const r = new Race(t, [slowCar(line), me, bot], 3, { realism: false, weather: false });
    let widest = 0;
    for (let i = 0; i < 45 * 60; i++) { r.step(); for (const c of r.cars) if (c.entrant.id !== "slow") widest = Math.max(widest, Math.abs(c.aim)); }
    const at = (id: string) => r.progress(r.cars.find((c) => c.entrant.id === id)!);
    // on the very line of the slow car, nothing but steering out of it would get past: so both are still behind
    expect(at("me")).toBeLessThan(at("slow"));
    expect(at("bot")).toBeLessThan(at("slow"));
    expect(widest).toBeLessThan(1);
    expect(r.events.filter((e) => e.type === "bump" && (e.strength ?? 0) >= 12)).toHaveLength(0);
  }, 60000);

  it("still steer round a car that has crashed", () => {
    const fast = makeBots(t, v, 0, 7, "hard").map((e, i) => ({ ...e, gridSlot: i + 1 }));
    const r = new Race(t, [slowCar(), ...fast], 3, { realism: false, weather: false });
    while (r.time < 20) r.step();
    const ahead = [...r.cars].sort((a, b) => r.progress(b) - r.progress(a))[0]!;
    (r as unknown as { startRecovery(c: RaceCar, kick: number, yaw: number): void }).startRecovery(ahead, 1.6, 6);
    let widest = 0;
    for (let i = 0; i < 6 * 60; i++) { r.step(); for (const c of r.cars) if (c !== ahead) widest = Math.max(widest, Math.abs(c.aim)); }
    expect(widest).toBeGreaterThan(1);
  }, 60000);
});
