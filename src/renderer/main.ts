import * as sim from "@apex/sim";
// Pixi's default shader setup needs eval, which the CSP forbids; this build avoids it.
import "pixi.js/unsafe-eval";
import { Application } from "pixi.js";
import { Game } from "./game.ts";
import { WorldView } from "./world.ts";
import { installNative } from "./platform.ts";

// The kart fan pack (fan approximations of the Mario Kart courses, docs/KART_CREDITS.md) is in dev builds only, unless a build asks for it with
// VITE_KART_PACK=1. A release leaves it out: the constant is false and the import goes with the dead branch.
if (__KART_PACK__) (await import("../../packages/sim/src/kartpack.ts")).installKartPack();

const app = new Application();
await app.init({ resizeTo: document.getElementById("stage")!, background: 0x12151c, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2) });
document.getElementById("stage")!.appendChild(app.canvas);
const game = new Game(app, new WorldView(app), document.getElementById("ui")!);
await installNative({ onBack: () => game.handleBack(), onVisibility: (v) => game.setVisible(v) });
await game.start();
(window as unknown as { __game: Game }).__game = game;

// Dev only: ?demo[&t=seconds][&zoom=0] drops straight into a race for screenshots. Compiled out of release builds.
if (import.meta.env.DEV) {
  (window as unknown as { __sim: unknown }).__sim = sim;
  const q = new URLSearchParams(location.search);
  if (q.has("draw")) game.demoDraw(Number(q.get("draw")), q.has("amend"));
  else if (q.has("demo")) game.demo({ atSeconds: Number(q.get("t") ?? 12), zoomed: q.get("zoom") !== "0", phrase: q.get("phrase") ?? undefined });
}
