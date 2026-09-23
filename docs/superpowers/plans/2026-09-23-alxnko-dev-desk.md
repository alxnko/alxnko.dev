# alxnko.dev "the desk": implementation plan

> **Executed; later superseded in part by the owner review** (see the decision log R1–R34): the
> public facts drop the company and coordinates (`SITE.company`/`SITE.coords` no longer exist), the
> canvas mirror and sheet mode were replaced by pinned DOM screens, and `cable_drop` was removed.

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild alxnko.dev as a terminal-first site set on a baked, lazy-loaded 3D
model of the owner's real desk. The DOM terminal and the 3D laptop screen share one
state.

**Architecture:**
- Astro static site with vanilla TypeScript and no UI framework.
- A pure-TS terminal core (`src/term/`) owns all terminal state. The DOM renderer and a
  canvas mirror both subscribe to it.
- The 3D desk is modeled and light-baked in headless Blender by committed Python
  scripts, exported as a meshopt glb with unlit atlas textures, and driven by a lazy
  three.js runtime (`src/scene/`) through a `WorldPort` interface.

**Tech stack:**
- Runtime: Bun 1.4, Astro ^7.0, TypeScript ^6.0 (keep 6: `@astrojs/check` compat),
  three 0.186 (runtime only, lazy chunk)
- Tests: Vitest 5 (+ happy-dom 20), @playwright/test 1.63
- Asset pipeline: Blender 5.2.2 LTS (local only), @gltf-transform/cli 4.5 (meshopt),
  ImageMagick 7 + avifenc (local only)
- Fonts: @fontsource/jetbrains-mono and @fontsource/vt323
- Deploy: wrangler (Cloudflare Pages direct upload)

**Spec:** `docs/superpowers/specs/2026-09-23-alxnko-dev-desk-design.md`.
**Decision log:** `docs/superpowers/decisions/2026-09-23-brainstorm-log.md`.
Executors read both.

## Global constraints (verbatim from the spec, apply to every task)
- **Public facts only:**
  - Alex Neko (`alxnko`)
  - tech lead
  - Kyrgyzstan
  - #1 committer in Kyrgyzstan (committers.top)
  - contacts: gh `https://github.com/alxnko`, tg `https://t.me/ALXNK0`,
    in `https://linkedin.com/in/alxnko`, ig `https://instagram.com/alxnko`,
    email `mailto:aleksandrnyrko@gmail.com`
  - Nothing else, and **no projects**.
- **No "todo"/placeholder/"coming soon" text anywhere on the site.**
- **Never name Arch Linux.** The OS is called `meowOS`; the host is `nitro`.
- **Colors:**
  - Green `#00ff82` is a signal only, ≤ ~5 uses per viewport. It never tints
    hardware or backgrounds.
  - Light-surface green text is `#0a6e3c`.
  - Screens are dark in both themes.
- **Banned styling:**
  - neon `text-shadow`, scanlines, glitch, CRT curvature, gradient blobs,
    glassmorphism, slate/indigo palettes
  - macOS traffic lights, emoji icons, typewriter headline effects, particle
    backgrounds, generic stock props
