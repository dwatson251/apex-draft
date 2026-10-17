import { runRace, timeTrial, type RaceInput, type RaceOutcome, type TrialInput, type TrialResult } from "@apex/sim";

/** The jobs the worker threads run. Both are the sim's own whole-session functions: the server adds no rules of its own. */
export type Job = { kind: "trial"; input: TrialInput } | { kind: "race"; input: RaceInput };
export type JobResult = TrialResult | RaceOutcome;

export function runJob(j: Job): JobResult {
  return j.kind === "trial" ? timeTrial(j.input) : runRace(j.input);
}
