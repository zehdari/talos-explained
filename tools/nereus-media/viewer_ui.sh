export DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority
W=$(timeout 5 xdotool search --name "^Nereus" | tail -1)
WX=100; WY=60
click() { xdotool mousemove $((WX+$1)) $((WY+$2)); sleep 0.3; xdotool mousedown ${3:-1}; sleep 0.1; xdotool mouseup ${3:-1}; sleep ${4:-0.6}; }
move() { xdotool mousemove $((WX+$1)) $((WY+$2)); sleep 0.3; }
drag() { xdotool mousemove $((WX+$1)) $((WY+$2)); sleep 0.3; xdotool mousedown ${5:-1}; sleep 0.1; local n=20; for i in $(seq 1 $n); do xdotool mousemove $((WX+$1+($3-$1)*i/n)) $((WY+$2+($4-$2)*i/n)); sleep 0.03; done; sleep 0.2; xdotool mouseup ${5:-1}; sleep 0.5; }
key() { xdotool key --clearmodifiers "$@"; sleep 0.5; }
typ() { xdotool type --delay 60 "$1"; sleep 0.4; }
# grab-free capture of the window area (ImageMagick import grabs the X server and can freeze it)
shot() { timeout 15 ffmpeg -y -loglevel error -f x11grab -draw_mouse 0 -video_size 1600x1000 -i :0.0+$WX,$WY -frames:v 1 "/tmp/nmedia/shots/$1.png" </dev/null; echo "/tmp/nmedia/shots/$1.png"; }
park() { xdotool mousemove 2400 1400; sleep 0.3; }
fit() { timeout 5 xdotool windowsize $W 1600 1000; timeout 5 xdotool windowmove $W $WX $WY; }
