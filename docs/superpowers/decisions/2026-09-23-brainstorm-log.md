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
| R29 | Laptop is on a stand (new photos in `3d-table-references/new`), not flat | Blender pass 3: black foldable stand, deck tilted ~15° up to the back, lid near vertical. **Done** (landed in pass 3). |
| R30 | Live terminal floats in front of the fan from a side angle | The `screen_laptop` quad was not coplanar with the lid; pass 3 parents it to the lid, ≤1 mm off the panel, side-angle verified. **Done** (landed in pass 3). |
| R31 | Zoom toward the cursor / pinch point, not the centre | Raycast under the cursor; the orbit pivot moves (1−k) toward it so the point stays fixed on screen. **Done.** |
| R32 | Cat's head can turn into its own body (cursor high) | Gaze constrained to a natural range (±50° sideways, +12°/−20° vertical from rest), unit-tested. **Done.** |
| R33 | Keyboards look unreal, numpad especially (laptop + external) | Pass 3: real 96 %/1800 key table with sculpted caps; laptop chiclet layout with numpad + touchpad. **Done** (landed in pass 3). |
| R34 | ASCII cat mark has defects and is asymmetric | Re-rasterised on a grid centred on the mark's axis, head/ears/body mirror-averaged; only the tail off-axis. **Done.** |

