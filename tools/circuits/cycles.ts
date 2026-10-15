import { loadWays, projector } from "./osm.ts";
import { graph, cyclesThrough } from "./loop.ts";

const [file, lat0, lon0, via, ...avoid] = process.argv.slice(2);
const ways = loadWays(file!).filter((w) => !avoid.includes(String(w.id)) && !/pit lane|kart|support|moto layout/i.test(w.tags.name ?? "") && w.tags.sport !== "karting" && w.tags.raceway !== "pit_lane");
const { edges } = graph(ways, projector(Number(lat0), Number(lon0)));
const viaId = via && via !== "-" ? Number(via) : edges.slice().sort((a, b) => b.len - a.len)[0]!.way.id;
const cycles = cyclesThrough(edges, viaId);
cycles.sort((a, b) => b.reduce((s, e) => s + e.len, 0) - a.reduce((s, e) => s + e.len, 0));
console.log(cycles.length, "cycles");
for (const c of cycles.slice(0, 6)) console.log(Math.round(c.reduce((s, e) => s + e.len, 0)), "m", c.map((e) => `${e.way.id}${e.way.tags.name ? ":" + e.way.tags.name : ""}`).join(" > "));
