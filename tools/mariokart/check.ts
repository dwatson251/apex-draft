import { CIRCUITS, ROAD_HALF, checkTrack, generateTrack, isCrossing, trackLength, KART_INFO } from "@apex/sim";

/**
 * The gates a kart course must pass (the cheap ones of tests/karttracks.test.ts), course by course, with the reason when one fails.
 *   node --no-warnings tools/mariokart/check.ts [id ...]        (no ids: every built course)
 */
const MIN_GAP = 2 * ROAD_HALF + 4 - 0.5;
const ids = process.argv.slice(2);
let bad = 0;
for (const c of CIRCUITS.filter((x) => x.kart && (!ids.length || ids.includes(x.id)))) {
  const t = generateTrack(c.id);
  const problems = checkTrack(t);
  const n = t.segments.length;
  let sep = Infinity;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (isCrossing(t.segments[i]!.kind) && isCrossing(t.segments[j]!.kind)) continue;
    for (const p of t.segments[i]!.center) for (const q of t.segments[j]!.center) sep = Math.min(sep, Math.hypot(p.x - q.x, p.y - q.y));
  }
  if (sep <= MIN_GAP) problems.push(`roads ${sep.toFixed(1)} apart (needs ${MIN_GAP})`);
  const len = trackLength(t);
  if (len <= 1200 || len >= 5000) problems.push(`lap of ${Math.round(len)} units`);
  const fx = KART_INFO.get(c.id)!.fx.length;
  console.log(`${problems.length ? "BAD" : "ok "} ${c.id.padEnd(28)} ${Math.round(len)} units, ${n} segments, ${fx} pieces${problems.length ? "\n      " + problems.join("\n      ") : ""}`);
  if (problems.length) bad++;
}
process.exit(bad ? 1 : 0);
