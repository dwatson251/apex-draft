// Runs just the renderer in a normal browser (no Electron): `npm run dev:web`. Saves go to localStorage.
import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "src/renderer",
  resolve: { alias: { "@apex/sim": resolve(__dirname, "packages/sim/src/index.ts") } },
  server: { port: 5199, strictPort: true },
  base: "./",
  // the Android (Capacitor) app packages this folder
  build: { target: "es2022", outDir: resolve(__dirname, "out/web"), emptyOutDir: true },
});
