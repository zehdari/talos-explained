#!/usr/bin/env python3
"""Which part of RepairCompMpcTree was running when, from a recorded Nereus run.

    source /opt/ros/humble/setup.bash && source ~/osu-uwrt/release/install/setup.bash
    python3 tools/mission-tree/tree_run.py BAG_DB3 AUTONOMY_LOG [OUT_JSON]

BAG_DB3: a rosbag2 sqlite file with /talos/autonomy/tree_stack (riptide_msgs2/TreeStack: the names of the running
nodes, root first, published by doTask's UwrtLogger on every status change). AUTONOMY_LOG: the launch log of the
same run (doTask's lines). Times are put on the mission clock of public/data/mission_hero_exact.json by matching the
tree's log lines to that file's tree_log. Each stack is matched to a node of public/data/mission-tree/tree.json
(run build_tree.py first); a node is addressed by its child indices from the main tree's root, a SubTree node's only
child being the subtree's root.
"""
import bisect, json, re, sqlite3, sys
from pathlib import Path
import numpy as np
from rclpy.serialization import deserialize_message
from riptide_msgs2.msg import TreeStack

SITE = Path(__file__).resolve().parents[2]
BAG, LOG = sys.argv[1], sys.argv[2]
OUT = Path(sys.argv[3]) if len(sys.argv) > 3 else SITE / 'public/data/mission-tree/run.json'
tree = json.load(open(SITE / 'public/data/mission-tree/tree.json'))
hero = json.load(open(SITE / 'public/data/mission_hero_exact.json'))
ST = tree['subtrees']

def name(n): return n.get('n') or n.get('id') or n['k']
def kids(n):
    if n['k'] == 'SubTree': return [ST[n['id']]] if n['id'] in ST else []
    return n.get('c', [])
ROOT = ST[tree['main']]

# ---- wall clock -> mission clock, from the tree's own log lines ----
LINE = re.compile(r'\[(INFO|WARN|ERROR)\] \[(\d+\.\d+)\] \[talos\.autonomy\]: (.*)')
raw = [(float(m.group(2)), m.group(1), m.group(3).strip()) for l in open(LOG) if (m := LINE.search(l))]
pairs, used = [], set()
for t, msg in hero['tree_log']:
    for i, (w, _, m) in enumerate(raw):
        if i not in used and m == msg and abs((t - w) - (hero['tree_log'][0][0] - raw[0][0])) < 1e9:
            pairs.append((w, t)); used.add(i); break
W, M = np.array([p[0] for p in pairs]), np.array([p[1] for p in pairs])
A = np.polyfit(W, M, 1)
for _ in range(3):
    ok = np.abs(np.polyval(A, W) - M) < 1.0
    A = np.polyfit(W[ok], M[ok], 1)
res = np.polyval(A, W) - M
print(f'wall -> mission: rate {A[0]:.5f}, {ok.sum()}/{len(pairs)} lines, max residual {np.abs(res[ok]).max():.3f} s')
tmap = lambda w: float(np.polyval(A, w))

# ---- stacks from the bag ----
db = sqlite3.connect(BAG)
tid = db.execute("select id from topics where name like '%autonomy/tree_stack'").fetchone()[0]
msgs = [(tmap(ts / 1e9), list(deserialize_message(d, TreeStack).stack))
        for ts, d in db.execute('select timestamp, data from messages where topic_id=? order by timestamp', (tid,))]
print(len(msgs), 'stacks from', round(msgs[0][0], 1), 'to', round(msgs[-1][0], 1))

# The logger pushes a node when it starts RUNNING. Control nodes set RUNNING before ticking their children, but the
# custom RetryUntilSuccessfulOrTimeout decorator only after its child has run, so its entry lands out of place. Drop
# those entries and let the matcher pass through the decorator. A stack that still doesn't match exactly is matched
# as far down as it does (the rest is left over from a halted branch).
RETRY = 'RetryUntilSuccessfulOrTimeout'
retry_names = set()
def collect(n):
    if n.get('id') == RETRY: retry_names.add(name(n))
    for c in n.get('c', []): collect(c)
for t in ST.values(): collect(t)

