import { readFileSync, writeFileSync, existsSync } from "node:fs";

/**
 * The course list of the Super Mario Wiki's hub page (https://www.mariowiki.com/Course_(Mario_Kart_series)) as a draft roster: every race course of the
 * main series in game order, each once under the first game it appeared in (a retro course links to the page of the original, so the page link is the identity).
 * Only names, links, cups and games are kept; the wiki's images are not fetched here. Mario Kart Tour and Mario Kart World are left out (ask first).
 *   node --no-warnings tools/mariokart/hub.ts [hub.html]     (fetches the hub page when no file is given)
 */
const HUB = "https://www.mariowiki.com/Course_(Mario_Kart_series)";
const BOOSTER = "https://www.mariowiki.com/Mario_Kart_8_Deluxe_%E2%80%93_Booster_Course_Pass";
const GAMES: [string, string][] = [
  ["Super Mario Kart", "smk"], ["Mario Kart 64", "mk64"], ["Mario Kart: Super Circuit", "mksc"], ["Mario Kart: Double Dash!!", "mkdd"], ["Mario Kart DS", "mkds"],
  ["Mario Kart Wii", "mkwii"], ["Mario Kart 7", "mk7"], ["Mario Kart 8 / Mario Kart 8 Deluxe", "mk8"],
];

const strip = (s: string): string => s.replace(/<[^>]+>/g, "").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
const slug = (s: string): string => s.toLowerCase().replace(/['’]/g, "").replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export interface Draft { id: string; name: string; game: string; cup: string; wikiUrl: string; href: string }

export async function loadHub(file?: string): Promise<string> {
  if (file && existsSync(file)) return readFileSync(file, "utf8");
  const r = await fetch(HUB, { headers: { "user-agent": "apex-draft-roster/0.1 (fan project; reads course names and links only)" } });
  if (!r.ok) throw new Error(`hub: HTTP ${r.status}`);
  return r.text();
}

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "user-agent": "apex-draft-roster/0.1 (fan project; reads course names and links only)" } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

/** The Booster Course Pass's cups: its courses tagged "Tour" are layouts first made for Mario Kart Tour (the pass's other courses are on the hub page already). */
export function parseBooster(html: string, seen: Set<string>): Draft[] {
  const out: Draft[] = [];
  for (const row of html.split("<tr>").slice(1)) {
    const th = row.match(/<th[\s\S]*?<\/th>/)?.[0];
    if (!th || !/Cup/.test(strip(th))) continue;
    for (const m of row.matchAll(/<a href="([^"#?]+)" title="[^"]+"><small>Tour<\/small>\s*([^<]+)<\/a>/g)) {
      const href = decodeURIComponent(m[1]!);
      if (seen.has(href)) continue;
      seen.add(href);
      out.push({ id: slug(m[2]!), name: strip(m[2]!), game: "mk8", cup: strip(th), wikiUrl: `https://www.mariowiki.com${m[1]}`, href });
    }
  }
  return out;
}

export function parseHub(html: string): Draft[] {
  const heads = [...html.matchAll(/<h[23][^>]*>[\s\S]*?<\/h[23]>/g)].map((m) => ({ at: m.index!, name: strip(m[0]).replace("[edit]", "").trim() }));
  const seen = new Set<string>(), out: Draft[] = [];
  const main = heads.findIndex((h) => h.name === "Main series race courses");
  for (const [gameName, game] of GAMES) {
    const k = heads.findIndex((h, i) => i > main && h.name === gameName);
    if (k < 0) throw new Error(`hub: no section for ${gameName}`);
    const section = html.slice(heads[k]!.at, heads[k + 1]?.at ?? html.length);
    for (const row of section.split("<tr>").slice(1)) {
      const th = row.match(/<th[\s\S]*?<\/th>/)?.[0];
      if (!th) continue;
      const cup = strip(th);
      if (!/\bCup\b|Special|Star/.test(cup)) continue;
      for (const td of row.match(/<td[\s\S]*?<\/td>/g) ?? []) {
        const link = [...td.matchAll(/<a href="([^"#?]+)" title="([^"]+)">([^<]+)<\/a>/g)].filter((m) => !m[1]!.startsWith("/File:")).at(-1);
        if (!link) continue;
        const href = decodeURIComponent(link[1]!);
        if (seen.has(href)) continue;
        seen.add(href);
        const name = strip(link[3]!);
        out.push({ id: "", name, game, cup, wikiUrl: `https://www.mariowiki.com${link[1]}`, href });
      }
    }
  }
  // an id is the course's name; a name that two layouts share gets the game in front of it
  const count = new Map<string, number>();
  for (const d of out) count.set(slug(d.name), (count.get(slug(d.name)) ?? 0) + 1);
  for (const d of out) d.id = count.get(slug(d.name))! > 1 ? `${d.game}-${slug(d.name)}` : slug(d.name);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const list = parseHub(await loadHub(process.argv[2]));
  list.push(...parseBooster(process.argv[3] && existsSync(process.argv[3]) ? readFileSync(process.argv[3], "utf8") : await fetchText(BOOSTER), new Set(list.map((d) => d.href))));
  const per = new Map<string, number>();
  for (const d of list) per.set(d.game, (per.get(d.game) ?? 0) + 1);
  console.log(`${list.length} courses`, Object.fromEntries(per));
  writeFileSync(new URL("./hub.json", import.meta.url), JSON.stringify(list, null, 1) + "\n");
}
