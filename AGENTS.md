# Apex Draft

TypeScript + PixiJS + Electron racing-line game. See `README.md` and `docs/DESIGN.md`.

- `packages/sim` is pure and deterministic: no DOM, no Node, no `Math.random` (use `Rng`). Import with `@apex/sim`.
  The alias lives in `tsconfig.json`, `vitest.config.ts`, `electron.vite.config.ts` and `vite.web.config.ts`.
- Relative imports carry the `.ts` extension.
- Check before committing: `npm run typecheck` and `npx vitest run`.
- Releases are tag-driven (`vX.Y.Z-alpha.N`); the notes come from the matching `CHANGELOG.md` section.
- Commits are one imperative sentence on `main`, as `dnlwtsn <dwatson251@gmail.com>`.
- The Electron app needs system libraries (`libnss3` and friends) to start; `npm run dev:web` runs the renderer in a browser.
