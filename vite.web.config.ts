// Runs just the renderer in a normal browser (no Electron): `npm run dev:web`. Saves go to localStorage.
import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig(({ command }) => ({
  // the kart fan pack: in dev, or in a build that asks for it (see src/renderer/main.ts)
  define: { __KART_PACK__: JSON.stringify(command === "serve" || process.env.VITE_KART_PACK === "1") },
  root: "src/renderer",
  resolve: { alias: { "@apex/sim": resolve(__dirname, "packages/sim/src/index.ts") } },
  server: { port: 5199, strictPort: true },
  base: "./",
  // the Android (Capacitor) app packages this folder
  build: { target: "es2022", outDir: resolve(__dirname, "out/web"), emptyOutDir: true },
}));
