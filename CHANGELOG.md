# Changelog

## 0.1.0-alpha.1
- First playable build: seeded tracks, line drawing, car AI, rivals, amend rounds, power-ups, garage.
- Every point you have drawn can be moved. Drag points, the square where a segment starts and the diamond where it
  ends (they slide along the road edge and bring the neighbouring segment with them, start line included). Right-click
  deletes a point, Shift+click inserts one. Amending a segment now opens its existing points instead of a blank slate.
- Cars no longer run into each other: they look ahead for cars on their path (including lines that merge or cross),
  follow at a safe gap, give way by race position, and a ghost only turns solid once nobody is inside it.
- The camera zooms slowly in on your car during a lap, follows it round, and zooms back out when you finish.
- A retro look for the course: tarmac with speckle and edge paint, red-and-white sausage kerbs, apex arrows, gravel
  traps, chequered start line and gantry, grandstands with a bobbing crowd, hills, trees, crates and puddles.
- Skid marks where cars slide in corners or brake hard.
- Sound: a soft engine hum that follows speed and throttle, and a soft tyre squeal in corners (M mutes).
- Clouds with shadows and passing flocks of birds while racing (the start of a weather system).
