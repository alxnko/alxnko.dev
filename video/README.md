# alxnko.dev — Instagram story

A 24 s promo for the site in two formats: **9:16** (stories/reels, 1080×1920) and **4:5** (feed, 1080×1350).

```bash
bun install
bun run video      # everything: recording build → captures → Blender hook → edit → out/
```

| step | what | where |
|---|---|---|
| `bun run site` | the site built with `PUBLIC_RECORDING=1` (full resolution, MSAA, sharp atlases) | `video/.site` |
| `bun run capture [scene…] --format=9x16\|4x5` | each scene played on the real site, **frame by frame on a frozen clock** (`capture/vt.js`), rendered at 4× on the NVIDIA GPU and downscaled; the site's own WebAudio sounds rendered in sync; every tap/drag/pinch/key logged | `public/footage/<format>/` |
| `bun run hook` | the path-traced opening (Cycles/OptiX, `blender/hook.py`), ending exactly on the site's desk camera | `public/hook/` |
| `bun run studio` | preview/edit the timeline (Remotion) | `src/` |
| `bun run render` | both formats, loudness-mastered (−18 LUFS, −1.5 dBTP), plus silent copies for adding music in Instagram | `out/` |

Scenes, captions and timing live in `capture/capture.ts` (what is done on the site) and `src/Story.tsx` (what is shown). Captions are timed from the capture's marks, so re-capturing one scene keeps it in sync. Footage, hook frames and outputs are build artefacts (git-ignored).
