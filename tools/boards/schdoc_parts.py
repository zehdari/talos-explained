#!/usr/bin/env python3
"""Extract components (designator, library ref, comment/value, description) from Altium .SchDoc files.

Usage: schdoc_parts.py file.SchDoc [...]  -> JSON on stdout.
Altium schematic files are OLE compound documents; the 'FileHeader' stream is a list of
length-prefixed '|KEY=VALUE|...' records. RECORD=1 is a component; its children (OWNERINDEX =
component's record index) carry the designator (RECORD=34) and parameters (RECORD=41).
"""
import json, struct, sys
import olefile

def records(path):
    ole = olefile.OleFileIO(path)
    data = ole.openstream('FileHeader').read()
    i, out = 0, []
    while i + 4 <= len(data):
        n = struct.unpack('<I', data[i:i + 4])[0] & 0xFFFFFF
        raw = data[i + 4:i + 4 + n]
        i += 4 + n
        txt = raw.rstrip(b'\0').decode('latin-1')
        rec = {}
        for kv in txt.split('|'):
            if '=' in kv:
                k, v = kv.split('=', 1)
                rec[k.upper()] = v
        out.append(rec)
    return out

def parts(path):
    recs = records(path)
    # record index: header is index 0 in file, component OWNERINDEX counts from the first record after header
    comps = {}
    for idx, r in enumerate(recs[1:]):
        if r.get('RECORD') == '1':
            comps[idx] = {'libref': r.get('LIBREFERENCE', ''), 'description': r.get('COMPONENTDESCRIPTION', ''),
                          'designator': '', 'params': {}}
    for r in recs[1:]:
        own = r.get('OWNERINDEX')
        if own is None:
            continue
        c = comps.get(int(own))
        if not c:
            continue
        if r.get('RECORD') == '34':
            c['designator'] = r.get('TEXT', '')
        elif r.get('RECORD') == '41':
            name = r.get('NAME', '')
            if name and r.get('TEXT') and not r.get('TEXT', '').startswith('='):
                c['params'][name] = r.get('TEXT')
    # sheet text: notes and text frames (RECORD=4 label, 28 text frame, 209 note)
    notes = [r.get('TEXT', '') for r in recs[1:] if r.get('RECORD') in ('4', '28', '209') and r.get('TEXT')]
    nets = sorted({r.get('TEXT', '') for r in recs[1:] if r.get('RECORD') in ('25', '17', '18') and r.get('TEXT')})
    return {'file': path, 'components': list(comps.values()), 'notes': notes, 'nets_ports_power': nets}

if __name__ == '__main__':
    print(json.dumps([parts(p) for p in sys.argv[1:]], indent=1))
