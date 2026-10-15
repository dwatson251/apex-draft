import { readFileSync } from "node:fs";

/** A way from the Overpass API: its tags and the points along it, in latitude and longitude. */
export interface OsmWay { id: number; tags: Record<string, string>; geometry: { lat: number; lon: number }[] }
export interface Pt { x: number; y: number }

export const loadWays = (file: string): OsmWay[] => (JSON.parse(readFileSync(file, "utf8")).elements as OsmWay[]).filter((e) => e.geometry?.length);

/** Metres east and metres south of a reference point (screen y points down). */
export function projector(lat0: number, lon0: number): (g: { lat: number; lon: number }) => Pt {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;
  return (g) => ({ x: (g.lon - lon0) * kx, y: -(g.lat - lat0) * ky });
}

export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
export const pathLength = (p: Pt[]): number => { let s = 0; for (let i = 1; i < p.length; i++) s += dist(p[i - 1]!, p[i]!); return s; };
