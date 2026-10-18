"""Add pieces to a course's shape: python3 fx.py <id> '<json list>'   e.g. '[{"p":[385,735],"q":[390,735],"type":"jump"}]'  (replaces its pieces)"""
import json, os, sys
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shapes")
for f in sorted(os.listdir(d)):
    if not f.endswith(".json"): continue
    s = json.load(open(os.path.join(d, f)))
    if sys.argv[1] in s:
        s[sys.argv[1]]["fx"] = json.loads(sys.argv[2]); json.dump(s, open(os.path.join(d, f), "w"), indent=1); print("ok", f); break
else: sys.exit("no such course")
