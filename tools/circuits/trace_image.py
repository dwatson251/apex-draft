"""Trace a one-line track outline image (dark line on a light ground) into a closed polyline.

usage: uv run --with pillow --with numpy --with scikit-image --with scipy python trace_image.py in.img out.json [--alpha[=radius]]
--open=N: (with --alpha) drop lines thinner than 2N pixels first, which takes the pit lane away.
--alpha: the map is a see-through picture whose line is in the alpha channel (the Gran Turismo wiki's GT7 maps). The line is closed over by `radius` pixels
(default 12, so a thin pit lane beside the track merges into it), and only the biggest piece is kept (the corner numbers, the arrow and the start bar fall away).
Writes [[x, y], ...] in pixels, in order round the loop. A throwaway helper for fictional circuits (see trace.ts)."""
import json, sys
import numpy as np
from PIL import Image
from skimage.morphology import skeletonize

alpha = next((a for a in sys.argv[3:] if a.startswith("--alpha")), None)
if alpha:
    from scipy import ndimage as ndi
    from skimage.morphology import disk
    r = int(alpha.split("=")[1]) if "=" in alpha else 12
    mask = np.array(Image.open(sys.argv[1]).convert("RGBA").getchannel("A")) > 128
    opening = next((int(a.split("=")[1]) for a in sys.argv[3:] if a.startswith("--open=")), 0)
    if opening:
        # a pit lane is drawn thinner than the track: opening the picture by more than half its width leaves the track alone
        mask = ndi.binary_opening(mask, structure=disk(opening))
    mask = ndi.binary_closing(np.pad(mask, r + 2), structure=disk(r))[r + 2:-r - 2, r + 2:-r - 2]
    lab, n = ndi.label(mask)
    sizes = ndi.sum(mask, lab, range(1, n + 1))
    mask = lab == (1 + int(np.argmax(sizes)))
    S = 1
else:
    img = Image.open(sys.argv[1]).convert("L")
    S = 4
    img = img.resize((img.width * S, img.height * S), Image.LANCZOS)
    mask = np.array(img) < 140
    from scipy import ndimage as ndi
    lab, n = ndi.label(mask, structure=np.ones((3, 3)))
    mask = lab == (1 + int(np.argmax(ndi.sum(mask, lab, range(1, n + 1)))))  # the biggest piece: the loop, not the labels beside it
sk = skeletonize(mask)
pts = {(int(y), int(x)) for y, x in zip(*np.nonzero(sk))}
nb = lambda p: [(p[0] + dy, p[1] + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx) and (p[0] + dy, p[1] + dx) in pts]
# prune spurs until every point has exactly two neighbours
for _ in range(400 if alpha else 60):
    ends = [p for p in pts if len(nb(p)) <= 1]
    if not ends: break
    pts -= set(ends)
deg = {p: len(nb(p)) for p in pts}
print("points", len(pts), "junction-ish", sum(1 for d in deg.values() if d > 2), file=sys.stderr)
if alpha:
    # the skeleton is one ring with small clumps of pixels where it forks: cut the ring open at one place and take the shortest way round from one cut end to the other
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import dijkstra
    L = sorted(pts)
    idx = {p: i for i, p in enumerate(L)}
    a = L[0]
    cut = {p for p in pts if abs(p[0] - a[0]) <= 6 and abs(p[1] - a[1]) <= 6}
    rest = [p for p in L if p not in cut]
    rid = {p: i for i, p in enumerate(rest)}
    ends = [p for p in rest if any((p[0] + dy, p[1] + dx) in cut for dy in (-1, 0, 1) for dx in (-1, 0, 1))]
    r_, c_, w_ = [], [], []
    for p in rest:
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                q = (p[0] + dy, p[1] + dx)
                if (dy or dx) and q in rid:
                    r_.append(rid[p]); c_.append(rid[q]); w_.append(2 ** 0.5 if dy and dx else 1.0)
    g = coo_matrix((w_, (r_, c_)), shape=(len(rest), len(rest))).tocsr()
    u = ends[0]
    dist, pred = dijkstra(g, directed=False, indices=rid[u], return_predecessors=True)
    v = max(ends, key=lambda q: dist[rid[q]] if np.isfinite(dist[rid[q]]) else -1)
    path, cur = [], rid[v]
    while cur >= 0:
        path.append(rest[cur]); cur = pred[cur]
    order = [a] + path[::-1] + [a]
    print("ring of", len(order), "pixels from", len(pts), "skeleton pixels", file=sys.stderr)
    json.dump([[x, y] for y, x in order], open(sys.argv[2], "w"))
    sys.exit(0)
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
