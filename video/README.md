# alxnko.dev — Instagram story

A 24 s promo for the site in two formats: **9:16** (stories/reels, 1080×1920) and **4:5** (feed, 1080×1350).

## Prerequisites

- the site's own dependencies: `bun install` in the repo root (`site.sh` uses its Astro; `hook.sh` its `scene/` pipeline)
- `bun install` here, then `bunx playwright install chromium`
- an NVIDIA GPU with glvnd EGL (`capture.ts` points Chrome's ANGLE at `/usr/share/glvnd/egl_vendor.d/10_nvidia.json`; any GPU works if you change that, CPU-only WebGL will be very slow)
- Blender 5.2 with Cycles on OptiX (the hook), `ffmpeg` with libx264, `python3` (the `scene/` scripts)

Captions and touch markers are timed from the capture logs (`public/footage/<format>/*.json`, committed), so `studio` and `lint` work before any footage exists; the videos themselves need `bun run capture`.
`src/brand.ts` reads the cat mark from the site (`src/content/mark.ts`): keep that path in step.

```bash
bun install
bun run video      # everything: recording build → captures → Blender hook → edit → out/
```

| step | what | where |
|---|---|---|
| `bun run site` | the site built with `--mode recording` (full resolution, MSAA, sharp atlases) | `video/.site` |
| `bun run capture [scene…] --format=9x16\|4x5` | each scene played on the real site, **frame by frame on a frozen clock** (`capture/vt.js`), rendered at 4× on the NVIDIA GPU and downscaled; the site's own WebAudio sounds rendered in sync; every tap/drag/pinch/key logged | `public/footage/<format>/` |
| `bun run hook` | the path-traced opening (Cycles/OptiX, `blender/hook.py`), ending exactly on the site's desk camera | `public/hook/` |
| `bun run studio` | preview/edit the timeline (Remotion) | `src/` |
| `bun run render` | both formats, loudness-mastered (−18 LUFS, −1.5 dBTP), plus silent copies for adding music in Instagram | `out/` |

Scenes, captions and timing live in `capture/capture.ts` (what is done on the site) and `src/Story.tsx` (what is shown). Captions are timed from the capture's marks, so re-capturing one scene keeps it in sync. Footage, hook frames and outputs are build artefacts (git-ignored).
