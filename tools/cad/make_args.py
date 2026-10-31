"""Build the shots.cs command list for the Talos CAD media library.

usage: python3 make_args.py tree_Talos.jsonl PHASE > args.txt   (PHASE = iso | ctx | sys)
Boxes come from the component bounding boxes dumped by dump_tree.cs (SolidWorks assembly frame, mm:
+Z = bow, +X = port, +Y = up).
"""
import json, sys

rows = [json.loads(l) for l in open(sys.argv[1])]
phase = sys.argv[2]
S = r'C:\talos\explainer_cad\_shots'
SIZE = '4756,2644'
FULL = [-512, -469, -358, 512, 373, 405]
V = {
    'iso': ('1,0.75,1', ''), 'rear': ('-1,0.75,-1', ''), 'below': ('1,-0.6,1', ''), 'below_rear': ('-1,-0.6,-1', ''),
    'front': ('0,0,1', ''), 'back': ('0,0,-1', ''), 'port': ('1,0,0', ''), 'stbd': ('-1,0,0', ''),
    'top': ('0,1,0', '0,0,1'), 'bottom': ('0,-1,0', '0,0,1'), 'iso_stbd': ('-1,0.75,1', ''), 'below_stbd': ('-1,-0.6,1', ''),
}
SHELLS = ['MainHousingFore', 'MainHousingAft', 'PolycarbonateChannels', 'PolycarbonateViewport', 'LidEyeGlass']
HOUSING_EXTRAS = ['Port_Lid', 'Starboard_Lid', 'Buoyancy Assembly', 'TensionRods', 'LidGrip', 'Draw Latch', 'O-Ring',
                  'LidGasket', 'Housing Connection', 'Closed Rails', 'Cage Assembly 4']
ALWAYS_HIDE = ['DVL Sensor Cone']  # a transparent cone drawn to show the DVL beams; not a part


def match(name, pats):
    for p in pats:
        if p.startswith('^'):
            if name.lower().startswith(p[1:].lower()):
                return True
        elif p.lower() in name.lower():
            return True
    return False


def box(only=None, hide=(), pats=None, margin=0.06, pad_mm=0):
    lo = [1e9] * 3; hi = [-1e9] * 3
    for r in rows:
        if r['nchild'] or r['suppressed'] or r['hidden'] or not r['box']:
            continue
        n = r['name']
        top = n.split('/')[0]
        if only is not None and not match(top, only):
            continue
        if match(n, list(hide) + ALWAYS_HIDE):
            continue
        if pats is not None and not match(n, pats):
            continue
        b = r['box']
        for k in range(3):
            lo[k] = min(lo[k], b[k]); hi[k] = max(hi[k], b[k + 3])
    m = max(hi[k] - lo[k] for k in range(3)) * margin + pad_mm
    return [round(lo[k] - m) for k in range(3)] + [round(hi[k] + m) for k in range(3)]


def shot(name, view, b):
    f, up = V[view]
    return f'shot|{S}\\{name}.bmp|{f}|{up}|{SIZE}|{",".join(map(str, b))}'


out = ['doc|Talos.SLDASM', 'mode|shaded', 'vis|saved', 'hidesub|' + ','.join(ALWAYS_HIDE)]

