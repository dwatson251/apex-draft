import { describe, expect, it } from "vitest";
import { botLine, decodeShare, defaultCar, encodeShare, generateTrack, validateLine, type ShareState } from "@apex/sim";

const base = (): ShareState => ({ phrase: "Healthy Bear eats tuna", laps: 40, mode: "race", rivals: 6, car: { name: "Zoom ünï", accel: 8, top: 5, grip: 7, brake: 4 }, obstacles: false, realism: true, playing: true, startTyre: "soft", pitPlan: [{ lap: 6, tyre: "wet" }, { lap: 14, tyre: "medium" }] });

describe("share links", () => {
  it("round trip the track, settings and car", () => {
    const back = decodeShare(encodeShare(base()));
    expect(typeof back).toBe("object");
    expect(back).toEqual({ ...base(), phrase: "healthy-bear-eats-tuna" });
  });
  it("round trip a whole drawn lap and keep it drivable, in a short link", () => {
    const t = generateTrack("brave-owl-rides-melons");
    const line = botLine(t, 5, 1);
    const code = encodeShare({ ...base(), phrase: t.phrase, line });
    expect(code.length).toBeLessThan(1500);
    const back = decodeShare(code) as ReturnType<typeof base> & { line: typeof line };
    expect(back.line.segs.map((s) => s.length)).toEqual(line.segs.map((s) => s.length));
    expect(Math.abs(back.line.start.x - line.start.x)).toBeLessThan(0.06);
    expect(validateLine(t, back.line).ok).toBe(true);
  });
  it("holds an unfinished drawing as it is", () => {
    const t = generateTrack("brave-owl-rides-melons");
    const full = botLine(t, 5, 1);
    const part = { start: full.start, segs: full.segs.slice(0, 3) };
    const back = decodeShare(encodeShare({ ...base(), phrase: t.phrase, line: part })) as { line: typeof part };
    expect(back.line.segs.length).toBe(3);
  });
  it("carries nothing about a race", () => {
    const keys = Object.keys(decodeShare(encodeShare(base())) as object).sort();
    expect(keys).toEqual(["car", "laps", "mode", "obstacles", "phrase", "pitPlan", "playing", "realism", "rivals", "startTyre"]);
  });
  it("is the same every time, and rejects junk instead of throwing", () => {
    expect(encodeShare(base())).toBe(encodeShare(base()));
    for (const junk of ["", "!!!", "AAAA", "AQ", encodeShare(base()).slice(0, 12)]) expect(typeof decodeShare(junk)).toBe("string");
    expect(defaultCar().name).toBe("Standard");
  });
  it("carries 50 laps, the edit stops, the start tyre and a stop plan for the whole race", () => {
    const back = decodeShare(encodeShare({ ...base(), laps: 50, pitPlan: [8, 16, 24, 32, 40].map((lap) => ({ lap, tyre: "medium" as const })) })) as ShareState;
    expect(back.laps).toBe(50);
    expect(back.pitPlan.map((p) => p.lap)).toEqual([8, 16, 24, 32, 40]);
    expect(back.startTyre).toBe("soft");
    // only five can be queued at a time, but a long race has more stops over its length: all of them travel in the link
    expect((decodeShare(encodeShare({ ...base(), laps: 50, pitPlan: Array.from({ length: 9 }, (_, i) => ({ lap: i + 1, tyre: "soft" as const })) })) as ShareState).pitPlan).toHaveLength(9);
  });
  it("still opens a version 1 link", () => {
    const bytes: number[] = [1, 1 | 2 | 4 | 8, 3 | (5 << 4), 0x66 | (0x66 << 8) & 0xff, 0];
    // levels: accel 6, top 6, grip 6, brake 6 = 0x6666
    bytes.splice(3, 2, 0x66, 0x66);
    const name = new TextEncoder().encode("Old"), phrase = new TextEncoder().encode("quiet-fox-hugs-kites");
    bytes.push(name.length, ...name, phrase.length, ...phrase);
    const code = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const back = decodeShare(code) as ShareState;
    expect(typeof back).toBe("object");
    expect(back.phrase).toBe("quiet-fox-hugs-kites");
    expect(back.laps).toBe(3);
    expect(back.rivals).toBe(5);
    expect(back.startTyre).toBe("medium");
    expect(back.pitPlan).toEqual([]);
  });
  it("still opens a version 2 link, ignoring its edit-every byte", () => {
    const name = new TextEncoder().encode("Two"), phrase = new TextEncoder().encode("quiet-fox-hugs-kites");
    const bytes: number[] = [2, 1 | 2 | 4 | 8, 12, 4 | (2 << 4), 3, 0x66, 0x66, name.length, ...name, phrase.length, ...phrase];
    // laps 12, rivals 4 on wets, edit every 3, then no stops
    bytes.splice(5, 0, 0);
    const code = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const back = decodeShare(code) as ShareState;
    expect(typeof back).toBe("object");
    expect(back.laps).toBe(12);
    expect(back.rivals).toBe(4);
    expect(back.startTyre).toBe("wet");
    expect(back.phrase).toBe("quiet-fox-hugs-kites");
  });
});
