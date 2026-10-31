"""Which node of the hero GLB each SolidWorks leaf component goes into (tools/cad/build_hero.py).

node_of(name) -> node id. Every node belongs to one system (SYSTEM_OF). The hero's tree of systems, containers and
items (public/data/index/hero.json) is built from these node ids. CAD frame: +X port, +Y up, +Z bow.
Port = CAD X > 0. Module names: Dorito = upper, Taco = lower; Dorito-2 / Mirrored_Taco-5 are on port.
"""
import re

SUBCONN = re.compile(r'(^|[/_ ])(mcbh|mcil|mcdc|hpbh|hpil|dbh|dil)\d', re.I)
FASTENER = re.compile(r'screw|nut\b|nut-|locknut|washer|insert|rivet|standoff|threaded rod|hex drive|socket head', re.I)

# corner modules -> (short id, thruster names from talos.yaml: outer, inner)
MODULES = {
    'Dorito-2': ('pu', 'VUP', 'HUP'),
    'MirroredDorito-3': ('su', 'VUS', 'HUS'),
    'Taco-2': ('sl', 'VLS', 'HLS'),
    'Mirrored_Taco-5': ('pl', 'VLP', 'HLP'),
}


def side_of_pod(top):
    # Smart Battery Housing Assembly-1 sits at CAD X > 0 (port), -2 at X < 0 (starboard)
    return 'port' if top.endswith('-1') else 'stbd'


