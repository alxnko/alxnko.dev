#!/usr/bin/env bash
# The Blender opening, both formats: build the scene's .blend and screen textures with the
# site's own pipeline (scene/), path-trace the shot (Cycles/OptiX, blender/hook.py), then
# encode public/hook/<format>.mp4. RENDER=0 only re-encodes existing frames.
set -euo pipefail
cd "$(dirname "$0")/.."
WORK=${ALXNKO_SCENE_WORK:-/var/tmp/alxnko-story/work}
OUT=${HOOK_DIR:-/var/tmp/alxnko-story}
export ALXNKO_SCENE_WORK=$WORK TMPDIR=$WORK/tmp
mkdir -p "$WORK/tmp" public/hook
if [ "${RENDER:-1}" = 1 ]; then
  ( cd .. && blender -b --factory-startup -P scene/build.py -- --out "$WORK/desk.blend" >"$WORK/build.log" 2>&1 && python3 scene/screens.py >"$WORK/screens.log" 2>&1 )
  blender -b --factory-startup -P blender/hook.py -- --samples 128 --out "$OUT/hook" >"$WORK/hook-9x16.log" 2>&1
  blender -b --factory-startup -P blender/hook.py -- --samples 128 --res 1080x1350 --end_vfov 60.474 --start_vfov 36 \
    --start_tgt=-0.465,-0.29,0.885 --out "$OUT/hook-4x5" >"$WORK/hook-4x5.log" 2>&1
fi
for pair in "9x16:$OUT/hook" "4x5:$OUT/hook-4x5"; do
  fmt=${pair%%:*}; dir=${pair#*:}
  [ -f "$dir/0105.png" ] || { echo "!! $fmt: no complete hook in $dir"; exit 1; }
  ffmpeg -v error -y -framerate 30 -i "$dir/%04d.png" -c:v libx264 -preset slow -crf 10 -pix_fmt yuv420p "public/hook/$fmt.mp4"
  echo "✓ hook $fmt ← $dir"
done
