import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";
import { MAX_RACE_LAPS, MAX_RACE_RIVALS, SIM_VERSION, circuitFor, defaultName, isComplete, isVehicleId, normalizePhrase, placeFor, sanitiseName, validateLine, cachedTrack, type Line, type TrialResult } from "@apex/sim";
import { Db, type EntryRow, type TrackInfo } from "./db.ts";
import { pickAround } from "./ghosts.ts";
import type { Runner } from "./pool.ts";
import { lineToWire, linesFromWire } from "./wire.ts";
import { renderPage } from "./pages.ts";
import { RateLimiter } from "./ratelimit.ts";

export interface AppConfig {
  db: Db;
  run: Runner;
  /** read the client address from X-Forwarded-For (behind a reverse proxy) */
  trustProxy?: boolean;
  /** most new tracks one player may bring in per day */
  newTracksPerDay?: number;
  limiter?: RateLimiter;
}

const MAX_BODY = 256 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_GHOSTS = 31;

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

/** The canonical key for a track: a real circuit is one track whatever it is called, anything else is its normalised phrase. */
export function trackInfo(phrase: string): TrackInfo {
  const norm = normalizePhrase(phrase);
  const circuit = circuitFor(norm);
  return { key: circuit ? circuit.id : norm, phrase: circuit ? circuit.id : norm, fun: placeFor(norm).fun, special: !!circuit };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let n = 0; const parts: Buffer[] = [];
    req.on("data", (c: Buffer) => { n += c.length; if (n > MAX_BODY) { reject(new HttpError(413, "body too large")); req.destroy(); } else parts.push(c); });
    req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    req.on("error", reject);
  });
}

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PUT, OPTIONS", "access-control-max-age": "86400" };

function send(req: IncomingMessage, res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const type = typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8";
  const headers: Record<string, string> = { ...cors, "content-type": type, "cache-control": "no-store", ...extra };
  if (text.length > 1024 && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) {
    const z = gzipSync(text);
    res.writeHead(status, { ...headers, "content-encoding": "gzip", "content-length": z.length }).end(z);
  } else res.writeHead(status, headers).end(text);
}

const rowToGhost = (r: EntryRow) => ({ id: `${r.player_id}`, name: r.name, vehicle: r.vehicle, time: r.time, car: JSON.parse(r.car_json), line: JSON.parse(r.line_json) });

