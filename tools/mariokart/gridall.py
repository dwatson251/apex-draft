"""For each course id: pick the best reference picture in <ref dir>/<id>/ (the largest) and write a gridded copy to <out dir>/<id>.png, to read waypoints off.

usage: uv run --with pillow python gridall.py <ref dir> <out dir> id [id ...] [--pick=N]
--pick=N takes the Nth largest picture instead (0 is the largest). Pictures stay in the scratch folder: they are Nintendo's and are never committed."""
import os, subprocess, sys
from PIL import Image

ref, out = sys.argv[1], sys.argv[2]
args = [a for a in sys.argv[3:] if not a.startswith("--")]
pick = next((int(a.split("=")[1]) for a in sys.argv[3:] if a.startswith("--pick=")), 0)
os.makedirs(out, exist_ok=True)
here = os.path.dirname(os.path.abspath(__file__))
for id in args:
    d = os.path.join(ref, id)
    files = []
    for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        try:
            with Image.open(os.path.join(d, f)) as im: files.append((im.width * im.height, f, im.size))
        except Exception: pass
    files.sort(reverse=True)
    if not files: print(id, "NO PICTURES"); continue
    _, f, size = files[min(pick, len(files) - 1)]
    print(id, f, size, "| others:", [x[1] for x in files if x[1] != f][:3])
    subprocess.run([sys.executable, os.path.join(here, "grid.py"), os.path.join(d, f), os.path.join(out, id + ".png")], check=True, capture_output=True)