def node_of(name):
    p = name.split('/')
    top, leaf = p[0], p[-1]
    low = name.lower()
    # ---- SubConns (connectors first: they sit inside lids, pods, the hydrophone pod and the DVL)
    if top.startswith('Subconn Cover'):
        return 'subconn_cover'
    if any(SUBCONN.search(x) for x in p[1:] or [top]):
        if top.startswith('Talos Main Housing'):
            return 'subconn_port_lid' if 'Port_Lid' in name else 'subconn_stbd_lid'
        if top.startswith('Smart Battery'):
            return 'subconn_bat_' + side_of_pod(top)
        if top.startswith('Acoustics'):
            return 'subconn_hydrophone'
        if top.startswith('DVL'):
            return 'subconn_dvl'
        return 'subconn_other'
    # ---- corner modules: thrusters, guards, foam, thruster cables, the rest is frame
    if top in MODULES:
        mid, outer, inner = MODULES[top]
        if 'T200' in leaf:
            return 'thr_' + (inner if 'Inner' in leaf else outer).lower()
        if 'Thruster Protector' in leaf:
            return 'frame_guards'
        if 'Foam' in leaf:
            return 'buoy_foam_' + mid
        if 'Thruster Cable' in leaf:
            return 'cables_thruster'
        return 'frame_mod_' + mid
    if top.startswith(('Holy L Bar',)):
        return 'frame_bars'
    if 'Battery Mounting Rail' in top:
        return 'frame_rails'
    if top.startswith(('Side Cable', 'Top Cable', 'Bottom Cable', '30315T611')):
        return 'frame_tension'
    if top.startswith(('Thruster ',)) and 'Cable' in top:
        return 'cables_thruster'
    if top.startswith(('Battery Data Cable', 'Macoroni Battery Cable', 'Straight Battery Cable')):
        return 'cables_battery'
    if top.startswith('DVL Cable'):
        return 'cables_dvl'
    # ---- main housing
    if top.startswith('Talos Main Housing'):
        sub = p[1]
        if sub.startswith('Cage Assembly-1'):            # starboard camera cage
            q = p[2]
            if q.startswith('NVidia Real'):
                return 'cc_orin'
            if q.startswith('ZEDX_Mini'):
                return 'cc_ffc'
            if q.startswith('vn100'):
                return 'cc_vn100'
            if q.startswith('GMSL2'):
                return 'cc_gmsl2'
            if q.startswith('40mmFan'):
                return 'cc_fan'
            if q.startswith('TEG-S50g'):
                return 'cc_switch'
            if q.startswith('TEG-Space'):
                return 'cc_switch_mount'
            if q.startswith('Keystone'):
                return 'cc_keystone'
            if q.startswith(('Bulkhead_Mounting_Assembly', 'Connector_Head_Rail')):
                return 'cc_bulkhead'
            if q.startswith('Cage4_4') and len(p) > 3 and p[3].startswith('CameraCageBB'):
                return 'cc_cagebb'
            if q.startswith(('Cage_Orin_Pannel',)):
                return 'cc_orin_panel'
            return 'cc_frame'
        if sub.startswith('Cage Assembly 4'):            # port cage frame around the board stack
            return 'ec_frame'
        if sub.startswith('ECageClean'):
            q = p[2]
            m = re.match(r'(Full Board|LED Control|LED AL)-(\d+)', q)
            if m:
                return 'ec_' + {'Full Board': 'full', 'LED Control': 'ledctl', 'LED AL': 'ledal'}[m.group(1)] + m.group(2)
            if q.startswith('FanPlate'):
                # the two 'KillSwitch' blocks on the fan plate hold the Hall-effect sensors: kill (top), AUX (bottom)
                if len(p) > 3 and p[3].startswith('KillSwitch-1'):
                    return 'ec_kill_sensor'
                if len(p) > 3 and p[3].startswith('KillSwitch-2'):
                    return 'ec_aux_sensor'
                return 'ec_fan'
            if q.startswith('LED Joiner'):
                return 'ec_joiner'
            return 'ec_frame'
        if sub.startswith('Buoyancy Assembly'):
            q = p[2]
            if q.startswith('Nalgene Water Bottle Holder'):
                return 'buoy_holders'
            if q.startswith('Nalgene Water Bottle'):
                return 'buoy_bottles'
            if q.startswith(('Center Foam',)):
                return 'buoy_center'
            return 'buoy_holders'
        if sub.startswith('Port_Lid'):
            return 'hull_lid_port'
        if sub.startswith('Starboard_Lid'):
            if p[2].startswith('BAR30'):
                return 'depth_sensor'
            return 'hull_lid_stbd'
        if sub.startswith('PolycarbonateChannels'):
            return 'hull_tubes'
        if sub.startswith('PolycarbonateViewport'):
            return 'hull_windows'
        if sub.startswith('LidEyeGlass'):
            return 'hull_window_rings'
        if sub.startswith(('MainHousingFore', 'MainHousingAft', 'Housing Connection', 'TensionRods', '92949A437')):
            return 'hull_rings'
        if sub.startswith(('6200A31', 'LidGrip')):
            return 'hull_latches'
        if 'O-Ring' in sub or sub.startswith('LidGasket'):
            return 'hull_seals'
        return 'hull_rings'
    # ---- battery pods
    if top.startswith('Smart Battery'):
        s = side_of_pod(top)
        q = p[1]
        if q.startswith('Battery-') or q == 'Battery-1':
            return f'bat_{s}_pack'
        if q.startswith('BMS_Board'):
            return f'bat_{s}_bms'
        if q.startswith(('LCD_Board',)):
            return f'bat_{s}_lcd'
        if q.startswith('LCD Window'):
            return f'bat_{s}_window'
        if q.startswith('PRV-M10'):
            return f'bat_{s}_prv'
        return f'bat_{s}_shell'
    if top.startswith('Kill Switch'):
        return 'kill_switch'
    if top.startswith('DVL Assembly'):
        return 'dvl_body' if 'DVL 1000' in name else 'dvl_mount'
    if top.startswith('ZEDX_Mini'):
        return 'dfc'
    if top.startswith('DFC Mount'):
        return 'dfc_mount'
    if top.startswith('Acoustics Pods'):
        q = p[1]
        if q.startswith('H1C'):
            return 'hydro_h1c'
        if q.startswith('Acoustics_Preamp'):
            return 'hydro_preamp'
        return 'hydro_pod'
    if top.startswith('Acoustic_Mount'):
        return 'hydro_mount'
    if top.startswith('Transducer'):
        return 'transducer'
    if top.startswith('Torpedoes + Markers'):
        q = p[1]
        if q.startswith('Sinky Torp'):
            return 'launcher_torpedoes'
        if q.startswith('SER-20XX'):
            return 'launcher_servo'
        return 'launcher_body'
    if top.startswith(('Torpservoholder', 'ServoHousing', 'mounting')):
        return 'launcher_mount'
    if top.startswith('EMERGENCYCLAWASSEMBLY'):
        return 'claw'
    if top.startswith('Magnet poker'):
        return 'magnet_poker'
    return 'unassigned'


def system_of(node):
    """The level-0 system a node belongs to (what a tap on it selects at the top level)."""
    for pre, sysid in (('thr_', 'thrusters'), ('frame_', 'frame'), ('buoy_', 'buoyancy'), ('cables_', 'cables'),
                       ('subconn_', 'subconns'), ('cc_', 'camera_cage'), ('ec_', 'ecage'), ('hull_', 'hull'),
                       ('depth_sensor', 'hull'), ('bat_', 'batteries'), ('kill_switch', 'kill_switch'),
                       ('dvl_', 'dvl'), ('dfc', 'cameras'), ('hydro_', 'hydrophone'), ('transducer', 'transducer'),
                       ('launcher_', 'launcher'), ('claw', 'claw'), ('magnet_poker', 'magnet_poker')):
        if node.startswith(pre):
            return sysid
    return 'other'
