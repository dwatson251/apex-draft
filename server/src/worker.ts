import { parentPort } from "node:worker_threads";
import { runJob, type Job } from "./eval.ts";
import { maybeInstallKartPack } from "./kartpack.ts";

await maybeInstallKartPack();

parentPort!.on("message", (j: Job) => {
  try { parentPort!.postMessage(runJob(j)); } catch (e) { parentPort!.postMessage({ ok: false, error: `evaluation failed: ${(e as Error).message}` }); }
});
