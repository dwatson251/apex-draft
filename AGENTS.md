# Apex Draft

TypeScript + PixiJS + Electron racing-line game. See `README.md` and `docs/DESIGN.md`.

- `packages/sim` is pure and deterministic: no DOM, no Node, no `Math.random` (use `Rng`). Import with `@apex/sim`.
  The alias lives in `tsconfig.json`, `vitest.config.ts`, `electron.vite.config.ts` and `vite.web.config.ts`.
- Relative imports carry the `.ts` extension.
- Check before committing: `npm run typecheck` and `npx vitest run`.
- Android is a Capacitor wrapper (`android/`, `npm run android:apk`, needs JDK 21 + Android SDK; CI builds it). Touch UI: `tools/e2e/ui-touch.cjs`.
- Releases are tag-driven (`vX.Y.Z-alpha.N`); the notes come from the matching `CHANGELOG.md` section.
- Commits are one imperative sentence on `main`, as `dnlwtsn <dwatson251@gmail.com>`.
- The Electron app needs system libraries (`libnss3` and friends) to start; `npm run dev:web` runs the renderer in a browser.
- Track-affecting settings (the phrase, obstacles) are part of the seed. Anything that changes them while a drawing exists
  must go through `Game.changeSeed`, which asks first.
- To look at the UI from WSL, run `npm run dev:web` and drive Windows Chrome over CDP: start it with
  `chrome.exe --headless=new --remote-debugging-port=9333 --use-angle=swiftshader --enable-unsafe-swiftshader`, then run
  `PLAYWRIGHT=/path/to/playwright node tools/e2e/ui.cjs`. Dev URLs: `?demo`, `?draw=N`, `?draw=N&amend`; `window.__game` and
  `window.__sim` exist in dev.
