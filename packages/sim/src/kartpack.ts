import { installKartCourses } from "./circuits.ts";
import { KART_DATA } from "./kartdata.ts";
import { KART_ROSTER } from "./kartroster.ts";

/**
 * The kart fan pack: fan approximations of the Mario Kart courses (names in kartroster.ts, shapes in kartdata.ts). Not part of the game: it is not
 * exported from index.ts and a release build leaves it out. Dev builds and the tests install it; a build or a server that wants it says so
 * (`VITE_KART_PACK=1`, `APEX_KART_PACK=1`). See docs/KART_CREDITS.md.
 */
export function installKartPack(): void { installKartCourses(KART_ROSTER, KART_DATA); }

export { KART_DATA, KART_ROSTER };
