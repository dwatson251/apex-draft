import type { VehicleId } from "@apex/sim";

/**
 * The waveguide engines (an experiment, see public/engine-worklet.js): what each machine is built like. Pipe lengths are in
 * samples at 44.1 kHz (343 m/s, so 100 samples is about 0.78 m), reflections 0 to 1, as in Antonio-R1's generator.
 * Machines without a combustion engine (the electric car) have none and keep the synth.
 */
export interface WaveguideEngine {
  cylinders: number;
  twoStroke?: boolean;
  /** the revs at idle and at the redline: the gearbox's 0 to 1 is spread over these */
  idle: number; redline: number;
  intakeWaveguideLength: number; exhaustWaveguideLength: number; extractorWaveguideLength: number;
  intakeOpenReflectionFactor: number; intakeClosedReflectionFactor: number;
  exhaustOpenReflectionFactor: number; exhaustClosedReflectionFactor: number;
  /** how long the charge burns, as a fraction of the cycle: longer is softer */
  ignitionTime: number;
  straightPipeWaveguideLength: number; straightPipeReflectionFactor: number;
  mufflerElementsLength: number[];
  /** how much the muffler reflects back, 0 (open pipe) to 1 */
  action: number;
  outletWaveguideLength: number; outletReflectionFactor: number;
  /** the intake noise's low-pass, and the output's, in Hz (default 1800 and 5000: the original's 11 kHz intake noise hissed) */
  noiseCut?: number; toneCut?: number;
  /** how much of each output is heard: [intake, engine block, outlet] */
  mix: [number, number, number];
  /** sets the loudness: every machine sounds equally loud (−42 dBA, A-weighted as the ear hears it, about the synth engines' middle), measured in the browser at 30, 60 and 90% of its top speed */
  gain: number;
}

/** Antonio-R1's demo engine: the starting point every machine below changes. */
const BASE: Omit<WaveguideEngine, "cylinders" | "idle" | "redline"> = {
  intakeWaveguideLength: 100, exhaustWaveguideLength: 100, extractorWaveguideLength: 100,
  intakeOpenReflectionFactor: 0.25, intakeClosedReflectionFactor: 0.95,
  exhaustOpenReflectionFactor: 0.25, exhaustClosedReflectionFactor: 0.95,
  ignitionTime: 0.016,
  straightPipeWaveguideLength: 128, straightPipeReflectionFactor: 0.1,
  mufflerElementsLength: [10, 15, 20, 25], action: 0.25,
  outletWaveguideLength: 5, outletReflectionFactor: 0.01,
  mix: [1, 1, 1], gain: 1,
};
const e = (o: Partial<WaveguideEngine> & Pick<WaveguideEngine, "cylinders" | "idle" | "redline">): WaveguideEngine => ({ ...BASE, ...o });

