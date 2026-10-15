"""Trace a one-line track outline image (dark line on a light ground) into a closed polyline.

usage: uv run --with pillow --with numpy --with scikit-image python trace_image.py in.img out.json
Writes [[x, y], ...] in pixels, in order round the loop. A throwaway helper for fictional circuits (see trace.ts)."""
import json, sys
import numpy as np
from PIL import Image
from skimage.morphology import skeletonize

img = Image.open(sys.argv[1]).convert("L")
S = 4
img = img.resize((img.width * S, img.height * S), Image.LANCZOS)
mask = np.array(img) < 140
sk = skeletonize(mask)
pts = {(int(y), int(x)) for y, x in zip(*np.nonzero(sk))}
nb = lambda p: [(p[0] + dy, p[1] + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx) and (p[0] + dy, p[1] + dx) in pts]
# prune spurs until every point has exactly two neighbours
for _ in range(60):
    ends = [p for p in pts if len(nb(p)) <= 1]
    if not ends: break
    pts -= set(ends)
deg = {p: len(nb(p)) for p in pts}
print("points", len(pts), "junction-ish", sum(1 for d in deg.values() if d > 2), file=sys.stderr)
start = min(pts)
order, seen, cur = [start], {start}, start
while True:
    nxt = [q for q in nb(cur) if q not in seen]
    if not nxt: break
    # prefer 4-neighbours, then nearest
    nxt.sort(key=lambda q: abs(q[0] - cur[0]) + abs(q[1] - cur[1]))
    cur = nxt[0]; order.append(cur); seen.add(cur)
print("walked", len(order), "of", len(pts), file=sys.stderr)
json.dump([[x / S, y / S] for y, x in order], open(sys.argv[2], "w"))
