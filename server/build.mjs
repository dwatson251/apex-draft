// Bundles the server and its worker (and the sim they run) into dist/. The sim is TypeScript with parameter properties, which Node's
// built-in type stripping rejects, so it is compiled here rather than run as source.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
await build({
  entryPoints: { server: "server/src/main.ts", worker: "server/src/worker.ts" },
  outdir: "server/dist", outExtension: { ".js": ".js" },
  bundle: true, platform: "node", format: "esm", target: "node24", sourcemap: true, logLevel: "info",
  alias: { "@apex/sim": `${root}packages/sim/src/index.ts` },
  absWorkingDir: root,
  // the kart fan pack is left out of the server unless it is built with APEX_KART_PACK=1 (see src/kartpack.ts)
  define: { __KART_PACK__: JSON.stringify(process.env.APEX_KART_PACK === "1") },
});
