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

## Drafting
- `Race.draft(car)` is 0 to 1: how close the car is behind another one (within `DRAFT_RANGE`), in its lane (6.5 units across),
  going its way, times the square of its speed over 110. The boost is applied in `step`: `DRAFT_TOP` (8%) on the target
  speed where the car is at its top speed (never in a bend, so it cannot raise a corner limit) and `DRAFT_ACCEL` (30%) on
  acceleration. `RaceRules.draft = false` switches it off (tests only). The traffic logic still stops a follower closing
  inside the safe gap, so drafting helps it keep up and close in, and does not by itself pass cars.

## Collisions
- Cars still try not to touch (`trafficLimit`), and when they do, `impact.ts` decides what happens: an impulse along the
  line between the two centres, shared by mass (`vehicles.ts` has a mass per class). Each car also has a sideways offset
  from its line and a sideways speed; a spring pulls it back in about a second (`settle` in `race.ts`).
- Rear-end hits slow the rear car and speed the front one; side hits kick both apart equally; a T-bone sends the struck car
  sideways and costs both a lot of speed (the striker's impulse is along its own heading, so it keeps its line).
- A car carrying more speed than the bend allows (after being shoved into a braking zone) is pulled outward by the grip it
  lacks and runs wide. The same mechanism makes a slick-shod car spin in the wet.
- `tests/collision.test.ts` tests the rules on hand-built geometry, then inside a race.

## Tyres, weather and a drying track
- `tyres.ts`: soft, medium and wet compounds, `tyreGrip(compound, wet, use)` and `wearRate`. `weather.ts`: showers laid out
  in laps from the seed and lap count. `trackwet.ts`: a `WetField` of 6 x 8 bins per segment holding `wet` and `use`.
- Rain wets bins, they dry slowly, and each car that drives over a bin dries it and adds `use`. High `use` polishes the
  line in the wet (less grip) and rubbers it in when dry. The profile for each lap takes its per-sample grip from the field
  at lap start (`ProfileOpts.gripAt`).
- Fuel and tyre constants scale with the race length (`raceScale`) so five stops cover fifty laps.
- `Entrant.pitPlan` is the player's queue (max `MAX_PIT_STOPS`); bots decide from fuel, tyres and the road they see, and
  `Race.replanBots` redraws their lines at each edit stop.
- The race records a wet-field snapshot and the rain once a second for replay.

## Interface
- Editing only happens in the pits: `Race.runToStop` runs the race until the player's stop begins, `Game.runAndPlay`
  plays it back and then shows the picker (3 segment limit); `Game.resumeRace` sets the new line for every later lap, has
  the bots read the road again and carries on. Emergency refuels count as stops. The pit strategy panel (`renderPlan`) and
  `addStop` enforce the limits; the bottom bar is `bar.ts`.

## Tyres, fuel and the pits
- `pit.ts`: the pit lane runs beside the two straights either side of the start line (`track.pit`, with a seeded side).
  Every track is generated so that those two cells are plain straights.
- `profile.ts` / `pitpath.ts`: a lap that pits ends in the lane (`pitIn`) and the next one starts there (`pitOut`); the
  lane has a speed limit and one stopping box. Those laps are *open*: their end does not join their start, so lookups
  clamp instead of wrapping.
- `race.ts`: fuel burns with distance, tyres with distance and cornering load. Grip and weight are fixed at the start of
  each lap, so wear shows lap by lap. The player says which laps to pit in (`entrant.pit`); bots work it out and take
  turns. Never stopping adds `PIT_PENALTY`; running dry makes the car limp (slowly) to the box for an emergency refuel: a stop half as long again as a planned one, fuel only, then it carries on. Nothing retires a car any more.
- `forecast()` in `weather.ts` is all the player is told about the weather: the phases of the race (beginning, middle, end) in which a shower starts. Never a lap, an intensity or a length.
- A pair of cars that hold each other up for two seconds pass through each other until clear, and the old 20-second
  failsafe is still behind that.

## Pieces and circuits
A segment still fills one cell, but it can be one of eight shapes: `straight`, `bendy`, `kink`, `chicane`, `corner`, `sharp`,
`sweeper` and `uturn` (`packages/sim/src/pieces.ts`). The first four are straight cells with a sideways offset that is zero,
with zero slope, at both gates. `sweeper` and `uturn` are three-cell windows: an exact circular arc (radius 150, or 100) cut
into three equal parts, with the outer gates where they were and the two inner gates on the arc, so heading is continuous
everywhere. The parts can spill a little over the cell edge, so anything that looks a point up (`nearbySegments`, the wet
field) searches the nine cells around.

`generateTrack` lays the cells out exactly as before, then `enrich` swaps in the new pieces from a separate random
stream (seed xor a constant): about 35% of eligible windows, never touching the two start straights, and a swap is undone
if it brings the road closer to other road than two cars need (`2 * ROAD_HALF + 4`). Circuits (`circuits.ts`) are routes
(one letter per move) plus a kind for the interesting cells and the windows to lay; the phrase is matched after
`normalizePhrase`. They reuse the same builder, fix the setting, and the pit lane goes on the infield side. The shapes are
hand-fitted by eye to the real layouts; no map data is shipped.

## The grid
Up to 32 cars start in two staggered columns (`GRID_GAP` between rows, `GRID_SIDE` either side of the middle of the road): the pole
car on the line and each next car half a row back on the other side. Each car keeps its own racing line; the sideways shift
into its column is `gridOff`, which melts away over the first 100 or so units, and a car slides back until it is clear of
the ones already placed (columns bunch up on a bend). The order is the fastest lap: `min(ideal lap of the line, bestLap)`, where
`bestLap` is the player's fastest lap on this track under the same rules, stored by the game.

## Vehicles and places
- `vehicles.ts` and `biomes.ts` are tables of multipliers picked from the track's seed (`vehicleForSeed`, `biomeForSeed`).
  Vehicles scale the car's stats, fuel use and wear; biomes scale grip, braking, acceleration, wear and fuel for
  everyone. Layout is the same whichever biome it is.

## Share links
- `share.ts` encodes the phrase, settings, car and the drawn segments (start point plus delta-coded points, tenths of a
  unit) as base64url. Nothing about a race is in it. It is rewritten on Start and after each completed segment.

## Renderer notes
- `look.ts` is the paint for each biome; `scenery.ts` builds the countryside from the seed and decides what turns up
  (rail, airport, lakes, mountains, fields, village, turbines, boats). Animated things (train, plane, turbines, boats)
  are updated from `Scenery.update`.
- The camera has three modes (`world.ts`): overview (free zoom and pan), focus (fills the screen with a rectangle) and
  follow (a slow zoom in on a point).
- The menu is an overlay (`#menu`) so it can sit over a live game; `game.ts` pauses the race while it is open.
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
