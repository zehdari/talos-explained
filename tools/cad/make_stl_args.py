"""Command list for shots.cs that exports one binary STL per Talos subsystem (for the 3D explorer GLB).

usage: python3 make_stl_args.py > args.txt   (then swjob shots.cs; fetch C:\\talos\\explainer_cad\\_stl\\*.stl)
Each group: vis|saved (the team's saved visibility), show only its top-level components, hide leaves outside
its include patterns. Groups are written to glb_groups.json for build_glb.py.
"""
import json, os
D = r'C:\talos\explainer_cad\_stl'
FRAME_TOP = ['^Dorito-2', '^MirroredDorito-3', '^Taco-2', '^Mirrored_Taco-5']
# id, label, top-level patterns, leaf include patterns, leaf exclude patterns, colour (site palette)
GROUPS = [
    ('frame', 'Frame: corner modules, cross bars, battery rails, tension cables', FRAME_TOP + ['Holy L Bar', 'Battery Mounting Rail', 'Side Cable', 'Top Cable', 'Bottom Cable', 'Turnbuckle'],
     ['/', 'Cable', 'Turnbuckle'], ['T200', 'Foam', 'Thruster Cable', 'Thruster Protector'], '#7d8f99'),
    ('thruster_guards', 'Thruster guards', FRAME_TOP, ['Thruster Protector'], [], '#b8c0c7'),
    ('thrusters', 'T200 thrusters (8)', FRAME_TOP, ['T200'], [], '#d9480f'),
    ('foam', 'Buoyancy foam', FRAME_TOP + ['Talos Main Housing'], ['Foam', 'Buoyancy Assembly'], [], '#e87ba4'),
    ('hull', 'Main housing: hull tubes, lids, viewports, latches', ['Talos Main Housing'], ['/'], ['Cage Assembly-1', 'ECageClean', 'Cage Assembly 4', 'Buoyancy Assembly'], '#2a78d6'),
    ('electronics', 'Electronics and computer cages (inside the hull)', ['Talos Main Housing'], ['Cage Assembly-1', 'ECageClean', 'Cage Assembly 4'], [], '#008300'),
    ('batteries', 'Smart battery housings (2)', ['Smart Battery Housing Assembly'], ['/'], [], '#eda100'),
    ('dvl', 'DVL and mount', ['DVL Assembly'], ['/'], ['DVL Sensor Cone'], '#1baf7a'),
    ('down_camera', 'Down camera (ZED X Mini) and mount', ['^ZEDX_Mini.step-1', '^DFC Mount'], ['ZEDX', 'DFC'], [], '#1baf7a'),
    ('launcher', 'Torpedo and marker launcher', ['Torpedoes + Markers V8', '^Torpservoholder', '^ServoHousing', '^mounting'], ['Torpedoes', 'Torpservoholder', 'ServoHousing', 'mounting'], [], '#6250d6'),
    ('claw', 'Claw', ['^EMERGENCYCLAWASSEMBLY'], ['/'], [], '#6250d6'),
    ('magnet_poker', 'Magnet poker', ['^Magnet poker'], ['/'], [], '#6250d6'),
    ('acoustics', 'Hydrophone pods and transducer', ['^Acoustics Pods', '^Acoustic_Mount', '^Transducer-2'], ['Acoustic', 'Transducer'], [], '#1baf7a'),
    ('kill_switch', 'Kill switch and SubConn cover', ['^Kill Switch', '^Subconn Cover'], ['Kill Switch', 'Subconn Cover'], [], '#e34948'),
    ('cables', 'Modelled cables', FRAME_TOP + ['Thruster', 'Battery Data Cable', 'Macoroni', 'DVL Cable', 'Straight Battery Cable'],
     ['Cable'], ['Side Cable', 'Top Cable', 'Bottom Cable', 'Thimble'], '#3f5b67'),
]
out = ['doc|Talos.SLDASM', 'freeze|none', 'mode|shaded']
for gid, label, top, inc, exc, col in GROUPS:
    out += ['vis|saved', 'only|' + ','.join(top), 'onlyleaf|' + ','.join(inc) + '|' + ','.join(exc + ['DVL Sensor Cone']),
            f'stl|{D}\\{gid}.stl|coarse']
out.append('vis|saved')
json.dump([dict(id=g, label=l, top=t, include=i, exclude=e, colour=c) for g, l, t, i, e, c in GROUPS],
          open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'glb_groups.json'), 'w'), indent=1)
print('\n'.join(out))
