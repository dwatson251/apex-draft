"""Find the road of a flat-coloured overhead map (the 16-bit and handheld games' course maps) and write it as waypoints for tools/mariokart/shapes.

usage: uv run --with pillow --with numpy --with scipy --with scikit-image python autotrace.py picture.png id sx sy dx dy [--tol=40] [--col=r,g,b ...] [--len=N] [--game=smk] [--close=7]
(sx, sy) is a point on the road at the start line and (dx, dy) a point further along it the way the cars go, both in the 0..1000 units of tools/mariokart/grid.py.
The road is the picture's colour at the start point (within --tol), plus any --col colour (a bridge, a boost strip); lane markings and dots are closed over. It is thinned
to one line, walked round from the start in the given direction, and simplified to about a point every 20 units. Prints the waypoints (and, with --game, merges
them into shapes/<game>.json). The picture is Nintendo's and stays in a scratch folder; only the numbers read off it are kept."""
import json, math, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage.morphology import skeletonize, disk, binary_closing

pic, id = sys.argv[1], sys.argv[2]
sx, sy, dx, dy = map(float, sys.argv[3:7])
opt = {a.split("=")[0]: a.split("=", 1)[1] for a in sys.argv[7:] if a.startswith("--") and "=" in a}
cols = [tuple(map(int, a.split("=")[1].split(","))) for a in sys.argv[7:] if a.startswith("--col=")]
tol = float(opt.get("--tol", 40)); close_r = int(opt.get("--close", 7))

img = Image.open(pic).convert("RGBA")
bg = Image.new("RGBA", img.size, (0, 0, 0, 255))
img = Image.alpha_composite(bg, img).convert("RGB")
k = 1000 / max(img.size)
W, H = round(img.width * k), round(img.height * k)
img = img.resize((W, H), Image.NEAREST)
a = np.asarray(img).astype(float)
road = np.array(list(map(int, opt['--road'].split(','))), float) if '--road' in opt else a[int(sy), int(sx)]
targets = [road] + [np.array(c, float) for c in cols]
mask = np.zeros((H, W), bool)
for t in targets: mask |= np.linalg.norm(a - t, axis=2) < tol
if "--notbg" in opt:  # the road is whatever is not the background colour (a dark road on a dark ground has many shades)
    mask = np.linalg.norm(a - np.array(list(map(int, opt["--notbg"].split(","))), float), axis=2) > float(opt.get("--bgtol", 20))
# --bridge=x1,y1,x2,y2 lays road across a gap the cars jump (or a break in the picture)
from PIL import ImageDraw
mimg = Image.fromarray((mask * 255).astype(np.uint8)); md = ImageDraw.Draw(mimg)
for arg in sys.argv[7:]:
    if arg.startswith("--bridge="):
        x1, y1, x2, y2 = map(float, arg.split("=")[1].split(",")); md.line([(x1, y1), (x2, y2)], fill=255, width=40)
mask = np.asarray(mimg) > 0
mask = binary_closing(mask, disk(close_r))
mask = ndi.binary_opening(mask, structure=disk(3))
lab, n = ndi.label(mask)
if lab[int(sy), int(sx)] == 0:
    ys, xs = np.nonzero(mask); i = np.argmin((xs - sx) ** 2 + (ys - sy) ** 2); l = lab[ys[i], xs[i]]
else: l = lab[int(sy), int(sx)]
mask = lab == l
# fill the little holes (a dot, a marking) but not the infield
holes = ndi.binary_fill_holes(mask) & ~mask
hl, hn = ndi.label(holes)
for i in range(1, hn + 1):
    if (hl == i).sum() < 600: mask |= hl == i
# smooth the ragged edge of the road first, or its skeleton wobbles with it
mask = ndi.gaussian_filter(mask.astype(float), 5) > 0.5
sk = skeletonize(mask)
if "--debug" in opt:  # the mask (grey) and its skeleton (red), to see why a road does not close
    dbg = np.asarray(img).copy() // 3; dbg[mask] = (dbg[mask] * 0 + 170); dbg[sk] = (255, 0, 0)
    Image.fromarray(dbg.astype(np.uint8)).save(opt["--debug"])
pts = {(int(y), int(x)) for y, x in zip(*np.nonzero(sk))}
nb = lambda p: [(p[0] + dy_, p[1] + dx_) for dy_ in (-1, 0, 1) for dx_ in (-1, 0, 1) if (dy_ or dx_) and (p[0] + dy_, p[1] + dx_) in pts]
for _ in range(3000):  # prune every spur: a loop has no ends, so only the loop is left
    ends = [p for p in pts if len(nb(p)) <= 1]
    if not ends: break
    pts -= set(ends)
if not pts: sys.exit("nothing left of the road: try another --tol / --col")
start = min(pts, key=lambda p: (p[1] - sx) ** 2 + (p[0] - sy) ** 2)
if "--walk" in sys.argv:
    # a course that crosses itself: walk the line keeping the heading, and go straight on through a junction (its pixels may be walked twice)
    deg = {p: len(nb(p)) for p in pts}
    free = set()
    for p, d in deg.items():
        if d >= 3:
            for dy_ in range(-7, 8):
                for dx_ in range(-7, 8):
                    q = (p[0] + dy_, p[1] + dx_)
                    if q in pts: free.add(q)
    d0 = (dx - sx, dy - sy); l0 = math.hypot(*d0) or 1; direction = (d0[0] / l0, d0[1] / l0)
    cur = start; order = [start]; seen = {start}; steps = 0
    def pick(cur, dirv):
        cand = [q for q in nb(cur) if q not in seen or q in free]
        cand = [q for q in cand if len(order) < 2 or q != order[-2]]
        if not cand: return None
        return max(cand, key=lambda q: ((q[1] - cur[1]) * dirv[0] + (q[0] - cur[0]) * dirv[1]) / (math.hypot(q[1] - cur[1], q[0] - cur[0]) or 1))
    nxt = pick(cur, direction)
    while nxt is not None and steps < 60000:
        cur = nxt; order.append(cur); seen.add(cur); steps += 1
        j = max(0, len(order) - 14); v = (cur[1] - order[j][1], cur[0] - order[j][0]); lv = math.hypot(*v) or 1
        direction = (v[0] / lv, v[1] / lv)
        if len(order) > 80 and math.hypot(cur[0] - start[0], cur[1] - start[1]) < 4: break
        nxt = pick(cur, direction)
    print(f'walk: {len(order)} steps, ended {math.hypot(order[-1][0] - start[0], order[-1][1] - start[1]):.0f}px from the start', file=sys.stderr)
    order = order if len(order) > 80 and math.hypot(order[-1][0] - start[0], order[-1][1] - start[1]) < 8 else []
