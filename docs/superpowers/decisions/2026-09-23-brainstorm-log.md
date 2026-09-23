# Brainstorm & decision log: alxnko.dev redesign (2026-09-23)

This log keeps the owner's requests and every decision taken, in order, so the
finished work can be reviewed and compared against them. The spec
(`docs/superpowers/specs/2026-09-23-alxnko-dev-desk-design.md`) is the normative
version. This file is the trail behind it.

## Owner requests (in order)
1. The site "looks too vibe coded and has no personality/uniqueness". Significantly
   improve design, UI, UX and "all feelings", and fully change it.
   - Consult /ui-ux-pro-max, /ui-styling, /brand, /design, /design-system.
   - Maybe add 3D (server, gaming laptop), but it must be fully optimized and fast,
     and work and look perfect on phones.
   - Research the owner online and in other sessions.
   - The interactive CLI "is not very good". Make it much better and Arch-Linux-like
     (without mentioning Arch) instead of macOS.
   - Suggest more.
2. A homelab also sounds cool, but it can be added later: server, a slightly-rounded
   ultrawide like the owner's. Adding it later must be easy, or add it now as
   non-interactive. Contacts can go on the monitor, and the server is
   non-interactive for now. **No "todo" text on the site.**
3. Make it the best possible, "using our design system", and make everything look
   right together.
4. Correction: "our design system" means **the new one we're making now** for this
   site, not `@meowerse/ui`.
5. Visual direction feedback: "too green". Make the laptop, server and monitor
   black. Green only for text and some UI parts. Prefers direction **A** ("cooler in 3D").
