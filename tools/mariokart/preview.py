"""Draw built courses from kartdata.ts as a sheet of outlines (start dot, direction ticks, pieces coloured), to compare with the reference picture.

usage: uv run --with pillow python preview.py out.png id [id ...]     (no ids: every built course)"""
import json, math, sys
from PIL import Image, ImageDraw

text = open(__file__.replace("tools/mariokart/preview.py", "packages/sim/src/kartdata.ts")).read()
data = json.loads(text[text.index("= ", text.index("/* data */")) + 2].rstrip().rstrip(";")) if False else json.loads(text[text.index("= ", text.index("/* data */")) + 2:].strip().rstrip(";"))
ids = sys.argv[2:] or list(data)
COL = {"jump": (230, 60, 60), "glide": (160, 60, 220), "boost": (255, 170, 0), "ice": (80, 200, 255), "sand": (210, 180, 90), "mud": (110, 70, 40), "water": (40, 110, 220)}
cell = 360
cols = min(len(ids), 4)
rows = math.ceil(len(ids) / cols)
sheet = Image.new("RGB", (cols * cell, rows * cell), (27, 30, 38))
d = ImageDraw.Draw(sheet)
for n, id in enumerate(ids):
    e = data[id]; p = e["points"]; pts = list(zip(p[0::2], p[1::2]))
    xs, ys = [q[0] for q in pts], [q[1] for q in pts]
    k = (cell - 40) / max(max(xs) - min(xs), max(ys) - min(ys))
    ox, oy = (n % cols) * cell + 20, (n // cols) * cell + 28
    T = lambda q: (ox + (q[0] - min(xs)) * k, oy + (q[1] - min(ys)) * k)
    q = [T(a) for a in pts]
    d.line(q + [q[0]], fill=(235, 235, 235), width=3)
    # pieces
    tot = sum(math.dist(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts)))
    cum = [0.0]
    for i in range(len(pts)): cum.append(cum[-1] + math.dist(pts[i], pts[(i + 1) % len(pts)]))
    def at(f):
        s = f * tot
        for i in range(len(pts)):
            if cum[i + 1] >= s:
                u = (s - cum[i]) / max(cum[i + 1] - cum[i], 1e-9); a, b = q[i], q[(i + 1) % len(q)]
                return (a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u)
        return q[0]
    for f in e.get("fx", []):
        a, b = at(f["at"]), at(min(f["at"] + f["len"], 0.9999))
        d.line([a, b], fill=COL.get(f["type"], (255, 0, 255)), width=7)
    for i in range(0, len(q), max(1, len(q) // 14)):
        a, b = q[i], q[(i + 3) % len(q)]
        l = math.dist(a, b) or 1
        d.line([a, (a[0] + (b[0] - a[0]) / l * 9, a[1] + (b[1] - a[1]) / l * 9)], fill=(120, 200, 120), width=2)
    d.ellipse([q[0][0] - 6, q[0][1] - 6, q[0][0] + 6, q[0][1] + 6], fill=(255, 215, 0))
    d.text((ox, oy - 20), id, fill=(255, 255, 255))
sheet.save(sys.argv[1]); print(sys.argv[1], sheet.size)
