# Changelog

## 0.1.0-alpha.1
- Races up to 50 laps, run in blocks: you edit your line every N laps (recommended: a fifth of the race, at least 1) and
  the cars drive the laps in between by themselves. Fuel range and tyre life stretch with the race, so a few stops are
  enough for a long one.
- Pit strategy is queued ahead: up to 5 stops, one per lap, only on laps still to come and never the last lap. Adding a
  stop is a lap and a tyre, picked from big tyre icons (soft red, medium yellow, wet blue). Plan it from the map or while
  editing a segment; stops already behind you are locked.
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
