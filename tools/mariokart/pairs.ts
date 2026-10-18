import { generateTrack, isCrossing } from "@apex/sim";
import { installKartPack } from "../../packages/sim/src/kartpack.ts";

installKartPack(); // the courses are a fan pack, not part of the game: see kartpack.ts
// the pairs of segments of a course that are too close: npx vite-node tools/mariokart/pairs.ts <id>
const t = generateTrack(process.argv[2]!);
const n = t.segments.length;
for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
  if (i === 0 && j === n - 1) continue;
  if (isCrossing(t.segments[i]!.kind) && isCrossing(t.segments[j]!.kind)) continue;
  let best = Infinity;
  for (const p of t.segments[i]!.center) for (const q of t.segments[j]!.center) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
  if (best < 47.5) console.log(i, t.segments[i]!.kind, j, t.segments[j]!.kind, best.toFixed(1), "level", t.segments[i]!.level, t.segments[j]!.level);
}
