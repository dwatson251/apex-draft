"""Draw a coordinate grid (and optionally a traced polyline) over a reference picture, to read waypoints off it.

usage: uv run --with pillow python grid.py picture.png out.png [shape.json]
The picture is scaled to fit 1000 x 1000 (aspect kept) and gridded every 100, labelled in those units; the waypoints in a shape file (tools/mariokart/shapes) are in
the same units. With a shape file the loop is drawn over the picture, point 0 (the start line) in yellow. Pictures are Nintendo's: they stay in a scratch
folder outside the repository and only the numbers read off them are kept."""
import json, sys
from PIL import Image, ImageDraw

src, out = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGBA")
bg = Image.new("RGBA", img.size, (235, 235, 235, 255))
img = Image.alpha_composite(bg, img).convert("RGB")
k = 1000 / max(img.size)
W, H = round(img.width * k), round(img.height * k)
img = img.resize((W, H), Image.LANCZOS)
d = ImageDraw.Draw(img, "RGBA")
for v in range(0, 1001, 100):
    if v <= W: d.line([(v, 0), (v, H)], fill=(0, 90, 255, 110), width=1); d.text((v + 2, 2), str(v), fill=(0, 40, 200, 255))
    if v <= H: d.line([(0, v), (W, v)], fill=(0, 90, 255, 110), width=1); d.text((2, v + 2), str(v), fill=(0, 40, 200, 255))
if len(sys.argv) > 3:
    shape = json.load(open(sys.argv[3]))
    pts = shape["pts"] if isinstance(shape, dict) else shape
    pts = [tuple(p) for p in pts]
    d.line(pts + [pts[0]], fill=(255, 0, 0, 220), width=3)
    for i, p in enumerate(pts):
        d.ellipse([p[0] - 4, p[1] - 4, p[0] + 4, p[1] + 4], fill=(255, 215, 0, 255) if i == 0 else (255, 0, 0, 255))
        d.text((p[0] + 6, p[1] - 6), str(i), fill=(180, 0, 0, 255))
    if len(pts) > 1:
        a, b = pts[0], pts[1]
        d.text((a[0] + 8, a[1] + 8), "start", fill=(0, 0, 0, 255))
img.save(out)
print(out, W, H)
