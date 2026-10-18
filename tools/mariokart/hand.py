"""Write a hand-placed shape: python3 hand.py <game> <id> <len|auto> "x,y x,y ..." [--tile=ox,oy,scale] [--notes=text]
Points are in grid.py's 0..1000 units; with --tile=ox,oy,s they are read off a montage tile instead (offset ox,oy in montage pixels, tile scale s) and converted."""
import json, math, os, sys
game, id, ln, pts = sys.argv[1:5]
tile = next((a.split("=")[1] for a in sys.argv[5:] if a.startswith("--tile=")), None)
notes = next((a.split("=", 1)[1] for a in sys.argv[5:] if a.startswith("--notes=")), "hand-placed")
P = [tuple(map(float, p.split(","))) for p in pts.split()]
if tile:
    ox, oy, s = map(float, tile.split(","))
    P = [((x - ox) / s, (y - oy) / s) for x, y in P]
P = [[round(x), round(y)] for x, y in P]
L = sum(math.dist(P[i], P[(i + 1) % len(P)]) for i in range(len(P)))
n = int(ln) if ln != "auto" else max(1300, min(2800, round(L * 0.5 / 50) * 50))
f = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shapes", game + ".json")
d = json.load(open(f)) if os.path.exists(f) else {}
d[id] = {"pts": P, "len": n, "notes": notes}
json.dump(d, open(f, "w"), indent=1); print(id, len(P), "points, len", n)
