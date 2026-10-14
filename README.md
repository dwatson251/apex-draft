# Apex Draft

A racing game where you never touch the wheel. You **draw the racing line**, one segment of the track at a time,
without seeing what comes next. Then your car has to drive it, braking for corners and holding the grip it has,
alongside up to seven rivals who each drove their own line.

> Alpha. Builds are unsigned, so Windows and macOS will warn you the first time you open one.

## Download

Installers for Windows, Linux (AppImage) and macOS are on the
[Releases page](https://github.com/dwatson251/apex-draft/releases).

## How it plays

- **Seeds.** A track comes from a memorable phrase such as `healthy-bear-eats-tuna`. Same phrase, same track, so
  sharing the phrase shares the track.
- **Draw a lap.** Each segment is shown on its own. Click to place points; your line leaves the segment where the yellow
  dot is, and the next segment starts from there. There is no limit on points. Boxes and water block a straight run, so
  steer round them.
- **Race.** The car follows your line with real limits: it brakes for tight bends (grip), accelerates (power) and tops
  out (top speed). Rivals on the same road slow down rather than collide, so the same line can give a different time
  against a different field.
- **Edit.** Every point can be dragged, including where a segment starts (square) and ends (diamond), which slide along
  the road edge. Right-click deletes a point, Shift+click inserts one between two others.
- **Amend.** After each lap, pick up to 3 segments on the map and edit them. Then the next lap runs. Moving a shared
  start or end node changes its neighbour too, and that counts toward the 3.
- **Watch.** The camera eases in on your car and follows it, then pulls back out when you finish. Cars leave skid marks,
  hum with their speed, and squeal in corners (`M` mutes). Clouds and birds pass overhead.
- **Power-ups.** Drive your line through a pickup for the rest of that segment: **B**oost (speed), **G**rip (cornering)
  or **H** ghost (pass through cars).
- **Long races and strategy.** Up to 50 laps. You can only change your line while you are in the pits (up to 3 segments
  per stop), so queue up to five pit stops in advance (a lap and a tyre: soft, medium or wet). The seed brings weather: rain wets the road unevenly, the lines
  cars drive dry it, and the dry line is where slicks want to be. You only get a vague forecast (rain at the beginning, middle or end of the race), never the lap or how long.
- **Drafting.** Follow close behind a car, in its lane, and you get a slipstream: a little more top speed and acceleration,
  more the closer you are and the faster you are going. It works in every mode.
- **Contact.** Cars can touch. A shunt from behind, a squeeze alongside and a T-bone each do what you would expect.
- **Tyres, fuel and pit stops.** Tyres wear, so grip fades; the tank runs down. Tick "Pit at the end of this lap" in the
  picker and your car drives itself into the pit lane beside the start straight, stops in its box and comes out on fresh
  tyres with a full tank. Never stopping adds a penalty. Run dry and the car limps to the pits for an emergency refuel (slow, no new tyres), then carries on. Switch it all off with Realism (tyre wear, fuel, pit stops, tyre choice and weather all go together). Realism is off by default for now.
- **Secrets.** A few real circuits are hidden behind their names. Try typing some famous ones as the phrase.
- **Places and machines.** The phrase also picks where you are (countryside, desert, snow, city, the Moon: each with its
  own grip and scenery) and what you are driving (go-karts, formula cars, rally cars, muscle cars, trucks or tanks).
- **Share and resume.** The address holds the track, the settings and the segments you have drawn. Copy it to share a
  track, or reload to carry on. Laps and times are never saved: a reload always starts the race afresh.
- **Menu.** The title has the track behind it (blurred), and the Menu button or Esc opens it over a game at any time.
  Changing the seed after you have drawn something asks first.
- **Garage.** Spend 24 points across acceleration, top speed, cornering and braking, and save setups.
- **Rivals.** Bots race you. You can also save your lines to a file and import other players' lines for the same phrase
  as rivals (`Import rival lines…`). There is no online upload yet.

## Develop

```sh
npm install
npm run dev        # Electron with hot reload
npm run dev:web    # just the renderer in a browser (saves go to localStorage); add ?demo to jump into a race
npm test           # vitest
npm run typecheck
npm run dist       # installers for this OS into release/
```

Node 22+. See [docs/DESIGN.md](docs/DESIGN.md) for how the pieces fit.

## Release

Add a `## X.Y.Z-alpha.N` section to `CHANGELOG.md`, commit, then `git tag -a vX.Y.Z-alpha.N -m "..." && git push origin main vX.Y.Z-alpha.N`.
The Release workflow builds all three platforms and publishes a GitHub release (a pre-release when the tag contains
`alpha`, `beta` or `rc`), with the changelog section as the notes.

## Licence

MIT.
