# Console and scene quality audit

Scope: the approved console-to-laptop entry, day/night shading, rounded props,
and preservation of the prior monitor-arm and foreground-command desk repairs.
The existing terminal portfolio and owner design contract remain authoritative.

## Design and technical decisions

One semantic terminal remains mounted from the black entry through the laptop
reveal and desk pullback. Responsive logical metrics are selected before first
paint and frozen for the intro. Actual transformed display corners determine
the camera, including the small difference between the exported display ratio
and nominal 16:10. Fonts, preparation and a covered projected frame gate reveal.
Reduced motion uses the immediate desk path; failed enhancement retains lite
content. Visitor camera intent cancels automatic travel.

Taste and UI UX Pro Max informed the direction and loading/readability choices;
Emil's motion principles informed purpose, timing and interruption. Impeccable's
technical audit and Web Interface Guidelines informed the verification pass.
These responsibilities did not replace the owner's desk composition or add a
framework. Impeccable's changed-file detector returned `[]`; that is a source
check, not accessibility or visual certification.

Headphone smooth-angle flags now survive joining, with bounded added detail.
Actual Blender validation found zero incorrectly sharp 38–60° edges, while all
112 hard-cap edges stayed sharp. Broad desk/stand planes retained flat normals;
cat facets and fixed screen coordinates stayed unchanged. The first visual pass
caught a tabletop regression: the third bevel band was 0.545 screen pixels and
0.571 atlas texels wide and produced a dotted dark rim. The desk retains two
bevel bands and improved weighted normals; stand bevels retain three.

Night-only WebP quality increases and static monochrome output dither address
quantization at separate stages. Day quality, alpha, multiply-shadow math and
additive glow remain unaffected. Dither is bounded to one 8-bit code value,
weighted by the night mix, with no time input. No claim is made that all displays
will eliminate every tonal band.

## Evidence and limits

Evidence lives in [`docs/audit-assets/2026-10-13`](../../audit-assets/2026-10-13).
Matching 1440×900 before/after desk captures include camera position, quaternion,
FOV and aspect metadata. Both theme renders produced no page/console errors.
Two synchronous renders of the same scene state changed zero bytes across the
5,184,000-byte framebuffer, with WebGL error zero; this checks deterministic
output, not frame-rate performance on every GPU.

Deliberately delayed scene JS, model and texture requests yielded a useful real
terminal while the scene was covered. Desktop and Pixel 7 emulation captures
retained exact terminal bounds, intrinsic size, node identity and content at
the held handoff. Loading, matched reveal, pullback and final desk screenshots
and recordings are retained. Final local visual measurements were 215ms and 67ms
to used-font terminal output with roughly 6.0s and 5.8s scene readiness under
the specified delays. These single-machine samples are not representative
p50/p95 measurements or a physical-phone benchmark.

The T3 native preview supplied earlier captures, then explicitly reported no
connected automation host during a resumed pass. The project Chromium/Playwright
environment provided the remaining slowed captures. The native host later
reconnected with an AMD Radeon 760M renderer and WebGL error zero. It exposed an
initially unavailable viewport, which froze a 2px terminal grid; the bounded
correction rejects unavailable or unreadably small startup rectangles and
preserves lite mode with explicit retry. Native background-preview throttling
prevents reliable animation timing measurements in that host.

Browser device emulation does not prove physical mobile GPU quality or virtual
keyboard behavior. Hidden-time boundary behavior is covered through the
production watchdog helper and its visibility tests.
## Scoped technical assessment

Provisional scores use Impeccable's 0–4 scale and cover this changed surface.
They are not a whole-site WCAG assessment.

| Dimension | Score | Evidence / limit |
| --- | --- | --- |
| Accessibility | 3 | Real DOM, preserved input, keyboard cancellation, lite/no-script baseline, intentional reduced-motion path; no physical-device certification |
| Performance | 3 | Existing runtime and asset budgets, lazy 3D, no new dependencies, preparation before reveal; device-wide latency distributions not measured |
| Theming | 3 | Saved theme/RGB continuity and day/night captures; display-dependent banding remains possible |
| Responsive behavior | 3 | Five held-handoff viewports, mobile emulation, frozen readable metrics, resize tests; real phone check still useful |
| Implementation integrity | 3 | Cancellable intro, late-work cleanup, context-loss and failure tests, full coherent scene pipeline; final shipping review is separate |

No new decorative stages or speculative polish are planned. The measured table
rim regression is the targeted correction from the batched visual pass. Final
asset and gate evidence, independent requirements review and shipping metadata
are recorded below when verified.

## Final verification

The final tabletop bake/export/optimization/import-check passed. Model `98d1b91b`
is 249,508 bytes with 26,776 triangles, within the unchanged limits. Night
2048 q96 is 274,098 bytes; night 1024 q94 is 109,936 bytes. Comparing the
2048 night encodings against the same new PNG master reduces MAE from .955
to .561 and the 95th percentile from 4 to 2; dark-pixel MAE falls from 1.191
to .749. The final visual comparison confirms the added dotted rim is gone.

The task review found two readiness gaps despite a green baseline full gate:
unsignaled GPU fences could resolve, and preferences could change during the
last fence wait. Commit `4db0f60` requires actual signaled completion, preserves
visible-time deadlines and abort cleanup, and repeats covered rendering until
the visual snapshot is current. Ten production-helper tests and six real browser
regressions pass. The independent readiness re-review confirms both findings are addressed.
The native viewport correction in `779ee85` also passes its independent scoped
review, 427 unit tests, 14 browser cases and 20 resize repetitions. Fresh lint,
production build and all unchanged budgets pass. Initial JS is 30,711 of 30,720
bytes, so future additions require careful accounting. The aggregate browser
suite passed: 216 tests, with 20 intentional skips, in 4.7 minutes. Raw gate
output and the scoped review reports are preserved in
[`2026-10-13-console-evidence`](2026-10-13-console-evidence). The independent
whole-branch review remains the next shipping gate.

The scoped reviewer notes existing Node localStorage, Vite large-chunk and
NO_COLOR/FORCE_COLOR warning noise. Those also appear in the earlier baseline
gate logs; tooling cleanup is deferred rather than mixed into the runtime fix.
