# Design notes

## Layout
- `packages/sim`: the whole game as pure, deterministic TypeScript. No DOM, no Node. Same phrase + same lines + same cars
  gives the same race (`Race.hash()`).
- `src/renderer`: Pixi draws the track, lines and cars (`world.ts`); `game.ts` is the state machine and the DOM panels.
- `src/main`, `src/preload`: Electron. Sandboxed renderer, CSP, a tiny IPC surface (saves, line files).

## Rules in the sim
- **Tracks** (`track.ts`): a simple cycle of grid cells grown from a ring round the edge of a block of cells, by pushing edges
  outward (nine pushes in ten the one that adds the fewest corners), so the road runs in long stretches and corners are the
  exception: no dead ends, no crossings, always back to the start. 14–22 cells on a 7×5 grid. Each cell
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
A segment still fills one cell, but it can be one of ten shapes: `straight`, `bendy`, `kink`, `esses`, `chicaneA`, `chicaneB`, `corner`, `sharp`,
`sweeper` and `uturn` (and `cross`, below) (`packages/sim/src/pieces.ts`). The straight-cell shapes have a sideways offset that is zero,
with zero slope, at both gates. A chicane is two cells: `chicaneA` swings out and back across the first, `chicaneB` swings the other way across the second, and they are always laid one after the other. `sweeper` and `uturn` are three-cell windows: an exact circular arc (radius 150, or 100) cut
into three equal parts, with the outer gates where they were and the two inner gates on the arc, so heading is continuous
everywhere. The parts can spill a little over the cell edge, so anything that looks a point up (`nearbySegments`, the wet
field) searches the nine cells around.

`generateTrack` lays the cells out exactly as before, then `enrich` swaps in the new pieces from a separate random
stream (seed xor a constant): about 35% of eligible windows, never touching the two start straights, and a swap is undone
if it brings the road closer to other road than two cars need (`2 * ROAD_HALF + 4`). Circuits (`circuits.ts`) are routes
(one letter per move) plus a kind for the interesting cells and the windows to lay; the phrase is matched after
`normalizePhrase`. They reuse the same builder, fix the setting, and the pit lane goes on the infield side. The shapes are
hand-fitted by eye (the oval, Lago Maggiore and the Demolition Derby; the real circuits are mapped, below). A `"chicane"` in a circuit's `kinds` becomes a pair of cells (the one named
and the one after it, or before it, whichever is a plain straight), and esses where neither fits.

`cross` is a straight cell that two parts of the lap pass through at right angles (`demolition-derby` only; `enrich` never lays it).
A cell then holds two segments: `Track.cellSegments` lists them, `cellIndex` keeps the first, and `nearbySegments` returns both.
The cars get across with the ordinary traffic rules (the car further round the race has right of way); the renderer paints
yellow hatching in the junction. `checkTrack` allows a cell to be used twice only by two `cross` pieces going different ways.

