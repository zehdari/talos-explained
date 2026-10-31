#!/usr/bin/env python3
"""Per-topic rates, sizes and message ages from rosbag2 sqlite3 bags, for the Debugging chapter.

    python3 -I tools/debugging/bag_stats.py OUT.json NAME=BAGDIR[:robot|sim] ...

Reads the .db3 files directly with sqlite3 (no ROS needed):
  - per topic: message count, total bytes, rate over the topic's own first..last message, bytes per second
  - for robot bags (recorder and publishers on the same Orin clock): the age of each stamped message when the
    recorder got it, i.e. recorder timestamp minus header.stamp. The stamp is read straight from the CDR bytes:
    a message that starts with std_msgs/Header has sec/nanosec at bytes 4..12 (after the 4-byte encapsulation
    header); a TFMessage has a uint32 sequence length first, so its first transform's stamp is at bytes 8..16.
"""
import json, sqlite3, struct, sys, glob, os
import yaml

# Types whose CDR starts with a std_msgs/Header (offset 4) or a sequence of stamped things (offset 8).
HEADER_FIRST = {
    'sensor_msgs/msg/Imu', 'nav_msgs/msg/Odometry', 'geometry_msgs/msg/TwistWithCovarianceStamped',
    'geometry_msgs/msg/PoseWithCovarianceStamped', 'geometry_msgs/msg/PoseStamped', 'geometry_msgs/msg/WrenchStamped',
    'sensor_msgs/msg/CompressedImage', 'vision_msgs/msg/Detection3DArray', 'sensor_msgs/msg/PointCloud2',
}
SEQ_FIRST = {'tf2_msgs/msg/TFMessage'}
AGE_SAMPLES = 4000          # evenly spaced messages per topic for the age distribution


def bag_stats(name, bagdir, kind):
    meta = yaml.safe_load(open(os.path.join(bagdir, 'metadata.yaml')))['rosbag2_bagfile_information']
    dbs = sorted(glob.glob(os.path.join(bagdir, '*.db3')))
    file_bytes = sum(os.path.getsize(d) for d in dbs)
    topics = {}
    for db in dbs:
        con = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
        types = {i: (n, t) for i, n, t in con.execute('SELECT id, name, type FROM topics')}
        for tid, cnt, tot, t0, t1 in con.execute(
                'SELECT topic_id, COUNT(*), SUM(LENGTH(data)), MIN(timestamp), MAX(timestamp) FROM messages GROUP BY topic_id'):
            n, ty = types[tid]
            e = topics.setdefault(n, {'topic': n, 'type': ty, 'count': 0, 'bytes': 0, 't0': t0, 't1': t1})
            e['count'] += cnt; e['bytes'] += tot; e['t0'] = min(e['t0'], t0); e['t1'] = max(e['t1'], t1)
        if kind == 'robot':
            for tid, (n, ty) in types.items():
                off = 4 if ty in HEADER_FIRST else 8 if ty in SEQ_FIRST else None
                if off is None:
                    continue
                cnt = con.execute('SELECT COUNT(*) FROM messages WHERE topic_id=?', (tid,)).fetchone()[0]
                step = max(1, cnt // AGE_SAMPLES)
                ages = []
                for ts, head in con.execute(
                        f'SELECT timestamp, SUBSTR(data, 1, {off + 8}) FROM messages WHERE topic_id=? AND (id % ?)=0',
                        (tid, step)):
                    if len(head) < off + 8:
                        continue
                    sec, nsec = struct.unpack_from('<iI', head, off)
                    if sec <= 0:
                        continue
                    ages.append((ts - (sec * 1_000_000_000 + nsec)) / 1e6)   # ms
                if ages:
                    topics[n].setdefault('age_ms', []).extend(ages)
        con.close()
    dur = meta['duration']['nanoseconds'] / 1e9
    out = []
    for e in topics.values():
        span = (e['t1'] - e['t0']) / 1e9
        r = {'topic': e['topic'], 'type': e['type'], 'count': e['count'], 'bytes': e['bytes'],
             'hz': round((e['count'] - 1) / span, 2) if span > 0 and e['count'] > 1 else 0,
             'bps': round(e['bytes'] / dur, 1), 'avg_bytes': round(e['bytes'] / e['count'])}
        if 'age_ms' in e:
            a = sorted(e['age_ms'])
            q = lambda p: round(a[min(len(a) - 1, int(p * len(a)))], 2)
            r['age'] = {'n': len(a), 'p05': q(0.05), 'p25': q(0.25), 'p50': q(0.5), 'p75': q(0.75), 'p95': q(0.95),
                        'max': round(a[-1], 2)}
            # histogram for the figure: 40 bins over the 1st..99th percentile (outliers go to the end bins)
            lo, hi = a[int(0.01 * len(a))], a[min(len(a) - 1, int(0.99 * len(a)))]
            w = max((hi - lo) / 40, 0.05)
            h = [0] * 40
            for v in a:
                h[min(39, max(0, int((v - lo) // w)))] += 1
            r['age'].update({'hist': h, 'hist_lo': round(lo, 3), 'hist_w': round(w, 4)})
        out.append(r)
    out.sort(key=lambda r: -r['bytes'])
    return {'name': name, 'dir': os.path.basename(os.path.normpath(bagdir)), 'kind': kind,
            'storage': meta['storage_identifier'], 'compression': meta.get('compression_format') or 'none',
            'duration_s': round(dur, 1), 'messages': meta['message_count'], 'file_bytes': file_bytes,
            'topics': out}


if __name__ == '__main__':
    res = []
    for arg in sys.argv[2:]:
        name, rest = arg.split('=', 1)
        bagdir, _, kind = rest.partition(':')
        print('reading', name, bagdir, file=sys.stderr)
        res.append(bag_stats(name, bagdir, kind or 'robot'))
    json.dump({'bags': res}, open(sys.argv[1], 'w'), separators=(',', ':'))
    for b in res:
        print(b['name'], b['duration_s'], 's', round(b['file_bytes'] / 1e6), 'MB', file=sys.stderr)
        for t in b['topics'][:30]:
            print(f"  {t['topic']:50s} {t['hz']:8.1f} Hz {t['bps']/1e3:9.1f} kB/s {t.get('age', {}).get('p50', '')}", file=sys.stderr)
