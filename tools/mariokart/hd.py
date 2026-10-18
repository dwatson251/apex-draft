"""hand.py for points read off a *displayed* montage (the viewer scales a tall montage down): hd.py game id "x,y ..." disp_scale tile_ox_m tile_oy_m tile_s [--notes=...]
(disp_scale = displayed width / montage width; tile_* are montage.py's ox oy s)"""
import subprocess, sys, os
game, id, pts, ds, ox, oy, s = sys.argv[1:8]
ds, ox, oy, s = float(ds), float(ox), float(oy), float(s)
P = [tuple(map(float, p.split(","))) for p in pts.split()]
P = [(x / ds, y / ds) for x, y in P]
rest = [a for a in sys.argv[8:]]
subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "hand.py"), game, id, "auto", " ".join(f"{x:.1f},{y:.1f}" for x, y in P), f"--tile={ox},{oy},{s}"] + rest, check=True, stdout=subprocess.DEVNULL)
