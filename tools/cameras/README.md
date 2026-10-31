# tools/cameras

Data and images for `cameras.html`.

1. `silhouette.py` (CAD venv, under a memory cap) writes `silhouette.json`: Talos side and top outlines from the Nereus robot pack meshes.
2. `build_data.py` writes `public/data/cameras/{params,fov,bandwidth,trees}.json` from riptide_core, zed-ros2-wrapper, Nereus and riptide_autonomy.
   `build_data.py --trees-only` rebuilds just `trees.json` (marks each subtree `reachable` from the main tree via SubTree calls).
3. `images.py` writes `public/img/cameras/*.webp`.
4. `cad_crops.py` writes `cad_ffc_front.webp` / `cad_dfc_below.webp`: the full-size SolidWorks renders
   (`/tmp/cadshots/raw/talos-{front,bottom}.bmp`, see `docs/media/cad.md`) cropped to the starboard tube, camera ringed.
5. `recolour_depth.py` repaints the old near-black "no depth" pixels of the built Nereus depth webps as a grey hatch
   (images.py now draws the hatch itself).
6. `rectify_check.py` prints rectified intrinsics from the calibration files (cv2.stereoRectify, alpha 0), to compare with Nereus's robot pack.

Inputs outside the repos:
- the bench frame `~/robot/snapshots/ffc_20261020_154052.jpg`;
- one stereo pair from `~/Downloads/slalom3.svo2` (an MCAP file). Strip each `Camera_SN42515811/side_by_side` message up to its
  first `00 00 00 01`, concatenate into `left.hevc`, then `ffmpeg -r 22 -f hevc -i left.hevc -vf "select=eq(n\,1540)" -frames:v 1 pair.png`
  and split the 3840 × 1200 frame into `/tmp/camwork/svo_{left,right}_full.png`;
- Nereus frames saved from the bridge's topics in `/tmp/perc/frames` (riptide-perception-explained `tools/nereus/grab_frames.py`).
