/**
 * Line art for the menu tiles: one drawing for each, in a 200 x 200 box, stroked in the current colour so a tile can tint and fade it.
 * They are drawings and not pictures so that the menu needs no image files.
 */
const svg = (body: string): string => `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const FLAG = '<path d="M50 175V30"/><path d="M50 34h100v70H50"/><path d="M50 34h25v23H50zM100 34h25v23h-25zM75 57h25v23H75zM125 57h25v23h-25zM50 80h25v24H50zM100 80h25v24h-25z" stroke-width="3"/>';
const WATCH = '<circle cx="100" cy="112" r="62"/><path d="M100 112V72M100 112l28 18M86 34h28M100 34v16"/><path d="M148 62l12-12" />';

export const TILE_ART: Record<string, string> = {
  race: svg('<path d="M20 150c40-10 60-40 100-40s50 20 60 30"/><path d="M20 120c40-10 60-40 100-40s50 20 60 30" opacity=".5"/><path d="M60 62l30-12 40 6 24 18-24 12-52-4z"/><circle cx="82" cy="90" r="9"/><circle cx="142" cy="86" r="9"/>'),
  attack: svg(WATCH),
  challenges: svg('<circle cx="100" cy="100" r="68"/><circle cx="100" cy="100" r="42"/><circle cx="100" cy="100" r="16"/><path d="M100 100l62-62M150 30l12 8 8 12"/>'),
  garage: svg('<path d="M40 150l60-60M120 50a30 30 0 0 1 36 36l-20-4-12-12-4-20z"/><path d="M52 162l-14-14 22-22 14 14z"/><circle cx="148" cy="148" r="22"/><circle cx="148" cy="148" r="8"/>'),
  tutorial: svg('<path d="M30 60l70-22 70 22v82l-70-22-70 22z"/><path d="M100 38v82"/><path d="M52 78l34 8M52 100l34 8M148 78l-34 8M148 100l-34 8" stroke-width="3"/>'),
  settings: svg('<path d="M30 60h140M30 100h140M30 140h140"/><circle cx="70" cy="60" r="14" fill="currentColor" fill-opacity=".25"/><circle cx="130" cy="100" r="14" fill="currentColor" fill-opacity=".25"/><circle cx="90" cy="140" r="14" fill="currentColor" fill-opacity=".25"/>'),
  // a play button over a line being drawn: straight into a race
  play: svg('<path d="M24 160c30-6 44-34 70-40s46 10 82-6" stroke-dasharray="10 12"/><circle cx="100" cy="86" r="56"/><path d="M84 58v56l46-28z" fill="currentColor"/>'),
  // a ladder with a trophy at the top
  career: svg('<path d="M62 180V60M138 180V60M62 160h76M62 130h76M62 100h76M62 70h76"/><path d="M84 22h32v14c0 10-7 17-16 17s-16-7-16-17z"/><path d="M100 53v7"/>'),
  // a folded map with a pin
  atlas: svg('<path d="M30 50l45-18 50 18 45-18v118l-45 18-50-18-45 18z"/><path d="M75 32v118M125 50v118"/><circle cx="100" cy="92" r="14"/><path d="M100 106v22"/>'),
  quick: svg(FLAG),
  weekend: svg('<rect x="30" y="50" width="140" height="110" rx="6"/><path d="M30 82h140M62 34v28M138 34v28"/><path d="M52 104h22M89 104h22M126 104h22M52 130h22M89 130h22" stroke-width="4"/>'),
  champ: svg('<path d="M70 40h60v40a30 30 0 0 1-60 0z"/><path d="M70 52H44c0 28 10 40 28 44M130 52h26c0 28-10 40-28 44"/><path d="M100 110v32M72 162h56M84 142h32"/>'),
  trial: svg(WATCH),
  // a flag in a hole on a green, and the line that got there
  golf: svg('<path d="M30 150c40-30 80-10 108-30" stroke-dasharray="9 11"/><ellipse cx="140" cy="150" rx="38" ry="10"/><path d="M140 150V42"/><path d="M140 44l40 14-40 14z" fill="currentColor"/>'),
  daily: svg('<circle cx="100" cy="100" r="30"/><path d="M100 36v18M100 146v18M36 100h18M146 100h18M55 55l13 13M132 132l13 13M145 55l-13 13M68 132l-13 13"/>'),
  // a gauge with the needle a little further round for each difficulty
  easy: svg('<path d="M30 140a70 70 0 0 1 140 0"/><path d="M100 140L62 104" stroke-width="7"/><path d="M40 140h14M146 140h14M100 62v14M54 90l10 10M146 90l-10 10" stroke-width="3"/><circle cx="100" cy="140" r="8"/>'),
  medium: svg('<path d="M30 140a70 70 0 0 1 140 0"/><path d="M100 140L100 80" stroke-width="7"/><path d="M40 140h14M146 140h14M100 62v14M54 90l10 10M146 90l-10 10" stroke-width="3"/><circle cx="100" cy="140" r="8"/>'),
  hard: svg('<path d="M30 140a70 70 0 0 1 140 0"/><path d="M100 140L140 100" stroke-width="7"/><path d="M40 140h14M146 140h14M100 62v14M54 90l10 10M146 90l-10 10" stroke-width="3"/><circle cx="100" cy="140" r="8"/><path d="M128 120l22-22" stroke-width="3" opacity=".5"/>'),
  quit: svg('<path d="M80 40H40v120h40M110 70l30 30-30 30M140 100H70"/>'),
};

export interface TileSpec { id: string; art: keyof typeof TILE_ART; colour: string; title: string; sub: string; size?: "xl" | "w2" }

/** One tile: a large rectangle with its drawing behind a title and a line of text. It fills with its colour on hover, focus and press. */
export const tile = (t: TileSpec, esc: (s: string) => string): string =>
  `<button class="tile${t.size ? ` ${t.size}` : ""}" id="${t.id}" style="--c:${t.colour}"><span class="art">${TILE_ART[t.art]}</span><b>${esc(t.title)}</b><span class="sub">${esc(t.sub)}</span></button>`;
