import { availableParallelism } from "node:os";
import { Db } from "./db.ts";
import { createApp } from "./app.ts";
import { WorkerPool } from "./pool.ts";
import { startQueue } from "./queue.ts";
import { maybeInstallKartPack } from "./kartpack.ts";

await maybeInstallKartPack();

const env = process.env;
const port = Number(env["PORT"] ?? 8787);
const dataDir = env["DATA_DIR"] ?? "./data";
const workers = Math.max(1, Number(env["WORKERS"] ?? Math.min(4, Math.max(1, availableParallelism() - 1))));

const db = new Db(dataDir);
const pool = new WorkerPool(new URL("./worker.js", import.meta.url), workers);
const server = createApp({ db, run: pool.run, trustProxy: env["TRUST_PROXY"] === "1" });
server.listen(port, "0.0.0.0", () => console.log(`apex-draft server on :${port}, data in ${dataDir}, ${workers} worker(s)`));

const stopQueue = startQueue(db, pool.run, Math.max(1, Math.floor(workers / 2)));
const stop = () => { stopQueue(); server.close(); void pool.close().then(() => { db.close(); process.exit(0); }); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
