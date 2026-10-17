import { createRequire } from "node:module";
import type { DatabaseSync as Sqlite } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { SIM_VERSION } from "@apex/sim";

export const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
/** What a profile URL shows. Derived from the secret id with a different hash, so the URL cannot be used to upload as the player. */
export const publicId = (secret: string): string => sha(`pub:${secret}`).slice(0, 12);

export interface PlayerRow { id: string; name: string }
export interface TrackInfo { key: string; phrase: string; fun: boolean; special: boolean }
export interface EntryRow { id: number; player_id: string; name: string; vehicle: string; car_json: string; line_json: string; time: number; lap_times_json: string }

// loaded by require: vite (used by the tests) cannot resolve the prefix-only `node:sqlite` as an import
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tracks (key TEXT PRIMARY KEY, phrase TEXT NOT NULL, fun INTEGER NOT NULL, special INTEGER NOT NULL, plays INTEGER NOT NULL DEFAULT 0, created_by TEXT, first_seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT, track_key TEXT NOT NULL, player_id TEXT NOT NULL, vehicle TEXT NOT NULL, car_json TEXT NOT NULL, line_json TEXT NOT NULL,
  time REAL NOT NULL, lap_times_json TEXT NOT NULL, sim_version INTEGER NOT NULL, created_at INTEGER NOT NULL,
  UNIQUE (track_key, player_id, vehicle, sim_version));
CREATE INDEX IF NOT EXISTS entries_board ON entries (track_key, vehicle, sim_version, time);
CREATE INDEX IF NOT EXISTS entries_player ON entries (player_id);
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, track_key TEXT NOT NULL, kind TEXT NOT NULL, vehicle TEXT NOT NULL, status TEXT NOT NULL,
  position INTEGER, finish_time REAL, grid_json TEXT, request_json TEXT, sim_version INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS results_player ON results (player_id, created_at);
