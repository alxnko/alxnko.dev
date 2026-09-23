#!/usr/bin/env bash
# JetBrains Mono beyond Latin: the fontsource files cover Latin only, so phones drew the
# terminal's block art, box lines, arrows and Russian text with a fallback font of another
# width and the columns drifted. Ship those glyphs from JetBrains Mono itself (every one is a
# 600-unit cell), licence text included (OFL). Needs fonttools + brotli (pyftsubset). Output
# is committed; rerun only to change the ranges (keep base.css's unicode-range in step).
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=${JBM_TTF:-/var/tmp/jbm/JetBrainsMono-Regular.ttf}
if [ ! -f "$SRC" ]; then
  mkdir -p "$(dirname "$SRC")"
  curl -fsSL -o "$SRC" https://github.com/JetBrains/JetBrainsMono/raw/v2.304/fonts/ttf/JetBrainsMono-Regular.ttf
fi
echo "a0bf60ef0f83c5ed4d7a75d45838548b1f6873372dfac88f71804491898d138f  $SRC" | sha256sum -c --quiet
pyftsubset "$SRC" \
  --unicodes='U+0400-045F,U+2190-21FF,U+2200-22FF,U+2500-259F,U+25A0-25FF' \
  --flavor=woff2 --layout-features='' --no-hinting --desubroutinize \
  --name-IDs='0,1,2,3,4,5,6,13,14' --output-file=src/assets/fonts/jetbrains-mono-symbols-400.woff2
