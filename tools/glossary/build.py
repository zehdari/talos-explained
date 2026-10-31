"""Builds the glossary entries in glossary.html from tools/glossary/terms/*.txt.

Checks every link (the page exists and has an element with that id), every [[cross-reference]] and every slug,
then replaces everything between <!-- glossary:start --> and <!-- glossary:end --> in glossary.html.

Usage: python3 tools/glossary/build.py [--check]   (--check: validate only, don't write)
"""
import glob, html, os, re, sys, json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
PAGE = os.path.join(ROOT, 'glossary.html')
PARTS = {'start': 'Start here', 'vehicle': 'Vehicle', 'perception': 'Perception', 'control': 'Control',
         'autonomy': 'Autonomy', 'ops': 'Running Talos'}


def slugify(s):
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', s.lower())).strip('-')


def parse():
    entries = []
    for f in sorted(glob.glob(os.path.join(HERE, 'terms', '*.txt'))):
        blocks = re.split(r'\n\s*\n', open(f).read())
        for b in blocks:
            lines = [l for l in b.strip().split('\n') if l.strip() and not (l.startswith('#') and not l.startswith('## '))]
            if not lines:
                continue
            if not lines[0].startswith('## '):
                sys.exit(f'{os.path.basename(f)}: block without a "## Term" header: {lines[0][:60]}')
            e = {'name': lines[0][3:].strip(), 'exp': '', 'aka': [], 'part': '', 'slug': '', 'text': [], 'links': [],
                 'file': os.path.basename(f)}
            for l in lines[1:]:
                m = re.match(r'(exp|aka|part|slug):\s*(.*)$', l)
                if m and not e['text']:
                    k, v = m.groups()
                    e[k] = [a.strip() for a in v.split(',') if a.strip()] if k == 'aka' else v.strip()
                elif l.startswith('> '):
                    e['links'].append(l[2:].strip())
                else:
                    e['text'].append(l.strip())
            e['text'] = ' '.join(e['text'])
            e['slug'] = e['slug'] or slugify(e['name'])
            entries.append(e)
    return entries


def chapter_titles():
    src = open(os.path.join(ROOT, 'src', 'site.js')).read()
    titles, part_tag = {}, None
    for m in re.finditer(r"tag: '([^']+)'|\{ href: '([^']+)', title: (['\"])(.*?)\3", src):
        if m.group(1):
            part_tag = m.group(1)
        else:
            href, title = m.group(2), m.group(4)
            if title == 'Overview' and part_tag:
                title = part_tag
            titles[href] = title
    return titles


_page_cache = {}


def page_ids(page):
    if page not in _page_cache:
        path = os.path.join(ROOT, page)
        if not os.path.exists(path):
            _page_cache[page] = None
        else:
            t = open(path).read()
            ids = {}
            for m in re.finditer(r'<(h[1-4])([^>]*)\bid="([^"]+)"([^>]*)>(.*?)</\1>', t, re.S):
                attrs = m.group(2) + m.group(4)
                short = re.search(r'data-short="([^"]*)"', attrs)
                text = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', m.group(5)))).strip()
                ids[m.group(3)] = html.unescape(short.group(1)) if short else text
            for m in re.finditer(r'\bid="([^"]+)"', t):
                ids.setdefault(m.group(1), None)
            _page_cache[page] = ids
    return _page_cache[page]


