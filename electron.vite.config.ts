import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { resolve } from "node:path";

const alias = { "@apex/sim": resolve(__dirname, "packages/sim/src/index.ts") };

export default defineConfig(({ command }) => ({
  main: { plugins: [externalizeDepsPlugin()], resolve: { alias } },
  preload: { plugins: [externalizeDepsPlugin()], resolve: { alias } },
  renderer: {
    // the kart fan pack: in dev, or in a build that asks for it (see src/renderer/main.ts)
    define: { __KART_PACK__: JSON.stringify(command === "serve" || process.env.VITE_KART_PACK === "1") },
    root: "src/renderer",
    resolve: { alias },
    // Not Vite's default 5173, which ftl-arena uses.
    server: { port: 5190, strictPort: true },
    // Pixi is awaited at the top level, so the target must be ES2022, and Pixi sits in its own chunk
    // (otherwise the entry and Pixi's renderer chunks wait on each other).
    build: {
      target: "es2022",
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
        output: { manualChunks: (id) => (id.includes("node_modules/pixi.js") ? "pixi" : undefined) },
      },
    },
  },
}));
