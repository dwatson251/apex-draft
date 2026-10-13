import { describe, expect, it } from "vitest";
import { botLine, decodeShare, defaultCar, encodeShare, generateTrack, validateLine, type ShareState } from "@apex/sim";

const base = (): ShareState => ({ phrase: "Healthy Bear eats tuna", laps: 4, mode: "race", rivals: 6, car: { name: "Zoom ünï", accel: 8, top: 5, grip: 7, brake: 4 }, obstacles: false, realism: true, playing: true });

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
    expect(keys).toEqual(["car", "laps", "mode", "obstacles", "phrase", "playing", "realism", "rivals"]);
  });
  it("is the same every time, and rejects junk instead of throwing", () => {
    expect(encodeShare(base())).toBe(encodeShare(base()));
    for (const junk of ["", "!!!", "AAAA", "AQ", encodeShare(base()).slice(0, 12)]) expect(typeof decodeShare(junk)).toBe("string");
    expect(defaultCar().name).toBe("Standard");
  });
});
