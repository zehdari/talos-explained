#!/bin/bash
# fetch_stl.sh -> copies C:\talos\explainer_cad\_stl\*.stl (from make_stl_args.py + shots.cs) to /tmp/cadshots/stl
set -e
mkdir -p /tmp/cadshots/stl
ssh winvm "Remove-Item C:\\talos\\explainer_cad\\_stl.tgz -ErrorAction SilentlyContinue; cd C:\\talos\\explainer_cad\\_stl; tar -czf C:\\talos\\explainer_cad\\_stl.tgz *.stl" >/dev/null
printf 'get "/C:/talos/explainer_cad/_stl.tgz" /tmp/cadshots/_stl.tgz\n' | sftp -b - winvm >/dev/null
tar -xzf /tmp/cadshots/_stl.tgz -C /tmp/cadshots/stl
ls -la /tmp/cadshots/stl