- **Security:**
  - No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`,
    `new Function` anywhere in `src/` (a test enforces this).
  - No `style="…"` attributes in `.astro` markup.
- **Assets and third parties:**
  - No third-party origins at runtime; fonts are self-hosted.
  - `'unsafe-inline'` is never allowed in the CSP.
- **Accessibility:**
  - Touch targets ≥ 44×44 px.
  - Mobile input font-size ≥ 16 px.
  - Focus is always visible and never obscured.
  - `prefers-reduced-motion` is honored everywhere.
- **Commits:** Conventional Commits, never `--no-verify`, and every commit ends with
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Scratch space:** `/tmp` is RAM-backed. Blender caches and render outputs go under
  `/var/tmp/alxnko-scene/`, never `/tmp`.

## File structure (locked)
```
design/tokens.json                 single token source (spec §4)
scripts/gen-tokens.ts              tokens.json → src/styles/tokens.css (+ --check)
scripts/postbuild-csp.ts           hash inline script/style in dist → dist/_headers CSP
src/content/site.ts                facts, contacts (allowlist), fs file texts
src/lib/tokens.ts                  typed re-export of design/tokens.json
src/lib/prefs.ts                   try/catch localStorage get/set
src/term/types.ts                  Span, Line, TermState, WorldPort, Landmark, Command…
src/term/parse.ts                  tokenizer + command-list/pipeline parser
src/term/vfs.ts                    virtual fs (tree, resolve, list, read)
src/term/store.ts                  TermStore: the single terminal state + subscribe
src/term/complete.ts               tab completion
src/term/exec.ts                   run a parsed line against registry (pipes, &&, ||, ;)
src/term/registry.ts               command registry + did-you-mean
src/term/commands/*.ts             info, fs, session, world, toys, secret, text
src/term/boot.ts                   boot log lines
src/term/format.ts                 span helpers (fg, bold, link), ansi palette names
src/ui/terminal-dom.ts             DOM renderer + keyboard controller
src/ui/theme.ts                    theme get/set/apply (+ system follow)
src/ui/overlay.ts                  scene-mode chrome: nav, toggles, hint
src/ui/app.ts                      entry; wires store, DOM, gating, lazy scene
src/audio/sound.ts                 WebAudio synth (lazy)
src/scene/gate.ts                  decide3D (pure)
src/scene/index.ts                 lazy entry: mount(opts) → SceneHandle (WorldPort)
src/scene/loader.ts                glb + atlas loading
src/scene/materials.ts             baked (day/night mix), screen, glow, led, sky shaders
src/scene/rail.ts                  landmark spline + spring
src/scene/homography.ts            4 points → CSS matrix3d
src/scene/screen-mirror.ts         canvas renderer of TermStore (80×24)
src/scene/monitor-screen.ts        canvas contacts/tiling screen
src/scene/dock.ts                  dock/undock DOM overlays
src/scene/input.ts                 wheel/touch/pinch/drag/tap → rail
src/scene/anim.ts                  desk, fan, cat, leds, ring animations
src/components/*.astro             Identity, Terminal, Contacts, Icon, Nav, Toggles
src/pages/index.astro, 404.astro   (+ existing redirect pages kept)
src/styles/{tokens.css,base.css,page.css,terminal.css,scene.css}
scene/{common.py,dims.py,build.py,bake.py,export.py,render_posters.py}, scene/run.sh
public/scene/{desk.glb,atlas-*.webp,poster-*.{avif,webp},manifest.json}, public/og.png
tests/unit/**/*.test.ts, tests/e2e/*.spec.ts
.github/workflows/ci.yml
```

## Waves and parallelism
- **Wave 0** (orchestrator, `feat/redesign-desk`): Task 1 (scaffold, contracts, tokens).
- **Wave 1** (parallel, one git worktree each, branched from the Wave 0 tip):
  - **W1-scene**: Tasks 2–4 (Blender pipeline). Branch `feat/rd-scene`.
  - **W1-term**: Tasks 5–7 (terminal core). Branch `feat/rd-term`.
  - **W1-page**: Tasks 8–10 (page, CSS, DOM renderer, CSP). Branch `feat/rd-page`.

  Each branch merges into `feat/redesign-desk` (merge commit) when its tests are green.
- **Wave 2**: Tasks 11–14 (scene runtime), then integration.
- **Wave 3**: Tasks 15–17 (sound, e2e, CI, perf, polish), then review and ship.

---

### Task 1: Scaffold, shared contracts, tokens (Wave 0)

**Files:**
- Modify: `package.json`, `astro.config.mjs`, `tsconfig.json`, `.gitignore`
- Create: `vitest.config.ts`, `design/tokens.json`, `scripts/gen-tokens.ts`,
  `src/styles/tokens.css` (generated), `src/lib/tokens.ts`, `src/lib/prefs.ts`,
  `src/content/site.ts`, `src/term/types.ts`
- Test: `tests/unit/tokens.test.ts`, `tests/unit/security-guard.test.ts`

**Produces (exact contracts):**
```ts
// src/term/types.ts
export type Color = 'fg'|'muted'|'dim'|'green'|'amber'|'red'|'blue'|'magenta'|'cyan'|'white';
export interface Span { text: string; fg?: Color; bold?: boolean; href?: string }
export type Line = Span[];
export type Landmark = 'wide'|'desk'|'laptop'|'monitor';
export type Theme = 'dark'|'light';
export type Ring = 'green'|'purple'|'off';
export type SoundLevel = 'off'|'low'|'on';
export interface WorldState { theme: Theme; desk: number; /* meters */ ring: Ring; fan: 0|1|2|3; sound: SoundLevel; landmark: Landmark }
export interface WorldPort {
  get(): WorldState;
  fly(to: Landmark): void;
  setDesk(h: number): Promise<void>;       // resolves when motion ends
  setTheme(t: Theme): void;
  setRing(r: Ring): void;
  setFan(s: 0|1|2|3): void;
  setSound(l: SoundLevel): void;
  meow(): void;
  stare(): void;                           // the sudo secret
  sfx(kind: 'key'|'enter'|'tick'): void;
}
export interface TermState {
  lines: Line[]; input: string; cursor: number; cwd: string;
  busy: boolean; history: string[]; version: number;
  overlay: Line[] | null;                  // transient toy frame (cmatrix); null normally
}
export interface CommandCtx {
  args: string[]; stdin: string|null; cwd: string; world: WorldPort;
  out(line: Line|string): void; err(text: string): void;
  setCwd(path: string): void; clear(): void;
  signal: AbortSignal; sleep(ms: number): Promise<void>;
  history(): string[];
}
export interface Command {
  name: string; summary: string; usage: string; hidden?: boolean;
  complete?(args: string[], cwd: string): string[];
  run(ctx: CommandCtx): void | Promise<void>;   // exit code via thrown ExitError
}
```
```ts
// src/content/site.ts
export const SITE = {
  name: 'Alex Neko', handle: 'alxnko', role: 'tech lead',
  country: 'Kyrgyzstan', host: 'nitro', os: 'meowOS',
  rank: { text: '#1 committer in Kyrgyzstan', href: 'https://committers.top/kyrgyzstan_private' },
} as const;
export const CONTACTS = [
  { id: 'github', short: 'gh', label: 'github', handle: 'alxnko', href: 'https://github.com/alxnko' },
  { id: 'telegram', short: 'tg', label: 'telegram', handle: '@ALXNK0', href: 'https://t.me/ALXNK0' },
  { id: 'linkedin', short: 'in', label: 'linkedin', handle: 'alxnko', href: 'https://linkedin.com/in/alxnko' },
  { id: 'instagram', short: 'ig', label: 'instagram', handle: 'alxnko', href: 'https://instagram.com/alxnko' },
  { id: 'email', short: 'mail', label: 'email', handle: 'aleksandrnyrko@gmail.com', href: 'mailto:aleksandrnyrko@gmail.com' },
] as const;
export const LINK_ALLOWLIST: ReadonlySet<string> = new Set([...CONTACTS.map(c => c.href), SITE.rank.href]);
```
`design/tokens.json` has this shape (values are in spec §4.2–4.3):
```json
{ "primitive": { "graphite": {"950":"#0a0a0b", "...": "..."}, "day": {...}, "green":"#00ff82", "greenInk":"#0a6e3c", "amber":"#ffb454", "red":"#ff5f56", "purple":"#b061ff", "scene": {"laminate":"#dcd8cc","floor":"#5b4a3c","wall":"#cfcabd"} },
  "semantic": { "dark": {"bg":"…","bgElev":"…","surface":"…","line":"…","lineStrong":"…","fg":"…","fgMuted":"…","fgSubtle":"…","accent":"#00ff82","accentFill":"#00ff82","onAccent":"#06170d","warn":"#ffb454","danger":"#ff5f56","focus":"#00ff82"},
                "light": {"bg":"#e9e8e4", "...": "...", "accent":"#0a6e3c","accentFill":"#00ff82","onAccent":"#06170d","focus":"#0a6e3c"} },
  "ansi": { "black":"#0a0a0b","red":"#ff5f56","green":"#00ff82","yellow":"#ffb454","blue":"#6ea8ff","magenta":"#c792ea","cyan":"#7fdbca","white":"#d8d8d6","dim":"#6d6d6a","muted":"#9a9a96","fg":"#d8d8d6","bg":"#050506" },
  "space": [0,4,8,12,16,24,32,48,64], "radius": {"s":2,"m":4,"l":8},
  "type": {"scale":[12,13,14,16,20,28,40]},
  "motion": {"ease":"cubic-bezier(.16,1,.3,1)","fast":120,"base":240,"slow":600} }
