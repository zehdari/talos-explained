# Lists topics, counts and mean rates of a ROS 2 sqlite bag. Usage: python3 probe_bag.py <bag.db3>
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
rows = db.execute('select t.id, t.name, t.type, count(m.id), min(m.timestamp), max(m.timestamp) from topics t left join messages m on m.topic_id=t.id group by t.id').fetchall()
for r in rows:
    dur = (r[5] - r[4]) / 1e9 if r[4] else 0
    print(f'{r[0]:3d} {r[1]:50s} {r[3]:8d} {r[3]/dur if dur else 0:8.1f} Hz  {r[2]}')
