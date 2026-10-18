import { Worker } from "node:worker_threads";
import { runJob, type Job, type JobResult } from "./eval.ts";

export type Runner = (j: Job) => Promise<JobResult>;

/** Run jobs in this thread. For tests and tiny setups. */
export const inProcess: Runner = async (j) => runJob(j);

/** A pool of worker threads that each run the sim, so a slow evaluation never stalls the web server. A hung worker is killed and replaced. */
export class WorkerPool {
  private idle: Worker[] = [];
  private queue: { input: Job; resolve: (r: JobResult) => void }[] = [];
  private all = new Set<Worker>();
  private closed = false;

  constructor(private file: URL | string, private size: number, private timeoutMs = 300_000) {}

  private spawn(): Worker {
    const w = new Worker(this.file);
    this.all.add(w);
    w.on("error", () => this.drop(w));
    w.on("exit", () => this.drop(w));
    return w;
  }

  private drop(w: Worker): void { this.all.delete(w); this.idle = this.idle.filter((x) => x !== w); }

  run: Runner = (input): Promise<JobResult> => new Promise((resolve) => { this.queue.push({ input, resolve }); this.pump(); });

  private pump(): void {
    while (this.queue.length && !this.closed) {
      let w = this.idle.pop();
      if (!w) { if (this.all.size >= this.size) return; w = this.spawn(); }
      const job = this.queue.shift()!, worker = w;
      let done = false;
      const finish = (r: JobResult) => {
        if (done) return;
        done = true; clearTimeout(timer);
        worker.off("message", onMsg); worker.off("error", onErr);
        job.resolve(r);
        if (this.all.has(worker)) this.idle.push(worker);
        this.pump();
      };
      const onMsg = (r: JobResult) => finish(r);
      const onErr = () => finish({ ok: false, error: "evaluation failed" });
      const timer = setTimeout(() => { void worker.terminate(); this.drop(worker); finish({ ok: false, error: "evaluation timed out" }); }, this.timeoutMs);
      worker.on("message", onMsg); worker.on("error", onErr);
      worker.postMessage(job.input);
    }
  }

  async close(): Promise<void> { this.closed = true; await Promise.all([...this.all].map((w) => w.terminate())); }
}
