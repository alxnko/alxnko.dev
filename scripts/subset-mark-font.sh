#!/usr/bin/env bash
# VT323 is only used for the `alxnko_` mark (spec §4.4), so ship just those glyphs.
# Needs fonttools + brotli (pyftsubset). Output is committed; rerun only if the mark changes.
set -euo pipefail
cd "$(dirname "$0")/.."
pyftsubset node_modules/@fontsource/vt323/files/vt323-latin-400-normal.woff2 \
  --text='alxnko_' --flavor=woff2 --layout-features='' --no-hinting --desubroutinize \
  --name-IDs='' --output-file=src/assets/fonts/vt323-mark.woff2
