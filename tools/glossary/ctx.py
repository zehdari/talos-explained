"""Shows where a term appears on the site, with the nearest h2 id and some text around it.
Usage: python3 tools/glossary/ctx.py [-n N] term [term...]"""
import re, sys, glob, html, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
pages = sorted(glob.glob(ROOT + '/*.html') + glob.glob(ROOT + '/perception/*.html') + glob.glob(ROOT + '/control/*.html'))
pages = [p for p in pages if not p.endswith('glossary.html')]
args = sys.argv[1:]; n = 3
if args[0] == '-n': n = int(args[1]); args = args[2:]
docs = []
for p in pages:
    t = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', open(p).read(), flags=re.S)
    # split at h2 ids
    parts = re.split(r'(<h[23][^>]*\bid="[^"]+")', t)
    sec = 'top'
    for part in parts:
        m = re.match(r'<h[23][^>]*\bid="([^"]+)"', part)
        if m: sec = m.group(1); continue
        txt = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', part)))
        docs.append((os.path.relpath(p, ROOT), sec, txt))
for term in args:
    print(f'=== {term}')
    k = 0
    rx = re.compile(r'(?<![\w-])' + re.escape(term) + r'(?![\w])', re.I if term.islower() else 0)
    for page, sec, txt in docs:
        for m in rx.finditer(txt):
            s = max(0, m.start() - 160); e = min(len(txt), m.end() + 220)
            print(f'  [{page}#{sec}] …{txt[s:e]}…')
            k += 1
            break
        if k >= n: break