# isolated subassemblies: (file stem, top-level only patterns, extra sub-level hides, views)
ISO = [
    ('sub-frame', ['Dorito', 'Taco', 'Holy L Bar', 'Battery Mounting Rail', 'Side Cable', 'Top Cable', 'Bottom Cable', 'Turnbuckle'],
     ['T200', 'Thruster Cable', 'Foam'], ['iso', 'front', 'port', 'top']),
    ('sub-frame-with-thrusters', ['^Dorito-2', '^MirroredDorito', '^Taco-2', '^Mirrored_Taco', 'Holy L Bar', 'Battery Mounting Rail', 'Side Cable', 'Top Cable', 'Bottom Cable', 'Turnbuckle'],
     ['Foam'], ['iso', 'front']),
    ('sub-thruster-module-upper', ['^Dorito-2'], ['Foam'], ['iso', 'port', 'front']),
    ('sub-thruster-module-lower', ['^Taco-2'], ['Foam'], ['iso_stbd', 'stbd', 'front']),
    ('sub-main-housing', ['Talos Main Housing'], [], ['iso', 'rear', 'front', 'top']),
    ('sub-housing-internals', ['Talos Main Housing'], SHELLS + HOUSING_EXTRAS, ['iso', 'top', 'front']),
    ('sub-electronics-cage-port', ['Talos Main Housing'], SHELLS + HOUSING_EXTRAS + ['Cage Assembly-1'], ['iso', 'port']),
    ('sub-computer-cage-starboard', ['Talos Main Housing'], SHELLS + HOUSING_EXTRAS + ['ECageClean'], ['iso_stbd', 'stbd', 'iso']),
    ('sub-battery-pods', ['Smart Battery Housing Assembly', 'Battery Mounting Rail'], [], ['iso', 'front']),
    ('sub-battery-pod', ['^Smart Battery Housing Assembly-1'], [], ['iso', 'rear']),
    ('sub-down-camera', ['^ZEDX_Mini.step-1', 'DFC Mount'], [], ['below', 'stbd']),
    ('sub-dvl', ['DVL Assembly'], [], ['below', 'port']),
    ('sub-torpedo-marker-launcher', ['Torpedoes + Markers V8', 'Torpservoholder', 'ServoHousing', '^mounting'], [], ['iso', 'port', 'below']),
    ('sub-claw', ['EMERGENCYCLAWASSEMBLY'], [], ['iso', 'port', 'front']),
    ('sub-magnet-poker', ['Magnet poker'], [], ['iso', 'port']),
    ('sub-acoustics', ['Acoustics Pods', 'Acoustic_Mount', '^Transducer-2'], [], ['below', 'iso']),
    ('sub-lids-connectors', ['Talos Main Housing', 'Subconn Cover', 'Kill Switch'], [], ['back', 'rear']),
    ('sub-kill-switch', ['^Kill Switch'], [], ['iso']),
    ('sub-buoyancy', ['Talos Main Housing'], SHELLS + [h for h in HOUSING_EXTRAS if h != 'Buoyancy Assembly'] + ['ECageClean', 'Cage Assembly-1'], ['iso']),
]

# in-context highlights: (file stem, leaf patterns to colour, hide shells?, views, zoom box or None)
CTX = [
    ('ctx-thrusters', ['T200'], False, ['iso', 'front', 'port'], None),
    ('ctx-frame', ['^Dorito-2/', '^MirroredDorito-3/', '^Taco-2/', '^Mirrored_Taco-5/', 'Holy L Bar', 'Battery Mounting Rail'], False, ['iso'], None),
    ('ctx-main-housing', ['^Talos Main Housing'], False, ['iso'], None),
    ('ctx-battery-pods', ['Smart Battery Housing Assembly'], False, ['iso'], None),
    ('ctx-forward-camera', ['Cage Assembly-1/ZEDX_Mini', 'cageToZedMiniAdapter'], True, ['iso', 'front'], None),
    ('ctx-down-camera', ['^ZEDX_Mini.step-1', '^DFC Mount'], False, ['below', 'below_stbd'], None),
    ('ctx-dvl', ['^DVL Assembly'], False, ['below'], None),
    ('ctx-imu', ['vn100'], True, ['iso'], None),
    ('ctx-computer', ['NVidia Real', 'GMSL2'], True, ['iso'], None),
    ('ctx-electronics-cage', ['ECageClean'], True, ['iso'], None),
    ('ctx-torpedo-marker-launcher', ['Torpedoes + Markers V8', '^Torpservoholder', '^ServoHousing', '^mounting'], False, ['iso', 'below'], None),
    ('ctx-claw', ['^EMERGENCYCLAWASSEMBLY'], False, ['iso'], None),
    ('ctx-magnet-poker', ['^Magnet poker'], False, ['iso'], None),
    ('ctx-acoustics', ['^Acoustics Pods', '^Acoustic_Mount', '^Transducer-2'], False, ['below'], None),
    ('ctx-kill-switch', ['^Kill Switch'], False, ['iso'], None),
    ('ctx-buoyancy', ['Buoyancy Assembly', 'Foam'], False, ['iso'], None),
    ('ctx-depth-sensor', ['BAR30'], False, ['rear'], None),
    ('ctx-lids-connectors', ['Port_Lid', 'Starboard_Lid', '^Subconn Cover'], False, ['rear'], None),
]
ORANGE = '0.851,0.282,0.059'
GREY = '0.80,0.82,0.84'

