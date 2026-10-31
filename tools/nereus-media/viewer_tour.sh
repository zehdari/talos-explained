source /tmp/nmedia/ui.sh
mark() { echo "$(date +%s.%N) $1" >> /tmp/nmedia/rec/tour_marks.txt; }
rm -f /tmp/nmedia/rec/tour_marks.txt
sleep 1.5; mark "Pool view and panels"
drag 600 850 760 840; sleep 1
mark "Drive: type a move"
key ctrl+p; typ "turn left 45 forward 2"; sleep 1; key Return; sleep 6
mark "Overlays: MPC path, thrust"
click 440 143; sleep 2; key ctrl+p; typ "go 4 -2.2 -0.75 45"; sleep 0.5; key Return; sleep 5; click 440 143
mark "Camera cards: RGB, depth, truth"
click 1248 138 1 2; click 1200 138 1 1; click 1307 138 1 2; click 1353 138 1 1
mark "Look through the forward camera"
click 1420 138 1 3; click 1420 138 1 1.5
mark "Vision: detections and point clouds"
click 127 722 1 1; click 25 910 1 3; click 25 910 1 1; click 215 722 1 1
mark "TF frames"
click 853 109 1 3; click 853 109 1 1
mark "Layouts"
click 246 19 1 0.8; click 251 122 1 3; click 246 19 1 0.8; click 251 145 1 3; click 246 19 1 0.8; click 251 99 1 2
mark "Scorecard"
click 742 143 1 3; click 1419 113 1 1
mark "Prior map editor"
click 1381 62 1 4; key ctrl+m; sleep 2
mark "end"
park
