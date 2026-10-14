# Console-to-desk loading experience

## Intent

Replace the baked-poster loading screen with a black fullscreen backdrop and the
actual terminal. Reveal that same terminal inside a close, front-on view of the
laptop, then ease back to the familiar desk view. The owner approved keeping
the laptop's 16:10 console proportions with surrounding black space on phones.

The poster currently cover-crops a fixed camera render while the live camera
fits each viewport independently. It also bakes green illumination, which cannot
represent a saved RGB color or `off`. Two different console DOM trees and
different page/scene typography make the replacement visibly discontinuous.

## Required behavior

1. Before first paint, capable 3D visits get a true black backdrop, not a scene
   poster. The same `#term` remains the console throughout loading and the reveal.
2. Show the existing first-visit boot/autologin content in that terminal during
   loading. Returning visits retain the current short autologin behavior. No
   duplicate animated log, simulated download percentages, or fake live baking.
3. The console uses its final logical size, typography, padding, and header from
   the beginning. Preserve its DOM nodes, input, scroll position, and wrapping
   at the handoff. Freeze logical size during the flight; only its transform
   changes with the camera. Mobile loading text must be readable.
4. Fit the initial 16:10 console within the viewport, including small/landscape
   screens and safe areas, without horizontal overflow. Black space is expected
   in portrait. Recompute the initial rectangle on resize before the reveal.
5. Derive a front-on laptop camera analytically from the actual screen corners
   and the initial DOM rectangle. Camera-up follows the screen vertical for the
   first frame. Bypass normal room/occlusion fitting only during the intro.
6. Cover the scene until its real textures, shaders, fonts, and DOM projection
   are ready. Project the first screen frame onto the same rectangle before
   uncovering it. Across the handoff, projected corner and text displacement
   must stay within 1 CSS pixel in the tested viewports, excluding intentional
   input or viewport changes.
7. Fade the surrounding black into the actual room, then ease from the close
   laptop pose to the normal desk pose. Use the existing 240ms reveal and 600ms
   spatial timing as the starting values. Camera movement scales the same text
   continuously; it does not substitute a screenshot or remount the terminal.
8. Keep the intro interruptible. Input must not be lost, links must not become
   clickable prematurely, and a camera request must not be overwritten by the
   automatic final desk flight. Keyboard typing should retain useful focus.
9. Reduced motion skips the spatial flight and reveals the ordinary desk view
   without artificial delay. Do not wait for a decorative minimum loading time.
10. A stalled or failed scene preserves the working lite terminal and contacts.
    The existing visible-time 15s fallback/watchdog still works, including when
    scripts fail or the tab is hidden. Dispose late mounts; no endless black
    screen, context leak, duplicate frame loop, or pending intro after disposal.
11. Saved day/night and RGB settings apply from the first terminal paint and to
    the revealed scene. Loading never exposes an obsolete baked green room.
    Changing a setting during loading must be synchronized before the reveal.
12. Preserve the monitor-arm correction, desk controls during `cmatrix`, touch
    cancellation, command interruption/typeahead, contact focus/navigation,
    view mode, Back behavior, and no-WebGL/data-saver fallbacks.
13. Additional owner request: improve object shading, shadows and gradients in
    both themes. The headphone screenshot identifies broken curvature and baked
    normal seams: preserve rounded-part smoothing before merge, increase hero
    bevel/circumference detail modestly, and keep broad hard planes correctly
    shaded. Preserve the deliberately faceted cat and the real desk arrangement.

## Implementation calls

### Accepted review clarifications

- Select responsive logical dimensions and typography synchronously before the
  first terminal paint, then freeze them through this intro. Target at least
  12 CSS pixels effective text at the initial contain rectangle in small phone
  and landscape tests; use a readable lite fallback if that cannot be achieved.
  Reject unavailable viewport dimensions or a contained rectangle
  narrower than 256 CSS pixels before freezing layout. Keep the lite terminal
  and allow an explicit 3D retry after the viewport becomes usable.
- Use the actual inner display corners with all parent world transforms, canvas
  CSS bounds, safe areas and clipping. One projection pipeline is authoritative.
  Corner/text boxes must match within 1 CSS pixel; wraps, scroll and focus must
  persist. Subpixel glyph rasterization differences are not layout failures.
- Readiness requires critical assets, used fonts, GPU preparation, correct intro
  camera/projection, and a successful covered frame. Compilation or texture
  initialization alone is not a successful render. Optional offscreen work
  must not delay the reveal.
- A single cancellable intro owner coordinates loading/reveal/flight/completion,
  explicit camera requests, resize, failure and disposal. No stale completion
  may pull the camera away after a visitor has taken control. Resize during a
  flight reprojects or rebases without changing frozen terminal layout.
- The unenhanced HTML/CSS baseline remains the accessible lite site. If the
  bootstrap never executes, it never hides that baseline. The 15s watchdog
  handles later failures only after activation, and counts visible elapsed
  time across visibility changes. Test context loss and late work explicitly.
