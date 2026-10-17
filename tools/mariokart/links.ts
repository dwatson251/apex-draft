import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Draft } from "./hub.ts";

/**
 * Checks that every course's wiki link resolves to the course page (not a missing page or a disambiguation) and keeps the pages in a cache folder
 * OUTSIDE the repository, for the tracing work to read. Prints a report; exits 1 on any problem.
 *   node --no-warnings tools/mariokart/links.ts <cache dir> [roster.json]
 */
const [cache, rosterFile] = process.argv.slice(2);
if (!cache) throw new Error("usage: links.ts <cache dir outside the repo> [roster file]");
mkdirSync(join(cache, "pages"), { recursive: true });
const roster: Draft[] = JSON.parse(readFileSync(rosterFile ?? new URL("./hub.json", import.meta.url), "utf8"));

const bad: string[] = [];
let next = 0;
async function worker(): Promise<void> {
  for (;;) {
    const d = roster[next++];
    if (!d) return;
    const file = join(cache, "pages", `${d.id}.html`);
    let html: string;
    if (existsSync(file)) html = readFileSync(file, "utf8");
    else {
      const r = await fetch(d.wikiUrl, { headers: { "user-agent": "apex-draft-roster/0.1 (fan project; link check)" } });
      if (!r.ok) { bad.push(`${d.id}: HTTP ${r.status} ${d.wikiUrl}`); continue; }
      html = await r.text();
      writeFileSync(file, html);
      await new Promise((ok) => setTimeout(ok, 250));
    }
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    if (/ may refer to:?/i.test(html.slice(0, 60000)) && !/race course|Mario Kart/i.test(title)) bad.push(`${d.id}: looks like a disambiguation (${title}) ${d.wikiUrl}`);
    else if (!/Mario Kart|race course|course|Circuit|Raceway|Road|Castle|Beach/i.test(html.slice(0, 200000))) bad.push(`${d.id}: not obviously a course page (${title})`);
  }
}
await Promise.all([worker(), worker(), worker()]);
console.log(`${roster.length} links checked, ${bad.length} problems`);
for (const b of bad) console.log("  " + b);
process.exit(bad.length ? 1 : 0);