# re-shoots after review (2026-10-31): bare frame without the thruster guards, acoustics without the far-off transducer
FIX = [
    ('sub-frame', ['Dorito', 'Taco', 'Holy L Bar', 'Battery Mounting Rail', 'Side Cable', 'Top Cable', 'Bottom Cable', 'Turnbuckle'],
     ['T200', 'Thruster Cable', 'Foam', 'Thruster Protector'], ['iso', 'front', 'port', 'top']),
    ('sub-acoustics', ['Acoustics Pods', 'Acoustic_Mount'], [], ['below', 'iso']),
    ('sub-transducer', ['^Transducer-2'], [], ['iso']),
]
if phase in ('iso', 'fix'):
    for stem, only, hide, views in (ISO if phase == 'iso' else FIX):
        out.append('only|' + ','.join(only))
        if hide:
            out.append('hidesub|' + ','.join(hide + ALWAYS_HIDE))
        b = box(only, hide)
        for v in views:
            out.append(shot(f'{stem}-{v}', v, b))
        out.append('vis|saved')
        out.append('hidesub|' + ','.join(ALWAYS_HIDE))
elif phase == 'ctx':
    out.append('ghostleaf|@@nothing@@|0')
    shells_hidden = False
    for stem, pats, shells, views, zb in sorted(CTX, key=lambda c: c[2]):
        if shells and not shells_hidden:
            out.append('hidesub|' + ','.join(SHELLS)); shells_hidden = True
        out.append(f'color|{",".join(pats)}|{ORANGE}')
        for v in views:
            out.append(shot(f'{stem}-{v}', v, zb or FULL))
        out.append(f'color|{",".join(pats)}|{GREY}')
    out.append('unghostleaf')
    out.append('vis|saved')
elif phase == 'sys':
    # colour-coded systems map (palette = the site's CSS data colours)
    def rgb(h):
        return ','.join(f'{int(h[i:i + 2], 16) / 255:.3f}' for i in (1, 3, 5))
    groups = [
        ('frame', ['^Dorito-2/', '^MirroredDorito-3/', '^Taco-2/', '^Mirrored_Taco-5/', 'Holy L Bar', 'Battery Mounting Rail', 'Side Cable', 'Top Cable', 'Bottom Cable', 'Thimble', 'Turnbuckle'], '#7d8f99'),
        ('housings', ['^Talos Main Housing'], '#2a78d6'),
        ('buoyancy', ['Foam', 'Buoyancy Assembly'], '#e87ba4'),
        ('thrusters', ['T200'], '#d9480f'),
        ('batteries', ['Smart Battery Housing Assembly'], '#eda100'),
        ('sensors', ['^DVL Assembly', '^ZEDX_Mini', '^DFC Mount', '^Acoustics Pods', '^Acoustic_Mount', '^Transducer-2', 'BAR30'], '#1baf7a'),
        ('actuators', ['Torpedoes + Markers V8', '^Torpservoholder', '^ServoHousing', '^mounting', '^EMERGENCYCLAWASSEMBLY', '^Magnet poker'], '#6250d6'),
        # Modelled cables (thruster, battery, DVL): not frame.
        ('cables', ['Thruster Cable', 'Battery Data Cable', 'Macoroni', 'DVL Cable', 'Straight Battery Cable'], '#8fb3bf'),
        # SubConn wet-mate connectors (bulkhead mcbh/mcdc, inline plugs mcil) and the SubConn cover: their own system.
        # Listed after the housings, sensors and cables so it overrides their colour on the connectors.
        ('subconns', ['mcbh', 'mcil', 'mcdc', 'hpbh', 'hpil', 'dbh8', 'dil8', '^Subconn Cover'], '#0f2633'),
        ('switch', ['^Kill Switch'], '#e34948'),
    ]
    for g, pats, col in groups:
        out.append(f'color|{",".join(pats)}|{rgb(col)}')
    for v in ['iso', 'front', 'port', 'top', 'below']:
        out.append(shot(f'talos-systems-{v}', v, FULL))
    out.append('unghostleaf')
    json.dump([{'group': g, 'colour': c, 'patterns': p} for g, p, c in groups], open('/tmp/cadshots/systems_groups.json', 'w'), indent=1)
print('\n'.join(out))
