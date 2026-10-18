import { CIRCUITS, generateTrack } from "@apex/sim";
// the kind of each segment of a course, with its piece marks: npx vite-node tools/mariokart/kinds.ts <id>
const id = process.argv[2]!;
const t = generateTrack(id);
console.log(CIRCUITS.find((c) => c.id === id)?.name, t.segments.map((s) => `${s.index}:${s.kind.slice(0, 3)}${s.fx ? "*" : ""}`).join(" "));
