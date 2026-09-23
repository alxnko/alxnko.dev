# alxnko.dev: "the desk" redesign (design spec)

> **Superseded in part by the owner review (decision log R1–R34).** Notably: no company name and no
> coordinates anywhere (R3, R24; `worksFor` dropped from JSON-LD); screens are always-pinned live DOM
> behind transparent canvas windows (R6, R26) instead of the sheet/canvas-mirror swap of §3.3/§5.1;
> the camera is direct flights + drag orbit + zoom-to-cursor (R7, R18, R31) instead of the §3.4 rail
> scrub; once 3D loads it never falls back (R14); paddle buttons are clickable (R19). Where this spec
> and the decision log disagree, the decision log wins.

Date: 2026-09-23 · Status: approved in brainstorming · Branch: `feat/redesign-desk`

## 1. Goal

Replace the current generic link-hub page (hero + 5 cards + a macOS-styled fake
terminal) with a **terminal-first personal site set on a 3D model of the owner's real
desk**. It has to feel handmade and personal, stay fast and correct on phones, and be
production-grade: secure headers, accessible, SEO-complete, and tested.

Success means:
- A first-time visitor on a mid-range phone gets useful content in about 1 s and a
  live 3D desk shortly after, with no jank.
- The CLI feels like a real Linux shell. It reads as Arch-flavored but never names Arch.
- The DOM terminal and the 3D laptop screen are **two views of one state**. Whatever
  you type is visible from any camera distance.
- The page is fully usable without WebGL, JS-heavy features, or motion.

## 2. Locked decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Site role | Terminal-first experience. No projects/portfolio section for now. |
| Public facts | Name **Alex Neko** (handle `alxnko`), **tech lead**, **Kyrgyzstan**, **#1 committer in Kyrgyzstan** (committers.top), contacts. Nothing else. |
| Repo | Standalone `alxnko.dev` repo. The site gets its **own new design system** ("graphite"), independent of `@meowerse/ui`. |
| Visual direction | "A1 Graphite": neutral black/graphite hardware and UI with **no green tint**. Green `#00ff82` is a *signal only* (prompt, cursor, active state, links, the cat, one LED, the ring light). One amber. Dark and light themes: the light theme is "daytime at the desk", and screens stay dark in both. |
| 3D | Hero object, lazy loaded: the owner's full desk (from reference photos), **built and baked in headless Blender via Python scripts committed to the repo**. |
| Ring light | Monitor back ring glow is **green by default**, switchable at runtime: `ring green\|purple\|off`. |
| Cat | The plush on the fan becomes a **faceted low-poly cat built from the brand-mark geometry**, in accent green. It is the only green object. |
| CLI | Virtual filesystem, Arch-flavored rituals, toys and easter eggs. Real shell ergonomics. |
| Architecture | **Approach A**: the DOM terminal is the real UI and the 3D scene is its stage. Live DOM overlays dock onto screens, and a canvas mirror shows the same state from afar. (B, WebGL-only text, and C, permanent CSS3D, were rejected: text quality, mobile keyboard, a11y and SEO, Safari fragility.) |
| Scope guard | Fidelity and causality, not more features. **No Layer 4**: no clickable keys, drawers, physics, object picking beyond the two screens, or minigames in the scene. |
| Delivery | One branch, one PR, merge commit, then production deploy to Cloudflare Pages project `alxnko-dev`. |

## 3. Experience

### 3.1 Layers
1. **Page (Layer 1).** Semantic HTML: identity, terminal, contacts. It is excellent on
   its own and is the no-3D fallback.
2. **Desk (Layer 2).** Camera, terminal↔scene state, desk, lighting, fan, cat, screens.
3. **Atmosphere (Layer 3).** Baked materials and light, micro-details, imperfections,
   fake reflections, tiny animations, optional sound.

