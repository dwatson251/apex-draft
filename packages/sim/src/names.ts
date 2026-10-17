/** Display names for online play: one sanitiser, shared by the game and the server so both agree on what a name is. */

export const NAME_MAX = 20;

/** Control characters, soft hyphen, zero-width and bidi marks, line and paragraph separators, the BOM and interlinear marks. */
const RANGES: [number, number][] = [[0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0x2066, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xfffb]];
const hidden = (ch: string): boolean => { const c = ch.codePointAt(0)!; return RANGES.some(([a, b]) => c >= a && c <= b); };

/** A name the way it will be shown: normalised, no hidden characters, single spaces, at most NAME_MAX characters. "" if nothing is left. */
export function sanitiseName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = [...raw.normalize("NFKC")].filter((ch) => !hidden(ch)).join("").replace(/\s+/g, " ").trim();
  return [...s].slice(0, NAME_MAX).join("").trim();
}

/** The name given to a player who has not chosen one, from the first characters of their id. */
export const defaultName = (id: string): string => `Driver-${id.replace(/[^a-z0-9]/gi, "").slice(0, 4).toLowerCase() || "0000"}`;
