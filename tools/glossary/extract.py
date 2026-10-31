"""Gathers glossary candidates from every page: span.term, h2/h3 ids and headings, acronyms, code names.
Usage: python3 tools/glossary/extract.py [anchors|terms|acronyms|code]"""
import re, sys, glob, html, collections, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
pages = sorted(glob.glob(ROOT + '/*.html') + glob.glob(ROOT + '/perception/*.html') + glob.glob(ROOT + '/control/*.html'))
pages = [p for p in pages if not p.endswith('glossary.html')]
rel = lambda p: os.path.relpath(p, ROOT)
strip = lambda s: re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', s))).strip()
mode = sys.argv[1] if len(sys.argv) > 1 else 'terms'
if mode == 'anchors':
    for p in pages:
        t = open(p).read()
        print('##', rel(p))
        for m in re.finditer(r'<(h[1-4])[^>]*\bid="([^"]+)"[^>]*>(.*?)</\1>', t, re.S):
            print(f'  {m.group(1)} #{m.group(2)}  {strip(m.group(3))}')
        other = [m.group(1) for m in re.finditer(r'<(?!h[1-4])[a-z]+[^>]*\bid="([^"]+)"', t)]
        print('  other ids:', ' '.join(re.findall(r'<(?:figure|section|div|aside|table|dl|dt|p|li|details)[^>]*\bid="([^"]+)"', t)))
elif mode == 'terms':
    for p in pages:
        t = open(p).read()
        ts = [strip(m) for m in re.findall(r'<span class="term">(.*?)</span>', t, re.S)]
        ds = [strip(m) for m in re.findall(r'<dfn[^>]*>(.*?)</dfn>', t, re.S)]
        if ts or ds: print(rel(p), '|', '; '.join(ts + ds))
elif mode == 'acronyms':
    c = collections.defaultdict(set)
    for p in pages:
        t = strip(re.sub(r'<(script|style|pre)[^>]*>.*?</\1>', '', open(p).read(), flags=re.S))
        for w in re.findall(r'\b[A-Z][A-Z0-9]{1,}[a-z]?\b', t): c[w].add(rel(p).replace('.html',''))
    for w, s in sorted(c.items(), key=lambda kv: -len(kv[1])): print(f'{w:12} {len(s):2} {" ".join(sorted(s))[:150]}')
elif mode == 'code':
    c = collections.defaultdict(set)
    for p in pages:
        t = open(p).read()
        for m in re.findall(r'<code>(.*?)</code>', t, re.S):
            c[strip(m)].add(rel(p).replace('.html',''))
    for w, s in sorted(c.items(), key=lambda kv: -len(kv[1])):
        if len(s) >= int(sys.argv[2] if len(sys.argv) > 2 else 2): print(f'{w[:50]:50} {len(s):2} {" ".join(sorted(s))[:120]}')
