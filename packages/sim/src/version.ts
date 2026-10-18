/**
 * The ruleset a lap time was set under. The online server stamps every time with this and only ranks times from the current
 * one, because a change to the physics, the track generator, the bots, the cars or the circuit data changes every time.
 * Bump it with any change to race.ts, profile.ts, car.ts, track.ts, bots.ts, vehicles.ts, biomes.ts, weather.ts, tyres.ts or
 * the circuit data. tests/version.test.ts holds a fingerprint of a fixed race and fails when the sim changes without a bump.
 */
export const SIM_VERSION = 5;