## Mapped circuits
The real circuits (Spa, Monza, Silverstone, Barcelona, Laguna Seca, Monaco, Le Mans, Daytona's road course, Donington and Willow
Springs) are not cell loops. Each is a line of points (`circuitData.ts`, made by `tools/circuits`, see below), and `freetrack.ts` turns it
into a `Track` with `free: true`:
- the points are run through a closed uniform cubic B-spline, and the line is cut into segments of about `SEGMENT_LENGTH` (120) units
  starting at the start line, each between two gates square to the road (so the pit lane, the line drawing, the bots and the wet field
  work exactly as before; a segment's `cx`/`cy` is only the cell of its middle);
- a segment's kind comes from how far it turns (straight, kink, sweeper, corner, sharp); the two beside the start line are straights;
- a segment is found from every cell its road touches (`touchedCells`), so `nearbySegments` still works with the nine-cell search;
- `cols` and `rows` come from the bounds, and the pit lane goes on the side of the start straight with no road beside it;
- `checkTrack` skips the checks about cells touching and being used once (and the even number of cells).

`tools/circuits` makes the data, offline, from OpenStreetMap: `sources.ts` says where each circuit is (a bounding box and either a
circuit relation, or a way on the lap, or a closed way); `fetch.ts` downloads the ways from the Overpass API; `build.ts` finds the lap
(a loop through the mapped ways, joining small gaps and choosing the one nearest the real length), turns it into metres, scales it
(`scale` units a metre; the laps are 3 to 6 thousand units), picks the straightest stretch near the real start line for the start,
makes the road dead straight there, and then bends the line the least that makes a road the cars can use. `process.ts` does that last step:
each point's turn is limited to that of a bend of radius 36 (the excess is spread along the road, so a hairpin gets wider), the loop is
rebuilt from its turns and fitted back toward where it was with a few slow waves of heading and kept closed, and parts of the road that
are not near each other along it are pushed at least 60 units apart. It prints how close the result is to the real shape. Run
`npm run circuits:fetch` once and `npm run circuits` to rebuild `circuitData.ts`.

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

## Real-world scale

`packages/sim/src/scale.ts` says what the sim's units mean; `src/renderer/scale.ts` re-exports it.

- **Distance.** A unit is **1.1 m**, so a 100-unit segment (a straight piece, or a piece of a real circuit) is about 110 m. This came
  from measuring the circuits: the game's Silverstone, Monza, Daytona, Barcelona, Donington (both layouts), Laguna Seca and Willow
  Springs come out at 1.05 to 1.13 m per unit against their real lengths. (Spa, Monaco, Lago Maggiore and Le Mans do not fit;
  Le Mans is squeezed to a third.) The old anchor of 0.25 mi per segment made the circuits 3.6 times too long, so no car could lap
  in a real time.
- **Time.** Every sim second is shown as `WORLD_TIME` (about 1.64) seconds, which keeps speeds real (150 units/s is 225 mph).
  Accelerations follow from the real g: `G` is one g in units/s² (about 24). Races play back at 1x on that clock.
- **Vehicles.** Multipliers (`vehicles.ts`) make **level 10 the real machine**: `top` is mph / 225 and `accel`, `grip` and `brake`
  are launch, lateral and braking g, with the real figures in the comment above `VEHICLES`. `PACE` (1.35, in `car.ts`) lifts
  accel, grip and braking together, and six classes carry a small extra calibration (formula 0.96, GT3 0.98, prototype 0.93,
  GT4 1.08, touring 1.06, superbike 1.12), all fitted to real lap times (below). Top speed is left exact.

### Lap-time calibration

A level-10 car on the best line (bot skill 1, no realism) against real pole or record laps, per class:

| Class | Real laps used | Game / real |
|---|---|---|
| F1 | Silverstone 1:24.3, Monza 1:18.8, Monaco 1:10.3, Barcelona 1:15.4 | 1.00 |
| GT3 | Spa 2:14, Daytona 1:44.4, Laguna Seca 1:19.7, Donington GP 1:24.5 | 1.00 |
| Prototype | Daytona 1:32.7, Laguna Seca 1:12.4 | 1.00 |
| GT4 | Big Willow 1:23.0, Laguna Seca 1:34.5, Donington GP 1:34.4 | 1.00 |
| Touring | Donington GP 1:33.2, Donington National 1:09.1 | 1.00 |
| Superbike | Donington GP 1:24.6 | 1.00 |

Before `PACE` and the per-class factors the same laps were 3% to 23% slow. The classes not in the table (kart, rally, muscle,
truck, tank, buggy, electric, dragster, boats) get `PACE` and no extra factor, so they sit on the same anchor. `tests/scale.test.ts`
keeps five of these laps within 10%.

## Splits (`fun-` tracks)
`makeBranches` lays up to two shortcuts. The cell where the ring road is left (`fork`) holds two segments that share an entry gate, the
ring's straight and the first corner of the shortcut, and the cell where it is rejoined (`merge`) two that share an exit gate; both
pairs are drawn with chevrons. A shortcut is kept only if it is a choice: `estimateTime` (`routetime.ts`: each point at the speed its bend
allows, braking and accelerating into it, a bottleneck taking a little off) puts it between 0.74 and 1.2 times the time of the ring
road it replaces (down to 0.62 if the ring road goes through a crossing, which the shortcut avoids). A shortcut that is too quick is
squeezed with bottlenecks until it is not; one still too quick, or too slow, is dropped. `generateTrack` tries layouts until one has
a shortcut. In the draw screen the exit of the other way on is a handle (`alt`), and `trackart` leaves out any sand or grandstand
that would lie on another road.

