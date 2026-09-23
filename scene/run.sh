#!/usr/bin/env bash
# bun run scene: rebuild the desk end to end (model -> bake -> glb -> posters -> manifest).
# Deterministic: fixed seeds + sample counts. Needs Blender 5.2, bun, ImageMagick 7,
# avifenc, oidnDenoise, python3 + fontTools/brotli. Work files live on disk under
# $ALXNKO_SCENE_WORK (default /var/tmp/alxnko-scene), never in the RAM-backed /tmp.
set -euo pipefail
cd "$(dirname "$0")/.."
WORK=${ALXNKO_SCENE_WORK:-/var/tmp/alxnko-scene}
SIZE=${SCENE_BAKE_SIZE:-4096}
SAMPLES=${SCENE_BAKE_SAMPLES:-512}
# GPU (OptiX -> CUDA -> CPU fallback) by default. Seeds and sample counts are fixed;
# GPU float reductions can still flip a handful of atlas bytes by 1 LSB between runs
# (new content hash, identical look). SCENE_DEVICE=CPU gives bit-exact output (slow).
DEVICE=${SCENE_DEVICE:-GPU}
export ALXNKO_SCENE_WORK=$WORK TMPDIR=$WORK/tmp
mkdir -p "$WORK/tmp" "$WORK/logs"

step() {
  local name=$1; shift
  echo "==> $name"
  if ! "$@" >"$WORK/logs/$name.log" 2>&1; then
    tail -n 40 "$WORK/logs/$name.log"; echo "!! $name failed (log: $WORK/logs/$name.log)"; exit 1
  fi
  grep -E '^\[|^\{' "$WORK/logs/$name.log" | grep -v '^\[posters\] wrote' || true
  # Blender swallows Python exceptions in -P scripts with exit code 0: fail on tracebacks
  if grep -q 'Traceback (most recent call last)' "$WORK/logs/$name.log"; then
    tail -n 30 "$WORK/logs/$name.log"; echo "!! $name raised"; exit 1
  fi
}

BL=(blender -b --factory-startup)
step build   "${BL[@]}" -P scene/build.py -- --out "$WORK/desk.blend"
step bake    "${BL[@]}" -P scene/bake.py -- --in "$WORK/desk.blend" --out "$WORK/desk_uv.blend" --size "$SIZE" --samples "$SAMPLES" --device "$DEVICE"
step export  "${BL[@]}" -P scene/export.py -- --in "$WORK/desk_uv.blend" --out "$WORK/desk-raw.glb"
step optimize bun scene/optimize.ts "$WORK/desk-raw.glb" "$WORK/desk-opt.glb" "$WORK/desk-check.glb"
step screens python3 scene/screens.py
step posters "${BL[@]}" -P scene/render_posters.py -- --mode posters --size "$SIZE" --samples 64 --device CPU
step finalize python3 scene/finalize.py
step check   "${BL[@]}" -P scene/check.py -- --glb "$WORK/desk-check.glb" --size 2048 --samples 16

if [[ "${SCENE_KEEP:-0}" != 1 ]]; then
  rm -rf "$WORK/bake" "$WORK/enc" "$WORK/tmp"   # ~1 GB of float bake caches
fi
echo "==> done: public/scene/manifest.json"
