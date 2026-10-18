"""Lay the pieces a course's wiki page mentions (roster.json `features`) on its shape, by theme and at fixed places round the lap, where the shape has none yet.
Only what suits the theme: ice on snow courses, sand on desert and beach, water on beach and water courses, mud on jungle and mine, boosts and ramps anywhere.
Ramps are snapped to the nearest straight with room by build.ts (and left out when there is none). Run: python3 fxauto.py"""
import json, os
here = os.path.dirname(os.path.abspath(__file__))
roster = {r["id"]: r for r in json.load(open(os.path.join(here, "roster.json")))}
total = 0
for f in sorted(os.listdir(os.path.join(here, "shapes"))):
    if not f.endswith(".json"): continue
    path = os.path.join(here, "shapes", f); d = json.load(open(path))
    for id, sh in d.items():
        if sh.get("fx"): continue
        r = roster[id]; feats = set(r["features"]); th = r["theme"]; fx = []
        h = sum(map(ord, id)) % 7 / 100  # a little spread so the pieces do not all sit at the same place
        if "glide" in feats: fx.append({"at": 0.34 + h, "end": 0.40 + h, "type": "glide"})
        elif "jump" in feats: fx.append({"at": 0.30 + h, "end": 0.34 + h, "type": "jump"})
        if "boost" in feats or th in ("rainbow", "tech", "city"): fx.append({"at": 0.58 + h, "end": 0.63 + h, "type": "boost"})
        if th == "snow" and ("ice" in feats or True): fx.append({"at": 0.14 + h, "end": 0.24 + h, "type": "ice"})
        if th in ("desert", "beach") and "sand" in feats: fx.append({"at": 0.72 + h, "end": 0.80 + h, "type": "sand"})
        if th in ("beach", "water") and "water" in feats: fx.append({"at": 0.84 + h, "end": 0.90 + h, "type": "water"})
        if th in ("jungle", "mine", "meadow") and "mud" in feats: fx.append({"at": 0.46 + h, "end": 0.53 + h, "type": "mud"})
        if fx: sh["fx"] = fx; total += len(fx)
    json.dump(d, open(path, "w"), indent=1)
print(total, "pieces laid")