```

- [ ] **Step 1:** Update `package.json`.
  - Scripts: `dev`, `build` = `bun run tokens:check && astro build && bun scripts/postbuild-csp.ts`,
    `preview`, `lint` = `astro check && tsc --noEmit`, `test` = `vitest run`,
    `e2e` = `playwright test`, `tokens` = `bun scripts/gen-tokens.ts`,
    `tokens:check` = `bun scripts/gen-tokens.ts --check`, `scene` = `bash scene/run.sh`.
  - Remove the deps `@fontsource-variable/outfit` and `@fontsource/bytesized`.
  - Add `@fontsource/vt323` and `three`.
  - Add devDeps `vitest`, `happy-dom`, `@playwright/test`, `@types/three`,
    `@gltf-transform/cli`.
  - Run `bun install`.
- [ ] **Step 2:** Write the failing tests in `tests/unit/tokens.test.ts`:
  - (a) `gen(tokens)` output contains `--bg:` for both themes, with the light theme
    under `:root[data-theme="light"]` and the system-light fallback under
    `@media (prefers-color-scheme: light){:root:not([data-theme="dark"])…}`.
  - (b) WCAG contrast of `fg/bg`, `fgMuted/bg`, `fgSubtle/bg`, `accent/bg` is ≥ 4.5 in
    both themes. Use the WCAG relative-luminance formula in the test.
  - (c) The committed `src/styles/tokens.css` equals `gen()` (drift check).

  Write `tests/unit/security-guard.test.ts`: glob `src/**/*.{ts,astro}`, and assert
  that none match
  `/\.innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/`,
  and no `.astro` contains ` style="`.
- [ ] **Step 3:** Run `bunx vitest run tests/unit` and confirm FAIL (module missing).
- [ ] **Step 4:** Implement `scripts/gen-tokens.ts`.
  - Export `gen(tokens): string` and `contrast(a,b): number`.
  - The CLI writes `src/styles/tokens.css`; `--check` exits 1 on diff.
  - Emit these CSS variables:
    - `--c-*` (semantic, per theme)
    - `--ansi-*`
    - `--sp-1..8`
    - `--r-s/m/l`
    - `--fs-1..7`
    - `--ease`, `--d-fast/base/slow`
    - `--font-mono: "JetBrains Mono","JetBrains Mono Fallback",ui-monospace,monospace`
    - `--font-mark: "VT323",var(--font-mono)`
  - Implement `src/lib/tokens.ts`: `import t from '../../design/tokens.json'; export const TOKENS = t;`
    with typed accessors `ansi(name)`, `sem(theme,name)`.
  - Implement `src/lib/prefs.ts`: `get(key):string|null`, `set(key,val)`, `del(key)`,
    all try/catch, keys prefixed `alxnko:`.
  - Adjust the tokens until contrast passes. The `fgSubtle` values must be ≥ 4.5.
- [ ] **Step 5:** Run `bun run tokens && bunx vitest run tests/unit` and confirm PASS.
- [ ] **Step 6:** Commit: `chore: scaffold tooling, tokens, shared contracts`.

---

### Task 2: Blender scene model (W1-scene)

**Files:** Create `scene/common.py`, `scene/dims.py`, `scene/build.py`, `scene/run.sh`.
Output: `/var/tmp/alxnko-scene/desk.blend`.

**Consumes:** `design/tokens.json` (colors), the reference photos at
`/home/alxnko/Projects/code/meow/3d-table-references/*.jpg` (view downscaled copies
only), and spec §6.1–6.2 plus the §10 imperfections.

**Produces:**
- A `.blend` with every node from the spec §6.2 contract, named exactly.
- A `bake` collection membership for baked meshes.
- Object custom property `pivot` where relevant.
- Two light rigs as collections: `rig_day` and `rig_night`.
- Cameras `cam_wide` and `cam_desk`.

- [ ] **Step 1:** `scene/dims.py`: all measurements in meters (Blender Z-up; the glTF
  exporter converts to Y-up).
  - desk top 1.20×0.60×0.025 at height 0.74
  - frame legs at x = ±0.52, with T-feet 0.60 deep
  - paddle at front-right x = 0.42, 3 cm under the top
  - laptop base 0.36×0.26×0.025 at x = −0.33, rotated +8° toward center; lid opened
    to 105°, screen 0.345×0.216
  - monitor: 34" 21:9 panel 0.80×0.335, curve radius 1.5 m, bezel 6 mm, corner
    radius 8 mm, center at x = +0.12, screen bottom 0.11 m above the desk,
    60 mm-deep stand with an oval base
  - keyboard 0.38×0.135×0.03 at (0.05, front 0.12 from edge), rotated −2°
  - pad 0.45×0.40 under the mouse and stand
  - mouse at x = 0.36 (vertical, 0.07×0.07×0.07, 57° shell tilt)
  - gamepad 0.155 wide in front of the stand
  - fan: 0.18 diameter ring in a U-bracket at the front-left x = −0.53
  - cat: ~0.22 long, lying on the fan
  - charger 0.15×0.07×0.03 behind the laptop
  - server 0.45×0.30×0.18 (4U mini) on the floor at right-rear x = 0.75
  - window on the left wall x = −1.4, 0.9 wide × 1.2 tall, sill at 0.85
  - room: floor 4×4 m, back wall at y = +0.35 behind the desk
- [ ] **Step 2:** `scene/common.py`: helpers.
  - `reset()`
  - `mat(name, hex, rough=0.6, metal=0.0, emit=None)` (sRGB→linear conversion)
  - `box(name, size, loc, bevel=0.002, segs=2)`, `cyl(...)`, `rounded_rect_panel(...)`,
    `curve_tube(points, r)` for cables with sag
  - `join(objs, name)`, `set_pivot(obj, world_point)`
  - `add_to(coll, obj)`
  - All colors come from `tokens.json`: laminate, floor, wall, graphite ramp, lime key
    accent `#a4d60e`, which is the physical keycap color, **not** the UI accent.
