import { describe, expect, it } from "vitest";
import { Race, botLine, defaultCar, forecast, generateTrack, raceDuration, vehicleChoicesForTrack, vehicleForTrack, weatherFor } from "@apex/sim";

/**
 * The race lays out its showers over the length of the race in the first entrant's machine (the player's), so the forecast the game shows
 * has to be worked out for that machine too, not the track's own (the game used to, and on a circuit with several classes it could be wrong).
 */
describe("the weather forecast", () => {
  const raceWeather = (phrase: string, vehicle: ReturnType<typeof vehicleForTrack>, laps: number) => {
    const track = generateTrack(phrase);
    const race = new Race(track, [{ id: "me", name: "Me", car: { ...defaultCar(), type: vehicle }, lines: [botLine(track, 1, 1)] }], laps, { realism: true, weather: true });
    return { track, weather: race.weather };
  };

  it("is the race's own weather when worked out for the machine the player drives", () => {
    for (const phrase of ["spa", "daytona", "silverstone"]) {
      const track = generateTrack(phrase);
      for (const v of vehicleChoicesForTrack(track)) {
        const { weather } = raceWeather(phrase, v, 20);
        const duration = raceDuration(track, v, 20);
        expect(weatherFor(track.seed, duration, track.biome)).toEqual(weather);
      }
    }
  });

  it("depends on the machine: some circuit and class forecast differs from the track's own class", () => {
    let differs = false;
    for (const phrase of ["spa", "daytona", "silverstone", "monza", "laguna-seca", "suzuka", "interlagos", "imola"]) {
      const track = generateTrack(phrase), own = vehicleForTrack(track);
      for (const laps of [10, 20, 30]) {
        const ownFc = forecast(weatherFor(track.seed, raceDuration(track, own, laps), track.biome), raceDuration(track, own, laps));
        for (const v of vehicleChoicesForTrack(track)) {
          const { weather } = raceWeather(phrase, v, laps);
          if (JSON.stringify(forecast(weather, raceDuration(track, v, laps))) !== JSON.stringify(ownFc)) differs = true;
        }
      }
    }
    expect(differs).toBe(true);
  });
});
