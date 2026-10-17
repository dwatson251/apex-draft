import { defaultName, isComplete, linesFromWire, lineToWire, normalizePhrase, sanitiseName, validateLine, type CarConfig, type Compound, type Line, type Tactic, type Track } from "@apex/sim";
import { load, save } from "./store.ts";

/**
 * Everything the game says to the online server, and the only networking in it. The server is optional: every call is async,
 * gives up after 10 seconds, and any failure (offline, down, blocked, a bad reply) just means nothing happens. The player is never told.
 */

/** Where the server lives. Baked in; also named in the Content-Security-Policy (index.html, src/main/index.ts), which tests/online.test.ts keeps in step. */
export const SERVER = "https://apexdraft.dnlwtsn.co.uk";
export const TIMEOUT_MS = 10_000;
/** After a failed call the server is left alone for this long, so an unreachable one costs one wait, not one per click. */
const BACKOFF_MS = 60_000;
const GHOST_TTL_MS = 5 * 60_000;

export interface Identity { id: string; name: string }

/** Another player's recorded lap, ready to race: checked against the track before it gets here. */
export interface Ghost { id: string; name: string; car: CarConfig; line: Line; time: number }

export interface GhostQuery { phrase: string; vehicle: string; limit: number; time?: number }

const uuid = (): string => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)));

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class Online {
  private secret = "";
  private name_ = "";
  private registered = false;
  private down = 0;
  private cache = new Map<string, { at: number; ghosts: Ghost[] }>();
  private inflight = new Map<string, Promise<void>>();

  constructor(private fetchFn: FetchLike = (u, i) => fetch(u, i), private base = SERVER, private now: () => number = () => Date.now()) {}

  /** The name shown in races and on the site. */
  get name(): string { return this.name_ || defaultName(this.secret); }

  /** Load (or make) the identity. Local only: it never waits for the network. */
  async init(): Promise<void> {
    const saved = await load<Partial<Identity> & { secret?: string }>("identity", {});
    this.secret = typeof saved.secret === "string" && /^[0-9a-f-]{36}$/i.test(saved.secret) ? saved.secret : uuid();
    this.name_ = sanitiseName(saved.name) || defaultName(this.secret);
    if (saved.secret !== this.secret || saved.name !== this.name_) await this.persist();
  }

  private persist(): Promise<void> { return save("identity", { secret: this.secret, name: this.name_ }); }

  /** Change the display name (cleaned the way the server cleans it). Tells the server in the background. */
  setName(raw: string): string {
    const name = sanitiseName(raw) || defaultName(this.secret);
    if (name === this.name_) return name;
    this.name_ = name;
    void this.persist();
    if (this.registered) void this.call("PUT", "/me", { name });
    return name;
  }

  /** One request: the parsed reply, or null for anything that went wrong. */
  private async call(method: string, path: string, body?: unknown, auth = true): Promise<any | null> {
    if (!this.secret || this.now() < this.down) return null;
    try {
      const res = await this.fetchFn(`${this.base}/api/v1${path}`, {
        method,
        headers: { ...(auth ? { authorization: `Bearer ${this.secret}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status >= 500) { this.down = this.now() + BACKOFF_MS; return null; }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      this.down = this.now() + BACKOFF_MS;
      return null;
    }
  }

  private async ensureRegistered(): Promise<boolean> {
    if (this.registered) return true;
    const r = await this.call("POST", "/players", { name: this.name });
    if (!r || typeof r.name !== "string") return false;
    this.registered = true;
    // the server keeps the first name it heard; if ours changed since, say so
    if (r.name !== this.name) void this.call("PUT", "/me", { name: this.name });
    return true;
  }

  // ---------- ghosts ----------
  private key(q: GhostQuery): string {
    // times within a few seconds of each other fetch the same field
    return `${normalizePhrase(q.phrase)}|${q.vehicle}|${q.limit}|${q.time === undefined ? "-" : Math.round(q.time / 2)}`;
  }

  /** Start fetching ghosts so they are ready when the race begins. Safe to call as often as you like. */
  preload(q: GhostQuery): void {
    const k = this.key(q), hit = this.cache.get(k);
    if ((hit && this.now() - hit.at < GHOST_TTL_MS) || this.inflight.has(k)) return;
    const p = (async () => {
      if (!(await this.ensureRegistered())) return;
      const qs = new URLSearchParams({ phrase: normalizePhrase(q.phrase), vehicle: q.vehicle, limit: String(q.limit) });
      if (q.time !== undefined && Number.isFinite(q.time)) qs.set("time", String(q.time));
      const r = await this.call("GET", `/ghosts?${qs}`);
      if (!r || !Array.isArray(r.ghosts)) return;
      const ghosts: Ghost[] = [];
      for (const g of r.ghosts) {
        const l = linesFromWire(g?.car, [g?.line]);
        if (typeof l !== "string" && typeof g.id === "string" && typeof g.time === "number") ghosts.push({ id: g.id, name: sanitiseName(g.name) || "Driver", car: l.car, line: l.lines[0]!, time: g.time });
      }
      this.cache.set(k, { at: this.now(), ghosts });
    })().finally(() => this.inflight.delete(k));
    this.inflight.set(k, p);
  }

  /** What has arrived for this query so far, checked against the track (a line that does not fit it is dropped). Never waits. */
  ghosts(q: GhostQuery, track: Track): Ghost[] {
    const hit = this.cache.get(this.key(q));
    if (!hit) return [];
    return hit.ghosts.filter((g) => isComplete(track, g.line) && validateLine(track, g.line).ok).slice(0, q.limit);
  }

  // ---------- uploads ----------
  /** Send the player's line to be timed and ranked. Fire and forget. */
  uploadLine(phrase: string, vehicle: string, car: CarConfig, line: Line): void {
    this.upload = (async () => {
      if (!(await this.ensureRegistered())) return;
      await this.call("POST", "/lines", { phrase: normalizePhrase(phrase), vehicle, car, lines: [lineToWire(line)] });
    })();
  }
  private upload: Promise<void> = Promise.resolve();

  /** The Daily board for a day: the top times and the player's own place, once their latest line has been sent. Null if the server cannot be reached. */
  async daily(date: string): Promise<{ top: { name: string; time: number; me: boolean }[]; rank: number | null; total: number } | null> {
    await this.upload.catch(() => {});
    if (!(await this.ensureRegistered())) return null;
    const r = await this.call("GET", `/daily?date=${encodeURIComponent(date)}`);
    if (!r || !Array.isArray(r.top)) return null;
    return { top: r.top.slice(0, 20).map((x: { name?: unknown; time?: unknown; me?: unknown }) => ({ name: sanitiseName(x.name) || "Driver", time: Number(x.time), me: !!x.me })), rank: typeof r.rank === "number" ? r.rank : null, total: Number(r.total) || 0 };
  }

  /** Send a finished race to be replayed on the server. Fire and forget. */
  uploadRace(r: {
    kind: "quick" | "weekend"; phrase: string; vehicle: string; car: CarConfig; laps: number; rivals: number; realism: boolean; lines: Line[];
    wearFuel?: number; wearTyre?: number; mandatory?: Compound[]; startTyre?: Compound; startTactic?: Tactic; pitPlan?: { lap: number; tyre?: Compound; tactic?: Tactic }[]; ghostIds: string[];
  }): void {
    // the distinct lines, and which each lap used (an amended lap has a different line from there on)
    const distinct: Line[] = [], lapLine: number[] = [];
    for (const l of r.lines) {
      let i = distinct.indexOf(l);
      if (i < 0) { distinct.push(l); i = distinct.length - 1; }
      lapLine.push(i);
    }
    if (distinct.length > 12) return;
    void (async () => {
      if (!(await this.ensureRegistered())) return;
      await this.call("POST", "/results", {
        kind: r.kind, phrase: normalizePhrase(r.phrase), vehicle: r.vehicle, car: r.car, lines: distinct.map(lineToWire), lapLine, laps: r.laps, rivals: r.rivals, realism: r.realism,
        wearFuel: r.wearFuel, wearTyre: r.wearTyre, mandatory: r.mandatory, startTyre: r.startTyre, startTactic: r.startTactic, pitPlan: r.pitPlan, ghostIds: r.ghostIds,
      });
    })();
  }
}