- [ ] **Step 3:** `scene/build.py`: model every object. Keep it stylized-real: bevels
  everywhere, no perfect symmetry.
  - Keyboard: rows of cap boxes via array plus random ±0.3 mm height jitter; lime caps
    = space, enter, arrows, esc (vertex color).
  - Laptop: keyboard well inset; vent lines on the rear; hinge cylinder.
  - Monitor: curved panel built as a subdivided strip bent on the 1.5 m radius; the
    `ring` torus on the back (r 0.09, tube 0.004); stand neck and oval base.
  - Cat: faceted low-poly built from brand-mark proportions, split into three meshes,
    all flat-shaded, accent green `#00ff82` base color:
    - `cat_head`: an octahedral diamond head with two triangular ears; pivot at the neck
    - `cat_body`: prism body with a center ridge
    - `cat_tail`: tapered wedge; pivot at the base
    - pose: lying on the fan, head toward the laptop
  - Fan: `fan_blades` is a separate 5-blade mesh with its pivot at the hub.
  - LEDs are 4 mm boxes: `led_paddle`, `led_kbd`, `led_srv_0..5`.
  - `cable_drop` is a straight tube down the rear-right leg with its origin at the
    floor anchor.
  - `ring_glow` is a 0.9×0.9 quad on the wall behind the monitor, parented to `desk_rig`.
  - `window_sky` is a quad in the window opening.
  - `hit_laptop` and `hit_monitor` are boxes enclosing each screen, excluded from the bake.
  - Parenting: `desk_rig` (empty at the desk-top height) parents all on-desk objects
    and the upper legs.
  - Collections: `bake_static`, `bake_rig`, `runtime` (screens, leds, ring, glow, sky,
    hits, cat parts, fan blades).
  - The cat and fan blades are **also** baked. They are separate meshes that share the
    atlas.
- [ ] **Step 4:** Light rigs.
  - `rig_day`: sun through the window (strength 3, warm 5600 K), world sky 0.6, and a
    large soft area fill from the front-right at 0.3.
  - `rig_night`: world 0.03 (cool `#1a2233`); an emissive plane standing in for the
    monitor screen (strength 2.5, `#dfe6ff`); a laptop screen emitter at 1.5;
    tiny LED emitters; a warm dim practical off-screen at 0.05. There is **no ring
    light** in either bake.
  - Cameras:
    - `cam_desk`: seated eye point ≈ (0.05, −0.95, 1.18), looking at (0.02, 0.05, 0.86);
      FOV 50° horizontal
    - `cam_wide`: (−1.1, −2.3, 1.9), looking at the desk center; FOV 55°
- [ ] **Step 5:** `scene/run.sh`:
  `mkdir -p /var/tmp/alxnko-scene && blender -b --factory-startup -P scene/build.py -- --out /var/tmp/alxnko-scene/desk.blend`,
  then the bake, export and posters steps (Tasks 3–4).
- [ ] **Step 6:** Verify by rendering quick EEVEE previews from `cam_desk` and
  `cam_wide` into `/var/tmp/alxnko-scene/preview-*.png`. **Look at them** (Read the
  PNG) and compare against the reference photos: proportions, placement, and a
  believable desk. Iterate until it reads as the owner's desk.
- [ ] **Step 7:** Commit `feat(scene): procedural Blender model of the desk`.

### Task 3: Bake, UV atlas, export (W1-scene)

**Files:** Create `scene/bake.py` and `scene/export.py`. Output: `public/scene/*`.

**Produces:**
- `public/scene/desk.glb`: meshopt-compressed and quantized, with nodes named per spec
  §6.2. Baked meshes carry UV0 into the shared atlas; screens carry UV0 in 0–1.
- `public/scene/atlas-{day,night}-{2048,1024}.webp`
- `public/scene/manifest.json`:
  ```json
  {"version":"<sha8 of glb>","deskBase":0.74,"presets":[0.74,0.95,1.12],"range":[0.70,1.20],
   "screens":{"laptop":{"w":0.345,"h":0.216},"monitor":{"w":0.80,"h":0.335,"radius":1.5}},
   "files":{"glb":"desk.<hash>.glb","atlas":{"day":{"2048":"…","1024":"…"},"night":{…}},"poster":{…}}}
  ```
  Filenames are content-hashed (`name.<sha8>.ext`) so they are immutable-cacheable.

- [ ] **Step 1:** UV: select all meshes in the `bake_*` collections plus the cat and fan
  blades, then Smart UV Project (angle 66°, margin 0.004).
  Pack islands into one layout with rotation, texel density weighted by importance:
  scale islands ×2 for hero objects (laptop, monitor, keyboard, desk top, cat), ×0.5
  for room walls and floor.
- [ ] **Step 2:** Bake.
  - Cycles on the OptiX GPU (fall back to CUDA, then CPU).
  - Bake type DIFFUSE with direct, indirect and color, at 512 samples plus the
    OIDN denoiser.
  - Target 4096² per rig into `/var/tmp/alxnko-scene/`, with 8 px bake margin.
  - Bake `rig_day`, then `rig_night`; each rig's collection is enabled only for its own
    bake.
  - Emissive objects (LEDs, screens, ring, glow, sky) are excluded from the bake
    targets.
- [ ] **Step 3:** Downscale with Lanczos to 2048 and 1024 and write WebP (`magick …
  -quality 82`; 1024 at `-quality 78`).
  - Assert sizes: 1024 ≤ 120 KB, 2048 ≤ 450 KB. If a file exceeds its limit, lower the
    quality in steps of 4.
- [ ] **Step 4:** Export glTF.
  - glb with Y-up, no materials beyond a single placeholder material per mesh, custom
    props on, apply modifiers.
  - Then:
    `bunx gltf-transform meshopt in.glb out.glb --level medium` followed by
    `bunx gltf-transform prune`, `dedup`, `weld`.
  - Assert the glb is ≤ 250 KB and triangles are ≤ 40 k (print the stats).
- [ ] **Step 5:** Write `manifest.json` with the hashed filenames. Delete stale hashed
  files in `public/scene/`.
- [ ] **Step 6:** Commit `feat(scene): bake day/night atlases and export meshopt glb`.

### Task 4: Posters and OG image (W1-scene)

**Files:** Create `scene/render_posters.py`. Output:
`public/scene/poster-{day,night}-{1600,800}.{avif,webp}` and `public/og.png`.

- [ ] **Step 1:** Render Cycles from `cam_desk` for each rig, with the ring glow
  **included** here as green (emission `#00ff82`, strength 4). Screens show:
  - laptop: the boot/fastfetch terminal composition rendered from a fixed PNG made by
    `scene/screen_text.py`, using PIL-free Blender text objects on the screen plane in
    JetBrains Mono
  - monitor: contacts

  Output 1600×1000 (16:10) and 800×1000 (a portrait crop for mobile, centered on the
  laptop and monitor).
- [ ] **Step 2:** Encode AVIF (`avifenc -q 60`) and WebP (`-quality 80`). Budgets:
  1600 avif ≤ 90 KB, 800 avif ≤ 45 KB.
- [ ] **Step 3:** Render the `og.png` 1200×630 from `cam_desk` (night) with a graphite
  band on the left holding `alxnko_` (VT323) and `tech lead · kyrgyzstan`, composited
  with ImageMagick.
- [ ] **Step 4:** Add the posters to `manifest.json`. Commit
  `feat(scene): baked posters and og image`.

