# alxnko.dev refinement and upgrade plan

Date: 2026-10-12. Scope: fix the two reported defects, audit the incumbent site,
and plan the next visual upgrade. Broad redesign and deployment are separate steps.

## Design read

An interactive developer identity site for visitors and technical peers, with a
personal graphite/terminal language and the real desk as the lead artifact.
Taste dials: variance 6, motion 5, density 4. Existing owner choices and accessibility
override generic skill defaults. The canonical quick contract is [DESIGN.md](../../../DESIGN.md).

## Immediate corrections

| Before | After | Why |
| --- | --- | --- |
| An overlapping `stand_foot` box forms a collar around the monitor neck | Remove the redundant box; retain neck and flat black base; rebake geometry, lightmaps, and posters together | This is modeled geometry, not a CSS or image artifact |
| Paddle clicks are ignored during `cmatrix`, and the first repair also blocked holds | Keep physical controls available; route busy clicks directly to desk movement while preserving idle command echo | The owner clarified that rain and physical desk controls must work together |

Acceptance: no collar in daytime and night views, coherent generated assets,
desk movement from clicks and holds during `cmatrix` without stopping its rain,
no stale touch action after cancellation, and normal idle click/hold still works. Orbit, zoom, screen
navigation, `q`, Ctrl+C, and the touch interrupt remain reachable.

## Workflow assessment

The suggested division of responsibilities is useful. The named design and audit
skills are installed globally for Claude, so another installation is unnecessary.
Global availability does not make every skill relevant to each task or automatically
activate Claude hooks in a Codex session.

Use one design direction at a time. Taste v2 is explicitly experimental; keep its
output anchored to the owner decisions. Impeccable is useful for targeted audit and
polish, and Emil for motion. UI UX Pro Max remains available for concrete research.
Use Web Interface Guidelines for this Astro site; React-specific rules have little
application to the website's vanilla TypeScript. The separate React video project
is a different target.

Model assignment should follow task ambiguity: stronger judgment for uncertain
design and debugging, a bounded implementation brief for Sonnet, and independent
review plus real browser evidence. Smaller model cost alone does not establish
visual QA quality. Source detectors and screenshot assertions serve different purposes.

Primary references checked on this date:
[Taste](https://github.com/Leonxlnx/taste-skill),
[Impeccable](https://github.com/pbakaus/impeccable),
[Emil](https://github.com/emilkowalski/skills),
[UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), and
[Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines).

## Readability and discoverability

### Recommended visual trial: graphite desk, clearer hierarchy

Keep the real desk as the full first viewport. Retain VT323 for `alxnko` and
JetBrains Mono for everything functional. Trial a tighter identity block: handle
first, name second, role/location/rank grouped beneath with consistent baseline
spacing. Use size and spacing to distinguish identity from controls, rather than
adding another font or enlarging every label.

Keep the landmark navigation in one stable bottom row with the active underline
and a visible focus treatment. Compare its spacing and separation from the hint
at desktop, 390px, and landscape widths; preserve actual 44px chrome hit areas.
Let the hint explain the next useful action, then recede after interaction. On a
first visit, trial making the existing help/contact paths easier to discover
without overlaying cards on the desk or requiring typed commands.

Retain per-glyph chrome contrast over the scene. Review the daytime material
edges and screen-frame alignment at the same camera poses as the night version.
Expression comes from the desk arrangement, hardware light, cat, and live shell;
reserve animation for travel, state changes, and purposeful feedback. Compare
one identity/navigation variant to the incumbent before changing additional surfaces.

Keep the actual terminal and physical screen composition. Trial changes locally
to the identity hierarchy, chrome spacing, and camera framing one surface at a
time, using the same desktop and portrait viewpoints for comparisons. Evaluate
whether a first-time visitor finds contacts and help without trial and error.
Keep visible navigation and the lite fallback as simple alternatives to gestures.

Acceptance: identity and chrome remain legible over hardware and wall backgrounds
in both themes; no navigation overlaps at narrow widths or text zoom; controls
have accessible names, focus states, and appropriate real hit areas. Judge contacts
at the monitor landmark, not only the distant overview. Avoid adding ornamental
labels or making screen content artificially huge from every camera position.

## Motion and interaction ownership

Audit camera flights, rapid theme changes, view-mode exit, phone Back, multitouch,
pointer cancellation, and losing window focus during a hold. Make each motion
explain travel or state. Preserve interruptibility and current reduced-motion
behavior. Test toys as foreground activities with a consistent way to stop them.

Acceptance: repeated input retargets smoothly; no stuck motor or held pointer;
escape/back does one understandable thing at a time; touch drags do not open links;
reduced motion removes ornamental movement and leaves useful controls intact.
Physical desk input remains usable while foreground toys run.

## Deployment correctness and performance

Production inspection found blocked Cloudflare analytics injection under the
existing strict CSP. Investigate the Cloudflare Pages Web Analytics setting and
disable unwanted injection at the host if analytics is not wanted. Do not relax
the application CSP just to silence a blocked third-party beacon. Local CSP tests
do not detect host-side HTML injection.

Keep the Blender pipeline separate from DOM polish. Measure loading and input on
a mid-range phone and a desktop, including software WebGL and slow connections.
Existing asset budgets are gates, not substitutes for measured LCP/INP/CLS or frame
timing. Record actual measurements before proposing engine/library changes.

## Delivery gates

1. Land the two defects with meaningful regression coverage and generated-asset checks.
2. Record the audit with severity, source locations, and browser evidence.
3. Trial one refinement direction with a small, reviewable comparison.
4. Verify desktop/mobile, day/night, lite/3D, keyboard, reduced motion, and toy exits.
5. Run lint, affected tests, production build/CSP tests, and asset budgets.
6. Review the final diff and screenshots before publishing the upgrade.

Keep source fixes, generated scene assets, audit evidence, and future proposals
clearly identified so a reviewer can tell what has been implemented.
