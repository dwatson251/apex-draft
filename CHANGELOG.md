# Changelog

## 0.1.0-alpha.5
- **Racing line editor on forks.** Editing a segment where the road splits now lets you drag its end node onto the other exit and it
  snaps there (it already did while drawing a lap); the rest of the lap is re-drawn along the new road. On small screens the editor
  buttons, and Menu, become icons stacked at the top right (spaced apart on phones), and the hint sits just above whatever the
  buttons wrap to. Menu is the same size and type as the editor buttons.
- **Pit strategy.** The starting tyre is the first entry of the queue (medium by default); the separate starting-tyre section is
  gone. The five-place limit is a queue limit: stops already made no longer show or count, and share links carry a plan for a whole
  50-lap race. Buttons: a tyre for pit strategy, a chequered flag for Race, a line-and-nodes icon for Edit.
- **HUD.** The top-left box is gone from editing (it only appears if something is wrong). The forecast is three tiles (start,
  middle, end: sun or rain), and one pill beside the track's other pills on the race setup screen. Fuel and tyres are tall
  bubble gauges during the race, with no numbers. Time trial and practice show the best lap in its own box with the last three laps
  under it. The setup screen's Random button becomes Load Track when the typed phrase differs from the current track.
- The player's car is now exactly the same model as everyone else's, marked by a soft circle round the whole vehicle.
- **New distance anchor, fitted to real laps.** A unit is now 1.1 m (a 100-unit segment is about 110 m), measured against the real
  lengths of seven circuits, and a sim second is shown as about 1.64 s. Level-10 cars on a clean line now lap the real circuits in
  the real time (F1 at Silverstone about 1:24, touring cars at Donington GP about 1:33). Races look about 3.6 times faster on screen.
  Accelerations are scaled to the real g, with one `PACE` of 1.35 and a small calibration per racing class. Tyre wear is recalibrated again.
- **New car models from real cars, seen from above:** F1 car, rally (Subaru WRC), muscle (each car is a Dodge Viper GT or a Ford
  Mustang GT, a mix), Ariel Nomad-style buggy, a racing kart with its driver (helmet, shoulders, arms, gloves, legs), pickup truck (F-150 Raptor, with its wheelbase and overhangs), Abrams tank (tracks, skirts, wedge turret, long
  gun), superbike, kart, Class 1 buggy, electric GT (Taycan) and Top Fuel dragster. Sizes follow the real ratios. The boats follow their real types too: a sit-down personal watercraft (Sea-Doo RXP-X), an offshore
  deep-V powerboat with quad outboards, a racing hovercraft with a caged pusher fan, and a flat-hulled airboat with a caged aero engine.
- **Splits on fun tracks.** The cell where the road splits and the one where it comes together are pieces of their own (`fork`, `merge`),
  painted with chevrons, and the sand and grandstands are never laid over another road. While drawing, the other exit at a fork shows as
  a faint diamond (tap it, or drag the end onto it), and the view takes in both. A shortcut is now a real decision: it is compared with
  the ring road it replaces (`estimateTime`), squeezed with bottlenecks until it is not simply quicker, and dropped if it is far slower
  (or, unless it avoids a crossing, far quicker). A fun layout with no shortcut is only used if no other layout has one.
- **Racing classes.** Four new cars with real figures (level 10 = the real class), top-down drawings, engine voices and sequential
  gearboxes: touring car (BTCC/TCR, 160 mph, 1.5 g), prototype (LMP2/DPi, 205 mph, 3 g), GT3 (190 mph, 1.9 g) and GT4 (155 mph,
  1.4 g). They join the random pool, and real circuits now race their best-known class: Donington Park touring cars, Daytona
  and Le Mans prototypes, Spa and Laguna Seca GT3, Lago Maggiore and Willow Springs GT4, Silverstone, Monza, Barcelona and
  Monaco the formula (F1) car. The Oval and the Demolition Derby keep the random pool. Their drawings follow real cars from above
  (BMW 330i, an Audi R18-style prototype, Porsche 911 GT3 R, Mazda 6) in true proportion and with real wheelbases.
- **Real-world vehicle tuning.** Level 10 of each stat is now the real machine: top speed, 0-60 launch, peak lateral g and
  braking g (a formula car at 10 is 230 mph and about 4 g in a corner, a tank 45 mph and 0.13 g off the line). Every vehicle also
  has a peak slip angle (formula 4°, rally 18°, hovercraft 40°); cars now slide to it at the limit of grip, as boats already did.
  Free-track segments are 100 units, a quarter of a mile like a grid piece. Tyre wear is recalibrated so tyre life stays at about
  5/10/15 laps.