`;

export class Db {
  readonly sql: Sqlite;
  constructor(dir: string) {
    if (dir !== ":memory:") mkdirSync(dir, { recursive: true });
    this.sql = new DatabaseSync(dir === ":memory:" ? ":memory:" : join(dir, "apex.db"));
    this.sql.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;");
    this.sql.exec(SCHEMA);
  }

  close(): void { this.sql.close(); }

  /** Register (or find) the player for a secret id. An existing player keeps their name. */
  register(secret: string, name: string): PlayerRow {
    const now = Date.now(), th = sha(secret), id = publicId(secret);
    this.sql.prepare("INSERT INTO players (id, token_hash, name, created_at, last_seen) VALUES (?, ?, ?, ?, ?) ON CONFLICT(token_hash) DO UPDATE SET last_seen = excluded.last_seen").run(id, th, name, now, now);
    return this.sql.prepare("SELECT id, name FROM players WHERE token_hash = ?").get(th) as unknown as PlayerRow;
  }

  playerBySecret(secret: string): PlayerRow | null {
    const r = this.sql.prepare("SELECT id, name FROM players WHERE token_hash = ?").get(sha(secret)) as unknown as PlayerRow | undefined;
    if (r) this.sql.prepare("UPDATE players SET last_seen = ? WHERE id = ?").run(Date.now(), r.id);
    return r ?? null;
  }

  rename(id: string, name: string): void { this.sql.prepare("UPDATE players SET name = ? WHERE id = ?").run(name, id); }

  /** How many tracks this player was the first to bring in the last 24 hours (a cap on phrase spam). */
  newTracksToday(playerId: string): number {
    return (this.sql.prepare("SELECT COUNT(*) AS n FROM tracks WHERE created_by = ? AND first_seen > ?").get(playerId, Date.now() - 864e5) as { n: number }).n;
  }

  hasTrack(key: string): boolean { return !!this.sql.prepare("SELECT 1 FROM tracks WHERE key = ?").get(key); }

  /** Record a time. Only a faster time replaces the stored entry. Returns whether it did and the player's rank on the board. */
  submit(t: TrackInfo, playerId: string, vehicle: string, car: unknown, line: unknown, time: number, lapTimes: number[]): { improved: boolean; best: number; rank: number } {
    const now = Date.now();
    this.sql.exec("BEGIN");
    try {
      this.sql.prepare("INSERT INTO tracks (key, phrase, fun, special, plays, created_by, first_seen) VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT(key) DO UPDATE SET plays = plays + 1").run(t.key, t.phrase, t.fun ? 1 : 0, t.special ? 1 : 0, playerId, now);
      const cur = this.sql.prepare("SELECT time FROM entries WHERE track_key = ? AND player_id = ? AND vehicle = ? AND sim_version = ?").get(t.key, playerId, vehicle, SIM_VERSION) as { time: number } | undefined;
      let improved = false, best = cur?.time ?? time;
      if (!cur || time < cur.time) {
        improved = true; best = time;
        this.sql.prepare(`INSERT INTO entries (track_key, player_id, vehicle, car_json, line_json, time, lap_times_json, sim_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(track_key, player_id, vehicle, sim_version) DO UPDATE SET car_json = excluded.car_json, line_json = excluded.line_json, time = excluded.time, lap_times_json = excluded.lap_times_json, created_at = excluded.created_at`)
          .run(t.key, playerId, vehicle, JSON.stringify(car), JSON.stringify(line), time, JSON.stringify(lapTimes), SIM_VERSION, now);
      }
      const rank = 1 + (this.sql.prepare("SELECT COUNT(*) AS n FROM entries WHERE track_key = ? AND vehicle = ? AND sim_version = ? AND time < ?").get(t.key, vehicle, SIM_VERSION, best) as { n: number }).n;
      this.sql.exec("COMMIT");
      return { improved, best, rank };
    } catch (e) { this.sql.exec("ROLLBACK"); throw e; }
  }

  /** Everyone's best on a track in a machine (current ruleset only), except one player, fastest first. */
  board(trackKey: string, vehicle: string, exclude?: string, limit = 1000): EntryRow[] {
    return this.sql.prepare(`SELECT e.id, e.player_id, p.name, e.vehicle, e.car_json, e.line_json, e.time, e.lap_times_json FROM entries e JOIN players p ON p.id = e.player_id
      WHERE e.track_key = ? AND e.vehicle = ? AND e.sim_version = ? AND e.player_id != ? ORDER BY e.time ASC LIMIT ?`).all(trackKey, vehicle, SIM_VERSION, exclude ?? "", limit) as unknown as EntryRow[];
  }

  /** The top of a track's board in a machine, with this player's own place whether or not they are in it. */
  dailyBoard(trackKey: string, vehicle: string, playerId: string, limit: number): { top: { name: string; time: number; me: boolean }[]; rank: number | null; total: number } {
    const rows = this.sql.prepare(`SELECT e.player_id, p.name, e.time FROM entries e JOIN players p ON p.id = e.player_id
      WHERE e.track_key = ? AND e.vehicle = ? AND e.sim_version = ? ORDER BY e.time ASC`).all(trackKey, vehicle, SIM_VERSION) as unknown as { player_id: string; name: string; time: number }[];
    const at = rows.findIndex((r) => r.player_id === playerId);
    return { top: rows.slice(0, limit).map((r) => ({ name: r.name, time: r.time, me: r.player_id === playerId })), rank: at < 0 ? null : at + 1, total: rows.length };
  }

  // ---------- ghosts for a replay ----------
  /** The entries of these players on a track in a machine (current ruleset), for the ids a result names. */
  entriesFor(trackKey: string, vehicle: string, ids: string[]): EntryRow[] {
    if (!ids.length) return [];
    return this.sql.prepare(`SELECT e.id, e.player_id, p.name, e.vehicle, e.car_json, e.line_json, e.time, e.lap_times_json FROM entries e JOIN players p ON p.id = e.player_id
      WHERE e.track_key = ? AND e.vehicle = ? AND e.sim_version = ? AND e.player_id IN (${ids.map(() => "?").join(",")})`).all(trackKey, vehicle, SIM_VERSION, ...ids) as unknown as EntryRow[];
  }

  playerTime(trackKey: string, vehicle: string, playerId: string): number | null {
    const r = this.sql.prepare("SELECT time FROM entries WHERE track_key = ? AND vehicle = ? AND player_id = ? AND sim_version = ?").get(trackKey, vehicle, playerId, SIM_VERSION) as { time: number } | undefined;
    return r?.time ?? null;
  }

  // ---------- results queue ----------
  pendingResults(playerId: string): number {
    return (this.sql.prepare("SELECT COUNT(*) AS n FROM results WHERE player_id = ? AND status IN ('pending','running')").get(playerId) as { n: number }).n;
  }

  addResult(playerId: string, trackKey: string, kind: string, vehicle: string, request: unknown): number {
    const r = this.sql.prepare("INSERT INTO results (player_id, track_key, kind, vehicle, status, request_json, sim_version, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)")
      .run(playerId, trackKey, kind, vehicle, JSON.stringify(request), SIM_VERSION, Date.now());
    return Number(r.lastInsertRowid);
  }

  /** Put anything left 'running' by a crash back in the queue. */
  requeueRunning(): void { this.sql.exec("UPDATE results SET status = 'pending' WHERE status = 'running'"); }

  claimResult(): { id: number; player_id: string; track_key: string; kind: string; vehicle: string; request: any } | null {
    const r = this.sql.prepare("SELECT id, player_id, track_key, kind, vehicle, request_json FROM results WHERE status = 'pending' ORDER BY id LIMIT 1").get() as
      { id: number; player_id: string; track_key: string; kind: string; vehicle: string; request_json: string } | undefined;
    if (!r) return null;
    this.sql.prepare("UPDATE results SET status = 'running' WHERE id = ?").run(r.id);
    return { id: r.id, player_id: r.player_id, track_key: r.track_key, kind: r.kind, vehicle: r.vehicle, request: JSON.parse(r.request_json) };
  }

  finishResult(id: number, position: number, finishTime: number | null, standings: unknown): void {
    this.sql.prepare("UPDATE results SET status = 'done', position = ?, finish_time = ?, grid_json = ?, request_json = NULL WHERE id = ?").run(position, finishTime, JSON.stringify(standings), id);
  }

  rejectResult(id: number, error: string): void {
    this.sql.prepare("UPDATE results SET status = 'rejected', grid_json = ?, request_json = NULL WHERE id = ?").run(JSON.stringify({ error }), id);
  }

  // ---------- website ----------
  player(id: string): { id: string; name: string; created_at: number } | null {
    return (this.sql.prepare("SELECT id, name, created_at FROM players WHERE id = ?").get(id) as { id: string; name: string; created_at: number } | undefined) ?? null;
  }

  track(key: string): { key: string; phrase: string; fun: number; special: number; plays: number } | null {
    return (this.sql.prepare("SELECT key, phrase, fun, special, plays FROM tracks WHERE key = ?").get(key) as { key: string; phrase: string; fun: number; special: number; plays: number } | undefined) ?? null;
  }

  popularTracks(limit: number): { key: string; phrase: string; fun: number; special: number; plays: number; drivers: number }[] {
    return this.sql.prepare(`SELECT t.key, t.phrase, t.fun, t.special, t.plays, (SELECT COUNT(DISTINCT player_id) FROM entries e WHERE e.track_key = t.key AND e.sim_version = ?) AS drivers
      FROM tracks t ORDER BY t.plays DESC, t.first_seen DESC LIMIT ?`).all(SIM_VERSION, limit) as any;
  }

  recentTracks(limit: number): { key: string; phrase: string; fun: number; special: number; plays: number; drivers: number }[] {
    return this.sql.prepare(`SELECT t.key, t.phrase, t.fun, t.special, t.plays, (SELECT COUNT(DISTINCT player_id) FROM entries e WHERE e.track_key = t.key AND e.sim_version = ?) AS drivers
      FROM tracks t ORDER BY t.first_seen DESC LIMIT ?`).all(SIM_VERSION, limit) as any;
  }

  recentRecords(limit: number): { track_key: string; fun: number; special: number; vehicle: string; time: number; name: string; player_id: string; created_at: number }[] {
    return this.sql.prepare(`SELECT e.track_key, t.fun, t.special, e.vehicle, e.time, p.name, e.player_id, e.created_at FROM entries e JOIN players p ON p.id = e.player_id JOIN tracks t ON t.key = e.track_key
      WHERE e.sim_version = ? ORDER BY e.created_at DESC LIMIT ?`).all(SIM_VERSION, limit) as any;
  }

  topTimes(trackKey: string, vehicle: string, limit: number): { player_id: string; name: string; time: number; car_json: string }[] {
    return this.sql.prepare(`SELECT e.player_id, p.name, e.time, e.car_json FROM entries e JOIN players p ON p.id = e.player_id
      WHERE e.track_key = ? AND e.vehicle = ? AND e.sim_version = ? ORDER BY e.time ASC LIMIT ?`).all(trackKey, vehicle, SIM_VERSION, limit) as any;
  }

  vehiclesOnTrack(trackKey: string): string[] {
    return (this.sql.prepare("SELECT DISTINCT vehicle FROM entries WHERE track_key = ? AND sim_version = ?").all(trackKey, SIM_VERSION) as { vehicle: string }[]).map((r) => r.vehicle);
  }

  playerEntries(playerId: string): { track_key: string; fun: number; special: number; vehicle: string; time: number; created_at: number; rank: number }[] {
    return this.sql.prepare(`SELECT e.track_key, t.fun, t.special, e.vehicle, e.time, e.created_at,
        1 + (SELECT COUNT(*) FROM entries o WHERE o.track_key = e.track_key AND o.vehicle = e.vehicle AND o.sim_version = e.sim_version AND o.time < e.time) AS rank
      FROM entries e JOIN tracks t ON t.key = e.track_key WHERE e.player_id = ? AND e.sim_version = ? ORDER BY e.created_at DESC LIMIT 200`).all(playerId, SIM_VERSION) as any;
  }

  playerResults(playerId: string): { track_key: string; fun: number; special: number; kind: string; vehicle: string; status: string; position: number | null; finish_time: number | null; grid_json: string | null; created_at: number }[] {
    return this.sql.prepare(`SELECT r.track_key, t.fun, t.special, r.kind, r.vehicle, r.status, r.position, r.finish_time, r.grid_json, r.created_at FROM results r JOIN tracks t ON t.key = r.track_key
      WHERE r.player_id = ? AND r.sim_version = ? ORDER BY r.created_at DESC LIMIT 50`).all(playerId, SIM_VERSION) as any;
  }

  stats(): { players: number; tracks: number; times: number } {
    const n = (q: string) => (this.sql.prepare(q).get() as { n: number }).n;
    return { players: n("SELECT COUNT(*) AS n FROM players"), tracks: n("SELECT COUNT(*) AS n FROM tracks"), times: n("SELECT COUNT(*) AS n FROM entries") };
  }
}
