#!/usr/bin/env bash
# bun run video: the whole story from scratch. Recording build → frame-exact captures of every
# scene in both formats → the Blender hook → the edit → Instagram-ready MP4s in out/.
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/site.sh
bun capture/capture.ts --format=9x16
bun capture/capture.ts --format=4x5
bash scripts/hook.sh
bash scripts/render.sh
