# Changelog

## Unreleased
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
