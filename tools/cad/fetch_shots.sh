#!/bin/bash
# fetch_shots.sh PATTERN -> copies C:\talos\explainer_cad\_shots\PATTERN.bmp to /tmp/cadshots/raw and converts to webp in public/media/cad
set -e
pat=${1:-*}; width=${2:-1600}
mkdir -p /tmp/cadshots/raw
ssh winvm "Remove-Item C:\\talos\\explainer_cad\\_fetch.tar -ErrorAction SilentlyContinue; cd C:\\talos\\explainer_cad\\_shots; tar -cf C:\\talos\\explainer_cad\\_fetch.tar $pat.bmp" >/dev/null
printf 'get "/C:/talos/explainer_cad/_fetch.tar" /tmp/cadshots/_fetch.tar\n' | sftp -b - winvm >/dev/null
tar -xf /tmp/cadshots/_fetch.tar -C /tmp/cadshots/raw
for f in $(tar -tf /tmp/cadshots/_fetch.tar); do
  python3 "$(dirname "$0")/bmp2webp.py" /tmp/cadshots/raw/$f ~/talos-explained/public/media/cad/${f%.bmp}.webp --width $width --pad 0.03
done
