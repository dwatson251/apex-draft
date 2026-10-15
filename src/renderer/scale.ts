import { METRES_PER_UNIT, SEGMENT_MILES, WORLD_TIME } from "@apex/sim";

/** How the sim's units map onto the real world is in the sim (packages/sim/src/scale.ts): a unit is about 1.1 m, so a segment is
 *  about 110 m, and every sim second is shown as WORLD_TIME (about 1.64) real seconds. */
export { METRES_PER_UNIT, SEGMENT_MILES, WORLD_TIME };
/** a time from the sim, in the seconds a person would see on a clock */
export const realSeconds = (simSeconds: number) => simSeconds * WORLD_TIME;
