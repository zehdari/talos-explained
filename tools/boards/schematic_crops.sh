#!/bin/bash
# Crop block-level excerpts out of the team's exported schematic PDFs (electric_boogaloo GitHub
# releases Tempest_mk_2, talos_boards, ssfb_boards). PDFS = folder with the downloaded PDFs.
PDFS=${PDFS:-/tmp/gh/eb_pdfs}
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${OUT:-$HERE/../../public/media/boards}
DPI=${DPI:-220}
tmp=$(mktemp -d)
grep -v '^#' "$HERE/schematic_crops.tsv" | while IFS=$'\t' read -r id pdf page ref x0 y0 x1 y1 note; do
  [ -z "$id" ] && continue
  s=$(python3 -c "print($DPI/$ref)")
  read -r X Y W H < <(python3 -c "s=$s;print(int($x0*s),int($y0*s),int(($x1-$x0)*s),int(($y1-$y0)*s))")
  pdftoppm -f "$page" -l "$page" -r "$DPI" -x "$X" -y "$Y" -W "$W" -H "$H" -png "$PDFS/$pdf" "$tmp/$id"
  convert "$tmp/$id"*.png -resize '1800x1800>' -quality 80 -define webp:method=6 "$OUT/$id.webp"
  echo "$id $(identify -format '%wx%h' "$OUT/$id.webp") $(du -k "$OUT/$id.webp" | cut -f1) KB"
done
rm -rf "$tmp"
