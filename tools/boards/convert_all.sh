#!/bin/bash
# Convert every board in boards_list.tsv from Altium to KiCad (in $WORK, default /tmp/boards_work).
# EB = path to a clone of osu-uwrt/electric_boogaloo. Runs under a 6 GB memory cap.
EB=${EB:-/tmp/gh/electric_boogaloo}
WORK=${WORK:-/tmp/boards_work}
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$WORK"
grep -v '^#' "$HERE/boards_list.tsv" | while IFS=$'\t' read -r id pcb title rev; do
  [ -z "$id" ] && continue
  systemd-run --user --scope -q -p MemoryMax=6G python3 -I "$HERE/convert_pcb.py" "$EB/$pcb" "$WORK/$id.kicad_pcb" "$WORK/$id.json" \
    "ProjectTitle=$title" "BoardRevision=$rev" 2>&1 | grep -v -E 'assert|padstack|could not be mapped|^$'
done
