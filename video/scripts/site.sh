#!/usr/bin/env bash
# The recording build of the site (PUBLIC_RECORDING=1: full resolution, MSAA, sharp atlases,
# no resolution steps) into video/.site. Never deployed.
set -euo pipefail
cd "$(dirname "$0")/../.."
PUBLIC_RECORDING=1 bunx astro build --outDir video/.site --silent
echo "✓ recording build → video/.site"
