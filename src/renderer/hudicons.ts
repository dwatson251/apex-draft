/** Small inline icons and infographics for the buttons, the forecast and the fuel and tyre bubbles. Inline SVG, so they look the
 *  same on every machine (emoji fonts differ, and some have no tyre or flag at all). */

const svg = (body: string, size = 24, vb = 24): string => `<svg viewBox="0 0 ${vb} ${vb}" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** A tyre seen from the side: tread, sidewall and a wheel. */
export const TYRE_ICON = svg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22M5 5l2.5 2.5M16.5 16.5L19 19M19 5l-2.5 2.5M7.5 16.5L5 19"/>');
/** A chequered flag on a pole. */
export const FLAG_ICON = svg('<path d="M5 22V3"/><path d="M5 4h14v10H5z" fill="currentColor" fill-opacity="0.15"/><path d="M5 4h14v10H5zM9.5 4v10M14 4v10M5 7.3h14M5 10.6h14" stroke-width="1.4"/><path d="M5 4h4.5v3.3H5zM14 4h5v3.3h-5zM9.5 7.3H14v3.3H9.5zM5 10.6h4.5V14H5zM14 10.6h5V14h-5z" fill="currentColor" stroke="none"/>');
/** A line with its nodes: editing the racing line. */
export const EDIT_ICON = svg('<path d="M3 19C7 19 6 6 11 6s3 12 8 12" stroke-dasharray="0.1 3.2"/><path d="M4 18C8 18 7 7 11 7s3 11 8 11"/><rect x="2" y="16.5" width="4" height="4" rx="1" fill="currentColor"/><rect x="9" y="4.5" width="4" height="4" rx="1" fill="currentColor"/><rect x="18" y="15.5" width="4" height="4" rx="1" fill="currentColor"/>');
export const FUEL_ICON = svg('<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h14M6.5 7h6"/><path d="M15 9l3 2.5V17a1.5 1.5 0 0 0 3 0V8l-3-3"/>', 20);
export const TYRE_SMALL = svg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>', 20);

/** Sunshine, or a dark cloud with rain, as a tile. */
function weatherTile(rain: boolean, px: number, active: boolean, label: string): string {
  const art = rain
    ? `<svg viewBox="0 0 64 64" width="${px * 0.82}" height="${px * 0.82}" aria-hidden="true"><path d="M18 40a11 11 0 0 1 1-22 14 14 0 0 1 26 4 9 9 0 0 1 1 18z" fill="#5d6678" stroke="#2d3342" stroke-width="2.5" stroke-linejoin="round"/><path d="M24 46l-3 8M34 46l-3 8M44 46l-3 8" stroke="#6fb4ff" stroke-width="3.5" stroke-linecap="round"/></svg>`
    : `<svg viewBox="0 0 64 64" width="${px * 0.82}" height="${px * 0.82}" aria-hidden="true"><circle cx="32" cy="32" r="12" fill="#ffd23f" stroke="#e8a400" stroke-width="2.5"/><path d="M32 8v8M32 48v8M8 32h8M48 32h8M15 15l5.5 5.5M43.5 43.5L49 49M49 15l-5.5 5.5M20.5 43.5L15 49" stroke="#ffb300" stroke-width="3.5" stroke-linecap="round"/></svg>`;
  return `<div class="wtile ${rain ? "rain" : "sun"}${active ? " now" : ""}" style="width:${px}px;height:${px}px" title="${label}" role="img" aria-label="${label}">${art}</div>`;
}

/** The forecast as one pill (the style of the track's other pills): start, middle and end as small icons, no boxes. */
export function weatherPill(rain: [boolean, boolean, boolean], px = 20): string {
  const names = ["start", "middle", "end"];
  const icon = (r: boolean, i: number) => r
    ? `<svg viewBox="0 0 64 64" width="${px}" height="${px}" role="img" aria-label="${names[i]}: rain"><title>Rain at the ${names[i]} of the race</title><path d="M18 40a11 11 0 0 1 1-22 14 14 0 0 1 26 4 9 9 0 0 1 1 18z" fill="#9aa4bd" stroke="#6b7390" stroke-width="2.5" stroke-linejoin="round"/><path d="M24 46l-3 8M34 46l-3 8M44 46l-3 8" stroke="#6fb4ff" stroke-width="4" stroke-linecap="round"/></svg>`
    : `<svg viewBox="0 0 64 64" width="${px}" height="${px}" role="img" aria-label="${names[i]}: dry"><title>Dry at the ${names[i]} of the race</title><circle cx="32" cy="32" r="12" fill="#ffd23f" stroke="#e8a400" stroke-width="2.5"/><path d="M32 8v8M32 48v8M8 32h8M48 32h8M15 15l5.5 5.5M43.5 43.5L49 49M49 15l-5.5 5.5M20.5 43.5L15 49" stroke="#ffb300" stroke-width="4" stroke-linecap="round"/></svg>`;
  return `<span class="chip chip-wx" aria-label="Forecast">${rain.map(icon).join("")}</span>`;
}

/** The forecast as three tiles: the start, the middle and the end of the race. `now` outlines the one being run. */
export function weatherGrid(rain: [boolean, boolean, boolean], px = 75, now = -1): string {
  const names = ["Start of the race", "Middle of the race", "End of the race"];
  return `<div class="wgrid" style="gap:${Math.max(4, Math.round(px / 10))}px">${rain.map((r, i) => weatherTile(r, px, i === now, `${names[i]}: ${r ? "rain" : "dry"}`)).join("")}</div>`;
}

/** A tall pill that fills from the bottom, with an icon on top: no numbers. */
export function bubble(id: string, icon: string, frac: number, color: string, low: boolean): string {
  const pct = Math.max(0, Math.min(1, frac));
  return `<div class="bubble-bar${low ? " low" : ""}" id="${id}" style="--fill:${(pct * 100).toFixed(1)}%;--col:${color}"><div class="bb-tube"><i></i></div><div class="bb-ic">${icon}</div></div>`;
}