---

### Task 5: Parser, VFS, store (W1-term)

**Files:** Create `src/term/parse.ts`, `src/term/vfs.ts`, `src/term/store.ts`,
`src/term/format.ts`. Tests: `tests/unit/term/{parse,vfs,store}.test.ts`.

**Produces:**
```ts
// parse.ts
export type Pipeline = string[][];                     // [[cmd,...args], ...] joined by |
export interface Chain { op: ';'|'&&'|'||'|null; pipeline: Pipeline }
export function parse(input: string): Chain[];         // throws ParseError('unterminated quote')
// vfs.ts
export interface VNode { name: string; kind: 'dir'|'file'|'link'; landmark?: Landmark;
  read?(w: WorldState): string; href?: string; children?: VNode[]; hidden?: boolean }
export function createFs(): VNode;                     // tree per spec §5.3
export function resolve(cwd: string, p: string): string;   // normalizes ~, ., .., abs
export function lookup(root: VNode, abs: string): VNode|null;
export const HOME = '/home/alxnko';
export function pretty(abs: string): string;          // HOME → ~
// store.ts
export class TermStore {
  constructor(opts?: { historyKey?: string; maxLines?: number /*500*/ });
  get state(): Readonly<TermState>;
  subscribe(fn: (s: TermState) => void): () => void;
  print(line: Line|string): void; printAll(lines: (Line|string)[]): void; clear(): void;
  setInput(text: string, cursor?: number): void; setCwd(abs: string): void; setBusy(b: boolean): void;
  pushHistory(cmd: string): void;                      // dedupe consecutive, cap 100, persist
  setOverlay(frame: Line[] | null): void;
  prompt(): Line;                                      // [alxnko@nitro ~]$
}
// format.ts
export const fg: (c: Color, text: string) => Span; export const b: (text: string, c?: Color) => Span;
export const link: (text: string, href: string) => Span;   // href must be in LINK_ALLOWLIST else plain span
```
- [ ] **Step 1:** Write the failing tests.
  - parse:
    - `parse('ls -la ~/monitor')` → `[{op:null,pipeline:[['ls','-la','~/monitor']]}]`
    - quotes: `echo "a b" 'c d'` → args `['a b','c d']`
    - `a && b || c; d` operators in order
    - `cat x | grep y | wc -l`
    - unterminated quote throws
    - the empty string → `[]`
    - 256+ chars are truncated upstream (store)
  - vfs:
    - `resolve('/home/alxnko','..')==='/home'`
    - `resolve(HOME,'~/monitor/../desk')===HOME+'/desk'`
    - `lookup(root,HOME+'/monitor').landmark==='monitor'`
    - `/` has `etc` and `home`
    - `.config` is hidden
  - store:
    - print appends and bumps the version
    - subscribers are notified exactly once per mutation
    - maxLines trims the oldest lines
    - history dedupes and persists through a fake localStorage (happy-dom env)
    - `prompt()` renders `[alxnko@nitro ~]$ ` with `~` for HOME and `/etc` for /etc
    - `link` with a non-allowlisted href returns a span without `href`
- [ ] **Step 2:** Run the tests and confirm FAIL. **Step 3:** Implement. The parser is an
  iterative char scanner. The fs content comes from `SITE`/`CONTACTS`:
  - `about.md`: name, role at company, country, rank, one line
    "i build systems and ship. meow."
  - `laptop/readme.txt`: "you're typing on it."
  - `monitor/*.lnk`: `read()` returns the URL; `href` is set
  - `desk/height`: `read(w)` returns `(w.desk*100).toFixed(0)+' cm'`; `desk/fan` and
    `desk/ring` work the same way
  - `.config/theme`: the current theme
  - `/etc/os-release`: `NAME="meowOS" PRETTY_NAME="meowOS" ID=meow ID_LIKE=… BUILD_ID=rolling
    HOME_URL="https://alxnko.dev"`, and **no** "arch" string anywhere
  - `/etc/hostname`: `nitro`
  - `/etc/motd`: a short greeting

  **Step 4:** Tests PASS. **Step 5:** Commit `feat(term): parser, virtual fs, terminal store`.

### Task 6: Registry, exec, completion, commands (W1-term)

**Files:** Create `src/term/registry.ts`, `src/term/exec.ts`, `src/term/complete.ts`,
`src/term/commands/{info,fs,session,world,toys,secret,text}.ts`, `src/term/boot.ts`.
Tests: `tests/unit/term/{exec,complete,commands}.test.ts`.

**Produces:**
```ts
export class Shell {                        // exec.ts
  constructor(store: TermStore, world: WorldPort, fs?: VNode);
  run(line: string): Promise<void>;         // echoes prompt+line into store, pushes history, executes
  interrupt(): void;                        // Ctrl+C: aborts running command, prints ^C
  readonly registry: Registry;
}
export function complete(line: string, cursor: number, cwd: string, reg: Registry, fs: VNode):
  { replace: [number, number]; candidates: string[]; insert: string|null };
export function didYouMean(name: string, names: string[]): string|null;   // Damerau ≤ 2
export function bootLines(): Line[];        // ~14 lines, [  OK  ] green, never mentions arch
export class NullWorld implements WorldPort { /* in-memory state, fly() no-op; used in tests and fallback */ }
```
Command behavior (all must be covered by tests in `commands.test.ts`, run through
`Shell.run` with `NullWorld`, asserting on the text in `store.state.lines`):
- **Help and info:**
  - `help`: a grouped table (info / files / world / fun). Hidden commands are not
    listed. No projects.
  - `man <cmd>`: prints name, synopsis and description. `man` with no argument prints
    `What manual page do you want?`.
  - `whoami`: `alxnko`. `whoami -v`: the full identity line.
  - `fastfetch`: ASCII cat mark (8 lines, green) beside key/value rows:
    `alxnko@nitro`, `os meowOS x86_64`, `host nitro`, `kernel 7.2.6-meow`,
    `uptime <since page load>`, `shell bash 5.3`, `role tech lead`,
    `loc Kyrgyzstan`, `rank #1 committer in KG`, then contacts
    (links), plus a colour-block row of 8 ANSI swatches.
  - `uname` → `Linux`; `uname -a` → `Linux nitro 7.2.6-meow #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux`.
  - `uptime`, `date`, `echo`, `hostname`.