export const WAVEGUIDE_ENGINES: Partial<Record<VehicleId, WaveguideEngine>> = {
  // two-strokes: one cylinder (or two), short pipes, a thin open exhaust
  kart: e({ gain: 0.299, cylinders: 1, twoStroke: true, idle: 2500, redline: 14000, exhaustWaveguideLength: 60, extractorWaveguideLength: 50, straightPipeWaveguideLength: 70, action: 0.15 }),
  jetski: e({ gain: 0.284, cylinders: 2, twoStroke: true, idle: 2000, redline: 7500, exhaustWaveguideLength: 70, straightPipeWaveguideLength: 90, action: 0.35 }),
  // V12 and flat-plane V8s: short equal-length headers, little muffling, high revs
  formula: e({ gain: 0.104, cylinders: 12, idle: 4000, redline: 16000, exhaustWaveguideLength: 55, extractorWaveguideLength: 45, straightPipeWaveguideLength: 60, action: 0.08, ignitionTime: 0.012 }),
  classic: e({ gain: 0.128, cylinders: 8, idle: 3000, redline: 10500, exhaustWaveguideLength: 70, extractorWaveguideLength: 60, straightPipeWaveguideLength: 80, action: 0.08 }),
  prototype: e({ gain: 0.127, cylinders: 8, idle: 3000, redline: 9500, exhaustWaveguideLength: 70, extractorWaveguideLength: 60, straightPipeWaveguideLength: 90, action: 0.12 }),
  hypercar: e({ gain: 0.164, cylinders: 6, idle: 3000, redline: 10500, exhaustWaveguideLength: 75, straightPipeWaveguideLength: 100, action: 0.18 }),
  superbike: e({ gain: 0.287, cylinders: 4, idle: 3000, redline: 14500, exhaustWaveguideLength: 60, extractorWaveguideLength: 50, straightPipeWaveguideLength: 70, action: 0.15 }),
  // turbo fours: mid-length pipes, a turbo in the way (more muffling)
  rally: e({ gain: 0.247, cylinders: 4, idle: 2500, redline: 7500, action: 0.3 }),
  rallycross: e({ gain: 0.191, cylinders: 4, idle: 2800, redline: 8500, action: 0.22, ignitionTime: 0.02 }),
  touring: e({ gain: 0.206, cylinders: 4, idle: 2500, redline: 8500, exhaustWaveguideLength: 90, action: 0.25 }),
  buggy: e({ gain: 0.376, cylinders: 4, idle: 1500, redline: 6000, exhaustWaveguideLength: 110, straightPipeWaveguideLength: 110, action: 0.2 }),
  // sixes
  gt3: e({ gain: 0.145, cylinders: 6, idle: 2500, redline: 9000, exhaustWaveguideLength: 90, straightPipeWaveguideLength: 120, action: 0.18 }),
  gt4: e({ gain: 0.156, cylinders: 6, idle: 2000, redline: 7500, exhaustWaveguideLength: 100, straightPipeWaveguideLength: 140, action: 0.3 }),
  airboat: e({ gain: 0.237, cylinders: 6, idle: 1200, redline: 3200, exhaustWaveguideLength: 80, straightPipeWaveguideLength: 60, action: 0.05 }),
  // big cross-plane V8s: long pipes, a slow burn, a deep loping note
  muscle: e({ gain: 0.096, cylinders: 8, idle: 900, redline: 6500, exhaustWaveguideLength: 140, extractorWaveguideLength: 130, straightPipeWaveguideLength: 200, action: 0.3, ignitionTime: 0.024 }),
  stock: e({ gain: 0.106, cylinders: 8, idle: 2000, redline: 9000, exhaustWaveguideLength: 120, extractorWaveguideLength: 110, straightPipeWaveguideLength: 150, action: 0.12, ignitionTime: 0.02 }),
  dragster: e({ gain: 0.072, cylinders: 8, idle: 1500, redline: 8000, exhaustWaveguideLength: 40, extractorWaveguideLength: 30, straightPipeWaveguideLength: 40, action: 0.03, ignitionTime: 0.03 }),
  speedboat: e({ gain: 0.093, cylinders: 8, idle: 900, redline: 5500, exhaustWaveguideLength: 150, straightPipeWaveguideLength: 220, action: 0.45, ignitionTime: 0.024 }),
  hovercraft: e({ gain: 0.341, cylinders: 4, idle: 1500, redline: 6000, exhaustWaveguideLength: 110, straightPipeWaveguideLength: 160, action: 0.4 }),
  // diesels: few, slow, long-burning strokes, long pipes and a big silencer
  truck: e({ gain: 0.292, cylinders: 6, idle: 600, redline: 2500, exhaustWaveguideLength: 180, extractorWaveguideLength: 160, straightPipeWaveguideLength: 260, action: 0.5, ignitionTime: 0.04 }),
  tank: e({ gain: 0.071, cylinders: 12, idle: 600, redline: 2800, exhaustWaveguideLength: 200, extractorWaveguideLength: 180, straightPipeWaveguideLength: 300, action: 0.55, ignitionTime: 0.045 }),
};
