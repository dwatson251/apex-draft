import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { resolve } from "node:path";

const alias = { "@apex/sim": resolve(__dirname, "packages/sim/src/index.ts") };

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], resolve: { alias } },
  preload: { plugins: [externalizeDepsPlugin()], resolve: { alias } },
  renderer: {
    root: "src/renderer",
    resolve: { alias },
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
});
