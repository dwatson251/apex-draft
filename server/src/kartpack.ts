/** Set by `define` in build.mjs: true only in a server built with APEX_KART_PACK=1. */
declare const __KART_PACK__: boolean;

/**
 * Install the kart fan pack (fan approximations of the Mario Kart courses, docs/KART_CREDITS.md) when the server was built to include it. Both the
 * server and each worker call it before building any track. Without it the course names are ordinary phrases. The tests install the pack themselves.
 */
export async function maybeInstallKartPack(): Promise<void> {
  if (__KART_PACK__) (await import("../../packages/sim/src/kartpack.ts")).installKartPack();
}