- **Filesystem:**
  - `ls` (dirs blue with `/`, links cyan; `-a` shows dotfiles; `-l` shows long format
    with fake perms and `alxnko alxnko`)
  - `cd` flies to the dir's landmark if it has one. `cd /` flies to wide. `cd` or
    `cd ~` goes home and flies to desk.
  - `pwd`, `cat` (a dir → `cat: x: Is a directory`), `tree`
  - `open <contact id|short|path>`: allowlisted only; returns
    `opening https://…` + calls `window.open` via the injectable `opener`.
- **Session:**
  - `history` (numbered), `clear`
  - `exit`: prints `logout`, flies to wide
- **World:**
  - `theme [day|night|toggle]`
  - `desk [1|2|3|up|down]`: prints `desk: moving to 95 cm…` and then
    `desk: 95 cm`; awaits `setDesk`
  - `ring [green|purple|off]`, `fan [0-3]` (no argument cycles), `sound [on|low|off]`
  - `meow` prints a cat line and calls `world.meow()`
- **Toys:**
  - `catsay <msg>`
  - `cmatrix`: sets `busy` and writes frames of random green columns (24 rows) via
    `store.setOverlay(frame)` at 12 fps for ≤ 8 s. Ctrl+C or any key stops it, and it
    ends with `setOverlay(null)`. Nothing goes to the scrollback. Both renderers draw
    `overlay` over the screen when it is non-null.
  - `pacman -Syu` / `yay`: progress bars over about 1.5 s, then
    ` there is nothing to do`. Plain `pacman -S x` prints
    `error: you cannot perform this operation unless you are root.`
  - `rm -rf /`: `rm: it is dangerous to operate recursively on '/'` +
    `rm: use --no-preserve-root to override this failsafe`, and with that flag:
    `nice try. meow.`
- **Secret:** `sudo <anything>`: `[sudo] password for alxnko:`, then a 700 ms pause,
  then `alxnko is not in the sudoers file.  This incident will be reported.`
  (amber), and calls `world.stare()`. It is hidden from `help`.
- **Pipes:** `grep <pat> [-i]`, `head [-n N]`, `tail [-n N]`, `wc [-l]` read `stdin`.
- **Errors:**
  - an unknown command prints `bash: foo: command not found`, plus a
    `did you mean 'bar'?` line when there is a suggestion
  - exit codes drive `&&`/`||`
  - a thrown error inside a command → `bash: <cmd>: internal error` (never crashes
    the shell)

- [ ] Steps: failing tests → FAIL → implement → PASS → commit
  `feat(term): shell, commands, completion, boot log`.

### Task 7: Terminal perf and edge tests (W1-term)
- [ ] Test that 1000 prints finish in < 50 ms and the store caps at 500.
- [ ] Test that input over 256 characters is clamped.
- [ ] Test that `run` during `busy` is ignored.
- [ ] Test that `interrupt` aborts `pacman -Syu` mid-way and prints `^C`.
- [ ] Test that completion cycles `ca`→`cat|catsay` and `cd mo`→`cd monitor/`.
- [ ] Commit `test(term): edge and performance coverage`.

---

### Task 8: Page shell, design system CSS, fonts (W1-page)

**Files:**
- Create: `src/styles/{base,page,terminal,scene}.css`,
  `src/components/{Identity,Terminal,Contacts,Icon,Nav,Toggles}.astro`, `src/pages/404.astro`
- Modify: `src/pages/index.astro`
- Delete: `src/components/Terminal.astro` (old), `src/styles/global.css`,
  `src/components/ThemeScript.astro`, `src/components/Icons.astro` (replaced by `Icon.astro`)
- Keep: `src/components/Redirect.astro` and the redirect pages.

**Produces:** DOM hooks (ids and data attributes) used by later tasks:
- `#app[data-mode="page"|"scene"]` on `<body>`
- `#identity` holds the name mark `#mark` and `#rank`
- `#term` (section) contains:
  - `#term-screen` (role=log, aria-live=polite), `#term-lines`, and `#term-overlay`
  - `form#term-form`, with `label.visually-hidden[for=term-input]` and
    `input#term-input` (autocomplete=off autocapitalize=off autocorrect=off
    spellcheck=false enterkeyhint=send maxlength=256)
  - `#term-chips` (5 buttons with `data-cmd`)
- `#contacts ul > li > a[data-contact=<id>]`
- `#poster` is a `<picture>` with AVIF/WebP sources per theme via `media` +
  `data-theme-src`, `fetchpriority=high`, width/height set.
- `#stage` is an empty div for the canvas.
- `#nav` has 4 buttons `[data-landmark]`. `#t-theme` and `#t-sound` are buttons with
  `aria-pressed`. `#hint` is the hint line.
- `#enter3d` is a button, hidden unless gated to "offer".
- Skip link to `#term-input`.

- [ ] **Step 1:** Page-mode layout, mobile first:
  - Identity block (VT323 `alxnko_` mark at 40 px with a blinking `_`; lines in
    `--fs-3` muted: `tech lead`, `kyrgyzstan`, a
    rank badge link)
  - Poster figure (aspect-ratio reserved)
  - Terminal panel (dark always; header strip `tty1 — alxnko@nitro` with tabular-num
    clock, no traffic lights; a 1 px graphite rule)
  - Contacts list (a grid of rows `gh  github.com/alxnko  ↗`, 44 px min height)
  - Footer (`alxnko.dev · meowOS rolling · kyrgyzstan`), a lowercase technical label
  - ≥ 1024 px: two columns (identity+contacts left 38 %, terminal+poster right)
  - All values come from token vars; no raw hex outside `tokens.css`.
- [ ] **Step 2:** Fonts. Import only `@fontsource/jetbrains-mono/latin-400.css`,
  `latin-700.css`, and `@fontsource/vt323/latin-400.css`.
  - Add the `@font-face` "JetBrains Mono Fallback": `src: local("DejaVu Sans Mono"),
    local("Menlo"), local("Consolas")`, `size-adjust: 100%`,
    `ascent-override: 102%`, `descent-override: 30%`.
  - Preload the latin-400 woff2 via `<link rel=preload as=font crossorigin>`, with the
    Astro-resolved URL via `?url` import.
- [ ] **Step 3:** Theme bootstrap. A tiny `is:inline` script in `<head>` sets
  `data-theme` from `localStorage['alxnko:theme']`, otherwise the system setting.
  Its hash goes to the CSP (Task 10).
- [ ] **Step 4:** `404.astro`: the same shell, with the terminal line
  `bash: cd: <path>: No such file or directory` (path filled by the client script via
  `textContent`) and a `cd ~` link home.
