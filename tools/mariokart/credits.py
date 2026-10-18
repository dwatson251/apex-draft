"""Write docs/KART_CREDITS.md from roster.json: python3 tools/mariokart/credits.py"""
import json, os
here = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(here, "roster.json")))
TITLE = {"smk": "Super Mario Kart", "mk64": "Mario Kart 64", "mksc": "Mario Kart: Super Circuit", "mkdd": "Mario Kart: Double Dash!!", "mkds": "Mario Kart DS", "mkwii": "Mario Kart Wii", "mk7": "Mario Kart 7", "mk8": "Mario Kart 8 / 8 Deluxe (with the Booster Course Pass)"}
out = ["# Kart Tracks: credits and notices", "",
"The Kart Tracks are **fan approximations**: each course's lap is a loop drawn by hand (or traced from a map) to look like the layout of the course of the same name in the Mario Kart series, scaled and eased so a kart in this game can drive it. **This project is not affiliated with, endorsed by or sponsored by Nintendo.** Mario Kart and the course names belong to Nintendo; they are used here only to say which layout is meant. The official names are kept in one data file (`packages/sim/src/kartroster.ts`, generated from `tools/mariokart/roster.json`) so they can be changed in one edit.", "",
"## What is and is not in the game", "",
"- **No Nintendo images, models, sprites, logos, characters or audio** are in this repository, in the game or in its releases. All the art is this game's own (flat shapes and colours per theme, see `src/renderer/look.ts`).",
"- The wiki's map pictures and screenshots were looked at **transiently**, to trace or draw a lap and to place ramps, boost pads and hazards. They were kept in a scratch folder outside the repository and are not included. What is kept is numbers: the waypoints of each lap (`tools/mariokart/shapes/*.json`), the course names, cups and links, and the pieces on each lap.",
"- Layouts are approximate: crossings are bridges where the real course has them, a lap is a loop on a drivable scale (15 to 30 seconds in a kart), anti-gravity and underwater parts are plain road, and some courses (marked low confidence in `roster.json`) were drawn from a very small map or from the text description alone. Courses whose wiki page had no map picture say so below.",
"- The course list, names, cups and links come from the Super Mario Wiki (https://www.mariowiki.com), whose text is available under CC BY-SA 4.0. Thanks to its editors.", "",
"## Courses", ""]
for g, t in TITLE.items():
    rows = [x for x in r if x["game"] == g]
    out += [f"### {t} ({len(rows)})", ""]
    for x in rows:
        note = " (low confidence)" if x["confidence"] == "low" else ""
        out.append(f"- {x['name']} ({x['cup']}): {x['wikiUrl']}{note}")
    out.append("")
open(os.path.join(here, "..", "..", "docs", "KART_CREDITS.md"), "w").write("\n".join(out))
print(len(r), "courses")