- **Fun tracks.** A phrase that starts with `fun-` gets crossings (the road runs over itself), pinches and wide arenas, and
  shortcuts. Random keeps the `fun-` prefix. A shortcut leaves the ring at a junction cell with two exits: drag the end node of the
  segment onto the other exit and the rest of that route is drawn. Bots pick the quicker way most of the time. Cars are ranked by
  where they are round the ring, so a shortcut and the long way compare fairly. Share links are version 5 (they carry the route),
  line files version 2; older ones still open.
- **Open water**, only on fun tracks, with four boats (jet ski, speedboat, hovercraft, airboat). Boats carry more speed into
  corners than a car could and slide: a slip angle builds quickly on entry and dies away slowly, carrying the hull wide and
  scrubbing speed. The hull points into the turn, with a wake and spray.
- Eight new vehicles: superbike, dune buggy (loses little to sand, snow or moondust), electric GT (single-speed whine, tiny running
  cost) and dragster (standing-start launch, poor grip and brakes), plus the four boats. Each has a drawing, an engine voice and
  a gearbox.
- Road width can vary on fun tracks (`half` per centre point): bottlenecks slow everyone, arenas give room to pass.
- Tyres and fuel: a wet tyre lasts about 15 laps on a soaked track (soft about 5, medium about 10); a full tank lasts about 11 laps.
- **Finish track for me** in the pause menu while a lap is being drawn: keeps the sound segments you have drawn, repairs any that
  leave the road, and draws the rest.
- Random tracks have far fewer corners: long straights, fast sweepers, hairpins, tight 90s, kinks and esses. A chicane is now
  two cells, one swing each way, and no longer as tight.
- Bots draw a smooth line (least curvature, with a slow wander for skill instead of jitter) and are closer in pace.
- **Real circuits from a map.** The hidden circuits are now the real shapes, taken from OpenStreetMap (`docs/CIRCUIT_CREDITS.md`) and
  no longer loops of cells: `spa-francorchamps`, `monza`, `silverstone`, `circuit-de-barcelona`, `laguna-seca`, `monaco`, `le-mans`,
  `daytona` (the road course), `donington-park` (the National), `donington-park-gp` and `willow-springs`. Laps are 3 to 6 thousand
  units (a hundred-odd units to a segment) instead of 2 to 3 thousand, and each is within a few metres of the real line (the old
  hand-fitted ones were 50 to 190 m out). The `oval`, `lago-maggiore` and the new `demolition-derby` (a `cross` piece: two
  crossroads) are still on the grid. `npm run circuits` rebuilds the data (`tools/circuits`).
- Drawing: while drawing a lap, the segments you have not reached yet show faintly instead of not at all, and the view can be dragged a
  little (up to about half a segment) with the middle button, or space and drag, or two fingers; it eases to a stop at the limit.

## 0.1.0-alpha.4
- Android: an installable debug APK (`apex-draft-<version>-debug.apk`) is attached to each release, built with Capacitor. It
  runs in landscape, full screen, and sharing a line opens the Android share sheet.
- Touch controls: tap to place a point; hold a point to delete it; a **Tap: add / insert / delete** button replaces
  right-click and Shift-click; pinch to zoom and two fingers to pan the map. Points are easier to grab with a finger.
- Phone-sized layout: bigger tap targets (48px), safe-area insets, the Menu button at the top-left and a single-row action
  bar, smaller headings and panels on short screens, no blur effects on touch devices, and touch wording ("Tap", "Pinch").
- Pauses (menu opens, sound suspends) when the app goes to the background; the Android Back button steps out of menus.
- Cars that take the flag keep driving round their line at half speed (as ghosts, so they never block anyone still racing)
  instead of stopping on the line. The race ends five seconds after the last car finishes.
- The mouse wheel zooms while you watch the race: in on the car up to 6x, out to nearly the whole track (0.8x). It is kept
  from one stretch of racing to the next.

## 0.1.0-alpha.2
- Time trial, practice and qualifying: the results (and Edit line) come up the moment your last timed lap is done, in a side
  panel. The cool-down lap carries on in the background and is dropped if you edit or go again.
