# Console intro implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mismatched poster loader with one readable terminal that
reveals into the laptop and pulls back continuously; smooth night shadow bands.

**Architecture:** The existing terminal/store stays authoritative. A shared
initial-layout calculation and analytic screen camera produce equal CSS quads;
the existing Dock homography animates that same DOM during a cancellable flight.
Night atlas quality and display-space dither correct separate quantization.

**Tech Stack:** Astro, vanilla TypeScript, Three.js, Python/ImageMagick; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-console-intro-design.md`

## Global constraints

- Same `#term`, intrinsic metrics and wraps from initial console through handoff.
- Actual screen world corners and ≤1 CSS pixel handoff geometry/text drift.
- Readable initial effective text ≥12 CSS pixels in tested small viewports.
- Existing 240ms reveal / 600ms spatial timing; interruptible, no artificial wait.
- Reduced motion skips movement and decorative delay; 15s visible-time fallback.
- HTML lite baseline works if bootstrap never runs; no forced mobile autofocus.
- Preserve CSP/Trusted Types, RGB/off, scene controls, typeahead and touch cancel.
- Initial JS gzip ≤30KiB; scene gzip ≤170KiB; CSS gzip ≤10KiB; atlas ≤120/450KiB.
- Keep prior deployed fixes, original dirty checkout and `shots/`; one merge-commit PR.

## Review focus

- Early keyboard input/focus during loading: no lost command or overwritten camera request.
- Resize/orientation during reveal/flight: frozen wraps, coherent projection, no stale flight.
- Context loss or late mount after fallback: usable lite content and disposed abandoned resources.
- Saved light theme/RGB/off: correct first terminal paint and first covered frame.
- Hidden page and reduced motion: no time-budget drain or unrequested motion on return.

## Task 1: Persistent console and camera handoff

**Files:**
- Modify `src/layouts/Base.astro`, `src/styles/scene.css`, `src/ui/entry.ts`,
  `src/ui/app.ts`, `src/scene/index.ts`, projection/rail types only if needed.
- Create narrowly scoped `src/scene/intro.ts` and/or `src/ui/intro.ts` if it makes
  the geometry/lifecycle independently testable without expanding the framework.
- Test `tests/unit/scene/intro.test.ts`, `tests/e2e/intro.spec.ts`; adapt obsolete
  poster-loader assertions in `tests/e2e/scene.spec.ts`.

**Interfaces:** Existing store/terminal, `mount(options)`, `SceneWorld.fly`, `Dock`
and world-corner extraction. If adding helpers, use `consoleLayout(viewport)` to
return intrinsic size and initial rect; `screenPose(corners, rect, viewport)` to
return analytic camera pose/up. An intro lifecycle exposes begin/cancel/finish
with idempotent cancellation; implementation may choose exact types and names.

- [ ] Write failing geometry/readability tests for 320×568, 390×844, 844×390,
  768×1024 and 1440×900, plus screen rotation/transformed parents and DPR 1/2.
- [ ] Write a held-handoff browser check under delayed scene assets: same DOM,
  text bounds/wraps/scroll, actual projected screen corners within 1px, saved RGB.
- [ ] Run the new checks against the current loader and record the expected failure.
- [ ] Implement black bootstrap/actual terminal, fixed intro metrics and font barrier.
- [ ] Solve the screen camera from actual corners, render covered, reveal, then
  ease pose/up to desk. Let explicit input cancel ownership; keep normal controls.
- [ ] Add real-input interruption, resize, reduced-motion, blocked/bootstrap/no-JS,
  hidden-tab, network/late mount and context-loss checks; implement cleanup paths.
- [ ] Remove obsolete loader step/bar callbacks/styles and poster priority for 3D.
- [ ] Run scoped unit + intro/browser regressions and budget; commit this phase
  only after its fast lane passes, using a Conventional Commit.

## Task 2: Night gradient encoding and display

**Files:** `scene/finalize.py`, `src/scene/materials.ts`, affected night atlas
files/manifest; relevant scene asset checks and evidence documentation.

**Interfaces:** Existing `bakedMaterial(day,night,mix)` with `uMix`, inherited
tinted/ghost shader strings; current content-hash finalizer/manifest budget schema.

- [ ] Record baseline PNG/WebP error and dark-region runs; retain matching master.
- [ ] Change night export to q96 at 2048 and q94 at 1024, keeping day unchanged.
- [ ] Add bounded deterministic display-space monochrome dither weighted by night
  after color conversion. Preserve alpha/decal ratio/glow and screen text behavior.
- [ ] Publish matching affected hashes/sizes/quality metadata without full Blender
  rebake. Verify GLB/day/posters hashes unchanged and all asset contracts/budgets.
- [ ] Observe matching night/day/RGB poses; compare output with dither off/on,
  stationary stability and shader correctness under production CSP.
- [ ] Record evidence and commit after the relevant fast lane passes.

## Task 3: Rounded props and baked surface quality

**Files:** `scene/build.py`; generated scene assets/OG from full pipeline; image
evidence and build/geometry validation. Keep shader and finalizer changes above.

**Interfaces:** Existing part-specific smoothing, `PARTS_STATIC`/`PARTS_RIG`
merge groups, bevel/cylinder/lathe helpers, fixed mesh names and screen corners.
The console camera consumes the actual new GLB rather than hardcoded dimensions.

- [ ] Confirm headphone sharp-edge baseline and model silhouette from the supplied
  screenshot; preserve the original cached masters and build source in git.
- [ ] Smooth headphone rounded parts at 60° before join; keep cap edges hard,
  use circumference24 and headband8°; preserve existing part-specific smoothing.
- [ ] Use three-segment stand bevels and retain two-segment desk bevels after the
  measured dotted-rim regression; use weighted normals selectively on
  broad flat hard surfaces, and 55° mouse/controller shell smoothing.
- [ ] Run actual Blender build/geometry checks; inspect merged sharp flags and
  bounded triangle/mesh growth before committing the source phase.
- [ ] Run the complete 4096/512-sample pipeline in a new work directory. If a
  geometry budget fails, adjust only the new detail or optimize valid redundancy;
  do not weaken the budget or discard prior desk repairs.
- [ ] Verify matching-pose closeups and full-room day/night renders, import checks,
  exact node/asset contracts and budgets; record limits and commit generated assets.

## Task 4: Complete verification and shipping

- [ ] Capture slowed cold and cached loading recordings at desktop/phone sizes;
  inspect handoff and both ends of flight, not only final screenshots.
- [ ] Run `bun run lint`, `bun run test`, `bun run build`, `bun run budget`, and
  `bunx playwright test --workers=2` in full. Observe final output and failures.
- [ ] Fetch base; commit finished changes; dispatch the required independent
  reviewer with actual spec text and exact base/head SHAs before push/PR.
- [ ] Verify each finding, fix Critical/Important, rerun the full gate after fixes.
- [ ] Push and verify remote tip equality; open one PR targeting `main` and link
  it to T3. Observe CI for that exact tip and resolve every legitimate review.
- [ ] Independently verify merge gate, current base, threads, and conflict status;
  merge with a merge commit. Check merged content and remove the worktree folder.
- [ ] Report the PR/merge and verification limits. Publication is separate from
  the shipping skill; do not imply the production site changed merely by merging.
