import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { botLine, defaultCar, generateTrack, lineToWire, placeFor, type Line } from "@apex/sim";
import { Online, SERVER, TIMEOUT_MS } from "../src/renderer/online.ts";

const phrase = "brave-owl-rides-melons";
const track = generateTrack(phrase, { obstacles: false });
const vehicle = placeFor(phrase).vehicle;
const line: Line = botLine(track, 5, 1);

function fake(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  return { calls, fetchFn: async (url: string, init: RequestInit) => { calls.push({ url, init }); return handler(url, init); } };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ghostBody = (n = 2) => ({ ghosts: Array.from({ length: n }, (_, i) => ({ id: `g${i}`, name: `Ghost ${i}`, vehicle, time: 30 + i, car: defaultCar(), line: lineToWire(line) })) });
const register = (init: RequestInit) => json({ id: "abc", name: JSON.parse(String(init.body)).name });
const settle = () => new Promise((r) => setTimeout(r, 20));

describe("the online client", () => {
  it("has the baked-in server in both Content-Security-Policies", () => {
    expect(SERVER).toBe("https://apexdraft.dnlwtsn.co.uk");
    expect(TIMEOUT_MS).toBe(10_000);
    expect(readFileSync(new URL("../src/renderer/index.html", import.meta.url), "utf8")).toContain(`connect-src 'self' ${SERVER}`);
    expect(readFileSync(new URL("../src/main/index.ts", import.meta.url), "utf8")).toContain(`connect-src 'self' ${SERVER}`);
  });

  it("makes an identity, keeps the name clean, and never asks the network to do it", async () => {
    const f = fake(() => json({}));
    const o = new Online(f.fetchFn);
    await o.init();
    expect(o.name).toMatch(/^Driver-[0-9a-f]{4}$/);
    expect(o.setName("  Ada ‮ Racer ")).toBe("Ada Racer");
    expect(o.name).toBe("Ada Racer");
    expect(o.setName("   ")).toMatch(/^Driver-/);
    expect(f.calls).toHaveLength(0);
  });

  it("registers once, then fetches ghosts and checks them against the track", async () => {
    const f = fake((url, init) => (url.endsWith("/players") ? register(init) : json(ghostBody())));
    const o = new Online(f.fetchFn);
    await o.init();
    const q = { phrase, vehicle, limit: 3, time: 31 };
    expect(o.ghosts(q, track)).toEqual([]); // nothing has arrived: no waiting
    o.preload(q); o.preload(q);
    await settle();
    expect(f.calls.map((c) => c.url.replace(SERVER, "").split("?")[0])).toEqual(["/api/v1/players", "/api/v1/ghosts"]);
    expect(f.calls[1]!.url).toContain("limit=3");
    expect(f.calls[1]!.url).toContain("time=31");
    expect((f.calls[1]!.init.headers as Record<string, string>)["authorization"]).toMatch(/^Bearer [0-9a-f-]{36}$/);
    const got = o.ghosts(q, track);
    expect(got.map((g) => g.name)).toEqual(["Ghost 0", "Ghost 1"]);
    expect(got[0]!.line.segs.length).toBe(line.segs.length);
    // a cached field is not fetched again
    o.preload(q);
    await settle();
    expect(f.calls).toHaveLength(2);
    // a line that does not fit the track is dropped
    expect(o.ghosts(q, generateTrack("quiet-fox-hides-socks", { obstacles: false }))).toEqual([]);
  });

  it("fails silently and leaves an unreachable server alone for a while", async () => {
    let t = 1000;
    const f = fake(() => { throw new TypeError("fetch failed"); });
    const o = new Online(f.fetchFn, SERVER, () => t);
    await o.init();
    const q = { phrase, vehicle, limit: 3 };
    o.preload(q);
    await settle();
    expect(o.ghosts(q, track)).toEqual([]);
    expect(f.calls).toHaveLength(1);
    o.preload({ ...q, limit: 4 }); o.uploadLine(phrase, vehicle, defaultCar(), line);
    await settle();
    expect(f.calls).toHaveLength(1); // backing off
    t += 61_000;
    o.preload({ ...q, limit: 5 });
    await settle();
    expect(f.calls).toHaveLength(2);
  });

  it("treats server errors and junk replies as nothing", async () => {
    const f1 = fake(() => json({ error: "boom" }, 500));
    const o1 = new Online(f1.fetchFn); await o1.init(); o1.preload({ phrase, vehicle, limit: 2 }); await settle();
    expect(o1.ghosts({ phrase, vehicle, limit: 2 }, track)).toEqual([]);
    const f2 = fake((url, init) => (url.endsWith("/players") ? register(init) : json({ ghosts: [{ id: 1 }, { id: "z", name: "N", time: 5, car: { nope: 1 }, line: {} }] })));
    const o2 = new Online(f2.fetchFn); await o2.init(); o2.preload({ phrase, vehicle, limit: 2 }); await settle();
    expect(o2.ghosts({ phrase, vehicle, limit: 2 }, track)).toEqual([]);
  });

  it("uploads a line and a race (distinct lines and which lap used which)", async () => {
    const f = fake((url, init) => (url.endsWith("/players") ? register(init) : json({ ok: true })));
    const o = new Online(f.fetchFn); await o.init();
    o.uploadLine(phrase, vehicle, defaultCar(), line);
    const other = botLine(track, 6, 0.9);
    o.uploadRace({ kind: "quick", phrase, vehicle, car: defaultCar(), laps: 3, rivals: 4, realism: false, lines: [line, line, other], ghostIds: ["g0"] });
    await settle();
    const bodies = f.calls.filter((c) => !c.url.endsWith("/players")).map((c) => ({ path: c.url.replace(SERVER, ""), body: JSON.parse(String(c.init.body)) }));
    expect(bodies.map((b) => b.path)).toEqual(["/api/v1/lines", "/api/v1/results"]);
    expect(bodies[0]!.body.lines).toHaveLength(1);
    expect(bodies[1]!.body.lines).toHaveLength(2);
    expect(bodies[1]!.body.lapLine).toEqual([0, 0, 1]);
    expect(bodies[1]!.body.ghostIds).toEqual(["g0"]);
    expect(bodies[1]!.body.time).toBeUndefined();
  });
});
