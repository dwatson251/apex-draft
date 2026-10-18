"""Print the colour of a reference picture at points given in grid.py's 0..1000 units: uv run --with pillow python probe.py picture.png x,y [x,y ...]"""
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGBA"); k = max(im.size) / 1000
for a in sys.argv[2:]:
    x, y = map(float, a.split(","))
    print(a, im.getpixel((min(im.width - 1, int(x * k)), min(im.height - 1, int(y * k)))))