else:
    # cut the loop at the start and take the shortest way round from just ahead of it to just behind it (a side branch or a small loop in a wide room is left alone)
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import dijkstra
    nodes = sorted(pts); idx = {p: i for i, p in enumerate(nodes)}
    d0 = (dx - sx, dy - sy); l0 = math.hypot(*d0) or 1; d0 = (d0[0] / l0, d0[1] / l0)
    CUT = 12
    def dot_dir(p): return (p[1] - start[1]) * d0[0] + (p[0] - start[0]) * d0[1]
    dist_s = lambda p: math.hypot(p[0] - start[0], p[1] - start[1])
    ahead = [p for p in nodes if CUT <= dist_s(p) <= CUT + 14 and dot_dir(p) > 0]
    behind = [p for p in nodes if CUT <= dist_s(p) <= CUT + 14 and dot_dir(p) < 0]
    order = []
    if ahead and behind:
        rows, cs, ws = [], [], []
        for p in nodes:
            if dist_s(p) < CUT: continue
            for q in nb(p):
                if dist_s(q) < CUT: continue
                rows.append(idx[p]); cs.append(idx[q]); ws.append(math.hypot(p[0] - q[0], p[1] - q[1]))
        G = coo_matrix((ws, (rows, cs)), shape=(len(nodes), len(nodes))).tocsr()
        a0 = min(ahead, key=lambda p: -dot_dir(p) / (dist_s(p) or 1)); b0 = min(behind, key=lambda p: dot_dir(p) / (dist_s(p) or 1))
        dist, pred = dijkstra(G, indices=idx[a0], return_predecessors=True)
        if math.isfinite(dist[idx[b0]]):
            path = [idx[b0]]
            while path[-1] != idx[a0]: path.append(pred[path[-1]])
            order = [start] + [nodes[i] for i in reversed(path)] + [start]

closed = len(order) > 60
print(f"{id}: skeleton {len(pts)} px, walked {len(order)}, {'closed' if closed else 'NOT closed'}", file=sys.stderr)
P = [(x, y) for y, x in order]
# the skeleton of a ragged road wobbles: average it over a window (the road is a loop)
if closed and len(P) > 80:
    w = 22; n_ = len(P)
    P = [(sum(P[(i + j) % n_][0] for j in range(-w, w + 1)) / (2 * w + 1), sum(P[(i + j) % n_][1] for j in range(-w, w + 1)) / (2 * w + 1)) for i in range(n_)]
# Douglas-Peucker
def rdp(p, eps):
    if len(p) < 3: return p
    (x1, y1), (x2, y2) = p[0], p[-1]; l = math.hypot(x2 - x1, y2 - y1) or 1
    best, bi = 0, 0
    for i in range(1, len(p) - 1):
        d = abs((x2 - x1) * (y1 - p[i][1]) - (x1 - p[i][0]) * (y2 - y1)) / l
        if d > best: best, bi = d, i
    if best > eps: return rdp(p[:bi + 1], eps)[:-1] + rdp(p[bi:], eps)
    return [p[0], p[-1]]
S = rdp(P, 2.0)
# keep points about 12 apart at most
out = []
for q in S:
    if out and math.hypot(q[0] - out[-1][0], q[1] - out[-1][1]) > 70:
        m = math.hypot(q[0] - out[-1][0], q[1] - out[-1][1]); c = int(m // 60)
        for t in range(1, c + 1): out.append((out[-1][0] + (q[0] - out[-1][0]) * 0 , out[-1][1]))  # placeholder, replaced below
        out = out[:len(out) - c]
        o = out[-1]
        for t in range(1, c + 1): out.append((o[0] + (q[0] - o[0]) * t / (c + 1), o[1] + (q[1] - o[1]) * t / (c + 1)))
    out.append(q)
out = [[round(x), round(y)] for x, y in out]
if len(out) > 2 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) < 25: out.pop()
L = sum(math.hypot(out[(i + 1) % len(out)][0] - out[i][0], out[(i + 1) % len(out)][1] - out[i][1]) for i in range(len(out)))
ln = int(opt.get("--len", max(1300, min(2800, round(L * 0.5 / 50) * 50))))
entry = {"pts": out, "len": ln, "notes": "traced"}
print(json.dumps({id: entry}))
if "--game" in opt and not closed and "--force" not in sys.argv: print("not written: the road did not close (try --tol, --col, --close, or another start point)", file=sys.stderr)
elif "--game" in opt:
    f = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shapes", opt["--game"] + ".json")
    d = json.load(open(f)) if os.path.exists(f) else {}
    if id in d and d[id].get("notes") != "traced": print("keeping the hand-made shape", file=sys.stderr)
    else: d[id] = entry; json.dump(d, open(f, "w"), indent=1); print("written", f, file=sys.stderr)
