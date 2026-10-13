# alxnko.dev design contract

Recorded from the shipped site and its owner decision log on 2026-10-12.
This is the quick entry point for design work, not a replacement for the detailed
[owner decisions](docs/superpowers/decisions/2026-09-23-brainstorm-log.md).
Those decisions take precedence over superseded parts of the original spec.

## Purpose and direction

A terminal-first personal site inside a model of Alex Neko's real desk. The desk
is the experience; the interface supports it. People can discover who Alex is,
reach the contacts, and explore the shell without needing to understand 3D controls.

Preserve the graphite hardware, green signal color, low-poly cat, real functioning
terminal, and day/night room lighting. Use asymmetry from the actual desk composition.
Do not introduce a generic marketing hero, project cards, invented professional
claims, company names, or location coordinates. A projects section requires a new
content decision; it is not part of this refinement.

## Sources of truth

- `src/content/site.ts`: approved identity and contacts; never invent public facts.
- `design/tokens.json`: colors, type, space, radius, layers, and motion. Generate
  `src/styles/tokens.css` with `bun run tokens`; do not edit the generated CSS.
- `src/term/store.ts`: terminal state shared by DOM and scene.
- `scene/`: reproducible Blender model, lightmaps, export, and poster pipeline.
- `public/scene/manifest.json`: generated scene asset references and geometry contract.

## Visual rules

JetBrains Mono is the UI and terminal font; VT323 belongs to the handle mark.
Fonts are self-hosted, including the monospace symbols subset. Preserve column
alignment rather than substituting a display font inside the terminal.

Dark surfaces use graphite neutrals; daytime uses the current paper/wall palette.
The screens remain dark in both themes. Green is the default signal and RGB accent;
`rgb` changes one coordinated accent throughout the interface and desk. Amber
communicates warning or motor activity. Check actual text/background contrast in
both themes, including camera positions where scene chrome overlaps objects.

Use the existing 4px spacing scale, token radii, and named layer tokens. Chrome
remains light and unobtrusive, with the owner's per-glyph halo treatment. Filled
chrome panels and blend-mode text were rejected in R38. A new skill's generic
aesthetic preferences must not override these decisions.

## Interaction and motion

The semantic DOM terminal and contacts remain the useful interface with no WebGL.
In scene mode they are pinned to the physical screens, occluded by foreground
geometry. Keyboard focus makes a screen reachable; camera navigation must not trap
people, activate contact links after a drag, or strand the interface off-screen.

Physical paddle presets, short nudges, and continuous holds remain available while
`cmatrix` or another foreground command runs. When the shell is idle, clicks echo
the equivalent desk command. While it is busy, clicks move the desk directly
without interrupting the foreground job, queuing a command, or changing shell
ownership. Holds stop on release or gesture cancellation. Pinches and cancelled
touch gestures must never trigger a delayed nudge or preset.

Use the existing easing and 120/240/600ms duration tokens. The longer duration is
for spatial travel or lighting, not routine button feedback. Retarget transitions
from the current state; do not add animation to repeated typing. Respect reduced
motion, suspend hidden-page work, and keep continuous scene values outside UI
state updates. No new motion library is required by the design.

## Skill responsibilities

- Taste v2: selected visual direction, interpreted through this contract.
- UI UX Pro Max: targeted research for an unresolved UX or accessibility choice.
- Impeccable: bounded critique/audit/polish of existing surfaces, backed by screenshots.
- Emil: timing, interruptibility, gesture behavior, and motion purpose.
- Web Interface Guidelines: accessibility and native behavior checks.
- Playwright: real input and viewport regression checks, including the production CSP.

The website is Astro plus vanilla TypeScript and Three.js, hosted on Cloudflare
Pages. Do not introduce React, Tailwind, GSAP, or a different host merely because a
skill lists them as defaults. React guidance applies only to actual React code
(such as the separate video project).

## Verification

Inspect desktop and phone-sized views, day/night, lite/3D, keyboard navigation,
reduced motion, and foreground toys. A resized desktop browser does not prove touch
or a real phone keyboard works; use device emulation and physical-device checks.
Run the meaningful affected tests, build with the real CSP, and keep bundle/scene
budgets passing. An empty source detector report is not visual, accessibility, or
performance certification. Keep before/after captures of geometry corrections.
