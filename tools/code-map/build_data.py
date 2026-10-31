#!/usr/bin/env python3
"""Build public/data/code-map/code-map.json: every repo and package Talos uses, measured from the local checkouts.

    python3 -I tools/code-map/build_data.py

Reads tools/code-map/catalog.yaml (the hand-written descriptions, layers and chapters) and, for each repo:
  * the branch and commit checked out, and for release submodules the commit riptide_release pins
    (git ls-tree HEAD) and how many commits the branch is ahead of that pin;
  * package.xml (ROS name, version, build type, dependencies), CMakeLists.txt / setup.py (nodes),
    launch/*.launch.py;
  * non-blank lines per language over `git ls-files` (tracked files only), skipping vendored code
    (VENDOR below) and generated or binary files.
Also writes the release repo's commit history (which submodule pins moved in each commit) to
public/data/code-map/release-history.json.

GitHub-only repos are read from shallow clones in /tmp/gh/<name> (`gh repo clone osu-uwrt/<name> /tmp/gh/<name> -- --depth 1`);
their last-commit dates come from the GitHub API (the tip of the catalog branch, or the default branch), falling back
to the clone's HEAD; `gh repo list` (cached in /tmp/codemap_repos.json) only supplies the archived flag.
"""
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from xml.etree import ElementTree as ET

import yaml

HERE = Path(__file__).resolve().parent
SITE = HERE.parent.parent
OUT = SITE / 'public' / 'data' / 'code-map'
RELEASE = Path.home() / 'osu-uwrt' / 'release'

# Code that is not the team's: vendored libraries, minified JS, lock files, meshes.
VENDOR = re.compile(r'(^|/)(third_party|vendor|vnproglib-[^/]*|node_modules|yaml-cpp|imgui|glm|pico-sdk|matlab_msg_gen'
                    r'|weights|meshes|collision_files|textures|external|mcp251Xfd|glad)(/|$)'
                    r'|(xterm\.js|addon-fit\.js|xterm\.css|\.min\.js|package-lock\.json|uv\.lock|(^|/)json\.hpp|(^|/)stb_[^/]*\.h)$')

# package.xml deps every ROS 2 package has; the explorer lists the other outside packages as "upstream".
CORE = {'rclcpp', 'rclpy', 'rclcpp_action', 'rclcpp_components', 'rclcpp_lifecycle', 'std_msgs', 'std_srvs',
        'geometry_msgs', 'sensor_msgs', 'nav_msgs', 'builtin_interfaces', 'action_msgs', 'tf2', 'tf2_ros',
        'tf2_geometry_msgs', 'tf2_msgs', 'launch', 'launch_ros', 'ros2launch', 'python3-pytest', 'pytest',
        'unique_identifier_msgs', 'diagnostic_msgs', 'visualization_msgs', 'message_filters'}

LANG = {
    '.py': 'Python', '.cpp': 'C++', '.cc': 'C++', '.cxx': 'C++', '.hpp': 'C++', '.hh': 'C++', '.ino': 'C++',
    '.c': 'C', '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.mjs': 'JavaScript',
    '.jsx': 'JavaScript', '.m': 'MATLAB', '.rs': 'Rust', '.sh': 'Shell', '.bash': 'Shell',
    '.frag': 'GLSL', '.vert': 'GLSL', '.glsl': 'GLSL', '.cmake': 'CMake', '.lua': 'Lua',
    '.html': 'HTML/CSS', '.css': 'HTML/CSS',
}
CONFIG = {'.yaml', '.yml', '.json5', '.toml', '.xml', '.msg', '.srv', '.action', '.launch', '.jsonc'}
ALTIUM = {'.schdoc': 'schematics', '.pcbdoc': 'PCB layouts', '.prjpcb': 'board projects', '.schlib': 'symbol libraries',
          '.pcblib': 'footprint libraries'}