- [ ] **Step 5:** Verify: `bun run build` and `bun run preview`. Take Playwright
  screenshots at 375/768/1440 in both themes and look at them. Compare against spec
  §10 and fix anything generic.
- [ ] **Step 6:** Commit `feat(page): graphite design system and page shell`.

### Task 9: DOM terminal renderer and controller (W1-page)

**Files:** Create `src/ui/terminal-dom.ts`, `src/ui/theme.ts`, `src/ui/app.ts`.
Tests: `tests/unit/ui/terminal-dom.test.ts` (happy-dom).

**Consumes:** `TermStore`, `Shell`, `complete` (Task 5/6 signatures; stub imports allowed
until merged), and the Task 8 hooks.

**Produces:**
```ts
export function mountTerminal(root: HTMLElement, shell: Shell, store: TermStore,
  opts: { onFocus?(): void; onActivity?(): void }): { focus(): void; destroy(): void };
export function applyTheme(t: Theme): void; export function currentTheme(): Theme;
export function toggleTheme(): Theme; // persists
export async function start(): Promise<void>; // app.ts entry
```
- [ ] **Step 1:** Tests:
  - rendering lines creates spans with classes `c-<color>`, `b`, and `<a>` for href
    with `rel="noopener noreferrer"` and `target=_blank`
  - no `innerHTML` is used (spy on the `Element.prototype.innerHTML` setter)
  - Enter runs the command
  - ↑/↓ walks history
  - Tab completes
  - Ctrl+L clears
  - Ctrl+C interrupts
  - Ctrl+U/W/A/E/R behave
  - a chip click runs its command
  - output auto-scrolls unless the user scrolled up
  - incremental render only appends new lines (a clear rebuilds)
- [ ] **Step 2:** Implement.
  - The renderer reconciles by `version` and line count.
  - The caret is a CSS block after the input mirror. The input is transparent over a
    rendered mirror so the caret glyph looks like a real tty block, blinking at 1 Hz
    and steady under reduced motion.
  - `app.ts`:
    - create the store and shell (`NullWorld` first)
    - mount the terminal
    - run the boot on the first visit (`prefs 'booted'`); else print `motd` + `fastfetch`
      compact
    - bind theme/sound toggles
    - global key handler: a printable key with no focused editable → focus the input,
      insert the key, and `onFocus`
    - after `load` + `requestIdleCallback` (1500 ms fallback): run `decide3D`;
      `import('../scene/index')` when `'auto'`, or show `#enter3d` when `'offer'`
- [ ] **Step 3:** PASS, then commit `feat(ui): accessible DOM terminal renderer`.

### Task 10: CSP postbuild and headers (W1-page)

**Files:** Create `scripts/postbuild-csp.ts`; modify `public/_headers`,
`public/.well-known/security.txt`. Test: `tests/unit/csp.test.ts`.

**Produces:** `export function buildCsp(htmlFiles: string[]): string` and a CLI that
rewrites `dist/_headers`, replacing the `__CSP__` placeholder line.

- [ ] **Step 1:** Test. Given HTML with an inline script `a()` and style `b{}`, the CSP
  contains `'sha256-<base64>'` for each, and has no `unsafe-inline`, no `https:`, and no
  googleapis.
- [ ] **Step 2:** Implement per spec §7.3. `public/_headers` gets:
  - `Content-Security-Policy: __CSP__`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(),
    interest-cohort=()`
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Resource-Policy: same-origin`
  - `/scene/*` immutable
  - `/404.html` gets no-cache like `/`

  Refresh the security.txt `Expires` to one year out.
- [ ] **Step 3:** PASS, then commit `feat(security): hashed strict CSP and hardened headers`.

---

### Task 11: Gate, rail, homography (Wave 2, pure, TDD)
**Files:** `src/scene/{gate,rail,homography}.ts`; tests `tests/unit/scene/*.test.ts`.
```ts
export type Gate = 'auto'|'offer'|'never';
export function decide3D(e: { url: string; webgl2: boolean; saveData?: boolean; effectiveType?: string;
  cores?: number; memory?: number }): Gate;
export interface Pose { pos: [number,number,number]; target: [number,number,number]; fov: number }
export class Rail { constructor(poses: Record<Landmark, Pose>);
  setPoses(p: Partial<Record<Landmark,Pose>>): void; sample(t: number): Pose;       // centripetal CR
  nearest(t: number): Landmark; }
export class Spring { constructor(k?: number); value: number; target: number; velocity: number;
  step(dt: number): boolean /* moving */; snap(v: number): void; }                   // critically damped
export function homography(src: [number,number][], dst: [number,number][]): number[]; // 3x3
export function toMatrix3d(h: number[]): string;                                     // CSS matrix3d(...)
```
- [ ] Tests:
  - gate truth table per spec §6.6
  - rail passes exactly through each landmark at t = 0/1/2/3 and is continuous
  - the spring converges without overshoot for k = 120 within 1 s
  - the homography maps the unit square to a known quad within 1e-6, and `toMatrix3d`
    of the identity is `matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)`
- [ ] Implement, confirm PASS, commit `feat(scene): gating, camera rail, homography math`.

### Task 12: Scene mount, loader, materials (Wave 2)
**Files:** `src/scene/{index,loader,materials}.ts`.
```ts
export interface SceneHandle extends WorldPort { destroy(): void; readonly ready: Promise<void> }
export function mount(o: { stage: HTMLElement; store: TermStore; theme: Theme;
  reducedMotion: boolean; onFallback(reason: string): void }): SceneHandle;
```
- [ ] **Loading:** load `manifest.json`, then the glb via `GLTFLoader` +
  `MeshoptDecoder`, then the atlas for the current theme at the chosen size (spec §6.3).
- [ ] **Materials:**
  - baked meshes: one `ShaderMaterial` (`uDay`, `uNight`, `uMix`; sRGB output;
    `toneMapping` off)
  - screens: `ShaderMaterial` (`map`, `uGlow`, fresnel term using the view dir and
    normal; reflection color from the theme)
  - `ring` and LEDs: `MeshBasicMaterial` with a color uniform
  - `ring_glow`: additive, radial falloff in the shader, `uColor`, `uIntensity`
  - `window_sky`: a procedural shader (`uMix` day/night; night = gradient + hashed
    window grid lights)
  - hit boxes: invisible
- [ ] **Renderer:** `antialias` true on DPR < 2, `powerPreference` `high-performance`
  only on desktop, `outputColorSpace` SRGB. Handle `webglcontextlost` →
  `onFallback('context')`.
- [ ] **Fade-in:** the canvas fades in over 400 ms once the first frame renders. Set
  `body[data-mode=scene]`.
