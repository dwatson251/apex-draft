// Pixi's default shader setup needs eval, which the CSP forbids; this build avoids it.
import "pixi.js/unsafe-eval";
import { Application } from "pixi.js";
import { Game } from "./game.ts";
import { WorldView } from "./world.ts";

const app = new Application();
await app.init({ resizeTo: document.getElementById("stage")!, background: 0x12151c, antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1 });
document.getElementById("stage")!.appendChild(app.canvas);
const game = new Game(app, new WorldView(app), document.getElementById("ui")!);
await game.start();
(window as unknown as { __game: Game }).__game = game;

// Dev only: ?demo[&t=seconds][&zoom=0] drops straight into a race for screenshots. Compiled out of release builds.
if (import.meta.env.DEV) {
  const q = new URLSearchParams(location.search);
  if (q.has("draw")) game.demoDraw(Number(q.get("draw")), q.has("amend"));
  else if (q.has("demo")) game.demo({ atSeconds: Number(q.get("t") ?? 12), zoomed: q.get("zoom") !== "0", phrase: q.get("phrase") ?? undefined });
}
