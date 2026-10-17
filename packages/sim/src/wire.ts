import { parseLineFile, serializeLineFile } from "./lineFile.ts";
import type { CarConfig } from "./car.ts";
import type { Line } from "./line.ts";

/** Lines travel to and from the online server in the line-file format (points as [x, y] to 0.01). These convert, checking shape and sizes on the way in. */
export function linesFromWire(car: unknown, lines: unknown): { car: CarConfig; lines: Line[] } | string {
  const f = parseLineFile(JSON.stringify({ v: 2, phrase: "x", name: "", car, lines }));
  return typeof f === "string" ? f : { car: f.car, lines: f.lines };
}

const PLACEHOLDER: CarConfig = { name: "x", accel: 6, top: 6, grip: 6, brake: 6 };

export function lineToWire(line: Line): unknown {
  return JSON.parse(serializeLineFile({ phrase: "x", name: "", car: PLACEHOLDER, lines: [line] })).lines[0];
}

/** A line as the server will see it: rounded to 0.01. The game drives this version, so its own time matches the server's. */
export function roundLine(line: Line): Line {
  const r = linesFromWire(PLACEHOLDER, [lineToWire(line)]);
  return typeof r === "string" ? line : r.lines[0]!;
}
