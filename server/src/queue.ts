import { isCompound, type Compound, type GhostRival, type RaceInput } from "@apex/sim";
import type { Db } from "./db.ts";
import type { Runner } from "./pool.ts";
import { linesFromWire } from "./wire.ts";

/**
 * Race results are made by running the whole race again here: the player's lines against the very ghosts the game raced
 * (their stored lines, looked up by id) and the computer-driven rivals, which are the same on every machine. The game
 * only reports what it did, never how it finished.
 */
export async function processOne(db: Db, run: Runner): Promise<boolean> {
  const job = db.claimResult();
  if (!job) return false;
  try {
    const q = job.request as Record<string, any>;
    const parsed = linesFromWire(q["car"], q["lines"]);
    if (typeof parsed === "string") throw new Error(parsed);
    const ids: string[] = Array.isArray(q["ghostIds"]) ? [...new Set<string>(q["ghostIds"].filter((x: unknown) => typeof x === "string"))].slice(0, 31) : [];
    const ghosts: GhostRival[] = [];
    for (const row of db.entriesFor(job.track_key, job.vehicle, ids.filter((id) => id !== job.player_id))) {
      const g = linesFromWire(JSON.parse(row.car_json), [JSON.parse(row.line_json)]);
      if (typeof g !== "string") ghosts.push({ id: row.player_id, name: row.name, car: g.car, line: g.lines[0]!, time: row.time });
    }
    const input: RaceInput = {
      phrase: job.track_key, vehicle: job.vehicle, car: parsed.car, lines: parsed.lines, lapLine: q["lapLine"], laps: q["laps"], realism: !!q["realism"],
      wearFuel: q["wearFuel"], wearTyre: q["wearTyre"], mandatory: Array.isArray(q["mandatory"]) ? q["mandatory"].filter(isCompound) as Compound[] : [],
      startTyre: q["startTyre"], pitPlan: Array.isArray(q["pitPlan"]) ? q["pitPlan"] : [],
      ghosts, rivals: q["rivals"], playerTime: db.playerTime(job.track_key, job.vehicle, job.player_id),
    };
    const r = await run({ kind: "race", input });
    if (!("standings" in r)) throw new Error(r.ok === false ? r.error : "race failed");
    db.finishResult(job.id, r.player.position, r.player.finishTime, r.standings);
  } catch (e) {
    db.rejectResult(job.id, (e as Error).message);
  }
  return true;
}

/** Work through the queue, one race at a time per loop, waking when there is nothing to do. */
export function startQueue(db: Db, run: Runner, concurrency = 1, idleMs = 1000): () => void {
  db.requeueRunning();
  let stopped = false;
  const loop = async () => {
    while (!stopped) {
      let did = false;
      try { did = await processOne(db, run); } catch (e) { console.error("results queue:", e); }
      if (!did) await new Promise((r) => setTimeout(r, idleMs));
    }
  };
  for (let i = 0; i < concurrency; i++) void loop();
  return () => { stopped = true; };
}
