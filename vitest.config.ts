import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@apex/sim": fileURLToPath(new URL("./packages/sim/src/index.ts", import.meta.url)) } },
  // the tests cover the kart fan pack too, so it is installed for every test file (tests/setup.ts)
  test: { include: ["tests/**/*.test.ts"], setupFiles: ["tests/setup.ts"] },
});
