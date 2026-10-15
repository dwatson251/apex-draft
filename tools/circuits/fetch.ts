import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { SOURCES } from "./sources.ts";

/** Download the highways for each circuit from the Overpass API into tools/circuits/cache (not committed). */
const MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const dir = new URL("./cache/", import.meta.url);
mkdirSync(dir, { recursive: true });

const only = process.argv.slice(2);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
for (const s of SOURCES) {
  const file = new URL(`${s.id}.json`, dir);
  if ((only.length && !only.includes(s.id)) || (!only.length && existsSync(file))) continue;
  const query = `[out:json][timeout:90];(${s.query ?? 'way["highway"="raceway"]'}(${s.bbox.join(",")}););out geom;`;
  let ok = false;
  for (let attempt = 0; attempt < 8 && !ok; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length]!;
    try {
      const res = await fetch(url, { method: "POST", body: new URLSearchParams({ data: query }), headers: { "User-Agent": "apex-draft-circuit-tool/1.0", Accept: "application/json" } });
      const text = await res.text();
      JSON.parse(text);
      writeFileSync(file, text);
      console.log(s.id, "fetched", text.length, "bytes from", new URL(url).host);
      ok = true;
    } catch (e) {
      console.log(s.id, "retrying:", (e as Error).message.slice(0, 80));
      await wait(4000 * (attempt + 1));
    }
  }
  if (!ok) console.log(s.id, "FAILED");
}
