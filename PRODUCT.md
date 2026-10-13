# alxnko.dev product context

## Purpose

Alex Neko's personal site, reachable at https://alxnko.dev. It presents the approved
identity and contact links through a working virtual terminal and an interactive
3D model of the owner's desk. The experience itself is the showcase.

Visitors should quickly identify Alex, reach a contact, and optionally explore
the shell and desk. Technical peers can enjoy the deeper commands; knowing shell
syntax must not be necessary to contact the owner.

## Approved content and constraints

Visible public facts are Alex Neko / `alxnko`, tech lead, Kyrgyzstan, the existing
committer-rank link, and the five approved contacts. `src/content/site.ts` is the
content authority. Preserve its distinction between visible identity and
machine-readable alternate names. Do not add employers, coordinates, invented
achievements, customer logos, or project case studies from inference.

The owner-approved scope is terminal-first with no projects section for now.
The older spec has superseded sections; the
[owner decision log](docs/superpowers/decisions/2026-09-23-brainstorm-log.md)
records the later constraints. [DESIGN.md](DESIGN.md) provides a current quick map.

## Operating context

Static Astro, vanilla TypeScript, a virtual filesystem/shell, and lazily loaded
Three.js. Semantic DOM screens remain the accessible interface; Blender-generated
geometry and baked lighting are a separate technical pipeline. Cloudflare Pages
hosts the result. No backend accounts or form submissions are part of this site.

Support desktop keyboards, touch phones, no-WebGL/lite mode, reduced motion,
light/day and dark/night themes, and slow or interrupted loading. Optional sound
starts off. The native browser, keyboard, and touch exit paths must stay useful.

## Success evidence

Measure real contact discovery and input behavior, then verify representative
desktop/phone views, keyboard/touch interactions, themes, reduced motion, scene
occlusion, terminal state, CSP, and build budgets. Existing tests are evidence for
their covered cases; neither an empty source detector nor a pretty screenshot
proves every accessibility or performance requirement.