6. The monitor is ultrawide. Add a keyboard, a vertical mouse (shape like the
   owner's, no brand names) on a small pad, the full desk, and the sit-stand table.
   The owner can send photos.
7. Photos provided (`/home/alxnko/Projects/code/meow/3d-table-references/`, 8
   shots). "Not really this detailed but also not too simple, so it looks like my
   workspace and looks cool." Both dark and light themes. "The best possible."
8. Offered to install Blender. Installed (5.2.2 LTS).
9. The cat may be green like the brand mark. Don't split into multiple PRs. Build
   everything, then test, PR and deploy when fully ready and verified. Approach A.
   UI inside the 3D must be optimized HTML DOM. **Moving away from the laptop must
   still show the same CLI with the typed commands. It should feel real.**
10. `/shipping-to-merge`: best possible, fully verified, optimized, secured,
    polished, production-ready and deployable. Asked to review a set of external
    comments (verdict below).
11. Work autonomously, don't forget anything, keep specs/plans for review and
    comparison, use subagents and worktrees where reasonable, fully finish and
    verify per /shipping-to-merge.
12. Use /ui-ux-pro-max so it doesn't look vibecoded. Save all plans, requirements
    and decisions for review.

## Decisions
| # | Question | Options offered | Chosen |
|---|---|---|---|
| D1 | What the site is | portfolio+hub / **terminal-first experience** / prettier hub / portfolio+blog | Terminal-first |
| D2 | Role of 3D | **hero object, lazy** / explorable homelab / ambient / none | Hero object, lazy (grew into the full desk, D6) |
| D3 | Public facts | KG + AIT tech lead / BULAK / #1 committer / side projects | **KG + AIT tech lead, #1 committer in KG. No projects or portfolio for now.** |
| D4 | CLI scope | **virtual FS**, **Arch rituals**, tiling/tmux feel, **toys & easter eggs** | VFS + rituals + toys (tiling feel only as screen chrome) |
| D5 | Repo home | meowerse/apps/alxnko-dev / **standalone alxnko.dev** | Standalone |
| D6 | Scene contents | from photos | Sit-stand desk (paddle `1 2 3 ▲ ▼`), 16" laptop, curved 34" 21:9 ultrawide on a stand (not an arm), 96% keyboard (graphite/grey/lime), vertical mouse on a large pad, gamepad, fan with the cat, charger, cables, decorative server, window. Chair and room clutter omitted. |
| D7 | Visual direction | A Phosphor / B Rice / C Blueprint paper → **A**, refined to **A1 Graphite** (neutral black, green as signal only), with a light "daytime" variant | A1 Graphite, dark and light |
| D8 | Ring light color | purple / green / switchable | **Green by default, switchable via CLI** (`ring green\|purple\|off`) |
| D9 | Cat | plush → **faceted low-poly cat from the brand mark, green** | Adopted |
| D10 | Blender use | procedural three.js vs **Blender-built, baked** | Blender, headless, scripted, baked day/night lightmaps |
| D11 | Terminal↔3D architecture | **A: DOM terminal + 3D stage** / B: WebGL-only / C: CSS3D | A |
| D12 | Delivery | one PR, merge commit, then deploy to CF Pages `alxnko-dev` (direct upload) | Adopted |

## External comments review (request 10): verdict
Adopted:
- Physical believability: bevels, wear, cable slack, the paddle, asymmetry.
- Occasional state-driven cat behavior (IDLE→NOTICE→WATCH→IDLE).
- Physical causality for commands.
- Day/night as lighting, plus a window.
- Fake reflections.
- Boot on the first visit only.
- Continuous camera field with restrained inertia.
- "No Layer 4".
- Sound, off by default, synthesized, subliminal.

Changed:
- Generic micro-objects (headphones, phone, cup, USB hub, screwdriver) → the owner's
  **real** desk items instead: gamepad, fan+cat, charger, cables, paddle, big pad.
- Monitor **stand, not an arm**.
- `help` drops experience/stack/projects (ruled out in D3).
- The navigation language became "the filesystem is the desk": `cd monitor` flies there.
- "One secret" and the owner's choice of toys are reconciled: text-only toys live in
  the terminal, and the scene has exactly one hidden reaction (`sudo` → the cat stares
  at the camera).

## ui-ux-pro-max review (request 12)
- Its generated design system for "developer terminal portfolio" returned
  slate-900/`#22C55E`, neon glow, scanlines and glitch ("cyberpunk UI"). That is the
  vibecoded default, recorded as **banned** in spec §10.
- Its checklist items that apply to this site are in spec §11: 44 px targets, focus
  not obscured, gesture alternatives, 16 px mobile input, reduced motion, contrast in
  both themes, single icon family.

## Reference photo observations (D6)
- **Desk:** cream/white laminate top about 120×60 cm, black steel sit-stand frame with
  T-feet, control paddle front-right under the top with buttons `1 2 3 ▲ ▼`.
- **Laptop:** 16" gaming laptop left of center, black, angled slightly toward the
  center, charger brick behind.
- **Monitor:** 34" 21:9 curved (≈1500R), thin bezels, grey stand, back ring light
  (purple in real life) that washes the wall.
- **Keyboard:** 96% layout with a knob cluster top-right. Black and grey caps with lime
  accents (spacebar, enter, arrows, some modifiers).
- **Mouse and pad:** vertical ergonomic mouse on a large black pad that extends under
  the monitor stand.
- **Gamepad:** black gamepad in front of the monitor stand.
- **Fan and cat:** round dark desk fan in a U-bracket at the front-left, with a calico
  plush cat lying on top (→ green faceted cat).
- **Room:** window with a radiator to the side, wood floor, cream walls.

## Implementation-time adjustments
- The light-theme accent/green-ink changed `#0a7a42` → `#0a6e3c`: 4.42:1 on the day
  paper failed AA, and the new value is 5.18:1. The dark strong line changed
  `#3a3a3d` → `#404044` (≥ 1.8:1 visibility). Both are enforced by `tests/unit/tokens.test.ts`.
- Pre-existing bugs found: `robots.txt` references a missing `sitemap.xml`, and
  `security.txt` has a `Policy:` URL that 404s. Both are fixed in Task 10.
- Owner (2026-09-23): remove coordinates everywhere (site, terminal, posters, spec).

## Owner review in Chrome (2026-09-23, second session): UX issues, all tracked
| # | Owner comment | Resolution |
|---|---|---|
| R1 | "Just a 2D site with a render image, not interactive 3D" | Root cause: three.js 0.186 treats glTF `extras.pivot` as a transform pivot → NaN rig/camera; canvas drew nothing, poster showed. Renamed to `pivot_at` (build.py + shipped glb). Plus a `requestIdleCallback` options bug that silently dropped to the page. **Fixed.** |
| R2 | "Cat in terminal is wrong" | Hand ASCII replaced by the real mark rendered to half-block characters from catuser.png (20×22 px). **Fixed.** |
| R3 | "Remove coords everywhere" | Removed from site, terminal, vfs, posters script, spec. **Fixed.** |
| R4 | Green focus outline on the terminal looks bad | Removed; focus shown by frame lift + block caret. **Fixed.** |
| R5 | Keyboard backlight (laptop + keyboard), green like the ring | Runtime additive glows tinted with the ring colour; Blender adds `kbd_glow`, `laptop_kbd_glow`. **Done** (pass 2: `kbd_glow`, `laptop_kbd_glow`; runtime tint). |
| R6 | Buttons show UI "not where needed, not connected to the stage"; screens should show real things up close without appearing/disappearing | Live DOM terminal + contacts are now pinned onto the 3D screens every frame at every distance (projective matrix3d). Sheet/canvas-mirror swap removed. **Fixed.** |
| R7 | "What is scroll to move" | Camera is real 3D now: drag = look around, scroll/pinch = zoom, buttons/`cd`/taps fly. **Fixed.** |
| R8 | Fan too dark; show "100" like the real fan; its ring glows green | `fan_ring` (ring-tinted), `fan_display` (speed readout); lighter housing. **Done** (pass 2: `fan_ring`, `fan_display`). |
| R9 | Gamepad should be DualShock 4-inspired | **Done** (pass 2: DS4-style pad). |
| R10 | Screens flicker; laptop console misplaced at desk/wide views | Page CSS 64px margin shifted the pinned DOM; margin reset in scene mode. **Fixed.** |
| R11 | Ultrawide cut on the sides on non-wide viewports | Monitor landmark fits the whole curved panel to any aspect. **Fixed.** |
| R12 | Cat on fan should fit the scene (more natural) | Natural loaf pose, shaded desaturated green. **Done** (pass 2 loaf pose; further polish in pass 3). |
| R13 | "Back to desk" control besides the bottom bar | Floating `← desk` button + Esc whenever flown/looked away. **Fixed.** |
| R14 | Day button drops out of 3D; fallback must be impossible once 3D works | Theme crash fixed; runtime never falls back after load; GPU context loss restores. **Fixed.** |
| R15 | Laptop covers part of the ultrawide | Laptop moved/angled in Blender. **Done** (pass 2), refined with the stand in pass 3. |
| R16 | Remove wires, clean desk | All cables + charger removed; `cable_drop` optional at runtime. **Done** (pass 2: charger, cables, `cable_drop` removed). |
| R17 | Flat page flashes on open | `<head>` gate decides before first paint; tty boot loader with real progress until the desk is ready; page only if 3D unavailable/fails. **Done** (head gate + loader + 15 s watchdog + 20 s mount timeout). |
| R18 | Flying to the monitor passes through the laptop | Flights go straight from the current view to the target (no rail through other landmarks). **Done** (straight pose-to-pose flights). |
| R19 | Paddle buttons under the desk should work: 1 lowest, 2 middle, 3 highest (▲▼ nudge) | Clickable `hit_paddle_*` targets run `desk N` through the shell (terminal shows it, desk moves, paddle LED lights). Hover shows a pointer on everything clickable. **Done** (hit boxes pass 2; tap resolution fixed in R28). |
| R20 | Never lose these comments; document lights/glow etc. | This table is the tracking list; each row is re-verified in the final review before PR. Lights/glow summary: monitor ring + wall wash, fan ring, laptop + keyboard backlights all share the ring colour (`ring green\|purple\|off`), breathe gently, pulse on `meow`; LEDs: paddle (amber while moving), server pattern, keyboard indicator. |
| R21 | Text selectable only on the screen you're at (none at wide/desk) | `body[data-view]` + scene.css `user-select`. **Fixed.** |
| R22 | Not everything clickable (sun icon, monitor from desk view); investigate all | Scene container click-through; every control's icon + label hit-tested in Chrome (29/29 ok); screens from afar are one button that flies you there. **Fixed.** |
| R23 | "#1 committer" clickable everywhere, incl. monitor | Rank restored in 3D identity; monitor right pane is a live pinned panel with the link. **Fixed.** |
| R24 | Remove "AIT Solutions" everywhere | Removed from site, terminal, JSON-LD, monitor; posters/og in Blender pass. **Done** (site + posters/og, pass 2). |
| R25 | Invert vertical drag (grab-the-scene) | **Fixed.** |
| R26 | Live screens can appear on top of 3D objects (laptop screen over fan/cat) | Canvas now sits *above* the pinned DOM; screen regions render as transparent depth-writing windows, so anything in front of a screen occludes it per pixel. Input moved to the stage layer beneath. **Done** (verified in Chrome from side angles). |
| R27 | Cat's tail looks black, not green | Cat remodel in Blender pass; tail on the green material, verified in the unlit atlas render; no fan cable. **Done** (pass 2: tail rebuilt, green in atlas check). |

### Lights & glow (owner asked to keep this written down)
- **Monitor ring** (back of the ultrawide) + its **wall wash**: runtime-tinted, green by default, `ring green|purple|off`, breathes ±6 % over 8 s, pulses on `meow`.
- **Fan ring** (front bezel): same tint as the monitor ring (shares its material).
- **Fan display**: speed readout (`0/40/70/100`), follows `fan N`.
- **Keyboard backlights** (96 % keyboard + laptop keyboard): additive glow between the keys, same tint as the ring; brighter at night, subtle by day; off with `ring off`.
- **LEDs**: paddle LED amber while the desk moves; server LEDs change pattern every 2–6 s; keyboard indicator steady.
- **Day/night**: baked atlases cross-fade in 600 ms; window sky switches; screens stay dark in both.
| R28 | Desk doesn't move when clicking the paddle buttons | Tap hits landed on quantised `<name>__geo` children, so the target name was wrong (`desk 1__geo`); also silently broke laptop/monitor taps. Pure `resolveTarget` + unit test. Verified in Chrome: click on "3" → `desk 3`, desk at 112 cm. **Fixed.** |
| R29 | Laptop is on a stand (new photos in `3d-table-references/new`), not flat | Blender pass 3: black foldable stand, deck tilted ~15° up to the back, lid near vertical. **Model pending.** |
| R30 | Live terminal floats in front of the fan from a side angle | The `screen_laptop` quad was not coplanar with the lid; pass 3 parents it to the lid, ≤1 mm off the panel, side-angle verified. **Model pending.** |
| R31 | Zoom toward the cursor / pinch point, not the centre | Raycast under the cursor; the orbit pivot moves (1−k) toward it so the point stays fixed on screen. **Done.** |
| R32 | Cat's head can turn into its own body (cursor high) | Gaze constrained to a natural range (±50° sideways, +12°/−20° vertical from rest), unit-tested. **Done.** |
| R33 | Keyboards look unreal, numpad especially (laptop + external) | Pass 3: real 96 %/1800 key table with sculpted caps; laptop chiclet layout with numpad + touchpad. **Model pending.** |
| R34 | ASCII cat mark has defects and is asymmetric | Re-rasterised on a grid centred on the mark's axis, head/ears/body mirror-averaged; only the tail off-axis. **Done.** |

### Code review (pre-PR) — findings and resolution
- Important: loader had no watchdog → head watchdog (15 s) + mount timeout (20 s, late mounts clean up). Esc in the terminal also flew back to the desk → terminal claims Esc (completions, search, toys) and the global handler honours `defaultPrevented`. Docs unreconciled → this table + superseded notes in spec/plan.
- Minor, fixed: `?3d&lite` gate order; WebGL probe leaks (head answer reused, probe contexts released); poster theme on load; old `alxnko-theme` key migrated; paddle keeps half-typed input; touch-specific hint; per-frame layout reads (sizes cached); day-theme slivers (screen-black stage behind windows); `manifest.json` no longer immutable; redirects test; stale comments.
- Minor, accepted: GPU context loss waits for restore instead of showing the poster (R14: never leave 3D once loaded). `og.png` keeps `Cross-Origin-Resource-Policy: same-origin` (Pages joins overlapping header rules, so a per-file override would produce an invalid combined value; crawlers are unaffected).
| R35 | Paddle ▲/▼ should work like a real desk: hold to move until released | Press-and-hold after 260 ms runs the desk at 6 cm/s (LED on, motor hum), prints the final height; short press = 5 cm step; 1/2/3 = presets. **Done.** |
| R36 | All links open in a new tab | External (http/https) links everywhere open in a new tab with `noopener noreferrer` and a screen-reader hint; `mailto:` hands off to the mail app; internal links (home, skip) stay. e2e-tested. **Done.** |
| R37 | Laptop screen drawn in front of the fan and cat (low front view) | Pass-2 layout put the fan *behind* the laptop's depth and overlapping it in x; occlusion rendered that faithfully. Pass 3 restores the photo layout: fan+cat left of the laptop stand with a gap, at or in front of the laptop's depth, verified from a low front-of-fan camera. **Model pending.** |
| R38 | Chrome text/buttons hard to see over parts of the 3D; no fills, per-glyph | Soft theme-coloured halo that hugs each glyph/icon (invisible over empty wall, separates over bright/dark objects); `mix-blend-mode: difference` rejected (vanishes over mid-grey, tints green magenta). **Done.** |
| R39 | Laptop too far from the monitor and not rotated; the monitor is angled too (photos 3/4) | Pass 4: laptop yawed 12–18° toward centre and moved beside the monitor; monitor yawed 6–10° back toward it (gentle V); lid may cover only the monitor's left bezel. **Model pending.** |
| R40 | Cat model broken/worse after pass 3 | Pass 4: sitting faceted cat built from the mark (diamond head + ears, split chest, wedge tail), clean low-poly. **Model pending.** |
| R41 | Screens drawn over the fan/cat (re-check) | Verified fixed in Chrome from the low front-of-fan angle after the panel-size fix + pass-3 flush screens. **Done.** |
| R42 | Screens still on top of the cat/fan (after R41 was marked done) | R41 was closed too early (tested views didn't overlap). Real root cause: body is a flex container, so the static `main.sheet`'s z-index (10) still formed a stacking context above the canvas (z 2), lifting all pinned screens above the 3D. `z-index:auto` in scene mode; e2e asserts canvas-over-panels stacking. Verified in Chrome with real mouse input. **Done.** |
| R43 | Aliases for meow (nya, nyan, мяу, …), each answering in its own word | 16 aliases (ja/ru/ky/es/fr/it/sv/tr/zh/ko…), each prints `=^..^=  <word><ending>` and makes the cat react; hidden from help, listed in `man meow`; tested. **Done.** |
| R44 | Laptop keyboard still wrong (photo `3d-table-references/new/keyboard.jpg`); external keyboard is correct | Pass 4: key-for-key laptop layout from the photo (full-height chiclets, F-row + media/power, inverted-T arrows, 4-column numpad with tall Enter, touchpad under the main block); backlight tiles follow. **Model pending.** |
| R45 | Dynamic meow system like the lolnekobot Telegram bot | Ported its catspeak engine (sound/face/filler token classes in en/ru/ja/zh/ko, mirror-or-voice replies, excitement, signature phrases, praise → purr) into `src/term/catspeak.ts`; any non-command catspeak line gets a cat reply and a cat reaction; tty tails instead of emoji; unit-tested. **Done.** |
