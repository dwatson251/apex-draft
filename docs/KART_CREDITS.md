# Kart Tracks: credits and notices

The Kart Tracks are **fan approximations**: each course's lap is a loop drawn by hand (or traced from a map) to look like the layout of the course of the same name in the Mario Kart series, scaled and eased so a kart in this game can drive it. **This project is not affiliated with, endorsed by or sponsored by Nintendo.** Mario Kart and the course names belong to Nintendo; they are used here only to say which layout is meant. The official names are kept in one data file (`packages/sim/src/kartroster.ts`, generated from `tools/mariokart/roster.json`) so they can be changed in one edit.

## What is and is not in the game

- **No Nintendo images, models, sprites, logos, characters or audio** are in this repository, in the game or in its releases. All the art is this game's own (flat shapes and colours per theme, see `src/renderer/look.ts`).
- The wiki's map pictures and screenshots were looked at **transiently**, to trace or draw a lap and to place ramps, boost pads and hazards. They were kept in a scratch folder outside the repository and are not included. What is kept is numbers: the waypoints of each lap (`tools/mariokart/shapes/*.json`), the course names, cups and links, and the pieces on each lap.
- Layouts are approximate: crossings are bridges where the real course has them, a lap is a loop on a drivable scale (15 to 30 seconds in a kart), anti-gravity and underwater parts are plain road, and some courses (marked low confidence in `roster.json`) were drawn from a very small map or from the text description alone. Courses whose wiki page had no map picture say so below.
- The course list, names, cups and links come from the Super Mario Wiki (https://www.mariowiki.com), whose text is available under CC BY-SA 4.0. Thanks to its editors.

## Courses

### Super Mario Kart (20)

- Mario Circuit 1 (Mushroom Cup): https://www.mariowiki.com/Mario_Circuit_1
- Donut Plains 1 (Mushroom Cup): https://www.mariowiki.com/Donut_Plains_1_(race_course)
- Ghost Valley 1 (Mushroom Cup): https://www.mariowiki.com/Ghost_Valley_1
- Bowser Castle 1 (Mushroom Cup): https://www.mariowiki.com/Bowser_Castle_1_(Super_Mario_Kart)
- Mario Circuit 2 (Mushroom Cup): https://www.mariowiki.com/Mario_Circuit_2
- Choco Island 1 (Flower Cup): https://www.mariowiki.com/Choco_Island_1
- Ghost Valley 2 (Flower Cup): https://www.mariowiki.com/Ghost_Valley_2
- Donut Plains 2 (Flower Cup): https://www.mariowiki.com/Donut_Plains_2_(race_course)
- Bowser Castle 2 (Flower Cup): https://www.mariowiki.com/Bowser_Castle_2_(Super_Mario_Kart)
- Mario Circuit 3 (Flower Cup): https://www.mariowiki.com/Mario_Circuit_3
- Koopa Beach 1 (Star Cup): https://www.mariowiki.com/Koopa_Beach_1
- Choco Island 2 (Star Cup): https://www.mariowiki.com/Choco_Island_2
- Vanilla Lake 1 (Star Cup): https://www.mariowiki.com/Vanilla_Lake_1
- Bowser Castle 3 (Star Cup): https://www.mariowiki.com/Bowser_Castle_3_(Super_Mario_Kart)
- Mario Circuit 4 (Star Cup): https://www.mariowiki.com/Mario_Circuit_4
- Donut Plains 3 (Special Cup): https://www.mariowiki.com/Donut_Plains_3_(race_course)
- Koopa Beach 2 (Special Cup): https://www.mariowiki.com/Koopa_Troopa_Beach_(Super_Mario_Kart)
- Ghost Valley 3 (Special Cup): https://www.mariowiki.com/Ghost_Valley_3
- Vanilla Lake 2 (Special Cup): https://www.mariowiki.com/Vanilla_Lake_2
- Rainbow Road (Special Cup): https://www.mariowiki.com/Rainbow_Road_(Super_Mario_Kart)

### Mario Kart 64 (16)

- Luigi Raceway (Mushroom Cup): https://www.mariowiki.com/Luigi_Raceway
- Moo Moo Farm (Mushroom Cup): https://www.mariowiki.com/Moo_Moo_Farm
- Koopa Troopa Beach (Mushroom Cup): https://www.mariowiki.com/Koopa_Troopa_Beach_(Mario_Kart_64)
- Kalimari Desert (Mushroom Cup): https://www.mariowiki.com/Kalimari_Desert
- Toad's Turnpike (Flower Cup): https://www.mariowiki.com/Toad%27s_Turnpike
- Frappe Snowland (Flower Cup): https://www.mariowiki.com/Frappe_Snowland
- Choco Mountain (Flower Cup): https://www.mariowiki.com/Choco_Mountain
- Mario Raceway (Flower Cup): https://www.mariowiki.com/Mario_Raceway
- Wario Stadium (Star Cup): https://www.mariowiki.com/Wario_Stadium_(Mario_Kart_64)
- Sherbet Land (Star Cup): https://www.mariowiki.com/Sherbet_Land_(Mario_Kart_64)
- Royal Raceway (Star Cup): https://www.mariowiki.com/Royal_Raceway
- Bowser's Castle (Star Cup): https://www.mariowiki.com/Bowser%27s_Castle_(Mario_Kart_64)
- D.K.'s Jungle Parkway (Special Cup): https://www.mariowiki.com/DK%27s_Jungle_Parkway
- Yoshi Valley (Special Cup): https://www.mariowiki.com/Yoshi_Valley
- Banshee Boardwalk (Special Cup): https://www.mariowiki.com/Banshee_Boardwalk
- Rainbow Road (Special Cup): https://www.mariowiki.com/Rainbow_Road_(Mario_Kart_64)

### Mario Kart: Super Circuit (20)

- Peach Circuit (Mushroom Cup): https://www.mariowiki.com/Peach_Circuit
- Shy Guy Beach (Mushroom Cup): https://www.mariowiki.com/Shy_Guy_Beach
- Riverside Park (Mushroom Cup): https://www.mariowiki.com/Riverside_Park
- Bowser Castle 1 (Mushroom Cup): https://www.mariowiki.com/Bowser%27s_Castle_1
- Mario Circuit (Flower Cup): https://www.mariowiki.com/Mario_Circuit_(Mario_Kart:_Super_Circuit)
- Boo Lake (Flower Cup): https://www.mariowiki.com/Boo_Lake
- Cheese Land (Flower Cup): https://www.mariowiki.com/Cheese_Land
- Bowser Castle 2 (Flower Cup): https://www.mariowiki.com/Bowser%27s_Castle_2
- Luigi Circuit (Lightning Cup): https://www.mariowiki.com/Luigi_Circuit_(Mario_Kart:_Super_Circuit)
- Sky Garden (Lightning Cup): https://www.mariowiki.com/Sky_Garden_(race_course)
- Cheep-Cheep Island (Lightning Cup): https://www.mariowiki.com/Cheep-Cheep_Island
- Sunset Wilds (Lightning Cup): https://www.mariowiki.com/Sunset_Wilds
- Snow Land (Star Cup): https://www.mariowiki.com/Snow_Land
- Ribbon Road (Star Cup): https://www.mariowiki.com/Ribbon_Road
- Yoshi Desert (Star Cup): https://www.mariowiki.com/Yoshi_Desert
- Bowser Castle 3 (Star Cup): https://www.mariowiki.com/Bowser%27s_Castle_3
- Lakeside Park (Special Cup): https://www.mariowiki.com/Lakeside_Park
- Broken Pier (Special Cup): https://www.mariowiki.com/Broken_Pier
- Bowser Castle 4 (Special Cup): https://www.mariowiki.com/Bowser%27s_Castle_4
- Rainbow Road (Special Cup): https://www.mariowiki.com/Rainbow_Road_(Mario_Kart:_Super_Circuit)

### Mario Kart: Double Dash!! (16)

- Luigi Circuit (Mushroom Cup): https://www.mariowiki.com/Luigi_Circuit_(Mario_Kart:_Double_Dash!!)
- Peach Beach (Mushroom Cup): https://www.mariowiki.com/Peach_Beach (low confidence)
- Baby Park (Mushroom Cup): https://www.mariowiki.com/Baby_Park
- Dry Dry Desert (Mushroom Cup): https://www.mariowiki.com/Dry_Dry_Desert_(race_course)
- Mushroom Bridge (Flower Cup): https://www.mariowiki.com/Mushroom_Bridge
- Mario Circuit (Flower Cup): https://www.mariowiki.com/Mario_Circuit_(Mario_Kart:_Double_Dash!!) (low confidence)
- Daisy Cruiser (Flower Cup): https://www.mariowiki.com/Daisy_Cruiser_(race_course)
- Waluigi Stadium (Flower Cup): https://www.mariowiki.com/Waluigi_Stadium_(Mario_Kart:_Double_Dash!!)
- Sherbet Land (Star Cup): https://www.mariowiki.com/Sherbet_Land_(Mario_Kart:_Double_Dash!!)
- Mushroom City (Star Cup): https://www.mariowiki.com/Mushroom_City (low confidence)
- Yoshi Circuit (Star Cup): https://www.mariowiki.com/Yoshi_Circuit
- DK Mountain (Star Cup): https://www.mariowiki.com/DK_Mountain
- Wario Colosseum (Special Cup): https://www.mariowiki.com/Wario_Colosseum (low confidence)
- Dino Dino Jungle (Special Cup): https://www.mariowiki.com/Dino_Dino_Jungle
- Bowser's Castle (Special Cup): https://www.mariowiki.com/Bowser%27s_Castle_(Mario_Kart:_Double_Dash!!) (low confidence)
- Rainbow Road (Special Cup): https://www.mariowiki.com/Rainbow_Road_(Mario_Kart:_Double_Dash!!) (low confidence)

### Mario Kart DS (16)

- Figure-8 Circuit (Mushroom Cup): https://www.mariowiki.com/Figure-8_Circuit
- Yoshi Falls (Mushroom Cup): https://www.mariowiki.com/Yoshi_Falls
- Cheep Cheep Beach (Mushroom Cup): https://www.mariowiki.com/Cheep_Cheep_Beach
- Luigi's Mansion (Mushroom Cup): https://www.mariowiki.com/Luigi%27s_Mansion_(race_course)
- Desert Hills (Flower Cup): https://www.mariowiki.com/Desert_Hills
- Delfino Square (Flower Cup): https://www.mariowiki.com/Delfino_Square
- Waluigi Pinball (Flower Cup): https://www.mariowiki.com/Waluigi_Pinball_(race_course)
- Shroom Ridge (Flower Cup): https://www.mariowiki.com/Shroom_Ridge
- DK Pass (Star Cup): https://www.mariowiki.com/DK_Pass
- Tick-Tock Clock (Star Cup): https://www.mariowiki.com/Tick-Tock_Clock_(race_course)
- Mario Circuit (Star Cup): https://www.mariowiki.com/Mario_Circuit_(Mario_Kart_DS)
- Airship Fortress (Star Cup): https://www.mariowiki.com/Airship_Fortress
- Wario Stadium (Special Cup): https://www.mariowiki.com/Wario_Stadium_(Mario_Kart_DS)
- Peach Gardens (Special Cup): https://www.mariowiki.com/Peach_Gardens_(race_course)
- Bowser Castle (Special Cup): https://www.mariowiki.com/Bowser_Castle_(Mario_Kart_DS)
- Rainbow Road (Special Cup): https://www.mariowiki.com/Rainbow_Road_(Mario_Kart_DS)

### Mario Kart Wii (16)

- Luigi Circuit (Mushroom Cup): https://www.mariowiki.com/Luigi_Circuit_(Mario_Kart_Wii) (low confidence)
- Moo Moo Meadows (Mushroom Cup): https://www.mariowiki.com/Moo_Moo_Meadows
- Mushroom Gorge (Mushroom Cup): https://www.mariowiki.com/Mushroom_Gorge
- Toad's Factory (Mushroom Cup): https://www.mariowiki.com/Toad%27s_Factory (low confidence)
- Mario Circuit (Flower Cup): https://www.mariowiki.com/Mario_Circuit_(Mario_Kart_Wii) (low confidence)
- Coconut Mall (Flower Cup): https://www.mariowiki.com/Coconut_Mall
- DK Summit (Flower Cup): https://www.mariowiki.com/DK_Summit
- Wario's Gold Mine (Flower Cup): https://www.mariowiki.com/Wario%27s_Gold_Mine
- Daisy Circuit (Star Cup): https://www.mariowiki.com/Daisy_Circuit
- Koopa Cape (Star Cup): https://www.mariowiki.com/Koopa_Cape
- Maple Treeway (Star Cup): https://www.mariowiki.com/Maple_Treeway
- Grumble Volcano (Star Cup): https://www.mariowiki.com/Grumble_Volcano
- Dry Dry Ruins (Special Cup): https://www.mariowiki.com/Dry_Dry_Ruins_(race_course)
- Moonview Highway (Special Cup): https://www.mariowiki.com/Moonview_Highway
- Bowser's Castle (Special Cup): https://www.mariowiki.com/Bowser%27s_Castle_(Mario_Kart_Wii) (low confidence)
- Rainbow Road (Special Cup): https://www.mariowiki.com/Rainbow_Road_(Mario_Kart_Wii)

### Mario Kart 7 (16)

- Toad Circuit (Mushroom Cup): https://www.mariowiki.com/Toad_Circuit
- Daisy Hills (Mushroom Cup): https://www.mariowiki.com/Daisy_Hills
- Cheep Cheep Lagoon (Mushroom Cup): https://www.mariowiki.com/Cheep_Cheep_Lagoon_(race_course)
- Shy Guy Bazaar (Mushroom Cup): https://www.mariowiki.com/Shy_Guy_Bazaar
- Wuhu Loop (Flower Cup): https://www.mariowiki.com/Wuhu_Loop (low confidence)
- Mario Circuit (Flower Cup): https://www.mariowiki.com/Mario_Circuit_(Mario_Kart_7)
- Music Park (Flower Cup): https://www.mariowiki.com/Music_Park
- Rock Rock Mountain (Flower Cup): https://www.mariowiki.com/Rock_Rock_Mountain
- Piranha Plant Slide (Star Cup): https://www.mariowiki.com/Piranha_Plant_Slide
- Wario Shipyard (Star Cup): https://www.mariowiki.com/Wario_Shipyard
- Neo Bowser City (Star Cup): https://www.mariowiki.com/Neo_Bowser_City
- Maka Wuhu (Star Cup): https://www.mariowiki.com/Maka_Wuhu (low confidence)
- DK Jungle (Special Cup): https://www.mariowiki.com/DK_Jungle_(Mario_Kart_7)
- Rosalina's Ice World (Special Cup): https://www.mariowiki.com/Rosalina%27s_Ice_World
- Bowser's Castle (Special Cup): https://www.mariowiki.com/Bowser%27s_Castle_(Mario_Kart_7)
- Rainbow Road (Special Cup): https://www.mariowiki.com/Rainbow_Road_(Mario_Kart_7)

### Mario Kart 8 / 8 Deluxe (with the Booster Course Pass) (45)

- Mario Kart Stadium (Mushroom Cup): https://www.mariowiki.com/Mario_Kart_Stadium
- Water Park (Mushroom Cup): https://www.mariowiki.com/Water_Park
- Sweet Sweet Canyon (Mushroom Cup): https://www.mariowiki.com/Sweet_Sweet_Canyon
- Thwomp Ruins (Mushroom Cup): https://www.mariowiki.com/Thwomp_Ruins
- Mario Circuit (Flower Cup): https://www.mariowiki.com/Mario_Circuit_(Mario_Kart_8)
- Toad Harbor (Flower Cup): https://www.mariowiki.com/Toad_Harbor
- Twisted Mansion (Flower Cup): https://www.mariowiki.com/Twisted_Mansion
- Shy Guy Falls (Flower Cup): https://www.mariowiki.com/Shy_Guy_Falls
- Sunshine Airport (Star Cup): https://www.mariowiki.com/Sunshine_Airport
- Dolphin Shoals (Star Cup): https://www.mariowiki.com/Dolphin_Shoals
- Electrodrome (Star Cup): https://www.mariowiki.com/Electrodrome
- Mount Wario (Star Cup): https://www.mariowiki.com/Mount_Wario
- Cloudtop Cruise (Special Cup): https://www.mariowiki.com/Cloudtop_Cruise
- Bone-Dry Dunes (Special Cup): https://www.mariowiki.com/Bone-Dry_Dunes
- Bowser's Castle (Special Cup): https://www.mariowiki.com/Bowser%27s_Castle_(Mario_Kart_8)
- Rainbow Road (Special Cup): https://www.mariowiki.com/Rainbow_Road_(Mario_Kart_8)
- Excitebike Arena (Egg Cup): https://www.mariowiki.com/Excitebike_Arena
- Dragon Driftway (Egg Cup): https://www.mariowiki.com/Dragon_Driftway
- Mute City (Egg Cup): https://www.mariowiki.com/Mute_City
- Ice Ice Outpost (Triforce Cup): https://www.mariowiki.com/Ice_Ice_Outpost
- Hyrule Circuit (Triforce Cup): https://www.mariowiki.com/Hyrule_Circuit
- Wild Woods (Crossing Cup): https://www.mariowiki.com/Wild_Woods
- Animal Crossing (Crossing Cup): https://www.mariowiki.com/Animal_Crossing
- Super Bell Subway (Bell Cup): https://www.mariowiki.com/Super_Bell_Subway
- Big Blue (Bell Cup): https://www.mariowiki.com/Big_Blue
- Ninja Hideaway (Lucky Cat Cup): https://www.mariowiki.com/Ninja_Hideaway
- Sky-High Sundae (Propeller Cup): https://www.mariowiki.com/Sky-High_Sundae
- Merry Mountain (Moon Cup): https://www.mariowiki.com/Merry_Mountain
- Yoshi's Island (Fruit Cup): https://www.mariowiki.com/Yoshi%27s_Island_(race_course)
- Squeaky Clean Sprint (Feather Cup): https://www.mariowiki.com/Squeaky_Clean_Sprint
- Piranha Plant Cove (Acorn Cup): https://www.mariowiki.com/Piranha_Plant_Cove
- Paris Promenade (Golden Dash Cup): https://www.mariowiki.com/Paris_Promenade
- Tokyo Blur (Lucky Cat Cup): https://www.mariowiki.com/Tokyo_Blur
- New York Minute (Turnip Cup): https://www.mariowiki.com/New_York_Minute
- Sydney Sprint (Propeller Cup): https://www.mariowiki.com/Sydney_Sprint
- London Loop (Rock Cup): https://www.mariowiki.com/London_Loop
- Berlin Byways (Moon Cup): https://www.mariowiki.com/Berlin_Byways
- Amsterdam Drift (Fruit Cup): https://www.mariowiki.com/Amsterdam_Drift
- Bangkok Rush (Boomerang Cup): https://www.mariowiki.com/Bangkok_Rush
- Singapore Speedway (Boomerang Cup): https://www.mariowiki.com/Singapore_Speedway
- Athens Dash (Feather Cup): https://www.mariowiki.com/Athens_Dash
- Los Angeles Laps (Cherry Cup): https://www.mariowiki.com/Los_Angeles_Laps
- Vancouver Velocity (Cherry Cup): https://www.mariowiki.com/Vancouver_Velocity
- Rome Avanti (Acorn Cup): https://www.mariowiki.com/Rome_Avanti
- Madrid Drive (Spiny Cup): https://www.mariowiki.com/Madrid_Drive
