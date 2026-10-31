"""Prints the plain text of given sections: page.html#id [max chars]."""
import re, sys, html, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
lim = 2500
for a in sys.argv[1:]:
    if a.isdigit(): lim = int(a); continue
    page, sid = a.split('#')
    t = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', open(os.path.join(ROOT, page)).read(), flags=re.S)
    m = re.search(r'<h([23])[^>]*\bid="' + re.escape(sid) + r'"', t)
    if not m: print('!! missing', a); continue
    rest = t[m.start():]
    n = re.search(r'<h2[^>]*\bid=', rest[5:])
    chunk = rest[: n.start() + 5] if n else rest
    txt = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', chunk)))
    print(f'=== {a}\n{txt[:lim]}\n')