- Pit lane: cars no longer queue to get in. Each car that pulls in takes its own bay (four are marked, the first nearest the
  line) and is serviced at once; the queue is on the way out, first in first out, with a short gap between releases.
- Tyres last longer at 1x wear: about 5 laps for softs and 10 for mediums, and 10 for wets on a wet track (about half that on a
  dry one). Long races still stretch tyre life as before.
- A new main menu: six big buttons (Solo Time Trial, Quick Race, Race Weekend, Tutorial, Settings, and Quit on the desktop
  build only), with a translucent "bubble" look and hand-built dropdowns, steppers, switches and tyre chips. The track phrase
  box has a copy button inside it; the Copy link button is gone (the address still follows your setup, so old links open).
  The obstacles checkbox and the starting-tyre picker are gone from the menus (obstacles are off everywhere).
- Solo Time Trial: no rivals, no wear, soft tyres. An out lap, one timed lap and a cool-down lap; the best timed lap is stored
  against the track phrase.
- Quick Race: today's race, with fuel-use and tyre-wear multipliers (1x to 40x) and tyres you must run (each one missed adds a
  pit-stop penalty). Your grid place comes from your Time Trial time on that track; with no time you start last.
- Race Weekend: Practice (no wear, everyone else spread round the track, ends when you say or after 10 minutes of laps; edit
  your line between runs), Qualifier (out lap, three timed laps, cool-down; the best counts) and the Race from the qualifying grid.
- Your drawn line carries over from mode to mode on the same track and is not cleared.
- Tutorial: a guided run on the oval with tooltips for drawing, locking in segments, queuing a pit stop and editing in the pits.
- Settings screen: sound, music, the controls, and a reset for the tutorial.
- Sim: `Entrant.gridSlot`, `gridTime` and `startFrac`, `RaceRules.wearMult` and `mandatory`, `CarResult.missing`, and a pure
  `session` module (session laps and times, the weekend state machine, grids from times).
- Fix: the results screen's Menu button was invisible (its id clashed with the menu layer's).
- Three more hidden circuits: `le-mans` (Circuit de la Sarthe, squashed to fit: Tertre Rouge, the Mulsanne straight and
  both chicanes, Arnage, the Porsche curves), `lago-maggiore` (Autodrome Lago Maggiore, full course) and a richer
  `daytona` (tri-oval kink, Turn 1, infield esses, chicanes, the banking as a wide arc). Each uses a bigger grid than a
  random track. Their shapes are approximations from limited descriptions, not maps.
- A new piece, `esses` (a flowing double S), joins kink, chicane, sweeper and uturn in the random pool.
- Grids up to 32 cars (you and 31 rivals), in two staggered columns, ordered by fastest lap: each car's best possible lap, and
  for you the quicker of that and the fastest lap you have set on this track. The standings list scrolls and keeps your row
  in view. Share links now carry up to 31 rivals (older links still open).
- Power-ups are switched off for now (`POWERUPS_ENABLED` in the sim): no pickups appear and nothing else about a track changes.
- Hidden circuits: type `donington-park`, `daytona`, `willow-springs` or `oval` as the track phrase and you get that
  circuit, drawn on the grid as a simplified copy (the right corners in the right order and direction, not a survey).
  Each fixes its own setting (Willow Springs is in the desert); weather and the machines still come from the phrase.
  They are not listed anywhere in the game.
- Four new pieces of road, now part of the random pool: `kink` (a gentle bow), `chicane` (a quick S), `sweeper` (a long
  fast bend that replaces a tight corner between two straights) and `uturn` (a wide 180 replacing corner, straight,
  corner). They come from their own random stream, so a phrase keeps its cells, its pit lane and most of its road; a few
  corners are now wider, so a line saved in an old share link may not fit one of those segments.

## 0.1.0-alpha.1
- Races up to 50 laps. You can change your line only while your car is in the pits: the race runs until your next
  planned stop (or an emergency refuel) and stops there, and you may redraw up to 3 segments before you go back out. With
  no stops queued you cannot edit once the race has started. Fuel range and tyre life stretch with the race, so a few stops are
  enough for a long one.
- Pit strategy is queued ahead: up to 5 stops, one per lap, only on laps still to come and never the last lap. Adding a
  stop is a lap and a tyre, picked from big tyre icons (soft red, medium yellow, wet blue). Plan it from the map or while
  editing a segment; stops already behind you are locked. Stops are also your only chances to edit, so they matter twice.
