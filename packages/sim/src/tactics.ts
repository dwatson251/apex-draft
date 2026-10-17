/**
 * How hard a driver pushes through a stint. It is chosen on the grid and at each pit stop and kept until the next one.
 * Attack is quicker and harder on the tyres, hotter and thirstier; defend is the reverse.
 */
export type Tactic = "attack" | "balanced" | "defend";
export const TACTICS: readonly Tactic[] = ["attack", "balanced", "defend"];
export const isTactic = (x: unknown): x is Tactic => x === "attack" || x === "balanced" || x === "defend";

export interface TacticInfo {
  name: string;
  /** share of the car's pace driven at (top speed and acceleration; cornering by its square) */
  pace: number;
  /** tyre wear, tyre heat and fuel use, 1 = balanced */
  wear: number;
  heat: number;
  fuel: number;
  blurb: string;
}

export const TACTIC_INFO: Record<Tactic, TacticInfo> = {
  attack: { name: "Attack", pace: 1.02, wear: 1.25, heat: 1.3, fuel: 1.1, blurb: "Quicker, but the tyres wear and overheat sooner and the tank empties faster." },
  balanced: { name: "Balanced", pace: 1, wear: 1, heat: 1, fuel: 1, blurb: "The standard way to drive a stint." },
  defend: { name: "Defend", pace: 0.98, wear: 0.8, heat: 0.75, fuel: 0.92, blurb: "Slower, but kind to the tyres and the tank: for a long stint." },
};
