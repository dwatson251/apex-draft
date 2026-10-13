# Design notes

## Layout
- `packages/sim`: the whole game as pure, deterministic TypeScript. No DOM, no Node. Same phrase + same lines + same cars
  gives the same race (`Race.hash()`).
- `src/renderer`: Pixi draws the track, lines and cars (`world.ts`); `game.ts` is the state machine and the DOM panels.
- `src/main`, `src/preload`: Electron. Sandboxed renderer, CSP, a tiny IPC surface (saves, line files).

## Rules in the sim
- **Tracks** (`track.ts`): a simple cycle of grid cells grown from a 2×2 loop by pushing edges outward, so every cell has
  exactly two road neighbours: no dead ends, no crossings, always back to the start. 14–22 cells on a 7×5 grid. Each cell
  is a segment: straight, bendy, corner or sharp. Boxes and water always leave room to pass on one side.
- **Lines** (`line.ts`): per lap, a start point on the start line and per-segment waypoints. The last waypoint of a
  segment is where the next begins; the last segment ends back on the start point, so a lap is a closed loop. Waypoints
  are joined with a centripetal Catmull-Rom spline. A line is valid when every sample stays on the road and clear of
  obstacles.
- **Car** (`profile.ts`, `car.ts`): speed at each point is capped by top speed and `sqrt(grip / curvature)`, then braking
  is propagated backwards so the car slows in time.
- **Race** (`race.ts`): 60 Hz. A car looking at another car ahead in its lane keeps to a speed from which it can stop
  within a safe gap. Different lines overtake; the same line queues. Ghosted cars ignore and are ignored.
- **Grid order**: by the ideal lap time of each car's first line.
- **Amending**: joins stay fixed, so redrawing a segment never breaks the loop. Up to 3 segments may differ from the line
  just raced.

## Not yet
- Online uploads of times and lines (line files are the stand-in).
- Code signing and auto-update.
- Sound, and proper art.
