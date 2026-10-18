#!/bin/sh
# tr.sh <id> <picture file name> sx sy dx dy [options...]: trace a course from its reference picture into shapes/<game>.json
S=/tmp/claude-1000/-home-dnlwtsn-Code-universal-modder/c7f61ca5-d951-4c0a-a85d-5ec6948eb3ac/scratchpad
D=$(dirname "$0"); id=$1; pic=$2; shift 2
game=$(python3 -I -c "import json,sys;print(next(r['game'] for r in json.load(open('$D/roster.json')) if r['id']=='$id'))")
uv run --quiet --with pillow --with numpy --with scipy --with scikit-image python -W ignore "$D/autotrace.py" "$S/ref/$id/$pic" "$id" "$@" --game=$game 2>&1 | grep -v '^{'
python3 -I -c "import json;print(json.dumps(json.load(open('$D/shapes/$game.json'))['$id']))" > "$S/grid/$id.shape.json" && uv run --quiet --with pillow python "$D/grid.py" "$S/ref/$id/$pic" "$S/grid/$id.trace.png" "$S/grid/$id.shape.json" >/dev/null
