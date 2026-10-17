import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { botLine, defaultCar, generateTrack, placeFor, sanitiseName, defaultName, parseLineFile, serializeLineFile, timeTrial, NAME_MAX, VEHICLE_IDS, type Line } from "@apex/sim";
import { pickAround } from "../server/src/ghosts.ts";
import { Db } from "../server/src/db.ts";
import { createApp, trackInfo } from "../server/src/app.ts";
import { inProcess } from "../server/src/pool.ts";
import { RateLimiter } from "../server/src/ratelimit.ts";
import { processOne } from "../server/src/queue.ts";
import { renderPage, fmtTime } from "../server/src/pages.ts";

describe("names", () => {
  it("strips hidden characters, collapses space and caps the length", () => {
    expect(sanitiseName("  Ada ‮  Lovelace​ ")).toBe("Ada Lovelace");
    expect(sanitiseName("x".repeat(100))).toHaveLength(NAME_MAX);
    expect(sanitiseName("   ")).toBe("");
    expect(sanitiseName(42)).toBe("");
    expect(sanitiseName("ＡＢＣ")).toBe("ABC");
  });
  it("gives a default from the id", () => { expect(defaultName("a1b2-c3d4")).toBe("Driver-a1b2"); });
});

describe("picking ghosts around a time", () => {
  const e = (...t: number[]) => t.map((time) => ({ time }));
  const times = (r: { time: number }[]) => r.map((x) => x.time);
  it("takes half just faster and half just slower", () => {
    expect(times(pickAround(e(10, 20, 30, 40, 50, 60, 70, 80), 45, 4))).toEqual([30, 40, 50, 60]);
  });
  it("lets the other side fill when one runs short", () => {
    expect(times(pickAround(e(10, 50, 60, 70, 80), 45, 4))).toEqual([10, 50, 60, 70]);
    expect(times(pickAround(e(10, 20, 30, 40), 100, 3))).toEqual([20, 30, 40]);
  });
  it("uses the median with no target, copes with few entries and gives nothing for none", () => {
    expect(times(pickAround(e(1, 2, 3, 4, 5), null, 2))).toEqual([2, 3]);
    expect(pickAround(e(5), 3, 10)).toHaveLength(1);
    expect(pickAround([], 3, 10)).toEqual([]);
    expect(pickAround(e(1, 2), 1, 0)).toEqual([]);
  });
});

describe("rate limiter", () => {
  it("allows a burst, refuses, then refills", () => {
    const l = new RateLimiter();
    expect([1, 2, 3].map(() => l.take("k", 2, 60, 60_000, 0))).toEqual([true, true, false]);
    expect(l.take("k", 2, 60, 60_000, 2000)).toBe(true);
  });
});

describe("track identity", () => {
  it("keys a circuit by its id however it was typed, and flags fun and special", () => {
    expect(trackInfo("Monza")).toMatchObject({ key: "monza", special: true, fun: false });
    expect(trackInfo("fun-healthy-bear-eats-tuna")).toMatchObject({ special: false, fun: true });
    expect(trackInfo("Brave Owl rides melons")).toMatchObject({ key: "brave-owl-rides-melons", special: false, fun: false });
  });
});