### 3.2 Load sequence
1. **0 ms.** HTML + critical CSS paint: identity block (`alxnko_` with blinking cursor,
   "tech lead · Kyrgyzstan", #1-in-KG badge), the live terminal, and
   contacts. A baked **poster render** of the desk (AVIF/WebP, current theme) sits
   behind as the LCP image.
2. **Interactive.** The terminal works immediately. The 3D decision (§6.6) runs after
   `load` + idle.
3. **First visit only.** A ~1.2 s boot log plays in the terminal (`[  OK  ] …`),
   skippable by any key or tap. Returning visitors (localStorage flag) skip it.
4. **3D ready.** The scene fades in over the poster (the poster matches the `desk`
   landmark exactly, so there is no pop). The page switches to **scene mode**.

### 3.3 Scene mode layout
- Full-viewport canvas (`100dvh`). The page does not scroll. Wheel, swipe and pinch drive the camera.
- Overlay UI (DOM, graphite tokens):
  - **top-left:** identity (name, role, location, badge link)
  - **top-right:** theme toggle, sound toggle
  - **bottom:** landmark nav `wide · desk · laptop · monitor` (buttons, `aria-current`) and a
    one-line hint ("type anywhere · scroll to move"), shown until first interaction
- **Terminal.** The single DOM terminal element.
  - **Docked** (camera at the laptop landmark):
    - Desktop: mapped exactly onto the laptop screen via a CSS `matrix3d` homography from
      the 4 projected screen corners.
    - Narrow/touch viewports (< 720 px wide or coarse pointer): shown as a
      full-width sheet over the lower part of the viewport, readable font, own wrap width.
  - **Undocked:** visually transparent. It stays in the a11y tree. Focusing it (Tab, click, any printable
    key) flies the camera to the laptop.
- **Contacts.** The DOM contacts panel is docked onto the monitor at the monitor
  landmark (fitted to the projected screen bounds). Undocked it is transparent. Focus
  entering it flies to the monitor.
- The 3D laptop screen shows the **canvas mirror** of the terminal store whenever the
  DOM terminal is not docked. Cross-fade on dock/undock is 120 ms.

### 3.4 Camera
- A continuous 1-D field `t ∈ [0, 3]` with named landmarks `wide(0) desk(1) laptop(2)
  monitor(3)`. Position and target come from a centripetal Catmull-Rom spline through
  the landmarks. There are never hard modes.
- Input:
  - wheel / vertical swipe / pinch changes `t`, with restrained inertia (critically
    damped spring, no overshoot)
  - drag adds a small clamped orbit offset (±12° yaw, ±6° pitch) that springs back
  - landmark buttons, `cd`, and object taps (laptop, monitor hit boxes only) fly to a
    landmark: ease-out, 500–900 ms scaled by distance
- **Typing from anywhere:** a printable key with no focused input focuses the terminal,
  flies to `laptop`, and inserts the character.
- Laptop and monitor landmarks are **computed at runtime from the screen nodes**. They
  fit the screen to the viewport with a margin, fronto-parallel, for any aspect. Wide
  and desk landmarks come from Blender cameras, with FOV widened so the desk's
  horizontal extent always fits portrait phones.
- Desk, laptop and monitor landmarks are relative to the moving desk rig, so the
  camera stays coherent when the desk height changes.
- Reduced motion: flights become 150 ms cross-cuts, no inertia, no idle animation, no boot.

### 3.5 Physical causality (commands → world)
| Command | World response |
|---|---|
| `desk 1\|2\|3\|up\|down` | Paddle LED on → motor sound (if enabled) → the desk rig moves over ~1.5 s (ease in-out). The monitor, laptop and everything on top ride along, the upper legs telescope, and the cable drop stretches. The terminal prints the height. LED off. |
| `theme day\|night` (and toggle) | Lighting cross-fades 600 ms between baked day/night atlases. The window sky changes. Page tokens switch. |
| `ring green\|purple\|off` | Ring emissive plus wall-glow decal re-tint over 300 ms. |
| `fan` / `fan 0-3` | Blade speed eases to the new level. Hum pitch follows (if sound is on). |
| `meow` | Cat: head tilt plus tail flick, ring pulse, synthesized meow (if sound is on). |
| `sudo …` (the one scene secret) | Prints the sudoers incident line. The cat slowly turns to stare into the camera for 3 s, then returns. |
| `cd monitor\|laptop\|desk`, `cd ~`, `cd /`, `exit` | Camera flies to the bound landmark (§5.3). |

### 3.6 Idle life (cheap, occasional)
- Fan blades spin, with slight speed drift.
- Server LEDs change pattern every 2–6 s. The keyboard indicator LED is steady.
- Ring light breathes ±6 % over 8 s.
- Cat state machine: `IDLE → (activity) NOTICE (head to cursor/laptop, 400 ms) →
  WATCH (follow cursor ≤ 4 s) → IDLE`. Tail flick every 15–40 s (random).
- Terminal activity nudges the laptop screen emissive slightly.
- Nothing else moves.

### 3.7 Sound (optional, off by default)
- All sounds are **synthesized in WebAudio**, with zero audio assets:
  - fan hum (filtered noise, tied to fan speed)
  - key clicks (short filtered noise bursts, randomized)
  - desk motor (low filtered saw while moving)
  - meow (formant-swept oscillator)
  - UI tick
- Master level is very low (about -30 dBFS peaks).
- The toggle and `sound on|low|off` persist to localStorage. The AudioContext is created
  only on the enabling gesture.

## 4. Design system: "graphite"

### 4.1 Single source of truth
`design/tokens.json` holds primitives plus semantic roles per theme. It is consumed by:
- `scripts/gen-tokens.ts` → `src/styles/tokens.css` (generated, committed, checked in CI
  for drift)
- `src/lib/tokens.ts` (typed import of the JSON) → scene materials, ring/LED colors,
  screen-canvas palettes
- `scene/*.py` → Blender material colors

### 4.2 Primitives
- graphite: `950 #0a0a0b, 900 #111113, 850 #151517, 800 #1a1a1c, 750 #232326,
  700 #2a2a2d, 600 #3a3a3d, 500 #6d6d6a, 400 #9a9a96, 300 #bdbdb9, 200 #d8d8d6,
  100 #ededeb`
- day: `paper #e9e8e4, paper-2 #dfded9, paper-line #cfcec8`
- green `#00ff82`, green-ink `#0a6e3c`, amber `#ffb454`, red `#ff5f56`,
  purple `#b061ff` (ring option only)
- desk laminate `#dcd8cc`, floor wood (desaturated) `#5b4a3c`, wall `#cfcabd`

### 4.3 Semantic roles (dark / light)
`bg, bg-elev, surface, line, line-strong, fg, fg-muted, fg-subtle, accent (#00ff82 /
#0a6e3c), accent-fill (#00ff82 both), on-accent, warn, danger, focus`.

The terminal always uses the dark ANSI palette, because screens stay dark:
- black, red, green, yellow (amber), blue `#6ea8ff`, magenta `#c792ea`, cyan `#7fdbca`,
  white, plus bright variants
- green is reserved for the prompt path, success marks and links

### 4.4 Type, space, motion
- **JetBrains Mono** (400/700, latin subset, self-hosted woff2) for all UI and the
  terminal. A metric-matched fallback `@font-face` uses `size-adjust` to prevent CLS.
- **VT323** for the name only, subset to `alxnko_` (self-hosted).
- Everything is lowercase in UI chrome. Terminal text keeps its real case.
- Space: 4 px scale (`1..8` = 4,8,12,16,24,32,48,64).
- Radius: 2 / 4 / 8.
- Motion: `--ease-out: cubic-bezier(.16,1,.3,1)`, durations 120/240/600 ms.
- Focus ring: 2 px accent outline with offset. Always visible on `:focus-visible`.
- Contrast: every text/background pair ≥ 4.5:1 (AA), tested (§8).

## 5. Terminal

### 5.1 Architecture
Pure TypeScript with no DOM in the core:
- `term/parse.ts`: tokenizer with quotes and escapes, `;`, `&&`, `||`, `|`
- `term/vfs.ts`: in-memory tree built from `content/site.ts`
- `term/commands/*.ts`: registry of `{name, summary, usage, complete?, run(ctx)}`
- `term/store.ts`: **the single terminal state**, i.e. scrollback (lines of styled spans
  `{text, fg?, bold?, href?}`), input line and cursor, cwd, history, busy flag. It
  exposes subscribe/notify.
- `term/complete.ts`: command names, then paths (cwd-relative), then per-command args
- `term/world.ts`: `WorldPort` interface (`fly, setDesk, setTheme, setRing, setFan,
  meow, stare, setSound, sound`) implemented by the scene (or a no-op/partial
  implementation in fallback mode, where commands still print their text result)

Renderers subscribe to the store:
- `ui/terminal-dom.ts`: DOM renderer. It builds text nodes/`<a>` only and **never
  `innerHTML`**. It is the accessible live region (`role="log"`, `aria-live="polite"`
  for output).
- `scene/screen-mirror.ts`: canvas renderer, a fixed 80×24 grid at 16:10 with the
  same palette, font and cursor. It redraws only on store change or cursor blink, and
  the blink is throttled to 2 Hz.

### 5.2 Ergonomics
- Prompt `[alxnko@nitro ~]$ ` (cwd shown `~`-relative).
- Keys:
  - ↑/↓ history (persisted, last 100, localStorage)
  - Tab completion (single: complete; multiple: list)
  - Ctrl+C (cancel line/running toy)
  - Ctrl+L (clear)
  - Ctrl+U / Ctrl+W / Ctrl+A / Ctrl+E
  - Ctrl+R (reverse search)
  - Home / End
- Mobile: native keyboard, `autocapitalize=off`, `autocorrect=off`, `enterkeyhint=send`,
  plus a small row of tappable suggestion chips above the input (`help`, `whoami`,
  `ls monitor`, `fastfetch`, `desk up`).
- Output is capped at 500 lines of scrollback.

### 5.3 Filesystem
```
/
├── etc/ os-release, hostname, motd
└── home/alxnko/            (~)            → landmark desk
    ├── about.md
    ├── laptop/  readme.txt                 → landmark laptop
    ├── monitor/ github.lnk telegram.lnk linkedin.lnk instagram.lnk email.lnk
    │                                       → landmark monitor
    ├── desk/    height fan ring            (virtual files reflect live world state)
    └── .config/ theme
```
`cd` into a bound dir flies there. `cd /` flies to wide. `exit` flies to wide and
prints `logout`.

### 5.4 Commands
- **Info:** `help`, `man <cmd>`, `whoami`, `fastfetch` (ASCII cat mark plus facts),
  `uname [-a]`, `uptime`, `date`, `echo`, `hostname`
- **Filesystem:** `ls [-la]`, `cd`, `pwd`, `cat`, `tree`, `open <contact|path>`
- **Session:** `history`, `clear`, `exit`
- **World:** `theme`, `desk`, `ring`, `fan`, `sound`, `meow`
- **Toys (text only):**
  - `catsay <msg>`
  - `cmatrix` (DOM/canvas rain; Ctrl+C or any key exits; 8 s max)
  - `pacman -Syu` / `yay` (fake sync progress bars → "there is nothing to do")
  - `rm -rf /` (refuses with a gag)
  - `sl`-free
- **Secret:** `sudo …`
- **Pipe-able built-ins:** `grep`, `head`, `tail`, `wc`
- Unknown command → `bash: foo: command not found`, plus a did-you-mean suggestion
  (Damerau distance ≤ 2)

### 5.5 Safety
- All output is text. Links render as `<a>` only for URLs from the **allowlist** in
  `content/site.ts`, with `rel="noopener noreferrer"`.
- `open` only accepts allowlisted targets.
- Input length is capped at 256 characters. The parser is iterative, with no
  recursion blow-up.

## 6. 3D

### 6.1 Blender pipeline (`scene/`)
`scene/build.py` (headless: `blender -b -P scene/build.py`) procedurally models the
desk from `scene/dims.py` (real measurements, meters, Y-up in glTF) and
`design/tokens.json`. The scene contains:
- **Room:** floor (desaturated wood), back wall, left wall with a **window**
  (frame, sill, radiator hint). Everything fades into `bg` beyond the light.
- **Sit-stand desk:**
  - top: 120×60×2.5 cm cream laminate, 3 mm edge bevel, subtle edge wear via baked AO
    and a slightly darker edge band
  - frame: black steel with T-feet and a crossbar
  - legs telescope: the lower stage is static, the upper stage is on the rig
  - a cable tray under the top
  - the **control paddle** under the front right: `1 2 3 ▲ ▼` buttons plus LED
- **Laptop** (16", Nitro-like, no logos): a black chassis with a subtle rear vent
  line, a red-accent-free lid, keyboard well, and hinge. The screen quad is 16:10.
- **Ultrawide:** 34" 21:9, 1500R curve, thin bezels, rounded corners, grey stand.
  The back has a ring light (torus).
- **Keyboard:** 96% layout block with keycap rows and a knob cluster top-right.
  Caps are graphite and grey with lime accents (space, enter, a few modifiers, arrows)
  via vertex colors baked into the atlas.
- **Mouse:** vertical ergonomic (tilted "handshake" shell with thumb scoop), on a large
  black **mousepad** that runs under the monitor stand.
- **Gamepad** in front of the monitor stand.
- **Desk fan:** round, dark, in a U-bracket at front-left. The **cat** lies on top of it.
- **Laptop charger brick** behind the laptop, plus a loose USB-C cable on the desk.
- **Cable run:** down the rear leg (the `cable_drop` node, which stretches).
- **Server:** a small 4U mini-rack on the floor at right-rear. Decorative, with LEDs.

`scene/bake.py`:
- Cycles on the OptiX GPU.
- Smart-UV plus a shared atlas pack.
- Bakes **combined diffuse (direct + indirect + color)** for `day` and `night`
  lighting rigs:
  - day: window sun, sky, and soft fill
  - night: screen emission, laptop glow, dim cool ambient, LEDs; no ring (the ring is
    runtime)
- Output: `atlas-{day,night}-{2048,1024}.webp`.
- Also renders **posters** from `cam_desk`: `poster-{day,night}-{1600,800}.{avif,webp}`,
  plus `og.png` (1200×630).
- Denoised (OIDN).

`scene/export.py`:
- glTF binary with `KHR_materials_unlit`, then
  `gltf-transform` / `gltfpack` meshopt compression and quantization.
- Output: `public/scene/desk.glb` plus `scene-manifest.json` (hash, bounds, landmark
  data).

All outputs are **committed**, so CI never needs Blender. `bun run scene` rebuilds them
end to end, deterministically: fixed seeds, fixed sample counts.

### 6.2 Node contract (glb)
| Node | Kind | Runtime role |
|---|---|---|
| `static` | merged mesh, atlas | room, floor, window frame, lower legs, server body |
| `desk_rig` | group, moves in Y | parent of everything on the desk |
| `desk_baked` | merged mesh, atlas | top, upper legs, tray, paddle, laptop body, monitor body+stand, keyboard, mouse, pad, gamepad, fan body, charger, cables |
| `screen_laptop` | quad, UV 0–1 | terminal mirror (CanvasTexture) and dock target |
| `screen_monitor` | curved strip, UV 0–1 | contacts canvas and dock target |
| `fan_blades` | mesh, pivot at hub | spin about local Z |
| `cat_body`, `cat_head`, `cat_tail` | meshes with pivots (neck, tail base) | cat animation |
| `ring` | torus | emissive, runtime tint |
| `ring_glow` | quad on the wall behind the monitor | additive radial glow, runtime tint (parented to rig) |
| `led_*` | tiny meshes | runtime emissive color (`led_paddle`, `led_kbd`, `led_srv_0..5`) |
| `cable_drop` | mesh, origin at floor anchor | scale Y with desk height |
| `window_sky` | quad | procedural day/night sky shader |
| `hit_laptop`, `hit_monitor` | invisible boxes | tap targets (the only raycasts) |
| `cam_wide`, `cam_desk` | cameras | landmarks |

The baked desk height is preset 1 = 0.74 m. Presets: 2 = 0.95 m, 3 = 1.12 m.
`up`/`down` step 5 cm within [0.70, 1.20].

### 6.3 Runtime (`src/scene/`)
- **Engine:** three.js with explicit imports only: `WebGLRenderer`, `GLTFLoader`,
  `MeshoptDecoder`, basic materials, `ShaderMaterial`. It loads as a lazy dynamic
  import chunk. A planning spike checked OGL, and three.js stays unless OGL loads the
  meshopt glb with ≥ 60 KB gz savings.
- **Materials:**
  - baked meshes: one shared `ShaderMaterial` that samples `atlasDay`/`atlasNight`
    with `uMix` (theme cross-fade)
  - screens: CanvasTexture with an added fresnel **fake reflection** (analytic
    gradient environment, no env map)
  - glow and LEDs: additive/emissive
  - window: procedural sky (day gradient, night gradient plus sparse lit windows by hash)
- **Draw calls:** about 16. Target ≤ 40 k triangles total.
- **Render policy:** on demand.
  - Full rate while the camera, a transition, or a command animation is active.
  - Otherwise idle life runs at **20 fps**, and at **8 fps** after 60 s without input.
  - **0 fps** when the tab is hidden, the canvas is offscreen, or reduced motion is set
    (then only render on change).
- **Resolution:** DPR cap 2 on desktop, 1.5 on mobile. An adaptive step-down fires when
  the average frame time is > 22 ms over 30 frames, then recovers.
- **Textures:** 2048 atlas when (DPR × viewport width) ≥ 1400 and deviceMemory ≥ 8 (or
  unknown on desktop), else 1024. Only the current theme's atlas loads up front; the
  other loads on first toggle.
- **Context loss:** handled. Lost → show the poster; restored → rebuild.

### 6.4 DOM docking
- `scene/homography.ts`: 4 projected screen corners → CSS `matrix3d` (projective
  transform, unit-tested against known mappings).
- The terminal element has a fixed logical size of 80×24 cells at the mirror's font
  metrics. The homography maps it onto the laptop screen, so the docked DOM text lands
  where the mirror text was: same grid, same wrap.
- Dock state has hysteresis: dock at alignment error < 0.08, undock > 0.15.

### 6.5 Monitor screen content
The canvas shows:
- a minimal tiling-WM look: thin top bar with workspaces `1 2 3` (1 active, green
  underline), clock, `kg`
- a left pane "contacts": the five links with handles
- a right pane: a fastfetch-style card with the cat mark

The DOM contacts panel docks over it with real links.

### 6.6 Gating
`decide3D(env)` is a pure function, unit-tested.
- **Fallback forced:** `?lite` in the URL, or `navigator.connection.saveData`, or
  `effectiveType` in {`slow-2g`,`2g`}.
- **3D forced:** `?3d` in the URL.
- **No WebGL2:** permanent fallback, no button.
- **Auto 3D:** WebGL2 and (`hardwareConcurrency` ≥ 4 or unknown) and (`deviceMemory` ≥ 4
  or unknown).
- **Otherwise:** fallback plus an "enter 3D" button.

## 7. Page, SEO, security, performance

### 7.1 Pages
- `/`: everything.
- `404.html`: graphite page with the terminal line `bash: cd: <path>: No such file or
  directory`, the cat mark, and a link home.
- Redirect pages and `_redirects` are unchanged (`/gh /tg /in /li /ig /mail /meow
  /chat /auth …`).

### 7.2 SEO / meta
- Title: `alex neko (alxnko) · tech lead`.
- Description, canonical, OG and Twitter tags with `og.png` from the render.
- JSON-LD `Person`: name, alternateName, jobTitle, worksFor, address country KG,
  sameAs = socials.
- `theme-color` for each theme. Manifest and icons are kept.
- `robots.txt` and the `security.txt` are kept (the latter gets its `Expires` refreshed).

### 7.3 Security
- `_headers` CSP, generated at build (`scripts/postbuild-csp.ts` hashes every inline
  `<script>`/`<style>` in `dist/**/*.html`):
  `default-src 'none'; script-src 'self' 'wasm-unsafe-eval' <hashes>; style-src 'self'
  <hashes>; img-src 'self' data: blob:; font-src 'self'; connect-src 'self';
  manifest-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'none';
  frame-ancestors 'none'; upgrade-insecure-requests`.
  - There is no `'unsafe-inline'` and no third-party origin.
  - `'wasm-unsafe-eval'` is needed only for the meshopt decoder.
- Other headers:
  - kept: HSTS preload, nosniff, `X-Frame-Options: DENY`, strict referrer
  - added: `Permissions-Policy` (deny camera, mic, geolocation, etc.),
    `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`
- No `style=""` attributes in markup. Dynamic styles go via CSSOM only.
- No `innerHTML`/`eval` anywhere. Enforced by a test grep.
- Caching: `/_astro/*` and `/scene/*` (content-hashed filenames) are immutable for 1
  year. HTML uses the current policy.

### 7.4 Performance budgets (enforced in tests/CI where measurable)
- Initial JS (terminal plus page): ≤ 30 KB gz. CSS ≤ 10 KB gz. Fonts ≤ 60 KB total.
- LCP ≤ 1.5 s (simulated mid-tier mobile on Lighthouse), CLS = 0, TBT ≤ 150 ms.
  Lighthouse perf ≥ 95 mobile and a11y = 100.
- 3D, mobile: engine chunk ≤ 170 KB gz, glb ≤ 250 KB, 1024 atlas ≤ 120 KB each.
- No main-thread task > 50 ms after first interaction, except the one-time glb parse.

## 8. Verification
- **Unit (Vitest):** parser, vfs, every command, completion, store, history
  persistence, did-you-mean, gating, camera spline and spring, homography, token
  generation drift, contrast pairs, CSP generation, no-innerHTML guard.
- **E2E (Playwright, Chromium; desktop 1440×900 and mobile 390×844 with touch):**
  - page renders with zero console errors and **zero CSP violations**
  - keyboard-only walkthrough; the terminal runs `help`, `ls monitor`, `cd monitor`,
    `desk 3`, `theme day`, `sudo x`
  - typed text appears in the mirror (read the canvas via a test hook)
  - `?lite` fallback and a WebGL-disabled context
  - reduced motion
  - 404 page
  - redirects exist in `dist/_redirects`
- **Lighthouse** run locally against `astro preview` for both form factors. Budgets
  per §7.4.
- **Visual:** screenshots of every landmark, both themes, desktop and mobile. Reviewed
  by eye before the PR.
- **CI (GitHub Actions):** install → gen-tokens drift check → `astro check` → unit →
  build (with CSP postbuild) → e2e.

## 10. Craft rules: why it must not look vibecoded

Sources: owner feedback ("too vibe coded, no personality"), plus a `ui-ux-pro-max`
review. The skill's *generic* recommendation for this product was slate-900 bg,
`#22C55E` accent, neon text-shadow glow, scanlines and glitch ("cyberpunk UI"). Those
are exactly the defaults every generated dev site ships, so they are **banned here**.

**Banned (anti-patterns):**
- neon `text-shadow` glow, scanline overlays, glitch/skew animations, CRT curvature
- slate/indigo "tailwind default" palettes, gradient blobs, glassmorphism cards
- macOS traffic-light window chrome, centered hero plus a grid of icon cards, emoji as
  icons
- "crafted with ❤️/code" footers, typewriter headline effects, cursor-follow blobs,
  particle backgrounds
- generic stock props in the scene (coffee cup, succulents, "code on
  screen" textures). Every object must exist on the owner's real desk (the server is
  the one declared exception).
- more than one accent. Green appears at most ~5 times per viewport.

**Required (craft):**
- Personality comes from **real specifics**: the actual desk, keyboard colorway, fan
  with the cat, the paddle `1 2 3 ▲ ▼` 
 , the real prompt style, and real facts.
- Typographic discipline: one family (JetBrains Mono) plus the VT323 name mark, a
  strict size scale (12/13/14/16/20/28/40), tabular numbers in the clock and heights.
- Hard 1 px graphite rules and a precise alignment grid. Chrome labels read like a
  technical drawing or tty (lowercase, dim, small), not marketing copy.
- Every animation expresses cause→effect (§3.5). Interruptible, transform/opacity
  only in DOM, and exits are faster than enters.
- Imperfection in the scene: slightly rotated keyboard (−2°), mouse at an angle, a
  loose cable with natural sag, a pad offset under the stand, edge wear on the
  laptop palm rest.

## 11. UX and a11y checklist (from ui-ux-pro-max §1–§9, applied)
- Contrast ≥ 4.5:1 for all text in both themes (tested). Non-text UI ≥ 3:1.
- `:focus-visible` ring on every control. **Focus is never obscured** by overlays: a
  docked terminal or contacts panel never covers the focused element. The landmark
  nav stays reachable.
- Skip link to the terminal. Heading hierarchy: h1 name, h2 sections (visually hidden
  where scene mode needs it).
- Touch targets ≥ 44×44 px (landmark nav, toggles, chips, contact links), with ≥ 8 px
  gaps. `touch-action: manipulation` on buttons. Canvas `touch-action: none` applies
  only to the canvas element, so system back-swipe and pull-to-refresh are unaffected.
- Every gesture has a button alternative: landmark buttons replace scroll/pinch/drag.
  No horizontal-swipe-only actions.
- Mobile terminal input font-size is **≥ 16 px** (prevents iOS focus zoom).
  `viewport-fit=cover` plus safe-area insets for fixed UI. Zoom is never disabled.
- Icons: inline SVG from one stroke family (1.5 px), `aria-hidden` beside text.
  Icon-only buttons get `aria-label` plus `aria-pressed` where they toggle.
- Reduced motion (§3.4). Motion tokens are shared (§4.4).
- Tested at 375, 390, 768, 1024, 1440 widths, plus landscape phone.

## 12. Out of scope
Projects/portfolio, blog, i18n, analytics, scene object interaction beyond the two
screens, physics, any Layer 4 idea.
