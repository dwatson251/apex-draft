#!/bin/sh
# trace-all.sh [id ...]: re-run the traces listed in traces.txt (all, or the ids given); the hand-placed shapes (hand.py) are not touched
D=$(dirname "$0")
grep -v '^#' "$D/traces.txt" | while IFS='|' read -r id pic start dir opts; do
  id=$(echo $id); [ -z "$id" ] && continue
  if [ $# -gt 0 ]; then case " $* " in *" $id "*) ;; *) continue ;; esac; fi
  "$D/tr.sh" $id $(echo $pic) $(echo $start) $(echo $dir) $opts
done
