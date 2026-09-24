#!/usr/bin/env bash
# Render both formats, then finish for Instagram: loudness-mastered site sound (-18 LUFS),
# H.264 High, faststart; plus a silent copy of each (for adding music in Instagram).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p out
for fmt in ${FORMATS:-9x16 4x5}; do
  # (frame extraction from the 1080p sources can hiccup under load: one retry)
  for try in 1 2; do
    bunx remotion render "story-$fmt" "out/.raw-$fmt.mp4" --codec h264 --crf 12 --pixel-format yuv420p \
      --audio-codec aac --audio-bitrate 320k --timeout 120000 --concurrency 4 \
      --offthreadvideo-cache-size-in-bytes 2147483648 --log error && break
    [ "$try" = 2 ] && exit 1; echo "…retrying $fmt"
  done
  # two-pass master: measure, then exact gain + true-peak limiter (the site's sound is quiet
  # ambience with transients; a one-pass loudnorm leaves it far too low)
  lufs=$(ffmpeg -hide_banner -i "out/.raw-$fmt.mp4" -af ebur128=peak=true -f null - 2>&1 | awk '/Integrated loudness/{f=1} f&&/I:/{print $2; exit}')
  gain=$(python3 -c "print(round(${TARGET_LUFS:--18} - ($lufs), 2))")
  ffmpeg -v error -y -i "out/.raw-$fmt.mp4" -c:v copy \
    -af "volume=${gain}dB,alimiter=limit=0.82:level=disabled,aresample=48000" -c:a aac -b:a 256k -movflags +faststart "out/alxnko-story-$fmt.mp4"
  ffmpeg -v error -y -i "out/alxnko-story-$fmt.mp4" -c:v copy -an -movflags +faststart "out/alxnko-story-$fmt-silent.mp4"
  rm -f "out/.raw-$fmt.mp4"
  echo "✓ out/alxnko-story-$fmt.mp4 (+ -silent)"
done
