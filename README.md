# alxnko.dev

Personal site of **Alex Neko** (`alxnko`): tech lead, Kyrgyzstan, #1 committer in Kyrgyzstan.
A terminal first. On capable devices it becomes an interactive 3D model of the real desk,
with the live terminal and contacts on its screens.

- **URL:** <https://alxnko.dev>
- **Stack:** Astro (static), vanilla TypeScript, three.js as a lazily loaded chunk, and a
  Blender 5.2 headless pipeline that bakes the desk into a meshopt glb with day/night
  lightmaps. Hosted on Cloudflare Pages.

## How it works

- **Page first.** The terminal (`src/term`) and contacts work with no 3D and no network.
  Try `help`, `fastfetch`, `ls monitor`, `desk up`, `meow`.
- **3D when it fits.** A tiny head script decides before first paint (WebGL2, enough cores
  and memory, no data saver; `?3d` forces it on, `?lite` off). The desk (`src/scene`) pins
  the live DOM screens onto the 3D laptop and monitor every frame. The canvas above them
  keeps transparent windows, so desk objects correctly cover the screens.
- **Budgets and security.** `bun run budget` enforces the size limits (JS, CSS, fonts, glb,
  atlases, posters). The build writes a strict hash-based CSP into `dist/_headers`. There
  is no inline code without a hash, and no third-party origins.

## Short links

- `/gh` → [GitHub](https://github.com/alxnko)
- `/tg` → [Telegram](https://t.me/ALXNK0)
- `/in`, `/li` → [LinkedIn](https://linkedin.com/in/alxnko)
- `/ig` → [Instagram](https://instagram.com/alxnko)
- `/mail` → [Email](mailto:aleksandrnyrko@gmail.com)

## Development

```bash
bun install
bun run dev          # local dev server
bun run lint         # astro check + tsc
bun run test         # unit tests (vitest)
bun run build        # static build + CSP headers
bun run budget       # size budgets against dist/
bun run e2e          # Playwright (desktop + mobile) against dist/ with the real headers
```

`scripts/serve-dist.ts` serves `dist/` with `_headers` applied. It reads them once at
startup, so restart it after every build.

## The 3D desk

```bash
bun run scene        # scene/run.sh: build → bake → export → optimize → posters → finalize → check
```

- **Requirements:** Blender 5.2 (OptiX/CUDA when available), ImageMagick 7, avifenc and
  oidnDenoise.
- **Outputs:** the pipeline writes `public/scene/*` (glb, atlases, manifest) plus the
  posters and `public/og.png`. Work files go to `/var/tmp/alxnko-scene`.
- **Docs:** the design spec, the plan, and a log of every decision are in `docs/superpowers/`.

## Deploy

Cloudflare Pages project `alxnko-dev` (not Git-connected). Deploy the built `main`:

```bash
bun run build && bun run budget
bunx wrangler pages deploy dist --project-name alxnko-dev --branch main
```