- [ ] Manual verify: run the dev server and take a Playwright screenshot of `/?3d` at
  1440 and 390. **Look** at the result.
- [ ] Commit `feat(scene): lazy three.js mount with baked materials`.

### Task 13: Screens, docking, input (Wave 2)
**Files:** `src/scene/{screen-mirror,monitor-screen,dock,input}.ts`.
- [ ] **screen-mirror:**
  - 80×24 grid; canvas 1280×800 on desktop or 1024×640 on mobile
  - JetBrains Mono after `document.fonts.load`
  - draws the last 23 lines plus the prompt/input line and a block cursor; a top bar
    with `1 2 3` and the clock
  - redraws on the store version or a 2 Hz cursor blink, and only while undocked
  - sets `texture.needsUpdate`
  - exposes `window.__mirrorText()` in dev/test builds only
    (`import.meta.env.MODE!=='production'` or `?test`) for e2e
- [ ] **monitor-screen:** per spec §6.5, drawn once plus on theme change and clock
  minute ticks.
- [ ] **dock:**
  - each frame at `laptop`, project the `screen_laptop` corners → homography → set
    `#term` `transform` (via CSSOM) + dock class
  - hysteresis per spec §6.4
  - on narrow viewports, use the sheet mode instead
  - same for `#contacts` over the monitor (bounds fit)
  - `focusin` on `#term`/`#contacts` → `fly`
- [ ] **input:**
  - wheel → t (deltaY · 0.0015, clamped)
  - one-finger vertical drag → t; horizontal drag → orbit offset (clamped, springs back)
  - pinch → t
  - tap → raycast only `hit_laptop`/`hit_monitor`
  - nav buttons → fly
  - all passive listeners except on the canvas
- [ ] Commit `feat(scene): live screens, DOM docking, camera input`.

### Task 14: World behaviours and animation (Wave 2)
**Files:** `src/scene/anim.ts`; wire up in `index.ts`.
- [ ] Implement every `WorldPort` method with the §3.5 table behaviour:
  - desk motion 1.5 s ease-in-out (the rig moves; `cable_drop` scales;
    `led_paddle` is on while moving)
  - theme mix 600 ms (loads the other atlas first)
  - ring tint 300 ms
  - fan speed eases
  - `meow`: head tilt plus tail flick plus ring pulse
  - `stare`: head turns toward the camera for 3 s
- [ ] **Idle (§3.6):** fan drift, server LED patterns, ring breathe, the cat state
  machine, tail flicks.
- [ ] **Render policy:** full rate while animating/moving; 20 fps idle; 8 fps after 60 s
  idle; 0 when hidden, offscreen (`IntersectionObserver`), or reduced motion.
- [ ] **Adaptive DPR** per spec §6.3.
- [ ] Unit-test the pure pieces:
  - `catState(now, events)` transitions
  - `deskPresetFor(arg, current)`: `up` = +0.05 clamped to the range
- [ ] Commit `feat(scene): physical world behaviours and render policy`.

---

### Task 15: Sound (Wave 3)
**Files:** `src/audio/sound.ts`, a lazy import from the scene or app.
- [ ] WebAudio only after a gesture:
  - fan hum (brown noise → lowpass, gain ∝ fan speed)
  - key click, enter
  - desk motor
  - meow (osc + formant bandpass sweep 700→1200→500 Hz over 450 ms)
  - tick
- [ ] Levels: master gain 0.06 at `low` and 0.12 at `on`.
- [ ] The preference persists. The toggle `aria-pressed` reflects the state.
- [ ] Commit `feat(audio): synthesized optional soundscape`.

### Task 16: E2E, CI, budgets (Wave 3)
**Files:** `playwright.config.ts`, `tests/e2e/{page,terminal,scene,fallback,a11y}.spec.ts`,
`.github/workflows/ci.yml`, `scripts/budget.ts`.
- [ ] **Playwright:** projects `desktop` (1440×900) and `mobile` (390×844, hasTouch,
  isMobile); `webServer: bun run preview`.
- [ ] **Specs (per spec §8):**
  - collect `console` errors and `securitypolicyviolation` events (fail on any)
  - keyboard-only walkthrough
  - mirror continuity via `__mirrorText` with `?3d&test`
  - `?lite` shows the poster and the terminal works
  - WebGL disabled via `--disable-webgl` launch args → fallback
  - reduced motion
  - 404
  - axe-like checks without adding deps: every button has an accessible name, every
    img has alt, touch targets ≥ 44 px, contrast of computed styles on key elements
- [ ] **`scripts/budget.ts`:** gzip sizes of the initial JS/CSS/fonts from
  `dist/index.html` and of the scene chunk; asserts the spec §7.4 budgets.
- [ ] **CI:** `oven-sh/setup-bun`, then
  `bun install --frozen-lockfile && bun run tokens:check && bun run lint && bun run test && bun run build && bun scripts/budget.ts && bunx playwright install --with-deps chromium && bun run e2e`.
- [ ] Commit `test: e2e coverage, budgets, CI`.

### Task 17: Polish pass, Lighthouse, visual review (Wave 3)
- [ ] Lighthouse (mobile and desktop) against `bun run preview` using Playwright's
  Chromium (`CHROME_PATH`). Record the scores in the PR body. Fix anything below the
  spec §7.4 targets.
- [ ] Screenshots of all landmarks × themes × {1440, 390} into
  `/var/tmp/alxnko-scene/review/`. Review each against spec §10/§11 and fix issues.
- [ ] Update `README.md`: what the site is, `bun run scene`, the tests, deploy
  (`wrangler pages deploy dist --project-name alxnko-dev --branch main`).
- [ ] Commit `docs: readme for the desk site` plus the polish commits.

## Ship (orchestrator only; per /shipping-to-merge)
1. Full gate: `bun run tokens:check && bun run lint && bun run test && bun run build &&
   bun scripts/budget.ts && bun run e2e`, all green.
2. Code review subagent (requesting-code-review template), handed the spec, this plan
   and the decision log. Fix Critical/Important findings, then re-run the gate.
3. Preview deploy:
   `wrangler pages deploy dist --project-name alxnko-dev --branch redesign-preview`.
   Smoke-test the preview URL: headers (CSP), no console errors, desktop and mobile.
4. Push the branch, open the PR, watch CI to green, resolve threads, merge commit.
5. Production deploy from merged `main`:
   `wrangler pages deploy dist --project-name alxnko-dev --branch main`. Smoke-test
   `https://alxnko.dev`.
6. Remove the worktrees.
