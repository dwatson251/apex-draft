"""Put several images side by side (2 per row, each scaled to fit 640 wide): uv run --with pillow python montage.py out.png a.png b.png ..."""
import sys
from PIL import Image
ims = [Image.open(p).convert("RGB") for p in sys.argv[2:]]
W = 640
ims = [im.resize((W, round(im.height * W / im.width))) for im in ims]
rows = [ims[i:i + 2] for i in range(0, len(ims), 2)]
H = sum(max(i.height for i in r) for r in rows)
sheet = Image.new("RGB", (W * 2, H), (30, 30, 30)); y = 0
for r in rows:
    for k, im in enumerate(r): sheet.paste(im, (k * W, y))
    y += max(i.height for i in r)
sheet.save(sys.argv[1]); print(sheet.size)