def git(repo, *args):
    r = subprocess.run(['git', '-C', str(repo), *args], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else ''


def tracked(repo):
    out = subprocess.run(['git', '-C', str(repo), 'ls-files', '-z'], capture_output=True).stdout.decode(errors='replace')
    return [f for f in out.split('\0') if f]


def lang_of(path, c_dirs):
    name = path.rsplit('/', 1)[-1]
    if name == 'CMakeLists.txt':
        return 'CMake'
    ext = os.path.splitext(name)[1].lower()
    if ext == '.h':  # C or C++: C if its folder tree has .c files and no .cpp
        top = path.split('/')[0]
        return 'C' if c_dirs.get(top) == 'C' else 'C++'
    if ext in LANG:
        return LANG[ext]
    if ext in CONFIG:
        return 'config'
    return None


def count_lines(f):
    try:
        if f.stat().st_size > 3_000_000:
            return 0
        with open(f, 'rb') as fh:
            data = fh.read()
        if b'\0' in data[:4096]:
            return 0
        return sum(1 for line in data.decode('utf-8', 'replace').splitlines() if line.strip())
    except OSError:
        return 0


def measure(repo, files):
    """Lines per language for the given tracked files (paths relative to repo)."""
    c_dirs = {}
    kinds = defaultdict(Counter)
    for f in files:
        ext = os.path.splitext(f)[1].lower()
        kinds[f.split('/')[0]][ext] += 1
    for top, c in kinds.items():
        c_dirs[top] = 'C' if c['.c'] and not (c['.cpp'] or c['.cc'] or c['.hpp']) else 'C++'
    langs, config, nfiles, ifaces = Counter(), 0, 0, Counter()
    for f in files:
        if VENDOR.search(f):
            continue
        ext = os.path.splitext(f)[1].lower()
        if ext in ('.msg', '.srv', '.action'):
            ifaces[ext[1:]] += 1
        lang = lang_of(f, c_dirs)
        if not lang:
            continue
        n = count_lines(repo / f)
        if not n:
            continue
        nfiles += 1
        if lang == 'config':
            config += n
        else:
            langs[lang] += n
    out = {'lang': dict(langs.most_common()), 'code': sum(langs.values()), 'config': config, 'files': nfiles}
    if ifaces:
        out['interfaces'] = dict(ifaces)
    return out


def disk_files(d):
    """Files of an untracked folder (a package not committed yet), or of a nested git repo (a submodule)."""
    if (d / '.git').exists():
        return tracked(d)
    return [str(p.relative_to(d)) for p in d.rglob('*') if p.is_file() and '__pycache__' not in p.parts
            and '.pytest_cache' not in p.parts]


def altium(repo, files):
    c = Counter()
    for f in files:
        ext = os.path.splitext(f)[1].lower()
        if ext in ALTIUM:
            c[ALTIUM[ext]] += 1
    return dict(c)


def parse_package(pkg_dir):
    t = ET.parse(pkg_dir / 'package.xml').getroot()
    bt = t.find('export/build_type')
    deps = sorted({d.text.strip() for tag in ('depend', 'build_depend', 'exec_depend', 'buildtool_depend')
                   for d in t.findall(tag) if d.text})
    return {'ros': t.findtext('name', '').strip(), 'version': t.findtext('version', '').strip(),
            'build': bt.text.strip() if bt is not None else 'ament_cmake', 'deps': deps}


def nodes_of(pkg_dir, files):
    """Executables a package installs. Returns (nodes, tools): nodes are add_executable targets whose sources start
    rclcpp, setup.py console scripts, and installed Python scripts that call rclpy.init; tools are the other
    installed C++ executables (offline fitting, validators, studies)."""
    nodes, tools = set(), set()
    cm = pkg_dir / 'CMakeLists.txt'
    if cm.exists():
        text = re.sub(r'#.*', '', cm.read_text(errors='replace'))
        pm = re.search(r'project\(\s*([\w-]+)', text)
        if pm:
            text = text.replace('${PROJECT_NAME}', pm.group(1))
        installed = set()
        for m in re.finditer(r'install\(\s*TARGETS\s+([^)]*?)(?:\s+(?:EXPORT|DESTINATION|ARCHIVE|LIBRARY|RUNTIME)\b[^)]*)?\)', text):
            installed.update(m.group(1).split())
        for m in re.finditer(r'add_executable\(\s*([A-Za-z_][\w-]*)\s+([^)]*)\)', text):
            name = m.group(1)
            if name.endswith('_test') or name.startswith('test_') or name not in installed:
                continue
            srcs = [s for s in m.group(2).split() if s.endswith(('.cpp', '.c', '.cc'))]
            if any('rclcpp::init' in (pkg_dir / s).read_text(errors='replace') for s in srcs if (pkg_dir / s).exists()):
                nodes.add(name)
            else:
                tools.add(name)
    sp = pkg_dir / 'setup.py'
    if sp.exists():
        for m in re.finditer(r"['\"]\s*([\w-]+)\s*=\s*[\w.]+:\w+\s*['\"]", sp.read_text(errors='replace')):
            nodes.add(m.group(1))
    elif cm.exists():
        for f in files:
            if f.endswith('.py') and '/test' not in f and not f.startswith('test') and 'launch' not in f:
                p = pkg_dir / f
                try:
                    txt = p.read_text(errors='replace')
                except OSError:
                    continue
                if 'rclpy.init' in txt and '__main__' in txt:
                    nodes.add(f.rsplit('/', 1)[-1])
    return sorted(nodes), sorted(tools - nodes)


def launches_of(files):
    return sorted({f.rsplit('/', 1)[-1] for f in files if re.search(r'(^|/)launch/[^/]+\.launch(\.py)?$', f)
                   or re.search(r'(^|/)launch/[^/]+_launch\.py$', f)})


def gh_info():
    """Archived flags from `gh repo list` (cached). Not dates: updatedAt is a metadata time, not a commit."""
    p = Path('/tmp/codemap_repos.json')
    if not p.exists():
        r = subprocess.run(['gh', 'repo', 'list', 'osu-uwrt', '--limit', '300', '--json', 'name,isArchived'],
                           capture_output=True, text=True)
        p.write_text(r.stdout)
    try:
        return {r['name']: r for r in json.loads(p.read_text())}
    except json.JSONDecodeError:
        return {}


def gh_commit_date(github, branch, clone):
    """Committer date of the branch tip on GitHub (shallow clones may be stale), else of the clone's HEAD."""
    if github:
        r = subprocess.run(['gh', 'api', f'repos/{github}/commits/{branch or "HEAD"}', '--jq', '.commit.committer.date'],
                           capture_output=True, text=True)
        if r.returncode == 0 and re.match(r'\d{4}-\d\d-\d\d', r.stdout.strip()):
            return r.stdout.strip()[:10]
    return git(clone, 'log', '-1', '--format=%cd', '--date=short')


def repo_path(src):
    p = src['path']
    if src['kind'] == 'release':
        return RELEASE / p
    return Path(os.path.expanduser(p))


def gh_url(github, branch, sub=''):
    if not github:
        return ''
    base = f'https://github.com/{github}'
    if not branch:
        return base
    return f'{base}/tree/{branch}' + (f'/{sub}' if sub else '')


def build():
    cat = yaml.safe_load((HERE / 'catalog.yaml').read_text())
    ghinfo = gh_info()
    pins = {}
    for line in git(RELEASE, 'ls-tree', 'HEAD', 'src/', 'nereus').splitlines():
        _, kind, sha, path = line.split(None, 3)
        if kind == 'commit':
            pins[path] = sha

    repos = []
    for rc in cat['repos']:
        src = rc['source']
        path = repo_path(src)
        r = {k: rc.get(k) for k in ('id', 'group', 'status', 'layers', 'chapters', 'desc', 'extra', 'branch', 'ref') if k in rc}
        r['name'] = rc.get('name', rc['id'])
        r['githubRepo'] = rc.get('github', '')
        r['github'] = gh_url(rc.get('github'), rc.get('branch'))
        r['packages'] = []
        if not path.exists():
            print('missing', path, file=sys.stderr)
            repos.append(r)
            continue
        is_git = bool(git(path, 'rev-parse', '--git-dir'))
        files = tracked(path) if is_git else []
        # Describe the branch Talos runs: if the local checkout is on another branch (a fix in progress),
        # take the commit and date from origin/<branch> instead. Line counts still come from the checkout.
        ref = rc.get('ref') or 'HEAD'  # catalog `ref`: a pinned commit to describe (zed_wrapper.repos)
        if is_git and src['kind'] != 'gh':
            r['checkedOut'] = git(path, 'rev-parse', '--abbrev-ref', 'HEAD')
            if ref == 'HEAD' and rc.get('branch') and r['checkedOut'] not in (rc['branch'], 'HEAD') \
                    and git(path, 'rev-parse', '--verify', '-q', 'origin/' + rc['branch']):
                ref = 'origin/' + rc['branch']
            r['commit'] = git(path, 'rev-parse', '--short=7', ref)
            r['commitDate'] = git(path, 'log', '-1', '--format=%ad', '--date=short', ref)
        if src['kind'] == 'gh':
            gi = ghinfo.get(Path(src['path']).name, {})
            r['commitDate'] = gh_commit_date(rc.get('github'), rc.get('branch'), path)
            r['archived'] = bool(gi.get('isArchived'))
        if src['kind'] == 'release' and src['path'] in pins:
            sha = pins[src['path']]
            r['pin'] = {'sha': sha[:7], 'date': git(path, 'log', '-1', '--format=%ad', '--date=short', sha),
                        'ahead': int(git(path, 'rev-list', '--count', f'{sha}..{ref}') or 0)}
        if rc.get('pinNote'):
            r['pinNote'] = rc['pinNote']

        if rc.get('altium'):
            r['altium'] = altium(path, files)
        elif not rc.get('noCount'):
            r.update(measure(path, files))

        # Packages: catalog entries are matched to a package.xml dir (ROS) or to a folder (anything else).
        pkg_dirs = {}
        for f in files:
            if (f == 'package.xml' or f.endswith('/package.xml')) and not VENDOR.search(f) and '/test' not in f:
                d = f[:-len('package.xml')].rstrip('/')
                if not (path / d / 'COLCON_IGNORE').exists() or d.endswith('riptide_teleop'):
                    pkg_dirs[d] = parse_package(path / (d or '.'))
        catpk = rc.get('packages') or {}
        untracked = set()
        for key in catpk:
            d = path / key
            if (d / 'package.xml').exists() and key not in pkg_dirs:
                pkg_dirs[key] = parse_package(d)
                sub = disk_files(d)
                if not (d / '.git').exists():
                    untracked.add(key)
                files = files + [f'{key}/{f}' for f in sub]
        ros_by_dir = dict(pkg_dirs)
        used = set()
        for key, pc in catpk.items():
            layers = pc.get('layers') or [pc['layer']]
            p = {'id': key, 'layer': layers[0], 'layers': layers, 'status': pc['status'],
                 'chapters': pc.get('chapters', []), 'desc': pc['desc'], 'note': pc.get('note')}
            # find a matching ROS package dir: last path component == key, or ros name == key
            match = None
            for d, info in ros_by_dir.items():
                if d.rsplit('/', 1)[-1] == key or info['ros'] == key or d == key or (d == '' and key == rc['id']):
                    match = d
                    break
            if src['kind'] == 'local' and 'dependencies' in src['path']:
                sub = path / key
                p['github'] = gh_url(pc.get('github'), '')
                if (sub / '.git').exists():
                    p['branch'] = git(sub, 'rev-parse', '--abbrev-ref', 'HEAD')
                    p.update(measure(sub, tracked(sub)))
                r['packages'].append(p)
                continue
            if match is not None:
                used.add(match)
                info = ros_by_dir[match]
                pf = [f[len(match) + 1:] if match else f for f in files if (f.startswith(match + '/') if match else True)]
                p.update({'dir': match, 'ros': info['ros'], 'version': info['version'], 'build': info['build'],
                          'depsAll': info['deps']})
                p['nodes'], p['tools'] = nodes_of(path / match, pf)
                p['launch'] = launches_of(pf)
                p.update(measure(path / match if match else path, pf))
                p['ignored'] = [m for m in ('COLCON_IGNORE', 'DEPLOY_IGNORE') if (path / match / m).exists()]
                if match in untracked:
                    p['untracked'] = True
                if match and (path / match / '.git').exists():
                    p['submodule'] = git(path / match, 'remote', 'get-url', 'origin').replace('https://github.com/', '').removesuffix('.git')
            elif pc.get('rest'):
                others = [k for k in catpk if k != key]
                pf = [f for f in files if not any(f == k or f.startswith(k + '/') for k in others) and not VENDOR.search(f)]
                p['dir'] = ''
                p.update(measure(path, pf))
            elif key == 'other robots':
                pf = [f for f in files if f.split('/')[0] in ('puddles', 'lilboat', 'mercury', 'SBCBoard')]
                p['dir'] = ''
                p.update(measure(path, pf))
            else:
                pf = [f for f in files if f == key or f.startswith(key + '/')]
                p['dir'] = key
                p.update(measure(path, pf))
                p['launch'] = launches_of(pf)
            if r.get('github') and p.get('dir') is not None and not p.get('untracked') and not p.get('submodule') \
                    and key != 'other robots' and not pc.get('rest'):
                p['github'] = gh_url(rc['github'], rc['branch'], p['dir'])
            elif p.get('submodule'):
                p['github'] = 'https://github.com/' + p['submodule']
            r['packages'].append(p)
        for d in ros_by_dir:
            if d not in used and catpk:
                print(f'  {rc["id"]}: package dir {d!r} not in catalog', file=sys.stderr)
        # Repos whose single package is the repo itself (apriltag_msgs, titan_canmore, ...) get their ROS facts.
        if not catpk and '' in ros_by_dir:
            r['ros'] = ros_by_dir['']['ros']
            r['version'] = ros_by_dir['']['version']
        repos.append(r)

    # Internal dependencies: package.xml deps that name another package in this map.
    repo_ros = {r['ros'] for r in repos if r.get('ros')}  # single-package repos (apriltag_msgs, ...): in the map, not upstream
    by_ros = {}
    for r in repos:
        for p in r['packages']:
            if p.get('ros'):
                by_ros[p['ros']] = (r['id'], p['id'])
    for r in repos:
        for p in r['packages']:
            alldeps = p.pop('depsAll', [])
            deps = [d for d in alldeps if d in by_ros and d != p.get('ros')]
            p['deps'] = [list(by_ros[d]) for d in deps]
            up = [d for d in alldeps if d not in by_ros and d not in repo_ros and d not in CORE
                  and not d.startswith(('ament_', 'rosidl_'))]
            if up:
                p['upstream'] = up
    used_by = defaultdict(list)
    for r in repos:
        for p in r['packages']:
            for rid, pid in p['deps']:
                used_by[(rid, pid)].append([r['id'], p['id']])
    for r in repos:
        for p in r['packages']:
            p['usedBy'] = used_by.get((r['id'], p['id']), [])

    OUT.mkdir(parents=True, exist_ok=True)
    data = {'generated': str(date.today()), 'releaseCommit': git(RELEASE, 'rev-parse', '--short=7', 'HEAD'),
            'releaseCommitDate': git(RELEASE, 'log', '-1', '--format=%ad', '--date=short'),
            'layers': cat['layers'], 'groups': cat['groups'], 'repos': repos}
    (OUT / 'code-map.json').write_text(json.dumps(data, separators=(',', ':')))
    print('wrote', OUT / 'code-map.json', (OUT / 'code-map.json').stat().st_size, 'bytes')
    history()


def history(since='2025-08-01'):
    """Each release commit since `since`: which submodule pins moved and by how many commits."""
    out = []
    log = git(RELEASE, 'log', '--first-parent', f'--since={since}', '--format=%H\t%ad\t%s', '--date=short')
    for line in log.splitlines():
        sha, d, subj = line.split('\t', 2)
        moved = []
        diff = git(RELEASE, 'diff-tree', '--no-commit-id', '-r', '--raw', f'{sha}^', sha)
        for row in diff.splitlines():
            meta, path = row.split('\t', 1)
            parts = meta.split()
            if parts[0] != ':160000' and parts[1] != '160000':
                continue
            a, b = parts[2], parts[3]
            name = path.split('/')[-1]
            sub = RELEASE / path
            n = None
            if set(a) != {'0'} and set(b) != {'0'}:
                c = git(sub, 'rev-list', '--count', f'{a}..{b}')
                n = int(c) if c else None
            moved.append({'repo': name, 'from': a[:7], 'to': b[:7], 'commits': n, 'added': set(a) == {'0'}})
        out.append({'sha': sha[:7], 'date': d, 'msg': subj, 'moved': moved})
    out.reverse()
    (OUT / 'release-history.json').write_text(json.dumps(out, separators=(',', ':')))
    print('wrote', OUT / 'release-history.json', len(out), 'commits')


if __name__ == '__main__':
    build()
