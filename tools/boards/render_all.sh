#!/bin/bash
# Render top and bottom 3D views of each converted board with kicad-cli, then trim and save webp
# into public/media/boards/. Usage: render_all.sh [id ...]   (default: every board in boards_list.tsv)
WORK=${WORK:-/tmp/boards_work}
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${OUT:-$HERE/../../public/media/boards}
mkdir -p "$OUT"
ids=("$@")
if [ ${#ids[@]} -eq 0 ]; then
  mapfile -t ids < <(grep -v '^#' "$HERE/boards_list.tsv" | cut -f1 | grep -v '^$')
fi
for id in "${ids[@]}"; do
  read -r w h < <(python3 -c "import json;d=json.load(open('$WORK/$id.json'));print(*d['size_mm'])")
  # image aspect follows the board; long side 2000 px
  read -r pw ph < <(python3 -c "w,h=$w,$h;s=2000/max(w,h);print(int(w*s)+160,int(h*s)+160)")
  for side in top bottom; do
    systemd-run --user --scope -q -p MemoryMax=6G kicad-cli pcb render --side $side --quality high \
      --width $pw --height $ph --background transparent --zoom 1.05 \
      -o "$WORK/${id}_$side.png" "$WORK/$id.kicad_pcb" > /dev/null 2>&1
    # trim the transparent border, keep a small margin, cap the long side at 1400 px
    convert "$WORK/${id}_$side.png" -channel A -threshold 75% +channel -trim +repage -bordercolor none -border 12 \
      -resize '1400x1400>' -quality 82 -define webp:method=6 -define webp:alpha-quality=90 "$OUT/${id}-$side.webp"
    echo "$id $side $(identify -format '%wx%h' "$OUT/${id}-$side.webp") $(du -k "$OUT/${id}-$side.webp" | cut -f1) KB"
  done
done

# Landscape copies of the tall boards (easier to fit in a wide figure); rotated 90 deg counter-clockwise.
for id in ccbb led ivc; do
  for side in top bottom; do
    [ -f "$WORK/${id}_$side.png" ] || continue
    convert "$WORK/${id}_$side.png" -channel A -threshold 75% +channel -trim +repage -rotate -90 -bordercolor none -border 12 \
      -resize '1400x1400>' -quality 82 -define webp:method=6 -define webp:alpha-quality=90 "$OUT/${id}-$side-landscape.webp"
    echo "$id $side landscape $(identify -format '%wx%h' "$OUT/${id}-$side-landscape.webp")"
  done
done
