/**
 * How the sim's units map onto the real world.
 *
 * The sim keeps its own units, and a tick is 1/60 s. A real circuit is laid out here at the size the sim can drive: no bend tighter
 * than 36 units, roads 60 apart. Measured against the real lengths of Donington, Daytona, Barcelona, Monza, Silverstone, Laguna
 * Seca and Willow Springs, a unit comes to about 1.1 m (they agree to within 6%), so a 100-unit segment is about 110 m.
 *
 * With the length fixed, one number is left to choose: how many seconds are shown for each sim second. It is set so the sim's
 * speeds stay real (150 units/s is 225 mph) and, because the length is real too, so are the lap times: F1 at Silverstone laps in
 * about 1:25. Accelerations in units/s² then follow from the real g (see `G`).
 */
export const METRES_PER_UNIT = 1.1;
/** Metres per second of real speed for one unit per sim second: 1 unit/s is 1.5 mph. */
export const SPEED_SCALE = 0.67056;
/** real seconds shown for each second the sim simulates */
export const WORLD_TIME = METRES_PER_UNIT / SPEED_SCALE;
/** one real g in units/s² */
export const G = (9.80665 * WORLD_TIME * WORLD_TIME) / METRES_PER_UNIT;
/** a straight piece or a free-track segment, in units */
export const SEGMENT_UNITS = 100;
export const SEGMENT_MILES = (SEGMENT_UNITS * METRES_PER_UNIT) / 1609.344;
