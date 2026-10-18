"""Convert montage pixels to grid units: python3 conv.py ox oy s mx,my [mx,my ...]  (the ox oy s that montage.py printed for the tile)"""
import sys
ox, oy, s = map(float, sys.argv[1:4])
print(" ".join(f"{round((float(a.split(',')[0]) - ox) / s)},{round((float(a.split(',')[1]) - oy) / s)}" for a in sys.argv[4:]))