### Code review (pre-PR) — findings and resolution
- Important: loader had no watchdog → head watchdog (15 s) + mount timeout (20 s, late mounts clean up). Esc in the terminal also flew back to the desk → terminal claims Esc (completions, search, toys) and the global handler honours `defaultPrevented`. Docs unreconciled → this table + superseded notes in spec/plan.
- Minor, fixed: `?3d&lite` gate order; WebGL probe leaks (head answer reused, probe contexts released); poster theme on load; old `alxnko-theme` key migrated; paddle keeps half-typed input; touch-specific hint; per-frame layout reads (sizes cached); day-theme slivers (screen-black stage behind windows); `manifest.json` no longer immutable; redirects test; stale comments.
- Minor, accepted: GPU context loss waits for restore instead of showing the poster (R14: never leave 3D once loaded). `og.png` keeps `Cross-Origin-Resource-Policy: same-origin` (Pages joins overlapping header rules, so a per-file override would produce an invalid combined value; crawlers are unaffected).
| R35 | Paddle ▲/▼ should work like a real desk: hold to move until released | Press-and-hold after 260 ms runs the desk at 6 cm/s (LED on, motor hum), prints the final height; short press = 5 cm step; 1/2/3 = presets. **Done.** |
| R36 | All links open in a new tab | External (http/https) links everywhere open in a new tab with `noopener noreferrer` and a screen-reader hint; `mailto:` hands off to the mail app; internal links (home, skip) stay. e2e-tested. **Done.** |
| R37 | Laptop screen drawn in front of the fan and cat (low front view) | Pass-2 layout put the fan *behind* the laptop's depth and overlapping it in x; occlusion rendered that faithfully. Pass 3 restores the photo layout: fan+cat left of the laptop stand with a gap, at or in front of the laptop's depth, verified from a low front-of-fan camera. **Done** (fixed by the pass-4/5 V layout). |
| R38 | Chrome text/buttons hard to see over parts of the 3D; no fills, per-glyph | Soft theme-coloured halo that hugs each glyph/icon (invisible over empty wall, separates over bright/dark objects); `mix-blend-mode: difference` rejected (vanishes over mid-grey, tints green magenta). **Done.** |
| R39 | Laptop too far from the monitor and not rotated; the monitor is angled too (photos 3/4) | Pass 4: laptop yawed 12–18° toward centre and moved beside the monitor; monitor yawed 6–10° back toward it (gentle V); lid may cover only the monitor's left bezel. **Done** (landed as the pass-5 V layout (R49)). |
| R40 | Cat model broken/worse after pass 3 | Pass 4: sitting faceted cat built from the mark (diamond head + ears, split chest, wedge tail), clean low-poly. **Done** (superseded: the pass-2 loaf cat restored in pass 6 (R49)). |
| R41 | Screens drawn over the fan/cat (re-check) | Verified fixed in Chrome from the low front-of-fan angle after the panel-size fix + pass-3 flush screens. **Done.** |
| R42 | Screens still on top of the cat/fan (after R41 was marked done) | R41 was closed too early (tested views didn't overlap). Real root cause: body is a flex container, so the static `main.sheet`'s z-index (10) still formed a stacking context above the canvas (z 2), lifting all pinned screens above the 3D. `z-index:auto` in scene mode; e2e asserts canvas-over-panels stacking. Verified in Chrome with real mouse input. **Done.** |
| R43 | Aliases for meow (nya, nyan, мяу, …), each answering in its own word | 16 aliases (ja/ru/ky/es/fr/it/sv/tr/zh/ko…), each prints `=^..^=  <word><ending>` and makes the cat react; hidden from help, listed in `man meow`; tested. **Done.** |
| R44 | Laptop keyboard still wrong (photo `3d-table-references/new/keyboard.jpg`); external keyboard is correct | Pass 4: key-for-key laptop layout from the photo (full-height chiclets, F-row + media/power, inverted-T arrows, 4-column numpad with tall Enter, touchpad under the main block); backlight tiles follow. Landed in fab62b8 (keycaps without side walls to stay under the glb budget). **Done.** |
| R45 | Dynamic meow system like the lolnekobot Telegram bot | Ported its catspeak engine (sound/face/filler token classes in en/ru/ja/zh/ko, mirror-or-voice replies, excitement, signature phrases, praise → purr) into `src/term/catspeak.ts`; any non-command catspeak line gets a cat reply and a cat reaction; tty tails instead of emoji; unit-tested. **Done.** |
| R46 | Chrome text too small on desktop (phones were fine) | Desktop-only size bump (`min-width:720px` + fine pointer) for the top row, hints and nav; phones unchanged. **Done.** |
| R47 | Phone Back: "if no UI → return UI, if UI shows → return to desk" | Back peels one layer per press: view mode → interface, away from the desk → desk, then leaves the page. Each layer owns one history entry; leaving a layer another way (on-screen button, Esc, nav) removes its entry, so history never piles up. e2e covers the full sequence. **Done.** |
| R48 | Pass 4 landed (V layout, mark cat, laptop keyboard, movable desk shadows) | fab62b8: laptop yawed 15° beside the monitor (2 cm gap, no overlap from the desk view), monitor swivelled 7°, slim seated cat from the mark (~25 cm with ears), room re-baked without the desk so `shadow_floor`/`shadow_wall` multiply decals move with it. glb 231 KB / 24.6k tris. Verified in Chrome with the desk raised in light and dark themes: no leftover baked shadows. Known limits: the laptop can't overlap the bezel (fan and wall in the way); the tail flick can briefly clip the body. **Done.** |
| R49 | "Keyboard got worse … keys green … make them all black with only green light/glow"; "monitor rotated to the left, laptop more to the right … not forming a V" | Pass 5 (Blender): laptop keycaps back to black with the green backlight only as a glow between and around the keys (no green caps). Proper inward V seen from above: laptop yawed ~25–30° (right side back), monitor swivelled the other way ~10–15° (left side back), inner edges meeting near the vertex. Cat: "the version before the previous was best, just the head got into textures" → restore the pass-3 cat and fix only its head clipping across the full gaze range. Also "monitor is partially not on the table": the whole monitor (stand base included) must sit inside the desktop footprint with ≥1 cm margin, checked top-down. Pass 5 (c2ceaaf) landed the V (laptop 27°, monitor −12°), dark caps with a green halo in the gaps (cause: 49 caps had flipped normals and were culled), monitor ≥1.3 cm inside the desk. Runtime: the tail flicks outward only. Cat: the owner wants the pass-2 loaf (beb42a2), not pass 3, and no visible neck (owner screenshot as reference). Pass 6 (37a6ea7): the beb42a2 loaf restored unchanged, no neck; the head pivot moved inside the head so it turns in place (only its lower edge sinks ≤4 mm into the chest, hidden); re-seated so it hides 0 % of the laptop screen from the desk view. Verified in Chrome. **Done.** |
| R50 | "When I scroll too much I get behind windows and walls … limit it, but … on the window side it will just make me closer to the table" | Camera kept inside the room (left wall/window, back wall, floor, ceiling, 15 cm margin; open toward the viewer and the right). Past a bound the camera slides toward what it looks at along its own line of sight, and the dolly is capped to match, so zooming back in responds at once. Verified in Chrome: orbiting to the window side and zooming out stops at the wall (x −1.25). **Done.** |
| R51 | "Cat looks good now, but I don't like the placement of keyboard and mouse pad" (photo) | Pass 7 (Blender): match the photo: keyboard forward and square to the edge, under the monitor; large dark mouse pad on the right, slightly rotated, with the numpad end of the keyboard overlapping it; vertical mouse on the pad; gamepad behind the keyboard toward the laptop. Also: the monitor stand base is a plain flat black rectangular slab with sharp corners (no wire, no lines, no rounding). Everything else frozen. **Done** (landed in pass 7 (4572384)). |
| R52 | "Are the shadows really good and realistic and light sources also good? … I see some lines" (window wall, both themes); "shadows for fan … baked on the rotating thing and shadows also rotate … significantly improve everything with lights" | Pass 8 (after pass 7): find and fix the wall bands/seams (texel density steps between wall pieces, island seams after denoise, margins, filtering; verified with the runtime's filtering), make the fan blades' lighting rotation-invariant (bake averaged around the axis or a runtime material) and audit every moving part, improve window light, night emitters, contact shadows and banding within budget. **Done** (landed in pass 8 (f3637c4)). |
| R53 | "This white select looks bad, can we make it gray on both light and dark versions" (contact row hover on the monitor) | Cause: the hover used the page's surface token, near-white in the day theme, while the monitor screen stays dark. The monitor's rows now hover a soft gray mixed from the screen's own colours, identical in both themes. Verified in Chrome. **Done.** |
| R54 | "Make also fan faster, it's kinda slow on all levels or it will be not optimized?" | Speed costs nothing: a spinning fan renders every frame at any speed. Levels raised from 7/13/20 to 12/20/28 rad/s. The real limit is strobing: with 5 blades 72° apart, a per-frame step near 36° makes the fan look like it's turning backwards, so each frame's step is capped at 0.45 rad (~26°), which also covers slow frames on phones. **Done.** |
| R55 | "Even faster, it looks like 3 is good for 1" | Levels now 28/42/56 rad/s (old 3 = new 1). Past what a frame can show without strobing (0.45 rad/frame), extra speed shows as motion blur: 3 translucent trailing copies of the blades fill the gap behind each frame's angle, fading in with speed; they share the baked atlas/theme uniforms and are hidden (no draw cost) when slow or off. Verified in Chrome at level 3. **Done.** |
| R56 | "Make sure it's fully optimized and won't be lagging"; "sometimes it slowdowns" | Cause of the slowdowns: idle frames drop to 20 fps (8 fps after a minute) and the per-frame cap from R55 then slowed the fan. Now the shown rotation is fixed in rad/s (16) at any frame rate, speed beyond it is blur, and a spinning fan that's on screen keeps a steady ~30 fps idle (off screen, normal idle pacing; hidden tab, nothing). Cost of the blur: 3 × 220 extra triangles, hidden when slow. Measured in Chrome: 11–12 draw calls, 15.5 rad/s shown both idle and while interacting. **Done.** Also: a dark speck on the cat's haunch (owner screenshot) was sent to pass 8. |
| R57 | "What is this with shadows? Do we have some space between table thing and table foot?" | Seen in the wide view: feet with almost no floor contact shadow (they look like they float), and a soft floor band offset from the legs. Pass 8 also checks: no gap between the moving column and the lower column or foot at any height, crisp contact shadows for feet, columns and server, and the moving floor decal lined up with the static legs' shadows (runtime formula confirmed or corrected). **Done** (pass 8 closed the frame/contact parts; the leg↔top shadow gap is R60). |
| R58 | "Windows is kinda bad and not connected" (screenshot) | No outer frame on the left and top, a floating mullion, a half-width bar ending in mid-air, a gappy right strip, a thin sill. Pass 8 rebuilds it as a connected window: full 4-sided frame in a lit reveal, two sashes meeting at a mullion that joins head and sill, full-width transom if kept, a proper sill board, the sky contract unchanged, and matching sun streaks with frame shadows on the floor and wall. **Done** (landed in pass 8 (f3637c4)). |
| R59 | Pass 7 + 8 landed; "the hint is hard to read in light mode" (then "not better") | Pass 7 (4572384): keyboard/pad/mouse/gamepad as in the photo, flat black sharp-cornered stand plate. Pass 8 (f3637c4): seamless one-piece room lightmaps (the wall lines), spin-invariant fan shading, contact occlusion under everything, cat speck (limb cap poking through) fixed, side rails shortened, wall socket moved, window rebuilt as a connected frame, decal brightness corrected. Runtime: the day floor shadow slides with the sun as the desk rises (manifest `sunShiftPerMetre`, parsed and unit-tested). Hint: a tighter halo was not enough over the dark floor; in light mode it now sits on a small frosted chip in the page colour with full ink. Verified in Chrome. **Done.** |
| R60 | "Also there are still this space..." → "I mean shadows, space between feet shadow and table top": the legs' cast shadow and the tabletop's cast shadow are disconnected (lit gap between them) | The owner rejects the pass-8 "real sunlight" reading. Pass 9: reproduce the site's decal rendering against a Cycles ground truth, fix the decal coverage/fade/seam at the source (or make any real sun streak read naturally), check at 0.74 and 1.12. It also speeds up the bake (batched bake calls, draft mode, GPU denoise). Pass 9 (bdb3664): the lower legs\' wall shadow moved into the wall decal so leg and top shadow are one shape; the decal now covers the skirting, reaches the floor at any height, fades only on chosen edges; the site render matches a Cycles ground truth within ~1 % of pixels at 0.74. Runtime: night decals widen but no longer fade. **Done.** |
| R61 | "Add QCY H3S headphones on the table in front of the laptop near the fan … and shark shoes under the table in the right corner near the table feet" (photos in 3d-table-references/headphones, /sharks) | Pass 9 adds: the headphones lying on their side as in the photo (light warm gray, wide band, big oval cups), on the desk top in front of the laptop by the fan, riding with the desk, never hiding a screen; the shark slides (blue → pale yellow-green → teal gradient, white insole, fin, eyes, teeth) as a pair on the floor by the right desk foot, baked static. Within the glb budget. Pass 9: headphones (1120 tris, clear of both screens) and slides (772 tris) in; pass 10 fixes the slides\' fin (rendered as a black spike) and proportions. **Partly done.** |
| R62 | Pre-PR code review (requirements: spec, plan, this log) | No Critical. Important, all fixed:<br>1. Adaptive resolution now recovers on 60 Hz screens and counts the fan's paced frames.<br>2. Theme, desk, ring and fan changes made while the desk loads reach the scene.<br>3. A mount that fails partway tears everything down.<br>4. The phone typing band uses the visible slice (iOS keeps the layout viewport).<br>5. Art and the cmatrix overlay are aria-hidden; cmatrix is still under reduced motion.<br>6/7. README rewritten; stale rows reconciled; company and coordinates scrubbed from the spec and plan; spec §10 allows the owner's real headphones.<br>Minor fixed: fan strobe margin, reduced motion (fan, cat), theme toggle order, preset during a hold stops the motor, touch-only keyboard blur, one 15 s load deadline, stale history state on reload, mailto via the mail app, monitor clock in KG time, legacy theme key migration.<br>Kept on purpose: `?test` hook (e2e needs it, exposes nothing private); other-theme atlas warmed after idle (instant toggle beats ~40–150 KB, loaded only after the desk is up); desk presets duplicated in the terminal (the terminal must work with no 3D). **Done.** |
| R63 | Found while verifying pass 9: the desk fell back to the flat page in a covered browser window | Cause: the mount waited for its first `requestAnimationFrame`, which a covered or background window never fires, so the 15 s deadline dropped the visitor to the page. Now the first frame is drawn directly, and both the head watchdog and the mount deadline count only time the page is shown. Verified in Chrome with rAF blocked: ready in 1.5 s. **Done.** |
| R64 | Found by Lighthouse: a visit with CPU-only WebGL (no GPU: VMs, broken drivers, headless audits) booted the desk and blocked the page (mobile performance 30, TBT 138 s) | The head gate reads the WebGL renderer string; SwiftShader/llvmpipe/software renderers get the page with the "enter 3d" offer instead of the auto boot; `?3d` still forces it. Unit-tested; e2e green. **Done.** |
| R65 | Plan Task 17: record Lighthouse (local `dist/` with the real headers, headless Chromium) | After R64: mobile performance 98, accessibility 100, best practices 100, SEO 100 (LCP 2.3 s, TBT 0 ms, CLS 0); desktop 100/100/100/100 (LCP 0.5 s). Remaining hints are small: unused CSS/JS from the lazy scene chunk, and compression that Cloudflare adds in production. **Done.** |
| R66 | "Can it be shown and rendered correctly without GPU? … show 3D for everyone possible, without additional buttons … maximize this number but not lose quality or details" (supersedes R64's "offer") | CPU-only WebGL (SwiftShader, llvmpipe) now boots the desk like everyone else. It renders in a CPU-friendly mode:<br>- light frames (≤0.26 MP) only while something moves, then one full-resolution frame (≤1.4 MP) once the view settles, so a still view keeps every detail;<br>- no redraws while nothing changes, and a paced 25 fps while moving;<br>- no MSAA;<br>- a spinning fan drawn as the blurred disc a fast fan is to the eye.<br>The pinned screens are DOM text, sharp throughout. The loading hint now paints at first paint, and the desk downloads start right after it (LCP entry 136 ms). Lighthouse on CPU-only headless Chromium: desktop 94–95; mobile (4× CPU throttle, no GPU: a worst case no real phone hits) 47–80 between runs, TBT 0.7–1.2 s (was 138 s). GPU visits are unchanged. The e2e suite went from 3.3 min to 44 s. **Done.** |
