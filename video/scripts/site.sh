#!/usr/bin/env bash
# The recording build of the site (--mode recording: full resolution, MSAA, sharp atlases,
# no resolution steps; see RECORDING in src/scene/index.ts) into video/.site. Never deployed.
set -euo pipefail
cd "$(dirname "$0")/../.."
bunx astro build --mode recording --outDir video/.site --silent
echo "✓ recording build → video/.site"
