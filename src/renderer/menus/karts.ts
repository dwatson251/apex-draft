import { KART_DATA, KART_ROSTER, type KartRow } from "@apex/sim";
import { esc } from "./controls.ts";

/** The Kart Tracks browser as HTML: the games, the cups of a game, and the courses of a cup with a small drawing of each lap. Pure functions of plain data. */

/** A colour for each game's tiles. */
export const KART_GAME_COLOUR: Record<string, string> = {
  smk: "#c9534b", mk64: "#e0a21f", mksc: "#7a5cf0", mkdd: "#2fbf71", mkds: "#1fa5d8", mkwii: "#e0409a", mk7: "#f2b705", mk8: "#ff6a2b",
};

/** The games that have at least one course built, in release order, with how many courses each has. */
export function kartGames(): { game: string; title: string; courses: number }[] {
  const out: { game: string; title: string; courses: number }[] = [];
  for (const r of KART_ROSTER) {
    if (!KART_DATA[r.id]) continue;
    const g = out.find((x) => x.game === r.game);
    if (g) g.courses++; else out.push({ game: r.game, title: r.gameTitle, courses: 1 });
  }
  return out;
}

/** The cups of a game, in order, with their courses. */
export function kartCups(game: string): { cup: string; rows: KartRow[] }[] {
  const out: { cup: string; rows: KartRow[] }[] = [];
  for (const r of KART_ROSTER) {
    if (r.game !== game || !KART_DATA[r.id]) continue;
    const c = out.find((x) => x.cup === r.cup);
    if (c) c.rows.push(r); else out.push({ cup: r.cup, rows: [r] });
  }
  return out;
}

/** The lap as a small drawing: the loop scaled into a 100 x 100 box, the start line a dot. */
export function lapThumb(id: string): string {
  const d = KART_DATA[id];
  if (!d) return "";
  const p = d.points, xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < p.length; i += 2) { xs.push(p[i]!); ys.push(p[i + 1]!); }
  const x0 = Math.min(...xs), y0 = Math.min(...ys), k = 88 / Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0, 1);
  const ox = (100 - (Math.max(...xs) - x0) * k) / 2, oy = (100 - (Math.max(...ys) - y0) * k) / 2;
  const pts = xs.map((x, i) => `${(ox + (x - x0) * k).toFixed(1)},${(oy + (ys[i]! - y0) * k).toFixed(1)}`);
  return `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="${pts.join(" ")}"/><circle cx="${pts[0]!.split(",")[0]}" cy="${pts[0]!.split(",")[1]}" r="5" fill="currentColor" stroke="none"/></svg>`;
}

const head = (title: string, sub: string): string => `<header class="tilehead"><button class="back" id="back">← Back</button><div><h2>${esc(title)}</h2><p class="dim">${esc(sub)}</p></div></header>`;
const DISCLAIMER = '<p class="dim kartnote">Fan approximations of the layouts, drawn by hand. Not affiliated with or endorsed by Nintendo.</p>';

export function kartGamesHtml(): string {
  const games = kartGames();
  return `${head("Kart Tracks", `${games.reduce((a, g) => a + g.courses, 0)} courses from ${games.length} games`)}<div class="tilegrid kart games">${games.map((g) =>
    `<button class="tile" id="kg-${g.game}" style="--c:${KART_GAME_COLOUR[g.game] ?? "#888"}"><span class="art">${lapThumb(KART_ROSTER.find((r) => r.game === g.game && KART_DATA[r.id])!.id)}</span><b>${esc(g.title)}</b><span class="sub">${g.courses} courses</span></button>`).join("")}</div>${DISCLAIMER}`;
}

export function kartCupsHtml(game: string): string {
  const cups = kartCups(game), title = KART_ROSTER.find((r) => r.game === game)?.gameTitle ?? game;
  return `${head(title, "Pick a cup")}<div class="tilegrid kart cups">${cups.map((c, i) =>
    `<button class="tile" id="kc-${i}" style="--c:${KART_GAME_COLOUR[game] ?? "#888"}"><span class="art">${lapThumb(c.rows[0]!.id)}</span><b>${esc(c.cup)}</b><span class="sub">${c.rows.map((r) => esc(r.name)).join(" · ")}</span></button>`).join("")}</div>`;
}

export function kartCoursesHtml(game: string, cupIndex: number, stars: (id: string) => number): string {
  const cup = kartCups(game)[cupIndex];
  if (!cup) return "";
  return `${head(cup.cup, KART_ROSTER.find((r) => r.game === game)?.gameTitle ?? "")}<div class="tilegrid kart courses">${cup.rows.map((r) =>
    `<button class="tile" id="kr-${r.id}" style="--c:${KART_GAME_COLOUR[game] ?? "#888"}"><span class="art">${lapThumb(r.id)}</span><i class="tstars">${"★".repeat(stars(r.id))}${"☆".repeat(3 - stars(r.id))}</i><b>${esc(r.name)}</b><span class="sub">${esc(r.theme)} · ${r.laps} laps</span></button>`).join("")}</div>`;
}