def candidates(stack):
    """The tree paths that best explain a stack: (paths, exact). A pop always removes the last entry, so a decorator
    pushed late leaves a stale name in the middle of later stacks; an inexact match may skip up to 4 stack entries."""
    stack = [x for x in stack if x not in retry_names]
    best = [-1e9, []]
    def kids_through(n, path):
        for i, c in enumerate(kids(n)):
            if c.get('id') == RETRY: yield from kids_through(c, path + (i,))
            else: yield c, path + (i,)
    def walk(n, d, path, skips, matched):
        score = matched - 0.5 * skips - (0 if d == len(stack) - 1 else 0.25 * (len(stack) - 1 - d))
        if score > best[0] + 1e-9: best[0], best[1] = score, [path]
        elif abs(score - best[0]) < 1e-9: best[1].append(path)
        if d == len(stack) - 1: return
        for c, cp in kids_through(n, path):
            for sk in range(0, min(2, 4 - skips) + 1):
                j = d + 1 + sk
                if j < len(stack) and name(c) == stack[j]:
                    walk(c, j, cp, skips + sk, matched + 1)
    if stack and name(ROOT) == stack[0]: walk(ROOT, 0, (), 0, 1)
    exact = best[0] == len(stack)
    return best[1], exact

prev, chosen, ambiguous, missing, cache = (), [], 0, 0, {}
for t, stack in msgs:
    if not stack: chosen.append((t, None)); continue
    k = tuple(stack)
    if k not in cache: cache[k] = candidates(stack)
    cs, exact = cache[k]
    cs = list(cs)
    if not exact: missing += 1
    if not cs: chosen.append((t, None)); continue
    if len(cs) > 1:
        ambiguous += 1
        def score(p):
            k = 0
            while k < min(len(p), len(prev)) and p[k] == prev[k]: k += 1
            forward = p[k:k + 1] >= prev[k:k + 1]
            return (k, forward, [-x for x in p])
        cs.sort(key=score, reverse=True)
    prev = cs[0]
    chosen.append((t, cs[0]))
print('ambiguous', ambiguous, 'matched only in part', missing, 'unique stacks', len(cache))

# ---- per node: when it was running (merged spans); per 0.2 s step: the stack that held longest ----
END = hero['duration']
key = lambda p: '.'.join(map(str, p))
spans = {}
for i, (t, p) in enumerate(chosen):
    if p is None: continue
    t1 = chosen[i + 1][0] if i + 1 < len(chosen) else END
    for d in range(len(p) + 1):
        k = key(p[:d])
        s = spans.setdefault(k, [])
        if s and t - s[-1][1] < 1.0: s[-1][1] = max(s[-1][1], t1)
        else: s.append([t, t1])

# The stack topic drops messages in bursts (many instant nodes in one tick), so a quick node can be missing although it
# ran. Fill those in from the tree's rules: a control node that ran ran its first child and every child before the last
# one that ran (an IfThenElse only its condition); a built-in decorator or SubTree that ran ran its child. The custom
# RetryUntilSuccessfulOrTimeout is left out: with no time left it fails without ticking its child. An inferred node is
# given the instant its next logged sibling (or its parent) started.
CONTROL = {'Sequence', 'ReactiveSequence', 'Fallback'}
PASS = {'ForceSuccess', 'ForceFailure', 'Inverter', 'Repeat', 'RetryUntilSuccessful', 'SubTree'}
def walk_all(n, p, out):
    out.append((p, n))
    for i, c in enumerate(kids(n)): walk_all(c, p + (i,), out)
nodes = []
walk_all(ROOT, (), nodes)
inferred = 0
changed = True
while changed:
    changed = False
    for p, n in nodes:
        k = key(p)
        if k not in spans: continue
        ks = kids(n)
        if not ks: continue
        want = []
        if n['k'] in CONTROL:
            ran = [i for i in range(len(ks)) if key(p + (i,)) in spans]
            want = list(range((max(ran) if ran else 0) + 1))
        elif n['k'] == 'IfThenElse': want = [0]
        elif n['k'] in PASS: want = [0]
        for i in want:
            ck = key(p + (i,))
            if ck in spans: continue
            later = [spans[key(p + (j,))][0][0] for j in range(i + 1, len(ks)) if key(p + (j,)) in spans]
            t0 = later[0] if later else spans[k][0][0]
            spans[ck] = [[t0, t0]]
            inferred += 1; changed = True
