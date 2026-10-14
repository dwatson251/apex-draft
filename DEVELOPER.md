# Developing Apex Draft

Everything for people working on the game. If you only want to play it, the [README](README.md) is what you want.

- [Quick start](#quick-start)
- [Scripts](#scripts)
- [Project layout](#project-layout)
- [Code design](#code-design)
- [Testing](#testing)
- [Looking at the UI](#looking-at-the-ui)
- [Building installers](#building-installers)
- [Releasing](#releasing)
- [Conventions](#conventions)
- [Recipes](#recipes)

## Quick start

You need **Node 22 or newer** and npm.

```sh
npm install
npm run dev:web    # the renderer in a browser, with hot reload: the fastest loop
npm run dev        # the real Electron app, with hot reload
npm test           # unit tests
npm run typecheck
```

`npm run dev:web` serves the renderer at <http://localhost:5199/>. Saves go to `localStorage` instead of Electron's
user data folder. Add `?demo` to jump straight into a race (more dev URLs [below](#looking-at-the-ui)).

Electron needs a few system libraries to start. On a bare Linux box or WSL that means `libnss3` and friends, and without
them `npm run dev` fails. Use `npm run dev:web` there.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | `electron-vite dev`: Electron with hot reload for the renderer |
| `npm run dev:web` | Vite with `vite.web.config.ts`: only the renderer, in any browser, on port 5199 |
| `npm run build` | `electron-vite build`: compiles main, preload and renderer into `out/` |
| `npm run typecheck` | `tsc --noEmit` over the sim package, `src/`, `tests/` and the config files |
| `npm test` | `vitest run` over `tests/**/*.test.ts` |
| `npm run dist` | `build`, then `electron-builder`: installers for **this** OS into `release/` |
| `npm run dist:dir` | The same, but an unpacked app in `release/`, for a quick look without making an installer |

## Project layout

```
packages/sim/src   The game as pure, deterministic TypeScript (imported as @apex/sim)
src/renderer       Pixi drawing, the state machine and the DOM menus (runs in a browser or in Electron)
src/main           Electron main process: window, CSP, saves, line-file dialogs
src/preload        The small, typed bridge the renderer uses to reach main
tests              Vitest tests for the sim (and the share link and the sessions)
tools/e2e          A Playwright script that drives the real UI over Chrome DevTools
docs/DESIGN.md     The rules of the simulation, in prose
build/             electron-builder's buildResources folder
.github/workflows  ci.yml (typecheck + tests) and release.yml (tag to installers to GitHub release)
```

## Code design

### The big idea: the sim is the system of record

`packages/sim` is the whole game, with no DOM, no Node and no `Math.random`. All randomness comes from `Rng`, a
mulberry32 generator whose state is one `u32`. Given the same phrase, the same lines and the same cars, a race plays out
identically every time, which is what lets a share link carry a track and not a race. `Race.hash()` gives a fingerprint
of a race for tests that check it.

The renderer never decides anything about the race. It runs the sim to get a **recorded race** (positions, speeds,
headings and events over time), then plays that recording back with Pixi, and derives the skid marks and the sound from
it. This is why editing is only allowed in the pits: `Race.runToStop` runs the sim until the player's stop begins, the
renderer plays that stretch back and shows the picker, and `Game.resumeRace` sets the new line for every later lap and
carries on.

```
phrase ──► generateTrack ──► Track (segments, biome, vehicle, weather seed)
                                 │
   player draws / bots drive ──► Line (start point + waypoints per segment)
                                 │
                       buildProfile ──► Profile (speed at every sample, braking propagated backwards)
                                 │
                            Race (60 Hz) ──► recorded race ──► renderer playback
```

### `packages/sim`

| Module | Responsibility |
| --- | --- |
| `seed.ts`, `rng.ts` | Phrase to seed (`normalizePhrase`, FNV-1a hash), `randomPhrase`, and the seeded `Rng` |
| `track.ts`, `pieces.ts`, `circuits.ts` | `generateTrack` grows a cycle of grid cells (14 to 22 cells on 7×5). `enrich` swaps in kinks, chicanes, esses, sweepers and U-turns from a *separate* random stream. Circuits are hand-fitted loops reached by a hidden phrase |
| `line.ts`, `lineFile.ts` | A racing line: a start point plus waypoints per segment, joined with a centripetal Catmull-Rom spline, and its validity check. `lineFile` is the file format for sharing lines |
| `profile.ts`, `car.ts` | Turns a line and a car into a speed profile: capped by top speed and `sqrt(grip / curvature)`, with braking propagated backwards so the car slows in time |
| `race.ts` | The 60 Hz deterministic race: traffic, drafting, fuel, tyres, pit stops, penalties |
| `impact.ts` | Collision response: an impulse shared by mass, and a sideways offset that a spring pulls back |
| `tyres.ts`, `weather.ts`, `trackwet.ts` | Compounds and grip curves, the shower schedule and the forecast, and the per-bin wet field that dries along the driven line |
| `pit.ts`, `pitpath.ts` | The pit lane geometry, bays and speed limit, and the open-ended laps that go in and out of it |
| `bots.ts` | The AI: a line for each rival and their strategy decisions (`Race.replanBots` redraws at each edit stop) |
| `vehicles.ts`, `biomes.ts` | Tables of multipliers picked from the seed |
| `session.ts` | Pure session logic: trial, practice, qualifying and race laps, times, the weekend state machine, grids from times |
| `share.ts` | The URL hash: phrase, settings, car and the drawn segments as base64url. Nothing about a race |

Rules worth knowing before you change anything (the long version is in [docs/DESIGN.md](docs/DESIGN.md)):

- **Traffic.** A car checks the next stretch of its own path for another car that is on it now or will be on arrival.
  It follows a car clearly ahead at `SAFE_GAP`, gives way to a car alongside or crossing if that car is further round the
  race (a strict order, so two cars never wait for each other), and ignores cars behind. As a last resort the car with
  less right of way stops if two would end a tick closer than `HARD_GAP`. Cars can still touch (see `impact.ts`), and
  `tests/sim.test.ts` checks that nobody deadlocks, everyone finishes and no overlap lasts.
- **Lap-start state.** Grip and fuel weight are fixed when a lap starts, so wear shows up lap by lap, and the profile for
  a lap takes its per-sample grip from the wet field at that moment (`ProfileOpts.gripAt`).
- **Open laps.** A lap that pits ends in the lane and the next starts there, so its end does not join its start. Lookups on
  those laps clamp instead of wrapping.
- **Amending.** Joins between segments stay fixed, so redrawing a segment never breaks the loop. Up to three segments may
  differ from the line just raced.
- **Scaling.** Fuel and tyre constants scale with the race length (`raceScale`), so five stops cover fifty laps.
- **Search radius.** Arcs can spill over a cell edge, so anything that looks a point up (`nearbySegments`, the wet field)
  searches the nine cells around it.
- **Track-affecting settings are part of the seed.** The phrase and obstacles must go through `Game.changeSeed` while a
  drawing exists, which asks the player first.

### `src/renderer`

| File | Responsibility |
| --- | --- |
| `main.ts` | Entry point, and the dev-only URL hooks (compiled out of release builds) |
| `game.ts` | The state machine (menus, flows, sessions, drawing, racing) and the DOM panels. By far the biggest file |
| `world.ts` | The Pixi scene and the camera (overview, focus on a segment, follow a car), the skid-mark `RenderTexture` and the cars |
| `trackart.ts` | Builds each segment once: tarmac, kerbs from the turning angle, apex arrows, gravel, stands, obstacles |
| `scenery.ts`, `look.ts`, `sky.ts` | Country scenery from the seed (rail, airport, lakes, mountains, village, turbines, boats), the paint for each biome, and clouds, birds and weather effects |
| `cars.ts`, `audio.ts` | Car sprites, and Web Audio only: two oscillators through a low-pass for the engine hum and band-passed noise for the squeal |
| `bar.ts`, `menus/` | The bottom button bar and the hand-built menu screens and controls (dropdowns, steppers, switches, tyre chips) |
| `store.ts` | Persistence: Electron through the preload bridge when present, `localStorage` in a plain browser |

Notes:

- Hills and trees stay hidden while a lap is being drawn, because the empty cells would show where the road goes.
- The menu is an overlay (`#menu`) so it can sit over a live game. `game.ts` pauses the race while it is open.
- The title screen is a live, blurred track with bots going round.

### `src/main` and `src/preload`

The renderer is sandboxed (`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`) and runs under a strict
CSP. The IPC surface is deliberately tiny, and each handler checks that the sender is the app itself (`trusted`):

- `store:get` / `store:set`: only `settings`, `cars` and `best` are valid keys, and they are written as plain files in the
  user data folder (override it with `APEX_DRAFT_DATA`).
- `lines:export` / `lines:import`: the line file dialogs.
- `app:version`, `app:quit`.

New windows are denied, only `https://` links are opened externally, and navigation away from the app is blocked.

## Testing

```sh
npm run typecheck
npx vitest run
```

CI runs exactly those two. The unit tests cover the sim, since it is pure and fast to test:

| File | What it checks |
| --- | --- |
| `sim.test.ts` | Seeds, 1000 closed-loop tracks, bot lines, determinism, and that traffic never deadlocks |
| `collision.test.ts` | Impact rules on hand-built geometry, then inside a race |
| `draft.test.ts` | The slipstream |
| `grid.test.ts` | The staggered 32-car grid and its order |
| `pit.test.ts`, `pitlane.test.ts`, `tyrelife.test.ts` | Pit stops, the lane and bays, tyre life and wear |
| `weather.test.ts` | Showers, the forecast and the drying field |
| `circuits.test.ts` | Each hidden circuit: named by its phrase, a closed loop, smooth headings, a clear pit lane, a full grid that gets home |
| `session.test.ts`, `flow.test.ts` | The session and weekend rules and the flows between them |
| `share.test.ts` | Round-tripping a share link |

Keep new rules in the sim and test them there, not in the renderer.

## Looking at the UI

The unit tests do not cover the interface, so `tools/e2e/ui.cjs` drives the real UI over Chrome DevTools and makes
screenshots. It is not part of `npm test`, because it needs a browser and a running dev server.

1. `npm run dev:web`
2. Start Chrome with a debugging port:

   ```sh
   chrome --headless=new --remote-debugging-port=9333 --use-angle=swiftshader --enable-unsafe-swiftshader
   ```

   In WSL, run the *Windows* `chrome.exe` (Chrome and Electron cannot start in a bare WSL without `libnss3`) and
   `localhost` reaches it.
3. `PLAYWRIGHT=/path/to/node_modules/playwright node tools/e2e/ui.cjs`
   Playwright is not a dependency of the project, so point `PLAYWRIGHT` at an install elsewhere. Set `SHOTS=<dir>` to keep
   the screenshots, `APEX_URL` and `CDP` to change the addresses.

Dev-only URLs (they are compiled out of release builds):

| URL | Opens |
| --- | --- |
| `?demo` | A race straight away on a bot line. Add `&t=14` to park the camera 14 seconds in, `&zoom=0` for the overview, `&phrase=...` for a track |
| `?draw=N` | The drawing screen, with the first N segments already drawn |
| `?draw=N&amend` | The same, in the amend flow |
| `?t=1` | The title screen with the track visible behind it (the number is only a seed for the backdrop) |

`window.__game` and `window.__sim` are available in the console in dev. After a segment change, wait about 3.5 seconds
before dragging, because the camera is still gliding. Navigating to a URL that only changes the hash needs a reload.

## Building installers

```sh
npm run dist
```

`electron-vite build` writes `out/`, then `electron-builder` (configured in `electron-builder.yml`) packages it. It only
builds for the OS it runs on, so build all three in CI (below).

| OS | Targets |
| --- | --- |
| Windows | NSIS installer (not one-click, so the user can pick the folder) and a zip |
| Linux | AppImage and tar.gz |
| macOS | dmg and zip |

Files are named `Apex Draft-<version>-<os>-<arch>.<ext>`, and everything lands in `release/`. Builds are **unsigned**:
there is no code signing or auto-update yet, so Windows SmartScreen and macOS Gatekeeper will warn.

## Releasing

Releases are driven by tags.

1. Add a `## X.Y.Z-alpha.N` section to `CHANGELOG.md`, replacing or following `## Unreleased`, and commit it.
2. Tag and push:

   ```sh
   git tag -a vX.Y.Z-alpha.N -m "..." && git push origin main vX.Y.Z-alpha.N
   ```

The **Release** workflow then:

1. runs the typecheck and tests;
2. builds on Windows, Linux and macOS runners, setting the app version to the tag without its `v`;
3. publishes a GitHub release called `Apex Draft <tag>`, which is a **pre-release** if the tag contains `alpha`, `beta` or
   `rc`, with the matching `CHANGELOG.md` section as the notes (it falls back to `Apex Draft <version>` if there is none).

## Conventions

- TypeScript, strict. Relative imports carry the `.ts` extension.
- `packages/sim` stays pure: no DOM, no Node, no `Math.random` (use `Rng`). Import it as `@apex/sim`. The alias is declared
  in `tsconfig.json`, `vitest.config.ts`, `electron.vite.config.ts` and `vite.web.config.ts`, so add a new alias to all four.
- Before committing: `npm run typecheck` and `npx vitest run`.
- Commits are one imperative sentence on `main`.
- Agents working in this repo should also read [AGENTS.md](AGENTS.md).

## Recipes

**Add a hidden circuit.** Add a `Spec` in `packages/sim/src/circuits.ts`: a `route` string (one letter per move, `E S W N`,
which must close or `build` throws), a `from` cell, `kinds` for the cells that are not a plain corner or straight, optional
`windows` for U-turn and sweeper arcs, a biome, and `aliases` for other things people might type. `circuits.test.ts` runs its checks over every circuit automatically. Shapes are fitted by eye to the real layouts, and no map data is shipped.

**Add a piece of road.** Add it to `packages/sim/src/pieces.ts`, then to `enrich` in `track.ts` so it is in the random pool,
and give it art in `trackart.ts`. A shape that leaves the cell must keep the heading continuous at both gates.

**Add a vehicle or a place.** Both are plain tables (`vehicles.ts`, `biomes.ts`) of multipliers with a selection `weight`.
A biome also needs paint in `look.ts` and scenery rules in `scenery.ts`.

**Change anything that changes a race.** Races are deterministic from the phrase, lines and cars, so a rules change shifts
every existing race. That is fine, since no race is stored, but a change to what a share link *contains* needs a new link
version in `share.ts` that still reads the old ones (version 4 is current, and 1 to 3 still open).

**Not done yet.** Online upload of times and lines (line files stand in), code signing and auto-update, and proper art.
