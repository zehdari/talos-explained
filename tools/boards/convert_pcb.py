#!/usr/bin/env python3
"""Convert an Altium .PcbDoc to a KiCad board with KiCad 9's Altium importer, and dump a small
connectivity/footprint summary as JSON (used to check facts such as which net a regulator drives).

Usage: python3 convert_pcb.py <in.PcbDoc> <out.kicad_pcb> <out.json> [KEY=VALUE ...]
KEY=VALUE pairs replace Altium special strings ('.KEY') left unresolved on the silkscreen;
an empty VALUE removes that text (used when the project only has template placeholder values).
"""
import json, re, sys
import pcbnew

src, dst, js = sys.argv[1:4]
subs = dict(a.split('=', 1) for a in sys.argv[4:])

io = pcbnew.PCB_IO_MGR.PluginFind(pcbnew.PCB_IO_MGR.ALTIUM_DESIGNER)
board = io.LoadBoard(src, None)

for item in list(board.GetDrawings()):
    if isinstance(item, pcbnew.PCB_TEXT):
        t = item.GetText()
        m = re.findall(r"'\.(\w+)'", t)
        if not m:
            continue
        drop = False
        for key in m:
            if key in subs:
                if subs[key] == '':
                    drop = True
                t = t.replace("'.%s'" % key, subs[key])
        if drop:
            board.Remove(item)
        else:
            item.SetText(t)

bb = board.GetBoardEdgesBoundingBox()
summary = {
    'source': src,
    'size_mm': [round(pcbnew.ToMM(bb.GetWidth()), 1), round(pcbnew.ToMM(bb.GetHeight()), 1)],
    'origin_mm': [round(pcbnew.ToMM(bb.GetX()), 3), round(pcbnew.ToMM(bb.GetY()), 3)],
    'copper_layers': board.GetCopperLayerCount(),
    'footprints': [],
}
for fp in board.GetFootprints():
    pads = {}
    for p in fp.Pads():
        pads[p.GetNumber()] = p.GetNetname()
    pos = fp.GetPosition()
    pbb = None
    for p in fp.Pads():
        b = p.GetBoundingBox()
        if pbb is None:
            pbb = b
        else:
            pbb.Merge(b)
    fbb = fp.GetBoundingBox(False, False)
    summary['footprints'].append({
        'ref': fp.GetReference(), 'value': fp.GetValue(),
        'pos_mm': [round(pcbnew.ToMM(pos.x), 3), round(pcbnew.ToMM(pos.y), 3)],
        'bbox_mm': [round(pcbnew.ToMM(fbb.GetX()), 3), round(pcbnew.ToMM(fbb.GetY()), 3),
                    round(pcbnew.ToMM(fbb.GetWidth()), 3), round(pcbnew.ToMM(fbb.GetHeight()), 3)],
        'pads_bbox_mm': None if pbb is None else [round(pcbnew.ToMM(pbb.GetX()), 3), round(pcbnew.ToMM(pbb.GetY()), 3),
                                                  round(pcbnew.ToMM(pbb.GetWidth()), 3), round(pcbnew.ToMM(pbb.GetHeight()), 3)],
        'side': 'bottom' if fp.IsFlipped() else 'top', 'pads': pads,
    })
summary['footprints'].sort(key=lambda f: f['ref'])
json.dump(summary, open(js, 'w'), indent=1)
print(src, summary['size_mm'], 'layers', summary['copper_layers'], 'fps', len(summary['footprints']), flush=True)
pcbnew.SaveBoard(dst, board)