describe("the server", () => {
  let server: Server, base = "", db: Db;
  const secret = "11111111-2222-4333-8444-555555555555", other = "99999999-2222-4333-8444-555555555555";
  const phrase = "brave-owl-rides-melons";
  const place = placeFor(phrase);
  const line = () => botLine(generateTrack(phrase, { obstacles: false }), 5, 1);
  // lines travel in the line-file format (points as [x, y], to 0.01), the way the game sends them
  const wire = (l: Line) => JSON.parse(serializeLineFile({ phrase, name: "", car: defaultCar(), lines: [l] })).lines[0];
  const rounded = (): Line => (parseLineFile(JSON.stringify({ v: 2, phrase, name: "", car: defaultCar(), lines: [wire(line())] })) as { lines: Line[] }).lines[0]!;
  const call = (path: string, init: { method?: string; key?: string; body?: unknown } = {}) =>
    fetch(base + path, { method: init.method ?? "GET", headers: { ...(init.key ? { authorization: `Bearer ${init.key}` } : {}), "content-type": "application/json" }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });

  beforeAll(async () => {
    db = new Db(":memory:");
    server = createApp({ db, run: inProcess, newTracksPerDay: 1 });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server.close(); db.close(); });

  it("evaluates exactly what the game's Time Trial would", () => {
    const r = timeTrial({ phrase, vehicle: place.vehicle, car: defaultCar(), line: line() });
    expect(r.ok && r.time).toBeGreaterThan(10);
    expect(r.ok && r.lapTimes).toHaveLength(3);
  });

  it("needs credentials, and registers once with a sanitised name", async () => {
    expect((await call("/api/v1/me")).status).toBe(401);
    expect((await call("/api/v1/me", { key: "nope" })).status).toBe(401);
    expect((await call("/api/v1/me", { key: secret })).status).toBe(401);
    const r = await (await call("/api/v1/players", { method: "POST", key: secret, body: { name: " Ada‮  Racer " } })).json() as { id: string; name: string };
    expect(r.name).toBe("Ada Racer");
    expect(r.id).toMatch(/^[0-9a-f]{12}$/);
    expect(r.id).not.toContain(secret.slice(0, 8));
    const again = await (await call("/api/v1/players", { method: "POST", key: secret, body: { name: "Someone Else" } })).json() as { name: string };
    expect(again.name).toBe("Ada Racer");
    const renamed = await (await call("/api/v1/me", { method: "PUT", key: secret, body: { name: "Grace" } })).json() as { name: string };
    expect(renamed.name).toBe("Grace");
    expect((await call("/api/v1/me", { method: "PUT", key: secret, body: { name: "  " } })).status).toBe(400);
    await call("/api/v1/players", { method: "POST", key: other, body: { name: "Rival" } });
  });

  it("times a line itself, ignoring any time the client claims", async () => {
    const body = { phrase, vehicle: place.vehicle, car: defaultCar(), lines: [wire(line())], time: 0.001, lapTimes: [0.001] };
    const r = await (await call("/api/v1/lines", { method: "POST", key: secret, body })).json() as { ok: boolean; time: number; rank: number; improved: boolean };
    const direct = timeTrial({ phrase, vehicle: place.vehicle, car: defaultCar(), line: rounded() });
    expect(r.ok).toBe(true);
    expect(direct.ok && r.time).toBeCloseTo(direct.ok ? direct.time : 0, 2);
    expect(r.time).toBeGreaterThan(10);
    expect(r.rank).toBe(1);
    expect(r.improved).toBe(true);
    const slower = await (await call("/api/v1/lines", { method: "POST", key: secret, body: { ...body, car: { ...defaultCar(), accel: 5, top: 5 } } })).json() as { improved: boolean };
    expect(slower.improved).toBe(false);
  });

  it("rejects cheats: off-road line, over-budget car, wrong machine, junk", async () => {
    const good = { phrase, vehicle: place.vehicle, car: defaultCar(), lines: [wire(line())] };
    const off = wire(line()); off.segs[2][0] = [off.segs[2][0][0] + 400, off.segs[2][0][1] + 400];
    expect((await call("/api/v1/lines", { method: "POST", key: secret, body: { ...good, lines: [off] } })).status).toBe(422);
    expect((await call("/api/v1/lines", { method: "POST", key: secret, body: { ...good, car: { name: "Cheat", accel: 10, top: 10, grip: 10, brake: 10 } } })).status).toBe(400);
    expect((await call("/api/v1/lines", { method: "POST", key: secret, body: { ...good, vehicle: VEHICLE_IDS.find((v) => !place.choices.includes(v)) } })).status).toBe(422);
    expect((await call("/api/v1/lines", { method: "POST", key: secret, body: { ...good, vehicle: "warp-drive" } })).status).toBe(422);
    expect((await call("/api/v1/lines", { method: "POST", key: secret, body: { ...good, lines: [] } })).status).toBe(400);
    expect((await call("/api/v1/lines", { method: "POST", key: secret, body: { vehicle: place.vehicle } })).status).toBe(400);
    const huge = await fetch(base + "/api/v1/lines", { method: "POST", headers: { authorization: `Bearer ${secret}` }, body: "x".repeat(300_000) }).catch(() => null);
    expect(huge === null || huge.status === 413).toBe(true);
  });

  it("hands out other players' lines, never your own, and nothing for a track nobody has driven", async () => {
    const up = await call("/api/v1/lines", { method: "POST", key: other, body: { phrase, vehicle: place.vehicle, car: { ...defaultCar(), accel: 7, top: 7, grip: 5, brake: 5 }, lines: [wire(botLine(generateTrack(phrase, { obstacles: false }), 5, 0.8))] } });
    expect(up.status).toBe(200);
    const g = await (await call(`/api/v1/ghosts?phrase=${phrase}&vehicle=${place.vehicle}&limit=5&time=30`, { key: secret })).json() as { ghosts: { name: string; line: unknown; time: number }[] };
    expect(g.ghosts.map((x) => x.name)).toEqual(["Rival"]);
    expect(g.ghosts[0]!.time).toBeGreaterThan(0);
    const mine = await (await call(`/api/v1/ghosts?phrase=${phrase}&vehicle=${place.vehicle}`, { key: other })).json() as { ghosts: unknown[] };
    expect(mine.ghosts.map((x: any) => x.name)).toEqual(["Grace"]);
    const none = await (await call(`/api/v1/ghosts?phrase=quiet-fox-hides-socks&vehicle=${place.vehicle}`, { key: secret })).json() as { ghosts: unknown[] };
    expect(none.ghosts).toEqual([]);
    expect((await call("/api/v1/ghosts?phrase=x", { key: secret })).status).toBe(400);
  });

  it("limits how many new tracks one player can bring in a day", async () => {
    const send = (p: string) => { const pl = placeFor(p); return call("/api/v1/lines", { method: "POST", key: other, body: { phrase: p, vehicle: pl.vehicle, car: defaultCar(), lines: [wire(botLine(generateTrack(p, { obstacles: false }), 5, 1))] } }); };
    expect((await send("calm-heron-paints-kites")).status).toBe(200);
    expect((await send("swift-lynx-bakes-pies")).status).toBe(429);
  });

  it("replays a race on the server with the named ghost and bots, and records the result", async () => {
    const body = { kind: "quick", phrase, vehicle: place.vehicle, car: defaultCar(), lines: [wire(line())], lapLine: [0, 0], laps: 2, rivals: 3, realism: false, ghostIds: [] as string[], time: 1 };
    const who = await (await call("/api/v1/me", { key: other })).json() as { id: string };
    body.ghostIds = [who.id, "feedfacefeed"];
    const r = await call("/api/v1/results", { method: "POST", key: secret, body });
    expect(r.status).toBe(202);
    expect((await call("/api/v1/results", { method: "POST", key: secret, body: { ...body, lapLine: [0, 5] } })).status).toBe(400);
    expect((await call("/api/v1/results", { method: "POST", key: secret, body: { ...body, kind: "ranked" } })).status).toBe(400);
    expect(await processOne(db, inProcess)).toBe(true);
    expect(await processOne(db, inProcess)).toBe(false);
    const me = await (await call("/api/v1/me", { key: secret })).json() as { id: string };
    const rows = db.playerResults(me.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("done");
    const grid = JSON.parse(rows[0]!.grid_json!) as { name: string; ghost: boolean; isPlayer: boolean }[];
    expect(grid).toHaveLength(4);
    expect(grid.filter((x) => x.ghost).map((x) => x.name)).toEqual(["Rival"]);
    expect(grid.filter((x) => x.isPlayer)).toHaveLength(1);
    expect(rows[0]!.position).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("shows the website: spoiler cards for circuits, a Fun badge, track pages with a layout and top times, profiles", async () => {
    const send = (p: string) => { const pl = placeFor(p); return call("/api/v1/lines", { method: "POST", key: other, body: { phrase: p, vehicle: pl.vehicle, car: defaultCar(), lines: [wire(botLine(generateTrack(p, { obstacles: false }), 5, 1))] } }); };
    const db2 = new Db(":memory:");
    const a = db2.register("aaaaaaaa-2222-4333-8444-555555555555", "Webber <b>");
    for (const [p, fun, special] of [["oval", false, true], ["fun-healthy-bear-eats-tuna", true, false], [phrase, false, false]] as const) {
      const pl = placeFor(p), t = trackInfo(p), tr = generateTrack(p, { obstacles: false });
      const ln = JSON.parse(serializeLineFile({ phrase: p, name: "", car: defaultCar(), lines: [botLine(tr, 5, 1)] })).lines[0];
      db2.submit({ ...t, fun, special }, a.id, pl.vehicle, defaultCar(), ln, 40, [41, 40, 41]);
    }
    void send;
    const home = renderPage(db2, "/")!;
    expect(home.status).toBe(200);
    expect(home.body).toContain("Spoiler: a real circuit");
    expect(home.body).toContain('class="badge fun"');
    expect(home.body).not.toContain("Webber <b>");
    expect(home.body).toContain("Webber &lt;b&gt;");
    const tp = renderPage(db2, `/tracks/${phrase}`)!;
    expect(tp.body).toContain("<svg");
    expect(tp.body).toContain("Top 10 by car");
    expect(tp.body).toContain(fmtTime(40));
    const fun = renderPage(db2, "/tracks/fun-healthy-bear-eats-tuna")!;
    expect(fun.body).toContain('class="badge fun"');
    expect(renderPage(db2, "/tracks/oval")!.body).toContain("The Oval");
    expect(renderPage(db2, `/players/${a.id}`)!.body).toContain("Best times");
    expect(renderPage(db2, "/tracks/never-heard-of-it")).toBeNull();
    expect(renderPage(db2, "/players/zzzzzzzzzzzz")).toBeNull();
    db2.close();
  }, 30_000);

  it("answers health checks and preflight", async () => {
    expect((await (await call("/healthz")).json() as { ok: boolean }).ok).toBe(true);
    const pre = await fetch(base + "/api/v1/lines", { method: "OPTIONS" });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("*");
  });
});
