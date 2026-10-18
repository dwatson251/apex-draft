# Changelog

## Unreleased

- **Your own levels for the sound.** Settings has sliders for the music, the effects and the engines (the engines have a bus of their own now). The win, goal and end-of-round stingers are short brass fanfares instead of beeps.
- **The tutorial teaches the rest of the drawing.** A tip on each of the first segments: the speed colours, dragging points, inserting and deleting them, sliding the square and the diamond along the road edge, and that a smooth, sparse line is usually the quicker one. Its wording now matches the white preview line.
- **Two new places, and two old ones on random tracks.** *Jungle* (hot, damp and muddy, rain more often than not) and *Volcano* (black basalt, rough on the tyres, lava where the lakes would be). They, *Mountains and forest* and *Coast* now turn up on random phrases: a share of the countryside and the desert becomes one of them, decided on a stream of its own, so every other phrase keeps its place and no layout moves.
- **Two new classes.** *Classic F1* (a 1960s cigar on skinny tyres: no wings, it slides) races the real circuits beside the other race cars; the *Rallycross car* (600 hp in a hatchback, brutal off the line, happy on dirt) is offered on rally and buggy tracks. Each has its own drawing, engine note and gearbox.
- **Superbikes lean into the bends.**
- **Heavier rain looks it.** Rings where rain lands on standing water (on the undriven, wettest road), drops beading on the screen in a downpour, and brighter streaks.
- **The atlas and trophies.** Time Attack > *Atlas* lists every hidden real circuit: a name once you have found it (type it as the track phrase), its length and your best time, and *???* until then. Nineteen trophies for what you do (your first win, a win on Hard, from the back of the grid, under the safety car, in the rain, three stars in Line Golf, rungs of the career, circuits found...), each with a toast when it comes.
- **Livery rewards.** Four trophies open something for the paint: gold and chrome, a chequered nose and tail, and chevrons.
- **Career.** A ladder of seasons in the Race menu, one machine a rung: karting, touring cars, GT4, GT3, prototypes, formula cars and hypercars, the top three on the real circuits. Each season is four rounds (a qualifier and a race) against the same rivals; finish in the top three and the next rung opens, otherwise you run it again on new tracks. Your best season on each rung is kept.
- **Yellow flags and the safety car.** In a race, cars coming up to a wreck slow down past it. When two cars are in trouble at once, or one has been stuck for four seconds, the safety car comes out (never on the last lap): the leader is held to its pace and the field closes up behind, until the road has been clear for twenty seconds and it has been out at least thirty. A flag in the race panel and a toast say when it is out and when it goes in. The server replays races with it.
- **Record a clip.** *● Record* on the race bar records the race as a video (WebM, up to a minute) and saves it when you stop, or when the race ends. Watch a replay and record that.
- **Duels.** *Challenge a friend* on the results of a race or a Time Trial copies a duel code: your line, your car and your name. Your friend pastes it into the track phrase box in race setup (the button says *Load Duel*), draws their own lap and races yours, head to head; *Send your line back* returns the favour. A link with a duel in it works too. Share links are version 6 (older ones still open).
- **Replays.** Your last five races are kept to watch again: *Watch replay* on the results, or the list under Settings. A replay is the race run again from what went into it (the field as it was at the start, and the changes made at the stops on the ticks they were made), so it comes out the same to the last tick; it says so if it ever does not. A race from an older version of the game is listed but not played.
- **Line Golf** (Time Attack): a course a day, and a target flying lap to beat with as few points as you can. Par and the target come from a reference line, the best computer line thinned to the fewest points that keep it on the road, so par can be drawn and a smooth, sparse line is quicker than a busy one. Three stars at par, two within half as many again, one for making the target. The score is worked out from the line, so it is the same every time.
- **Elimination races.** Turn on *Elimination* in Quick Race: each time the leader starts a new lap, the last car still running is out, down to a duel on the last lap (a lap for every rival, 25 at most). A toast says who has gone; the results list who went out on which lap. Elimination races are kept apart from ordinary ones for best times, and are not sent to the online boards.
- **Cars pull hardest off the line and fade toward top speed.** Acceleration used to be the same all the way up to top speed. Now a car puts down all its grip at low speed, then its power and the air take over and the pull fades, as a real car's does: getting out of a slow corner well matters more, a long straight a little less. A slipstream or a pad stretches the curve so a car can still go past its top speed.
- **One grip for turning and braking.** A tyre turning at the limit has less left to brake or accelerate with (the friction circle), so a line that brakes in a straight line before a bend and straightens the exit is quicker than one that brakes and turns at once.
- **Tyres have a cliff.** Grip fades gently for most of a set's life and falls away in the last quarter (it used to fall in a straight line), and it fades as the lap goes rather than all at once at the start of the next lap. Wets wear a touch faster on a wet road to keep about 15 laps.
- Lap times are re-fitted to the real ones (`PACE` 1.46): the calibrated laps are within 6%.
- **The experimental Racing room and Aggressive overtaking switches are gone from Settings.** Measured over eight 16-car races, both made races slower and rougher (overtaking: 76 contacts and 26 spins against none), and either one kept a race off the online boards.
- **See how fast your line is before you race it.** Your line is drawn in speed colours, red where the car is slow, through amber, to green where it is quick, from the slowest point of the lap to the fastest: the segments you have drawn while you draw (the rest is worked out the way *Finish for me* would), and the whole lap on the map before the start and in the pits. The map also shows the **flying lap** the line is worth in your car.
- **Where your line loses time.** The results now compare your line with the best computer line, both in your car on a flying lap with nobody in the way: how much a lap it gains or loses, and the three segments where it loses most, lit on the map.
- **Play now.** A tile on the home screen goes straight to drawing a random track: three laps, seven rivals, no tyres or fuel, at Medium once you have opened it. Your own Quick Race setup is left as it was.
- **Difficulty is chosen on the race setup**, in a dropdown beside the laps and the field, instead of on a screen of its own between the menu and the setup. The next locked difficulty says what opens it.
- **The pit wall can call your stops.** In the pit strategy panel, *Let the pit wall call the stops* (on by default) brings you in when the computer drivers would come in: for fuel, worn tyres or the wrong tyre for the road. Stops you queue still come first. It is set before the start, and the server replays it.
- **Computer drivers count all the fuel they burn.** Planning their stops, they left out the race's fuel multiplier, the place and their tactic, so with fuel use turned up they thought a tank went much further than it does and ran dry.
- **No Time Trial, no back of the grid.** A Quick Race used to start you last if you had no Time Trial time on the track. Now you are placed as the computer drivers are, by the lap time of the line you drew; a Time Trial time still counts when you have one. The server replays races the same way. **SIM_VERSION is 7.**
- **Long races use a fifth of the memory.** What a race records for playback (every car's place, speed, fuel, tyres... at every tick) is kept in typed arrays instead of plain ones: about 32 bytes a car a tick instead of 156, so a 50-lap race of 32 cars at Spa holds about 0.4 GB instead of 1.7 GB, which phones and the Steam Deck could not spare.
- **The kart courses are a fan pack now, not part of the game.** Release builds and the online server leave them out; dev builds, the tests and a build made with `VITE_KART_PACK=1` (or a server with `APEX_KART_PACK=1`) put them back. Without the pack a course's name is an ordinary phrase. See DEVELOPER.md.
- **The rain forecast is for the machine you drive.** It was worked out for the track's own class, while the race lays out its showers over the length of the race in your machine, so on a circuit raced in another class the forecast could name the wrong part of the race.

## 0.1.0-alpha.10

- **Bowser's Castle (Mario Kart 64) has its tower.** The lap now makes the real course's 270-degree counter-clockwise loop round a circular tower and passes over the road it came in on (a bridge and an under-road, the same crossing as Rainbow Road's), climbing as it goes: the road gains 10 units round the tower and comes back down on the way home (uphill is slower, downhill quicker). Kart courses can now have a `climb` in their shape file (see DEVELOPER.md). The lap is about the same length as before. The gap jump it had is gone for now: the castle's bends leave no straight long enough for a ramp to land on.
- **Speed pads boost.** Driving onto one now kicks the car forward at once (28% of its top speed, up to 1.32x top speed) and gives it a fading extra push for about a second on a clear straight, on top of the higher top speed and acceleration over the pad itself. A car in the air or in recovery rides over it.
- **Jumps look as high as they are fast.** A ramp's height now follows the flight time, which follows speed: a hop at walking pace is low, one at full speed is higher but about half what it was, and a glide stays low and long. (The flight times are unchanged; this is the picture.)
- **Headlights are masked by a car in front.** A beam stops at the tail of a car in its cone (a small glow on the tail instead of lighting the whole body) and only a dim spill gets past its sides to the road beyond. A car in the air is passed over.
- **The Mario Kart courses are secret again.** The Kart Tracks tile and its game / cup / course picker are gone from the Race menu (and the picker's code and styles with it). All 165 courses are still there: type a course's name into the phrase box in race setup and it is the track, as before. **Random** on a kart course still goes to the next kart course.
- **Twenty more circuits, nothing capping a lap.** Interlagos, Imola, Zandvoort, the Circuit of the Americas, the Red Bull Ring, Suzuka (the figure of eight, with its bridge), Fuji, Brands Hatch, Mugello, Sebring, Road America, the Hungaroring, Paul Ricard and Montréal, from OpenStreetMap; the Nürburgring in three layouts (`nurburgring`, `nurburgring-sprint`, and `nordschleife` at full scale, nearly 21 km and 186 segments); and three fictional circuits from Gran Turismo (`trial-mountain`, `high-speed-ring`, `dragon-trail`), traced from the wiki's track maps. "Nürburgring" is typed any way you like (`nurburgring`, `nuerburgring`, `n-rburgring`), and an alias that two circuits claim stops the build. Limits lifted for the long laps: a saved or shared line may have 512 segments (it was 64), the race clock allows time for a long lap, the server runs at most as many laps as 300 thousand units of racing (50 on any ordinary track, 16 on the Nordschleife), keeps 256 tracks in its cache and gives a race five minutes, and the tests no longer cap a lap at 7000 units or the scale at 0.35 units a metre.
- **Real ground under the circuits.** The mapped circuits now rise and fall as they do (heights read off the Copernicus elevation model, three fifths of the real climb): Spa, Laguna Seca, the Nordschleife and the rest, with Daytona's and Zandvoort's banked turns and Monaco's tunnel. The Mario Kart courses stay flat.
- **Two new classes and two new places.** The **hypercar** (Group C, Le Mans hypercars, Gran Turismo's Gr.1: 225 mph, 3.3 g) and the **stock car** (NASCAR and V8 Supercars: 190 mph, heavy and loose), offered on the real circuits beside the other race cars. **Mountains and forest** and **Coast** are places for the circuits that suit them (the Nürburgring, the Red Bull Ring, Fuji, Trial Mountain; Zandvoort, Paul Ricard, Dragon Trail); no random phrase gets them, so no random track changes its place.
- **New pieces in the random tracks**: a wide **S-sweep** (`sweepS`), **crests and dips** on straights (up to three on a `fun-` track), and a wide sweeper is always banked when its track has banking.
- Circuits can say they are fictional (Spoiler: a fictional circuit, on the server's pages). `tools/circuits` takes per-circuit fit limits, more rounds and more slow waves for a very twisty lap, gaps to mend and crossings to leave alone; `trace_image.py` reads the Gran Turismo wiki's see-through maps (`--alpha`); a bug in the fit that handed back a road it had not pulled apart is fixed.

- **Kart Tracks.** 165 courses from the Mario Kart games (Super Mario Kart to Mario Kart 8 Deluxe, with the Booster Course Pass), as fan approximations drawn or traced from the Super Mario Wiki's maps, each in a theme of its own (meadow, beach, desert, snow, castle, haunted, rainbow, jungle, city, mine, volcano, tech, sweets, retro, sky, water, factory; the dark ones are always at night). Courses are circuits like the real ones: type the name (`luigi-raceway`, `mk64-rainbow-road` for a shared name) in the phrase box. A kart is always the default there and three other classes are offered (any land class, drawn from the track), and a machine you picked for another track is not carried over. **Random** on a circuit now goes to the next circuit of its own kind (Mario Kart courses, or the real ones) round and round. No Nintendo images or audio are used; see `docs/KART_CREDITS.md` for the notices.
- **New pieces on the road**: **ramps** (a car going fast enough leaves the ground, for longer the faster it goes; slow cars ride over), **glide ramps** (twice the air), **speed pads**, and patches of **ice, sand, mud and shallow water** that change grip, speed and braking. Cars in the air pass over cars on the ground, and are drawn bigger with their shadow left behind and a puff of dust on landing, with a whoosh and a thump. A course's ramps need straight road after them (checked at build time). `fun-` tracks now get some of these too (laid on their own random stream, so every `fun-` layout, drawing and share link is as it was; ordinary tracks are untouched).
- **Mapped circuits can cross themselves** (a bridge over the road under it), for the courses that do.
- **SIM_VERSION is 6** (circuits have their real ground, the random pieces changed, two new classes and places, the airborne state is part of the race fingerprint, and speed pads kick): times set under earlier versions stop being ranked, as with earlier bumps. Course pages on the server show Mario Kart courses by name (they are not spoilers).

## 0.1.0-alpha.9

- **Overtaking is committed and taken in turn** (the Aggressive overtaking setting). A car now commits to passing one car and stays out until that car is clearly behind it (more than both lengths and a little more), then eases back to its line; before, it dropped the pass about when the two were level and cut back in alongside. Passes are taken in turn: a car does not start one while the car it is following is passing or waiting to, or while another car is passing it, so the front of a queue goes first and a column no longer pulls out all at once and blocks the cars behind. With 16 cars contacts fell (Spa 46 to 5, river bend 13 to 3); with 32 it is still rough.
- **Name tag in the pits.** While you are stopped in the box with the map showing, the name tag now stays on your car (it was left where it had been on screen before the view changed, in the middle of the map).

## 0.1.0-alpha.8

- **Cars go round what blocks them.** A computer driver held up for a second and a half well below the speed its line wants, behind something far slower (a wreck, a crawling or stopped car), now steers round it as soon as there is room (even while crawling), and goes back to its line once past, instead of queueing behind it for the rest of the race. Nothing happens in the first six seconds, while the grid gets going.
- **The pit stop on the gauges.** Over the whole stop the fuel gauge now fills steadily, and the tyre gauge drops to 0% in quarters (one tyre of four coming off at a time) and climbs back to 100% in quarters (one going back on at a time); a fuel-only emergency stop fills the tank and leaves the tyres alone. It is what the gauges show, the car and the race are as before.
- **The "run dry" warning in the pits.** The warning shown while you edit your line in the pits judged the plan from the nearly empty tank you came in on, so it said you would run dry on the very lap you were about to leave on a full tank. It now judges from the tank the stop in progress gives you.
- **Braking zones.** A follower now looks ahead of the car in front by about 0.9 s of its speed (at least 25 units) and follows it at the lowest speed its line will hold it to over that stretch, so it is already slowing when the car in front brakes for a corner. In 64-car races on the same four tracks this cut contacts and stops (river bend contacts 23 to 13, brave-owl stops 17 to 8) with no loss of speed. Running closer than the default did not make the field any quicker and cost more stops on tight tracks, so closer racing stays a choice (Racing room, in Settings).
- **Two things to try, in Settings.** **Racing room** (Normal, Tight, Tightest: at Tightest cars run almost touching, about half a unit between their bodies) sets how close cars run side by side and follow; **Aggressive overtaking** (off by default) has a car held behind a slower one take a gap between the cars round it and go back to its line once through. Both are experimental, make more contact, and races played with either on are not uploaded.
- **Results show how you crossed the line.** With tyres and fuel in play, a car that finishes without a pit stop is given a time penalty and one that stopped is not, so the classification can differ from the order the cars crossed the line in; the results screen now says "You crossed the line P13 ... classified P1".
- **Tighter racing.** Cars going the same way now need only their bodies and about 2.6 units between them to run side by side (it was about 10 centre to centre), and follow 1.5 units closer, so a car goes past one in the next lane or through a gap in the pack instead of dropping in behind it. On the same 64-car races the speed of the field improved on the tight tracks (brave-owl from 61% to 74% of what the lines allow, river bend 46% to 50%) with far fewer stops. **Your position** is now ranked by where a car is on the ring, not how far along its own line it has come: lines are different lengths (a lane, an inside line, the one you drew), and over a lap that put cars several places out.
- **Fewer stalls in a big field.** Cars in a field of more than 32 keep to lanes eleven units apart (the grid columns match them), and lane-keeping neighbours only need their real room to run side by side, so a neighbouring lane is no longer "in the way"; a lane's offset shrinks in tight bends. Followers read the speed the car ahead is about to be held to, so they brake with it; a car still pulling away from the grid is not taken for a slow one. A hit has to be hard (an impulse of 20) to throw a car into the spin-and-recover routine, so a pack of cars pinned in it no longer freezes the field. A bug is fixed where a touch after a hard hit in the same instant inherited the hard hit's speed and spun cars that were barely moving. On Spa and an open track with 64 cars (and the player's car among them) nobody stops for two seconds; on tight tracks the S-bends still queue, for up to about ten seconds on the hardest setting.
- **A frozen pit lane.** In a big field a pile of cars in the last pit bay could be held for ever by one still driving in (it was first in the list, and could not get in because the lane was full). Cars in the bay and done now go first. On Spa with 64 cars and heavy wear, where 58 cars pit at once, the worst wait fell from a deadlock to the queue itself (about a second per car).
- **Gauges.** The fuel, tyre and temperature gauges are round again (the panel theme had squared them).
- **Fields up to 64.** The 128 and 256 player options are gone (64 is crowded enough): the Players choice tops out at 64, and saved settings and links with more are brought down to 64.

## 0.1.0-alpha.7
- **Big fields and real car sizes.** Contact is now between rectangles of each machine's own length and width, so cars no longer clip through each other (a nose-to-tail touch used to be judged at a smaller, disc-shaped distance); the gaps cars keep, and the grid's row spacing, follow the machine's size. In fields of more than 32 the computer drivers keep to a lane of the road each for the whole lap, which stops 128 and 256 cars merging into one file (longer than the lap) and piling up in the first seconds; a car that gets stuck creeps up through the jam keeping the bumper space it needs, never passing through or shoving anyone.
- **A panel look.** The menus drop the bubbles for flat, square panels in the style of a console or a sim's front end: large title tiles with line-art drawings that fill with their colour when pointed at, focused or pressed, square controls, capitals for titles and a coloured edge on every panel. The difficulty choice is three tiles, the Garage is a set of panels (a large preview, setup bars, livery and saved setups), and the pause, setup, settings, results and in-race panels follow the same look.
- **Livery fixes.** Colour choices in the Garage now stick; stripes run over the bonnet and boot (or along the sides) and never across the glass, and the number sits on a round plate on the roof, sharp at any zoom.
- **A tidier title.** The modes are grouped: **Race** (Quick Race, Race Weekend, Championship), **Time Attack** (Solo Time Trial, Daily), then Challenges, Garage, Tutorial and Settings: six tiles instead of nine. Back steps out through the group.
- **Daily.** One track a day, the same for everyone: the day's phrase comes from the UTC date, you drive it as a Time Trial in your garage car, and your best time, your streak and (online) the day's board show on the results. Home gets a **Daily** button. The server serves the board at `GET /api/v1/daily`; times are ordinary Time Trial times on that phrase.
- **Championship.** A season of five races on linked tracks, in one machine and against the same rivals every round (a roster seed fixes each rival's name, car and skill), with points for the places and a season table. Each round is a qualifier then the race. Pick Easy, Medium or Hard (locked ones stay locked); the season is kept between visits (`championship` key).
- **Challenges.** Ten races with a goal (win, gain places from the back, pass cars, no contact, no pit stop, match a good pace), each worth one to three stars. Challenge stars are their own count, apart from a track's difficulty stars (`challenges` key).
- **Tyre temperature** (realism). Each compound has a window it grips best in. Tyres warm with the work they do and the dirty air they drive through, cool toward the road, start cold and restart cold after a stop; outside the window they lose up to 8% of their grip. A thermometer joins the fuel and tyre gauges.
- **Dirty air.** In a bend, the air a car ahead has churned costs the car behind up to 5% of its cornering speed (and heats its tyres). Slipstream on the straights is as it was.
- **Tactics** (realism). Attack, Balanced or Defend for the first stint and for each stop you queue: attack is about 2% quicker but wears the tyres 25% faster, runs hotter and burns fuel faster; defend is the reverse. Chosen on the grid and when queuing a stop, never mid-stint.
- **Track evolution.** Dry running lays rubber on the line (up to 4% more grip on a dry road), rain washes it off, and in a Race Weekend what practice and qualifying laid stays on the road for the race (not on Hard, whose races the server replays from scratch).
- **Machines with character.** Formula cars, prototypes, GT cars and touring cars have downforce (more cornering force the faster they go); the superbike leans harder into bends; trucks, muscle cars, dragsters and tanks lose braking when they brake into a bend already at the limit; rally cars, buggies, trucks and tanks cope better with rough surfaces.
- **Hills, rough roads, banking, tunnels and night.** Some generated tracks now have hills (uphill is slower to speed up and quicker to stop, downhill the reverse), a stretch of gravel, dirt or cobbles (less grip, less for machines built for it), banked corners (more grip), a tunnel (the rain never reaches the road) or are run after dark, with lamps along the road and headlights. The layout of every phrase is unchanged; the hidden circuits are as they were, bar the oval's banking.
- **Sound and look.** The music swells with the last lap or a rival close by, with a flourish for a win or a goal met; each machine's tyres squeal in their own voice, and gravel and cobbles rumble; dust, tyre smoke and spray; a toast when you pass a car; a livery (colours, stripes and a number) for your car in the Garage.
- **Fixes.** The racing line is saved on desktop again (`lines` was missing from the saved keys). The segment view in the track editor centres on the road, including arcs that run outside their cell, and a new segment always starts centred.
- The simulation changed (SIM_VERSION 3): times set under the old rules stop being ranked.

## 0.1.0-alpha.6
- **Difficulty.** Quick Race and Race Weekend ask for Easy, Medium or Hard before the race menu (Time Trial does not). Rivals drive at about 66%, 80% and 100% of their pace; Easy has no tyres or fuel; only Hard can have other players' lines in the field. Medium opens with a win on Easy, Hard with a win on Medium. Finishing a race earns 1, 2 or 3 stars for the track, and the race menu shows the stars and your best place. Saved as the `records` key.
- **Split times.** Every row of the race standings shows how far that car is from you in seconds: red `+1.2` for a car ahead (what you must make up, and for the leader the gap to the lead), green `−0.8` for one behind, `+1 lap` only for a car that has really lapped you. It is a time, not a distance (how long ago the car ahead was where you are now), and updates about every half second.
- **Points go on the road.** A racing-line point can no longer be placed or dragged off the road being drawn, or closer than 8 units to the start or end of its segment or to another point.
- **Your racing line is kept.** The line you draw for a track (finished, or the segments done so far) is saved for that track and is still there after quitting to the menu, starting any session, or closing the game. Only **Redraw track** in the pause menu clears it. The last 40 tracks are kept.
- **Shorter standings.** The race list shows five rows whatever the size of the field: the leader, last place, the car ahead of you, you, and the car behind. In or next to first or last place the spare rows are filled with the cars nearest you, so there are always five.
- **Bridges.** A new piece: a crossing where the road goes over itself on a raised deck, so the cars on the bridge and on the road beneath
  pass without touching or giving way. They turn up on about one ordinary track in ten (a figure of eight or a chain of lobes) and on
  most fun tracks (6 in 10 of their crossings; the rest are still flat crossings you can collide on). The artwork is a concrete deck with
  parapets that rise as it climbs, railing posts, expansion joints, piers and a shadow over the road beneath; cars on the road under it
  go out of sight beneath the deck, and cars on it are drawn above it.
- **Cars get out of the way after a crash.** Cars steer round a wreck, or a car that has sat still for a second, when there is room, instead
  of queueing behind it. A wrecked car now gives way to nobody, so it is no longer held in the middle of a junction, and with traffic coming
  up behind it pulls to the side of the road and lets the pack through before it rejoins. Cars do not drive into a crossing unless the road
  beyond it is clear. Fixed: a car facing the wrong way flipped between forward and reverse every frame and never turned round. A stuck car
  stops giving way after 2 seconds (it was 10), and one that is still stuck after 5 drives on regardless (it stays solid: no car ghosts after a collision or a jam).
  A recovering car steers only while it is moving, in a tighter circle the slower it goes, and turns about its rear axle.
- The simulation changed (SIM_VERSION 2): online times set before this are not ranked against new ones.
- **Online play.** Your times and lines go to the online server as you play, and other players' lines come back as rivals on the
  same track, picked to put you mid-pack (the grid is topped up with computer-driven rivals). The server runs every line through
  the game's own simulation, so times can't be faked. Pick your name under Settings. Other online racers (and you) get a name above
  a small arrow on the car; when many names crowd together yours always shows and the rest thin out. If the server can't be reached
  nothing is said and the game plays as before. The website shows lap times, popular tracks (real circuits are spoilers, fun tracks
  are labelled), track pages with the layout, code, weather and top 10 per car, and player profiles with race results. Host your own
  with `server/docker-compose.yml`.
- Line files are gone: no more Import lines or Save my lines.
- **Weather is on a clock, not on laps.** Showers are laid out over the estimated race time (the same estimate every time for a track,
  vehicle class and lap count, from `raceDuration`), and rain comes at those moments whatever pace the laps go at. The forecast
  tiles are the start, middle and end of that time.
- **Harder collisions.** A hit at speed costs much more than a nudge, and a car with little grip (wet track, snow, worn tyres) is thrown
  further sideways, loses more speed and can be spun. In a side-swipe both cars are recipients, each by its own grip.
- **Pit stops take real time** for the class: F1 8 s, touring 20 s, rally 25 s, GT cars 40 s, prototypes 45 s, trucks 45 s, tanks 90 s
  (see the table in `vehicles.ts`). The no-stop penalty is two of the car's own stops.
- **Kerbs.** A racing line may run to the road edge, over the kerb with two wheels still on the track.
- **Sound.** On phones the audio uses a longer buffer, builds fewer engines (only the nearest) and updates them less often, drops
  engines too far away to hear, and brings the audio back if the system takes it. Exhaust pops and bangs on downshifts and on the
  overrun for touring cars, rally cars, muscle cars, superbikes, dragsters and some GT and prototype cars.
- **A loading box** goes up when you hit Race (or leave the pits) while the race is worked out, so a long wait no longer looks frozen.
- **Impacts are physical.** A car that is hit, or spins on a wet road, is now a body with a heading, a direction of travel and a yaw rate. Its
  tyres drag its travel toward its heading as hard as the grip allows and scrub speed while it slides; the driver steers the nose back toward
  the line at the vehicle's turning circle, and cannot steer while it is sliding. Cars now turn, spin, go round in a circle and rejoin instead
  of sliding sideways into place, and the tyres screech (and leave skid marks) while they slide.
- **Reversing out.** A car that ends nose-first against the wall, or pointing the wrong way, backs out (steering the tail toward the road)
  and then drives forward again once it points along the track.
- **Front wheels steer.** The front tyres of cars, karts, trucks, buggies, dragsters and bikes turn to the steering angle (from the car's
  yaw rate, speed and wheelbase), so you can see them point into corners and during a recovery.
- **Start lights.** A race starts from the grid with five red lights coming on one by one with a beep, a short random pause (the same
  for the same track) and lights out with a go tone and the crowd; the cars do not move until then. Skip ahead cuts the sequence short.
- **The speed button** steps through 1x, 2x, 4x, 8x and 16x of real-world pace (it showed fractions on phones).
- **Zoom** goes in much further (14x in the overview, 16x following the car).
- **Race HUD.** The fuel and tyre bubbles and the list of positions share the screen height: the list takes what the bubbles leave,
  and the bubbles and forecast tiles shrink on short screens.

- **Gamepad support, built for the Steam Deck.** Left stick moves a cursor that slows down and settles onto points; A places a point
  or grabs the one under the cursor (hold and move to drag), X always inserts, LB deletes, B undoes, Y finishes the segment,
  d-pad left/right steps through the handles, right stick pans, triggers zoom, Select walks the bottom buttons with the d-pad, and
  Start is the pause menu. Menus and dialogs work with the d-pad, A and B. Using the mouse or touch takes control back at once.
- **Steam Deck build.** The Linux AppImage is named `...-steamdeck-x86_64.AppImage`, has a desktop entry, and starts fullscreen in Game
  mode (or with `--fullscreen`).

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