export function createApp(cfg: AppConfig): Server {
  const { db } = cfg;
  const limiter = cfg.limiter ?? new RateLimiter();
  const perDay = cfg.newTracksPerDay ?? 30;

  const clientIp = (req: IncomingMessage): string => {
    if (cfg.trustProxy) { const f = String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim(); if (f) return f; }
    return req.socket.remoteAddress ?? "?";
  };

  const secretOf = (req: IncomingMessage): string => {
    const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers["authorization"] ?? ""));
    if (!m || !UUID.test(m[1]!)) throw new HttpError(401, "missing or malformed credentials");
    return m[1]!.toLowerCase();
  };

  const json = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
    let v: unknown;
    try { v = JSON.parse(await readBody(req)); } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, "invalid JSON"); }
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new HttpError(400, "expected a JSON object");
    return v as Record<string, unknown>;
  };

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (req.method === "OPTIONS") return void res.writeHead(204, cors).end();
    if (path === "/healthz") return send(req, res, 200, { ok: true, simVersion: SIM_VERSION });
    if (!path.startsWith("/api/v1/")) {
      const page = req.method === "GET" || req.method === "HEAD" ? renderPage(db, path) : null;
      if (!page) return send(req, res, 404, { error: "not found" });
      return void res.writeHead(page.status, { "content-type": page.type, "cache-control": "public, max-age=30" }).end(req.method === "HEAD" ? undefined : page.body);
    }
    const ip = clientIp(req);
    if (!limiter.take(`ip:${ip}`, 40, 240, 60_000)) throw new HttpError(429, "slow down");
    const api = path.slice("/api/v1".length);

    if (api === "/players" && req.method === "POST") {
      const secret = secretOf(req);
      if (!limiter.take(`reg:${ip}`, 3, 10, 3600_000)) throw new HttpError(429, "slow down");
      const body = await json(req);
      const p = db.register(secret, sanitiseName(body["name"]) || defaultName(secret));
      return send(req, res, 200, { id: p.id, name: p.name });
    }

    const me = db.playerBySecret(secretOf(req));
    if (!me) throw new HttpError(401, "unknown player: register first");

    if (api === "/me" && req.method === "GET") return send(req, res, 200, { id: me.id, name: me.name, simVersion: SIM_VERSION });
    if (api === "/me" && req.method === "PUT") {
      const name = sanitiseName((await json(req))["name"]);
      if (!name) throw new HttpError(400, "name is empty");
      db.rename(me.id, name);
      return send(req, res, 200, { id: me.id, name });
    }

    if (api === "/lines" && req.method === "POST") {
      if (!limiter.take(`up:${me.id}`, 10, 30, 60_000)) throw new HttpError(429, "slow down");
      const body = await json(req);
      if (typeof body["phrase"] !== "string" || typeof body["vehicle"] !== "string") throw new HttpError(400, "phrase and vehicle are required");
      // the same checks as a line file: shape, sizes and the car's budget. Times in the body are ignored on purpose.
      const parsed = linesFromWire(body["car"], body["lines"]);
      if (typeof parsed === "string") throw new HttpError(400, parsed);
      const t = trackInfo(body["phrase"]);
      if (!db.hasTrack(t.key) && db.newTracksToday(me.id) >= perDay) throw new HttpError(429, "too many new tracks today");
      // the lines of the Time Trial are all the same line; a player's amended laps keep only the first, which is what is timed
      const line: Line = parsed.lines[0]!;
      const r = await cfg.run({ kind: "trial", input: { phrase: t.key, vehicle: body["vehicle"], car: parsed.car, line } }) as TrialResult;
      if (!r.ok) throw new HttpError(422, r.error);
      const out = db.submit(t, me.id, r.vehicle, parsed.car, lineToWire(line), r.time, r.lapTimes);
      return send(req, res, 200, { ok: true, track: t.key, time: r.time, best: out.best, improved: out.improved, rank: out.rank });
    }

    if (api === "/ghosts" && req.method === "GET") {
      if (!limiter.take(`gh:${me.id}`, 10, 60, 60_000)) throw new HttpError(429, "slow down");
      const phrase = url.searchParams.get("phrase") ?? "", vehicle = url.searchParams.get("vehicle") ?? "";
      if (!phrase || !vehicle || phrase.length > 80) throw new HttpError(400, "phrase and vehicle are required");
      const limit = Math.max(1, Math.min(MAX_GHOSTS, Math.floor(Number(url.searchParams.get("limit") ?? 5)) || 5));
      const tp = url.searchParams.get("time");
      const target = tp !== null && tp !== "" && Number.isFinite(Number(tp)) && Number(tp) > 0 ? Number(tp) : null;
      const t = trackInfo(phrase);
      const rows = pickAround(db.board(t.key, vehicle, me.id), target, limit);
      // lines come back as stored; the game checks each one again before it uses it
      return send(req, res, 200, { track: t.key, simVersion: SIM_VERSION, ghosts: rows.map(rowToGhost) });
    }

    if (api === "/results" && req.method === "POST") {
      if (!limiter.take(`rs:${me.id}`, 3, 12, 60_000)) throw new HttpError(429, "slow down");
      if (db.pendingResults(me.id) >= 5) throw new HttpError(429, "too many results waiting");
      const b = await json(req);
      const kind = b["kind"];
      if (kind !== "quick" && kind !== "weekend") throw new HttpError(400, "kind must be quick or weekend");
      if (typeof b["phrase"] !== "string" || typeof b["vehicle"] !== "string" || !isVehicleId(b["vehicle"])) throw new HttpError(400, "phrase and vehicle are required");
      const parsed = linesFromWire(b["car"], b["lines"]);
      if (typeof parsed === "string") throw new HttpError(400, parsed);
      const laps = b["laps"], rivals = b["rivals"], lapLine = b["lapLine"];
      if (!Number.isInteger(laps) || (laps as number) < 1 || (laps as number) > MAX_RACE_LAPS) throw new HttpError(400, "bad lap count");
      if (!Number.isInteger(rivals) || (rivals as number) < 1 || (rivals as number) > MAX_RACE_RIVALS) throw new HttpError(400, "bad rival count");
      if (!Array.isArray(lapLine) || lapLine.length !== laps || !lapLine.every((k) => Number.isInteger(k) && k >= 0 && k < parsed.lines.length)) throw new HttpError(400, "bad lap lines");
      const t = trackInfo(b["phrase"]);
      if (!placeFor(t.key).choices.includes(b["vehicle"])) throw new HttpError(422, "that machine is not available on this track");
      const track = cachedTrack(t.key);
      for (const l of parsed.lines) if (!isComplete(track, l) || !validateLine(track, l).ok) throw new HttpError(422, "a line does not go all the way round or leaves the road");
      const id = db.addResult(me.id, t.key, kind, b["vehicle"], {
        car: b["car"], lines: b["lines"], lapLine, laps, rivals, realism: !!b["realism"], wearFuel: b["wearFuel"], wearTyre: b["wearTyre"], mandatory: b["mandatory"],
        startTyre: b["startTyre"], pitPlan: b["pitPlan"], ghostIds: Array.isArray(b["ghostIds"]) ? b["ghostIds"].slice(0, 31) : [],
      });
      return send(req, res, 202, { ok: true, id });
    }

    throw new HttpError(404, "not found");
  }

  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    route(req, res, url).catch((e) => {
      if (res.headersSent) return void res.end();
      if (e instanceof HttpError) return send(req, res, e.status, { error: e.message });
      console.error(e);
      send(req, res, 500, { error: "server error" });
    });
  });
}
