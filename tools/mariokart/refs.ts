import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Fetches the wiki's map pictures of each course into a folder OUTSIDE the repository, to trace a layout from. They are Nintendo's pictures: they are only looked at
 * and measured, never committed, shipped or linked from the game. Writes <dir>/<id>/<file> and <dir>/hashes.json (sha256 of each, so a run can be repeated).
 *   node --no-warnings tools/mariokart/refs.ts <ref dir outside the repo> <page cache dir> [id ...]
 */
const [dir, cache, ...only] = process.argv.slice(2);
if (!dir || !cache) throw new Error("usage: refs.ts <ref dir> <page cache dir> [id ...]");
const roster: { id: string; game: string }[] = JSON.parse(readFileSync(new URL("./roster.json", import.meta.url), "utf8"));
const PREFIX: Record<string, string> = { smk: "SMK", mk64: "MK64", mksc: "MKSC", mkdd: "MKDD", mkds: "MKDS", mkwii: "MKWii", mk7: "MK7", mk8: "MK8" };
const hashesFile = join(dir, "hashes.json");
mkdirSync(dir, { recursive: true });
const hashes: Record<string, string> = existsSync(hashesFile) ? JSON.parse(readFileSync(hashesFile, "utf8")) : {};

/** a thumbnail's address -> the picture's own */
const full = (u: string): string => (u.includes("/thumb/") ? u.replace("/thumb/", "/").replace(/\/[^/]+$/, "") : u);

for (const r of roster) {
  if (only.length && !only.includes(r.id)) continue;
  const html = readFileSync(join(cache, "pages", `${r.id}.html`), "utf8").slice(readFileSync(join(cache, "pages", `${r.id}.html`), "utf8").indexOf('id="mw-content-text"'));
  const urls = [...new Set([...html.matchAll(/<img[^>]+src="(https:\/\/mario\.wiki\.gallery\/images\/[^"]+)"/g)].map((m) => full(m[1]!)))]
    .filter((u) => /(map|overhead|layout|lower-screen)/i.test(decodeURIComponent(u)) && !/Emblem|Icon|Cup_|Tour_|MKT_|Logo|Multiplayer|Shortcut|_map_Mario|MK_World|Map_by/i.test(u));
  // the course's own game first, then the others' (retro courses are in later games' maps too)
  urls.sort((a, b) => +!a.includes(`/${PREFIX[r.game]}_`) - +!b.includes(`/${PREFIX[r.game]}_`));
  mkdirSync(join(dir, r.id), { recursive: true });
  for (const u of urls.slice(0, 5)) {
    const name = decodeURIComponent(u.split("/").pop()!);
    const file = join(dir, r.id, name);
    if (existsSync(file)) continue;
    const res = await fetch(u, { headers: { "user-agent": "apex-draft-roster/0.1 (fan project; reference pictures for tracing, not redistributed)" } });
    if (!res.ok) { console.log(`${r.id}: ${name}: HTTP ${res.status}`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(file, buf);
    hashes[`${r.id}/${name}`] = createHash("sha256").update(buf).digest("hex");
    await new Promise((ok) => setTimeout(ok, 200));
  }
}
writeFileSync(hashesFile, JSON.stringify(hashes, null, 1));
console.log(`${Object.keys(hashes).length} pictures`);