- Three tyres: soft (most dry grip, wears fastest), medium (the default), wet (worse in the dry and wears fast there,
  but it is the only tyre that works on a soaked track, where it also lasts longest).
- Weather comes from the seed: the same phrase and lap count always rain at the same moments (none on the Moon, rarely in
  the desert). Each piece of road has its own wetness. Rain wets it, it dries slowly, and the lines the cars drive dry
  it much faster: that becomes the dry line. In the rain the same worn line is polished and slippery, so wets want the
  quiet wet line. Slicks on a soaked road have almost no grip and may spin. You see rain, a darkened and glossy wet
  road and the paler dry line; the numbers stay hidden.
- With weather on, the menu and the picker give a vague forecast: rain at the beginning, in the middle or near the end of
  the race. Never which lap, how hard or for how long.
- Bots read the road: they pit for wets or slicks when the road changes, and redraw their lines at each edit stop,
  leaning toward the grip their tyre wants.
- Drafting, in every mode: tucked in close behind another car, in its lane and going the same way, a car gets a slightly
  higher top speed (up to +8%, only where it is at top speed, not in a bend) and quicker acceleration (up to +30%). It is
  worth more the closer the gap and the faster the follower is going.
- Realism covers tyre wear, fuel, pit stops, the choice of tyre and the weather: switch it off and none of them apply, and
  there are no pit stops, so no edits once the race starts. It is off by default for now.
- Collisions have consequences instead of being forbidden: a nudge from behind slows the car behind and speeds up the one
  in front (which can then miss its braking point and run wide), side by side both get kicked apart equally, and a T-bone
  throws the struck car sideways and costs both a lot of speed while the striker keeps its line. Knocked cars come back
  to their line. There are sparks and a thump.
- The side panels are gone: big colour buttons at the bottom centre with text on hover, a hint line above them, and a
  slim info card at the top left.
- First playable build: seeded tracks, line drawing, car AI, rivals, amend rounds, power-ups, garage.
- Edit anything you have drawn: drag points, the square where a segment starts and the diamond where it ends (they
  slide along the road edge and bring the neighbouring segment with them, start line included). Right-click deletes,
  Shift+click inserts. Amending opens a segment's existing points.
- Cars no longer run into each other: they look ahead for cars on their path (including lines that merge or cross),
  follow at a safe gap, give way by race position, and a ghost only turns solid once nobody is inside it.
- Camera: eases in on your car during a lap and back out when you finish. In the overview you can zoom (wheel) and pan
  (drag). When editing, it fills the screen with the segment and glides to the next one.
- A retro look for the course, with skid marks, a bobbing crowd, kerbs, apex paint, a pit lane and garages.
- Tyres and fuel: tyres wear (grip fades lap by lap), the tank runs down. Pit lane beside the start straight: slow lane,
  a box to stop in, fresh tyres and a full tank. Finish without ever stopping and you pay a penalty; run dry and the car
  limps to the pits for a slow emergency refuel (no new tyres) and carries on. Bots stop on their own when they need to. Turn it all off with Realism.
- Vehicle classes picked by the phrase: go-karts, formula cars, rally cars, muscle cars, trucks, tanks, each with its own
  dynamics, fuel use, tyre wear, look and engine sound.
- Places picked by the phrase: countryside, desert, snow and ice, city streets, the Moon. Each has its own scenery and
  surface (grip, braking, acceleration, tyre wear, fuel).
- Scenery that does not always turn up: lakes across several tiles, mountains, fields, a village, wind turbines, boats,
  a railway loop with a train, and an airport with one aeroplane at a time. Snow falls in the snow.
- Sound: engine hum and tyre squeal for every car, a quiet backing track, crowd cheers as you cross the line, wheel guns in
  your pit box, the race director on the radio when you are let go, aeroplane engines.
- Options: Realism (tyres and fuel) and Obstacles can be switched off.
- The address holds the track, settings and the segments you have drawn, and is updated on Start and every completed
  segment. Reloading brings it all back, even a half-drawn lap, but never a lap or a time: the race always starts afresh.
- The title shows the track for the typed phrase behind the menu, blurred, with bots going round. A Menu button (and Esc)
  is always there, over the game, and changing the seed when you have drawn something asks before it throws it away.
- Big, bright menu buttons.
