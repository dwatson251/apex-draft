import { loadWays, projector, pathLength, dist } from "./osm.ts";

const [file, lat0, lon0] = process.argv.slice(2);
const ways = loadWays(file!);
const proj = projector(Number(lat0), Number(lon0));
console.log(ways.length, "ways");
for (const w of ways) {
  const p = w.geometry.map(proj);
  const a = p[0]!, b = p.at(-1)!;
  console.log(String(w.id).padEnd(11), (w.tags.name ?? "-").padEnd(28), (w.tags.oneway ?? "-").padEnd(4), String(Math.round(pathLength(p))).padStart(5), "m", `(${a.x.toFixed(0)},${a.y.toFixed(0)}) -> (${b.x.toFixed(0)},${b.y.toFixed(0)})`, Object.entries(w.tags).filter(([k]) => !["highway", "name", "oneway", "surface"].includes(k)).map(([k, v]) => `${k}=${v}`).join(" ").slice(0, 70));
}
void dist;
