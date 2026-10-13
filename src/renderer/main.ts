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