print('inferred', inferred, 'quick nodes the stack topic missed')

spans = {k: [[round(a, 2), round(b, 2)] for a, b in v] for k, v in spans.items()}

DT = 0.2
paths, index, steps = [], {}, []
times = [t for t, _ in chosen]
for s in range(int(END / DT) + 1):
    a, b = s * DT, (s + 1) * DT
    i = max(bisect.bisect_right(times, a) - 1, 0)
    best, hold = None, 0
    while i < len(chosen) and chosen[i][0] < b:
        t0 = max(chosen[i][0], a); t1 = min(chosen[i + 1][0] if i + 1 < len(chosen) else END, b)
        if chosen[i][1] is not None and chosen[i][0] <= b and t1 - t0 >= hold and (t1 > t0 or best is None):
            best, hold = chosen[i][1], t1 - t0
        i += 1
    if best is None or a < chosen[0][0] or a > chosen[-1][0] + 0.5: steps.append(-1); continue
    k = key(best)
    if k not in index: index[k] = len(paths); paths.append(k)
    steps.append(index[k])

# ---- the mission's segments: which task under COMP was running ----
def node_at(p):
    n = ROOT
    for i in p: n = kids(n)[i]
    return n
LABEL = {'WaitForKillSwitch': 'Kill switch', 'PrepForRun': 'Prep', 'Dive': 'Dive', 'GateTreeMpc': 'Gate', 'SlalomPathMpc': 'Slalom',
         'RandomPingerTree': 'Pinger', 'Path: to torpedo': 'To torpedo', 'TorpedoTreeMpc': 'Torpedo', 'Path: leave torpedo, straight to the table': 'To table',
         'Path: to the table': 'To table', 'NewTableTreeMpc': 'Table', 'Path: leave the table, straight to bins': 'To bins',
         'Path: leave the table, straight to torpedo': 'To torpedo', 'Path: leave torpedo, straight to bins': 'To bins',
         'BINS': 'Bins', 'MagnetTreeMpc': 'Magnets', 'Path: leave bins, straight home through the gate': 'Home', 'KillController': 'Stop'}
def task(p):
    if p is None: return None
    for d in range(len(p) + 1):
        n = node_at(p[:d])
        if name(n) in LABEL: return LABEL[name(n)], key(p[:d])
    return None
segs = []
for t, p in chosen:
    tk = task(p)
    if tk is None: continue
    if segs and segs[-1][2] == tk[0]: segs[-1][1] = t; continue
    if segs: segs[-1][1] = t
    segs.append([t, t, tk[0], tk[1]])
merged = []
for a, b, l, k in (x for x in segs if x[1] - x[0] > 0.3):
    if merged and merged[-1][2] == l: merged[-1][1] = b
    else: merged.append([a, b, l, k])
for i in range(len(merged) - 1): merged[i][1] = merged[i + 1][0]
segs = [[round(a, 2), round(b, 2), l, k] for a, b, l, k in merged]
for s in segs: print('  ', s)

# ---- the tree's log, without the per-step move chatter ----
NOISE = re.compile(r'^(Alignment computed|Translation Complete|Rotation Complete|Translating to XYZ|Rotating to RPY|Attempting to move forward|'
                   r'Enforcing minimum depth|Aligning link .* within frame world|Getting parameter|Registering|Using tree directory|DoTask: Loading)')
log = [[round(tmap(w), 2), lvl[0], re.sub(r'/home/\S*/', '', m)] for w, lvl, m in raw if not NOISE.search(m) and tmap(w) > -5]

out = {'duration': END, 'dt': DT, 'paths': paths, 'steps': steps, 'spans': spans, 'segments': segs, 'log': log,
       'phases': hero['phases'], 'video': {'src': 'video/cam_exact.mp4', 't0': -0.04}}
OUT.write_text(json.dumps(out, separators=(',', ':')))
print('wrote', OUT, f'{OUT.stat().st_size / 1e3:.0f} kB,', len(paths), 'leaf paths,', len(spans), 'nodes ran,', len(log), 'log lines')
