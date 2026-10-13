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
- **Race** (`race.ts`): 60 Hz, deterministic. Each car checks the next stretch of its own path for another car that is
  on it now or will be when it arrives (that is how merging and crossing lines are caught).
  - A car clearly ahead and going the same way is followed at `SAFE_GAP`.
  - A car alongside or crossing is given way to if it is further round the race. That is a strict order, so two cars
    can never each wait for the other.
  - A car behind is its own driver's problem.
  - As a last resort, if two cars would end a tick closer than `HARD_GAP`, the one with less right of way stops.
  - A test runs 15 tracks of 8 cars for 3 laps and asserts solid cars never get closer than `HARD_GAP`.
  - Ghost power-ups pass through everything, and only turn solid once nobody is inside (a lingering ghost drops back from
    a car ahead). The grid slides a car back if two slots would overlap.
- **Grid order**: by the ideal lap time of each car's first line.
- **Amending**: joins stay fixed, so redrawing a segment never breaks the loop. Up to 3 segments may differ from the line
  just raced.

## Renderer notes
- `trackart.ts` builds each segment once (tarmac, kerbs from the turning angle, apex arrows, gravel, stands,
  obstacles); `scenery.ts` builds the countryside. Hills and trees stay hidden while a lap is being drawn, because the
  empty cells would show where the road goes.
- `world.ts` owns the camera (eases to `FOLLOW_ZOOM` and back), the skid-mark texture (a `RenderTexture` the brush
  draws into) and the cars. `sky.ts` has a `Weather` object (`cover`, wind) for later weather effects.
- Skid marks and sound are derived from the recorded race (speed, heading change) in `game.ts`, not simulated.
- `audio.ts` is Web Audio only: two oscillators through a low-pass for the hum, band-passed noise for the squeal.
- Dev only: `?demo&t=14` races a bot line and parks the camera; `?draw=5` and `?draw=3&amend` open the drawing screens.

## Not yet
- Online uploads of times and lines (line files are the stand-in).
- Code signing and auto-update.
- Sound, and proper art.
