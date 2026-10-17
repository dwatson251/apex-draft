import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Draft } from "./hub.ts";

/**
 * hub.json (the course list) + the cached course pages -> roster.json: for each course its length in metres, laps, theme, the hazards its page mentions
 * and which map pictures it has. Pictures are NOT fetched here and none is kept; only names and numbers go into the roster.
 *   node --no-warnings tools/mariokart/roster.ts <cache dir>        (run links.ts first, it fills the cache)
 */
const [cache] = process.argv.slice(2);
if (!cache) throw new Error("usage: roster.ts <cache dir>");
const draft: Draft[] = JSON.parse(readFileSync(new URL("./hub.json", import.meta.url), "utf8"));

export const THEMES = ["meadow", "beach", "desert", "snow", "castle", "ghost", "rainbow", "jungle", "city", "mine", "volcano", "tech", "sweets", "retro", "sky", "water", "factory"] as const;
export type Theme = typeof THEMES[number];

/** First match wins. Original art per theme, chosen from the course's name and setting. */
const THEME_RULES: [RegExp, Theme][] = [
  [/rainbow/i, "rainbow"],
  [/ghost|boo |banshee|mansion|haunt|twisted|luigi's mansion|boo lake/i, "ghost"],
  [/bowser|castle|neo bowser|airship|thwomp|dry dry ruins|wario colosseum/i, "castle"],
  [/snow|frappe|sherbet|ice|rosalina|vanilla|merry mountain|frost/i, "snow"],
  [/desert|kalimari|dunes|sand|yoshi desert|sunset wilds|dry dry|wild west/i, "desert"],
  [/beach|cape|island|lagoon|shoals|cheep|coast|pier|harbor|cruiser|park pier|lakeside|water|big blue|dolphin|shipyard|riverside/i, "beach"],
  [/jungle|dino|dk |dk's|yoshi valley|yoshi falls|woods|treeway|summit|donut|garden|hills|meadow|moo moo|farm|sky garden|maple|wuhu|pass/i, "jungle"],
  [/volcano|grumble|lava/i, "volcano"],
  [/gold mine|mine|choco mountain|rock rock|mount wario|mountain|choco island/i, "mine"],
  [/city|turnpike|highway|subway|square|promenade|blur|minute|sprint|loop|byways|drift|rush|dash|laps|velocity|avanti|drive|speedway|toad harbor|airport|bridge|mushroom city|downtown|delfino|moonview/i, "city"],
  [/electro|excitebike|mute city|tech|neon|stadium|wario stadium|waluigi|pinball|baby park|colosseum|circuit special/i, "tech"],
  [/sweet|sundae|cheese|canyon|candy|ribbon/i, "sweets"],
  [/factory|clock|toad's factory/i, "factory"],
  [/cloud|sky|airship|cloudtop/i, "sky"],
];
const themeOf = (d: Draft): Theme => {
  if (d.game === "smk") return /ghost/i.test(d.name) ? "ghost" : /rainbow/i.test(d.name) ? "rainbow" : /bowser/i.test(d.name) ? "castle" : /lake|vanilla/i.test(d.name) ? "snow" : /beach/i.test(d.name) ? "beach" : "retro";
  return THEME_RULES.find(([re]) => re.test(d.name))?.[1] ?? "meadow";
};

const KEYWORDS: [RegExp, string][] = [
  [/glide|glider|hang glid/i, "glide"], [/anti-?gravity/i, "antigravity"], [/\bjump|\bramp|trick/i, "jump"], [/dash panel|boost pad|speed pad|dash plate/i, "boost"],
  [/\bice\b|icy|slippery|snow/i, "ice"], [/\bsand\b|quicksand/i, "sand"], [/\bmud\b|swamp|mire/i, "mud"], [/underwater|shallow water|\bwater\b/i, "water"],
  [/shortcut/i, "shortcut"], [/tunnel|cave/i, "tunnel"], [/cross(es|ing)? (over|under)|overpass|bridge|figure-8|figure eight/i, "crossing"], [/half-?pipe/i, "halfpipe"],
];

const text = (html: string): string => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#160;|&nbsp;/g, " ").replace(/\s+/g, " ");

const out = draft.map((d) => {
  const html = readFileSync(join(cache, "pages", `${d.id}.html`), "utf8");
  const body = html.slice(html.indexOf('id="mw-content-text"'));
  const t = text(body);
  const dist = t.match(/Distance\s+([\d,]+)\s*m\b/);
  // the page's own description of the layout: the "Layout" section, else the first part of the text (hazard keywords are counted over this only)
  const lay = body.match(/id="(?:Layout|Course_layout|Course_description|Description)"[\s\S]*?(?=<h2)/);
  const prose = lay ? text(lay[0]) : t.slice(0, 6000);
  const features = [...new Set(KEYWORDS.filter(([re]) => re.test(prose)).map(([, k]) => k))];
  const maps = [...new Set([...body.matchAll(/\/File:((?:SMK|MK64|MKSC|MKDD|MKDS|MKWii|MK7|MK8|MK8DX|MKT)[A-Za-z0-9_%'!-]*?(?:[Mm]ap|[Mm]inimap|Layout|Overview)[A-Za-z0-9_%'!.-]*)"/g)].map((m) => decodeURIComponent(m[1]!)))];
  return {
    id: d.id, name: d.name, game: d.game, cup: d.cup, wikiUrl: d.wikiUrl,
    lengthM: dist ? Number(dist[1]!.replace(/,/g, "")) : null,
    laps: d.game === "smk" ? 5 : 3,
    theme: themeOf(d),
    features, maps,
    confidence: maps.length ? "medium" : "low",
  };
});
writeFileSync(new URL("./roster.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(`${out.length} courses; ${out.filter((r) => r.lengthM === null).length} without a length, ${out.filter((r) => !r.maps.length).length} without a map picture`);
const themes = new Map<string, number>();
for (const r of out) themes.set(r.theme, (themes.get(r.theme) ?? 0) + 1);
console.log(Object.fromEntries(themes));