- Preserve terminal node identity, input/caret, history, selection, focus and
  scroll where relevant; never open a phone keyboard without intentional focus.
  Avoid a second boot live-region announcer. Reduced motion skips both spatial
  flight and decorative reveal duration. Record timing and hardware limits
  honestly rather than claiming representative p50/p95 from one machine.

Build on Astro, vanilla TypeScript, Three.js, the current DOM homography, and
existing tokens. No new animation framework or runtime dependency. The black
backdrop is deliberate in both day and night themes; terminal ANSI/RGB remains
the site's existing palette. Keep normal screen/landmark behavior after intro.
Keep posters for lite-page illustration/OG; stop treating them as the 3D loader.
The original console/night-encoding task needed no Blender rebake. The owner's
subsequent object-quality request supersedes that constraint: rebuild and bake
the affected geometry through the complete existing pipeline once changes are
checked, using a new work directory so the original masters remain recoverable.

The implementer may tune the contain rectangle and timing after slowed browser
captures, provided the equality at handoff and readable text remain. Native DOM
is authoritative. Continuous scaling during the pullback is intentional; a
font-size change, wrap, discontinuous translation, or instant switch is not.

## Verification and shipping

### Night shadows (additional owner request)

The owner also reports visible tonal bands in night-mode shadows while day looks
good. Texture inspection confirms that the current lossy export erases much of
the bake's existing dithering. In one dark atlas patch, distinct RGB values fall
from 113 in the PNG to 41 in WebP. Encoding experiments select night quality 96
at 2048 and 94 at 1024: 272,092 and 108,804 bytes, inside the unchanged 450/120KiB
budgets. The 2048 atlas's mean absolute code-value error falls from .984 to .572,
and the 95th percentile from 4 to 2. Day exports retain their current qualities.

Use these tested night quality values in the reproducible finalizer and add a
small deterministic monochrome dither after display-color conversion in the
baked shader, bounded to one 8-bit code value and weighted by the night mix.
Keep alpha, day output, shadow-decal ratio math, RGB/off behavior, and live screen
text untouched. No blur or animated noise. The initial night-only correction republished just
night atlases from matching cached masters. The subsequent object-quality scope
requires a full fresh bake of the checked geometry; repeat encoding measurements
against those new masters. Content hashes and recorded sizes/qualities stay coherent.

Verify broad dark gradients visually at matching poses and numerically against
the PNG masters. Stable dither must not shimmer on a stationary camera or leak
into additive glow edges/transparent material alpha. This improves encoding and
display quantization; no claim that every display eliminates all banding.

### Object shading (subsequent owner screenshot)

Cached Blender inspection found 248 headphone edges with 39–45° bends marked
sharp by the final blanket 38° smoothing pass. Rounded headphone parts should
use 60° smoothing, retain hard cap edges, and increase circumference 16→24 and
headband sampling 12°→8°. Preserve per-part sharp flags through joining instead
of overwriting them at the end; existing slipper smoothing also benefits.

Use three segments on the stand bevels and selectively apply weighted normals
to broad flat hard surfaces before baking. Keep the desk bevel at two segments:
the visual check of three segments exposed a new dark strip only 0.545 screen
pixels and 0.571 atlas texels wide at the desk pose, producing a dotted edge.
The two-segment desk retains its improved weighted normals without that new strip. Use roughly
55° smoothing on the mouse/controller shells; increase mouse tessellation only
if it earns a visible improvement within the unchanged geometry budget. No
global subdivision or global smoothing of the cat, text, hits or screen planes.

Validate actual Blender sharp-edge counts and smooth surface normals, then
complete model→UV/bake→export→optimization→screens→posters→finalizer→import-check.
Keep original cached masters untouched. Check optimized geometry size before
the expensive full bake when practical; GLB remains ≤250KiB and triangles ≤40k.
Compare headphones and representative hard surfaces at close and desk poses in
day/night. Re-run the new analytic handoff against the new GLB; geometry metadata,
texture/poster hashes and budgets must remain coherent.

Use deliberate delays for scene JS, GLB, and textures to inspect the actual
loading interval. Capture before/after recordings, and assert geometry and text
metrics at the held handoff before flight. Include desktop, small portrait,
landscape, tablet, DPR variation, saved RGB/day theme, cached/first visits,
resize, early interaction, hidden tab, reduced motion, and failed/late mount.
Use real input and production CSP; mocks alone do not prove the handoff.

Keep enforced CSP/Trusted Types, no third-party scripts, safe link behavior,
and all existing budget limits (initial JS gzip 30KiB; lazy scene 170KiB; CSS
10KiB). Reuse/remove obsolete loader code before adding overhead. Measure and
report meaningful performance limits; do not promise every physical device.

One isolated worktree/branch and one PR. Carry earlier deployed but uncommitted
fixes into the branch; preserve the original checkout and `shots/`. Full lint,
unit suite, production build, budgets, and full desktop/mobile browser suite
must pass before pre-PR independent requirements review. Resolve review/CI at
the current tip, merge with a merge commit, then remove the isolated worktree.
Production publication remains a distinct action after merge.