def main():
    check_only = '--check' in sys.argv
    entries = parse()
    titles = chapter_titles()
    errors = []
    by_slug, lookup = {}, {}
    for e in entries:
        if e['slug'] in by_slug:
            errors.append(f'duplicate slug {e["slug"]} ({e["name"]})')
        by_slug[e['slug']] = e
        if e['part'] not in PARTS:
            errors.append(f'{e["name"]}: unknown part {e["part"]!r}')
        if not e['links']:
            errors.append(f'{e["name"]}: no links')
        for k in [e['name'], e['slug']] + e['aka']:
            lookup.setdefault(k.lower(), e)
    for e in entries:  # names win over aliases
        lookup[e['name'].lower()] = e

    def link_html(target):
        page, _, anchor = target.partition('#')
        ids = page_ids(page)
        if ids is None:
            errors.append(f'missing page {page}')
            return ''
        if anchor and anchor not in ids:
            errors.append(f'missing anchor {target}')
            return ''
        chap = titles.get(page, page)
        sec = ids.get(anchor) if anchor else None
        inner = f'<span class="gl-ch">{html.escape(chap)}</span>' + (f'<span class="gl-sec">{html.escape(sec)}</span>' if sec else '')
        return f'<li><a href="{page}{("#" + anchor) if anchor else ""}">{inner}</a></li>'

    def render(text, e):
        out = html.escape(text, quote=False)
        out = re.sub(r'`([^`]+)`', lambda m: f'<code>{m.group(1)}</code>', out)

        def xref(m):
            key, _, label = m.group(1).partition('|')
            t = lookup.get(html.unescape(key).lower())
            if not t:
                errors.append(f'{e["name"]}: unknown cross-reference [[{key}]]')
                return label or key
            if t is e:
                return label or key
            return f'<a class="gl-x" href="#term-{t["slug"]}">{label or key}</a>'
        out = re.sub(r'\[\[([^\]]+)\]\]', xref, out)
        out = re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)', r'<a href="\2">\1</a>', out)
        return out

    def sort_key(e):
        return re.sub(r'^[^a-z0-9]+', '', e['name'].lower())

    entries.sort(key=sort_key)
    groups = {}
    for e in entries:
        c = sort_key(e)[:1].upper()
        groups.setdefault('#' if c.isdigit() else c, []).append(e)

    parts_html = []
    for letter, es in groups.items():
        lid = 'letter-' + ('num' if letter == '#' else letter.lower())
        items = []
        for e in es:
            search = ' '.join([e['name'], e['exp']] + e['aka']).lower()
            links = ''.join(link_html(t) for t in e['links'])
            aka = [a for a in e['aka'] if a.lower() != e['name'].lower()]
            items.append(
                f'<div class="gl-entry" id="term-{e["slug"]}" data-part="{e["part"]}" data-k="{html.escape(search)}">\n'
                f'  <dt><a class="gl-name" href="#term-{e["slug"]}">{html.escape(e["name"])}</a>'
                + (f' <span class="gl-exp">{html.escape(e["exp"])}</span>' if e['exp'] else '')
                + f' <span class="gl-part">{PARTS.get(e["part"], "")}</span></dt>\n'
                f'  <dd><p>{render(e["text"], e)}</p>'
                + (f'<p class="gl-aka">Also: {", ".join(html.escape(a) for a in aka)}</p>' if aka else '')
                + f'<ul class="gl-see" aria-label="Where it is explained">{links}</ul></dd>\n</div>')
        parts_html.append(f'<section class="gl-letter" data-letter="{letter}">\n<h2 id="{lid}" data-short="{letter}">{letter}</h2>\n<dl class="gl-list">\n'
                          + '\n'.join(items) + '\n</dl>\n</section>')

    if errors:
        print('\n'.join(errors))
        sys.exit(1)
    body = '\n'.join(parts_html)
    print(f'{len(entries)} terms, {len(groups)} letters, {sum(len(e["links"]) for e in entries)} links: all resolve')
    if check_only:
        return
    page = open(PAGE).read()
    a, b = '<!-- glossary:start -->', '<!-- glossary:end -->'
    if a not in page or b not in page:
        sys.exit('glossary.html has no glossary:start/end markers')
    page = page[: page.index(a) + len(a)] + '\n' + body + '\n' + page[page.index(b):]
    page = re.sub(r'<span class="gl-total">\d*</span>', f'<span class="gl-total">{len(entries)}</span>', page)
    open(PAGE, 'w').write(page)
    os.makedirs(os.path.join(ROOT, 'public', 'data', 'glossary'), exist_ok=True)
    json.dump([{'slug': e['slug'], 'name': e['name'], 'exp': e['exp'], 'part': e['part'], 'links': e['links']} for e in entries],
              open(os.path.join(ROOT, 'public', 'data', 'glossary', 'terms.json'), 'w'), indent=0)


main()
