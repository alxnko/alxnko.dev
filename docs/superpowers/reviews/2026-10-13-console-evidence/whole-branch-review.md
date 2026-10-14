# Whole-branch independent review

Reviewed base `bc1ef1da3aa9bd64e88985026bdc2161f3ca2ca3` through head `873b7e41b1064d42c9c9a6e8c4eb424ea10eef68` in the isolated console-intro checkout. Read the filled review template, full supplied diff in passes, execution ledger, committed scoped reviews/audit, gate outputs, relevant surrounding producers/consumers, and selected visual evidence. No subagents. No product source, index, HEAD, branch, build, or committed evidence was changed. This requested report is the sole written review artifact.

## Strengths

- The implementation retains one semantic terminal and its store. Removing the separate loader and progress callbacks reduces competing lifecycle/state owners. Responsive bootstrap metrics, the font barrier, actual transformed display corners, and Dock projection address the original discontinuity at the responsible layers.
- The real-asset handoff tests compare terminal/text rectangles and projected corners across five viewport shapes in desktop/mobile projects. Recorded slow captures include the actual loading interval, matched frame, pullback and desk, with preserved DOM/content. I inspected the mobile loading/matched images; their visible content and placement agree with the retained numerical evidence.
- The earlier readiness findings were substantively fixed: `gpuDone` resolves only on a signaled fence and cleans up on failure/abort; `prepare` rechecks the rendered preference snapshot after the final fence. Both have targeted regressions, including a late preference change with the newly selected atlas held.
- The shading change is bounded and coherent. Per-part smoothing survives the merge; weighted normals are restricted to broad hero planes; headphone detail increases modestly; the faceted cat and scene contracts remain. The headphone comparison visibly improves cup curvature in both themes. The final desk-edge comparison supports the measured decision to retain two tabletop bevel segments.
- Night quality 96/94, deterministic display-space dither, fresh coherent assets, unchanged budgets, and honest hardware/performance limitations are documented. The aggregate gate on the identical product source is green: 427 unit tests, 216 browser tests with 20 intentional skips, lint/build/CSP/budgets. I confirmed the subsequent head commit changes documentation/evidence only.

## Issues

### Critical (Must Fix)

None found.

### Important (Should Fix)

1. **A retry after resizing uses stale terminal dimensions until the scene mounts.**

   **Locations:** `src/scene/index.ts:747`, `src/scene/dock.ts:46`, `src/ui/intro.ts:38`, `src/ui/entry.ts:163`.

   `sizeOverlays` writes `--screen-w` and `--screen-h` on `#term`. Disposal removes its transform and Dock flag but leaves those inline variables. The next bootstrap writes the new attempt's dimensions on `:root`, where they lose to the old element variables. The new contain transform therefore scales the previous attempt's logical grid until the next mount overwrites it.

   **Observed production-dist reproduction:** load at 1440×900; induce actual `WEBGL_lose_context` after readiness; resize to 320×568; click `enter 3d` while holding the manifest request. Root width is 576px, but terminal inline/computed width remains 1280px. Its loading rectangle is `(16,194,640,400)`, right edge 656 in a 320px viewport. After releasing the manifest it changes to intrinsic 576px and rectangle `(16,194,288,180)`. The controller independently reproduced the same values in the native preview.

   **Impact:** retry clips the working console, violates initial containment, then changes intrinsic dimensions/wrapping at handoff. This breaks requirements 3, 4 and 6 on the explicitly supported retry path.

   **Fix:** restore/remove scene-owned terminal size overrides on disposal, or establish the new attempt's authoritative metrics on the element before its first paint. Keep a single authoritative grid for each attempt. Add a context-loss/fallback → resize → delayed explicit retry regression, including preserved input/output and held-handoff equality; test both shrink and grow directions.

2. **Disposal abandons a pending desk operation and an active hold's completion.**

   **Locations:** `src/scene/index.ts:725`, `src/scene/index.ts:1089`, `src/ui/entry.ts:248`; dependent await at `src/term/commands/world.ts:59`, hold callback at `src/ui/entry.ts:198`.

   Cleanup cancels the frame loop without settling `deskDone`. The promise returned by `setDesk` then has no remaining completion path, while the real `desk` command (and the tour's desk step) awaits it. The same teardown detaches pointer release without ending an active hold: `onHold('end')` is the path that stops `stopMotor`, but `leave3d` never invokes that stop callback either.

   **Observed production-dist reproduction:** enter `desk 3` with real input, induce actual context loss while its form is busy, wait for lite mode and another 2.2 seconds, then enter `echo fallback-queue`. The form remains busy and output ends at `desk: moving to 112 cm…`; the queued command never executes. Ctrl+C clears busy. The outstanding hold/audio path is additionally established by the source trace: `motorHold` creates an oscillator without an automatic stop, and only its returned stop callback ends it. The controller independently verified the pending-operation chain.

   **Impact:** the newly introduced context-loss fallback can leave the supposedly working lite terminal blocked indefinitely. With sound enabled during an active paddle hold, teardown can also leave the motor hum running. Requirements 10 and 12 require disposal to retain usable terminal/control behavior.

   **Fix:** make scene disposal complete or explicitly cancel owned desk operations, clear their callbacks/tweens, and end any active hold exactly once, including motor cleanup and coherent height state. Preserve unrelated foreground commands such as `cmatrix`; do not indiscriminately interrupt the shell. Test context loss during a typed desk move, a queued command, and an active physical hold, plus idempotent disposal and explicit retry.

### Minor (Nice to Have)

No new product minor raised. The previously ruled Node localStorage warning, Vite chunk advisory, color-environment warning and existing Astro hint remain deferred tool hygiene. Raw committed gate transcripts contain trailing spaces/blank EOF lines reported by `git diff --check`; these are evidence formatting, not a product failure, and should not be represented as a clean whole-range diff check.

## Governing requirement verdicts

“Met” below means supported by the reviewed source and the identified empirical evidence, within the recorded environment limits. It does not certify every GPU or physical keyboard. Existing green tests do not override the two reproduced failures.

| Governing requirement | Verdict | Evidence / qualification |
| --- | --- | --- |
| 1. Black pre-paint backdrop; same terminal | Met | Base bootstrap and boot CSS replace the poster loader; delayed-scene/no-loader assertions and recorded loading images; terminal identity asserted at handoff. |
| 2. Existing first/returning boot, no fake progress | Met | Existing `boot`/`start`/store remain authoritative; separate loader DOM/progress callbacks removed; first-visit slow capture and returning-visit tests. |
| 3. Final logical layout from start; preserve nodes/input/scroll/wrap | **Unmet on retry; violated invariant** | Normal handoff/grid/early-input checks pass, but issue 1 changes intrinsic width from 1280 to 576 at retry mount. No remount is introduced. |
| 4. Contained 16:10 layout, safe areas, resize | **Unmet on retry; violated invariant** | Normal five-viewport and safe-area calculations pass; zero/tiny startup fallback and explicit retry pass. Issue 1 produces right edge 656 at viewport width 320 after a prior successful mount. |
| 5. Analytic camera, actual world corners, screen up, intro-only bypass | Met | `screenCorners` applies world matrices; `screenPose` derives axes/distance/off-center translation/aspect; frame uses intro camera only while active. Transformed-corner and real-GLB tests. Temporary analytic aspect correction is an explicitly accepted ruling. |
| 6. Assets/fonts/GPU/covered projection ready; ≤1px handoff | **Unmet on retry; normal path met** | Signaled GPU helper and final snapshot loop have targeted tests; five real held-handoff viewport pairs pass against the final GLB. Issue 1 breaks the bootstrap-to-projection equality for subsequent attempts. |
| 7. Black reveal then continuous desk travel, 240/600 starting timing | Met within recorded limits | Intro stages use 240ms/600ms and continuous pose/up/aspect interpolation; same Dock DOM scales. CSS fades canvas; retained stage captures/recordings support the sequence. Native background throttling is explicitly not timing certification. |
| 8. Interruptibility, useful focus, no stolen camera request or premature links | Met on covered paths | AppWorld records pre-mount requests; fly/gesture cancellation takes current pose; monitor activation follows visible Dock projection; click capture/inert navigation retained. Real early typing/nav/drag/contact tests pass. |
| 9. Reduced motion has no decorative/spatial wait | Met | Intro starts done, normal desk path, near-zero CSS transitions; production browser reduced-motion checks. No minimum-loading timer. Live mid-session OS policy updates are a previously documented separate issue. |
| 10. Failed/stalled scene retains working lite; visible 15s deadline; complete cleanup | **Unmet; violated disposal invariant** | Abort/fence/context-loss/late-entry watchdog checks pass for idle terminal cases. Issue 2 leaves a pending desk command busy forever; issue 1 impairs retry. |
| 11. Saved theme/RGB/off and changes during loading synchronized | Met | Saved CSS palette precedes first paint; snapshot prepare applies theme/RGB/desk/fan and repeats after fences; saved-color and delayed-final-atlas tests; shader uniforms checked. |
| 12. Preserve prior repairs, controls, terminal/nav/Back/fallback behavior | **Unmet at disposal; ordinary paths met** | Stand-foot removal retained; real paddle/cmatrix, gesture latch, typeahead, links, view/Back/no-WebGL suites pass. Issue 2 breaks terminal/control completion after context loss. |
| 13. Rounded surfaces, broad planes, cat and arrangement | Met | Local 60° headphone and 55° shell smoothing, retained sharp flags, selective weighted normals, bounded tessellation. Actual Blender measurements in scoped review, full pipeline/import-check evidence, final asset and day/night visual comparisons. |
| Clarification: ≥12px initial effective type; reject unavailable/<256px rectangle; explicit valid retry | Met for fresh invalid startup; retry integration defect above | Bootstrap rejects before freezing; native 240→320 explicit retry evidence and unit boundary cases. A previous scene's inline grid is the missing lifecycle case. |
| Clarification: one projection including transforms/safe areas/clipping | Met on initial mount | Shared layout/actual corners/Dock; numerical safe-area and five-view browser equality. Retry violates the input layout contract, not the camera solver. |
| Clarification: successful covered frame; optional offscreen work not on critical path | Met | Signaled fences, loaded fonts/critical atlas, covered render, snapshot validation. Exact view refinements and opposite atlas warming remain idle work. |
| Clarification: one cancellable owner, resize rebases, no stale flight | Met for camera lifecycle; disposal incomplete | AbortController plus intro state and cameraRequest coordinate normal flow. Flight resize resets/rebases while retaining logical dimensions; no stale automatic desk override found. Issue 2 concerns a world-operation resource owned by that scene. |
| Clarification: no-bootstrap baseline and visible-time accounting | Met | Baseline HTML/CSS plus app `.js` activation; blocked/no-script and late-entry browser cases; visibility-boundary helper tests. |
| Clarification: node/caret/history/selection/focus/scroll and no forced phone keyboard | Met on covered unchanged DOM paths, empirical limits recorded | Same element/store/FrameView; early real typing and focus tests, zero-scroll held-handoff assertion, no automatic input focus on reveal. Arbitrary nonzero selection/caret combinations and physical virtual keyboards were not comprehensively measured. |
| Night: q96/q94 reproducible export; unchanged day quality/budgets | Met | Finalizer chooses night 96/94, day82/78; final manifest sizes 274098/109936 bytes; unchanged budget gate. |
| Night: bounded static monochrome post-conversion dither, night weighting | Met | Shader adds `(a+b-1)*uMix/255` after colorspace conversion, no time input; numerical bound record and stationary framebuffer zero-change evidence. |
| Night: preserve alpha, day, decal ratio, RGB/off, additive glow, live text | Met | RGB-only dither; tinted/ghost inheritance retains alpha; shadow/glow/screen shaders are separate; day mix zero; RGB/off real-scene tests and shader inspection. |
| Night: fresh-master numeric and visual comparison, coherent hashes | Met | New-master MAE .95482→.56149, p95 4→2, dark MAE1.19108→.74938; final metadata/contracts and retained matching-pose images. No universal banding claim. |
| Objects: preserve 60° rounded parts/hard caps, 24 circumference/8° band | Met | Builder source and actual Blender report: zero erroneous 38–60° sharp edges;112/112 cap edges retained. |
| Objects: stand3, desk2, selective broad normals, shell55, no global cat smoothing | Met | Explicitly scoped builder changes and measured desk-rim exception; comparison images; cat/node/screen contracts retained. |
| Objects: new cache/full model→bake→export→optimize→screens→posters→finalize→check | Met by retained execution evidence | `run.sh` producer order inspected; ledger records two fresh full runs and final import-check; original cache retained. Reviewer did not rebake. |
| Objects: GLB≤250KiB, ≤40k tris, new-GLB handoff | Met | Final249508 bytes/26776 tris; 13 asset checks within427 unit suite; final real-GLB handoff suite. Optional pre-bake optimized-size check was not done, openly recorded, final actual size passes. |
| Verification: delayed resources, before/after evidence, viewport/DPR/theme/input/failure coverage | Met with stated limits | Committed captures/metrics, tests and native GPU/retry evidence; focused review probes additionally exposed issues1–2. Physical device and representative latency claims are explicitly withheld. |
| Verification: CSP/Trusted Types, safe links, no new runtime dependency/framework | Met | Existing strict-header/CSP and allowlisted-link suites green; no package changes; esbuild is build-time minification. No production host setting changed in this branch. |
| Verification: full lint/unit/build/budget/browser gate before review | Met | Committed final logs and root-observed gate on779ee85; head873b7e4 is product-source-identical documentation/evidence. |
| Shipping: preserve prior work, original checkout/shots, one worktree/PR/merge commit, separate publication | Met to review stage; remaining operations pending | Carry commit/diff retain repairs; ledger/controller record original patch hash unchanged and isolated tree. This review precedes push/PR/CI/merge/removal/publication, so those actions are not claimed complete. |

### Plan/spec assessment

No material defect in the governing product specification. Two apparent historical conflicts are already resolved explicitly: later object work supersedes the night-only no-rebake step, and the measured two-segment tabletop exception supersedes the earlier three-segment trial. The analytic aspect adjustment and unusable-viewport offer-only behavior are recorded accepted rulings, not silent deviations. The plan's unchecked checklist is historical planning text; execution/gate records establish what was actually completed. The two findings require narrow lifecycle fixes, not a redesign or relaxed budgets.

## Dependent read/write paths inspected

1. **Pre-paint preferences:** Base reads theme/RGB localStorage and writes theme attributes/CSS palette/meta color; `AppWorld`/accent/theme subsequently validate, persist and consume those values; page theme toggles and terminal commands write them. Scene initial state and `prepare` read the same preferences. `postbuild-csp` hashes the emitted scripts and the production server serves those hashes.
2. **Capability/activation:** Base gate reads URL, connection/device hints and WebGL availability, writes `data-gl`, boot status and probe; `afterIdle`/`decide3D` read captured boot state and capability to auto-enter/offer/retain lite; manual button calls the exposed bootstrap; renderer takes/reuses/releases the probe.
3. **Logical layout:** `consoleLayout`/`introViewport` read viewport/safe areas and root bootstrap writes fixed metrics/contain transform; CSS consumes those for loading; scene reads frozen root metrics and writes element metrics/Dock sizes. `Dock.destroy` and retry are the broken dependent cleanup path in issue1.
4. **Terminal content/input:** `start` mounts existing terminal DOM; boot/Shell/TermStore produce lines, busy state, input and history; terminal DOM/FrameView consume it. Camera handoff changes only CSS/Dock. Type-anywhere, focus, Enter/typeahead, interrupt and shell commands read/write the same state. Pending world-command completion is the broken dependency in issue2.
5. **Readiness/exposure:** scene manifest/GLB/atlas/fonts/compile/upload → full covered frame → GPU fence → current visual snapshot → body scene mode/ready → entry selects saved camera request or intro. CSS reads boot/projecting/scene-ready flags to govern black, canvas, screens/chrome and poster. Failure reverses these through entry and mount undo.
6. **Camera/projection:** actual GLB screen positions/world transforms → screen corners → analytic intro pose or ordinary fitted Rail poses → current camera matrix → Dock homography. Resize/safe areas/phone typing and desk height feed refits; intro flight rebases; idle occlusion refinements remain outside critical readiness.
7. **Camera intent/navigation:** AppWorld.fly, terminal focus/type-anywhere, nav buttons, screen capture, Escape and Back history request views; scene raycasts/taps and zoom/orbit also cancel intro. Landmark/away callbacks write view, nav current state, Back visibility/history, and contact focus. Contact lists read those flags through inert/ARIA sync and Dock visibility.
8. **Physical desk/control completion:** raycast paddle → idle Shell command or busy direct `AppWorld.setDesk`; pointer hold/release → scene height and onHold callbacks → sound motor and world height/store output. Scene tween completion resolves command promises; disposal currently omits that last writer and hold termination (issue2). Existing no-tap latch covers pinch/cancelled gestures.
9. **Other live world effects:** theme events/terminal setters update atlas/tween/background/sky/shadow uniforms; RGB updates palette/tinted/glow/emissive/monitor accent; fan/readout/cat animations consume current world state. Final preparation samples these before reveal; subsequent settings use existing live paths.
10. **cmatrix and contacts:** TermStore monitor frames → `watchMonitor`/MonitorScreen and monitor window holes; page FrameView/rain flags → contact inertness/visibility. Physical controls bypass busy shell without replacing foreground ownership. Intro/disposal must preserve these consumers.
11. **Failure/resources:** visible watchdog/context loss/pagehide → `leave3d`/AbortController → mount undo: frame/timer/subscription/input/Dock/renderer/context/textures/geometry/monitor cleanup. Late signal checks prevent ordinary stale reveal; owned world-operation completion and terminal inline sizing are the omissions reported above.
12. **Geometry producers:** part builders write topology, smooth/sharp flags and custom normals; `common.join` produces baked groups; bake reads normals/topology to generate UVs and day/night masters; export records named nodes/screens/pivots and geometry; optimize welds/quantizes/compresses, strips unnecessary runtime normals, writes GLB statistics/check model. Thus shading improvement reaches runtime through the bake, not a runtime normal-lighting dependency.
13. **Asset publication:** screens/poster rendering read fresh bake/model data; finalizer encodes, hashes and writes GLB/atlases/posters/OG/manifest and prunes replaced assets; import-check reads the decoded export/new atlas. Runtime parser/loader and page poster/OG metadata read published outputs; asset contract tests and budget script read filenames/sizes/node/extension/stat contracts. Final coherent set passes these checks.
14. **Shader derivatives:** tinted and ghost materials reuse baked source/uniforms; deterministic dither therefore also reaches their RGB, retaining ghost alpha. Multiply decals, additive glow, live screen/window materials and native terminal text use separate paths and do not inherit the new dither.
15. **Repository/docs/tooling:** `.gitignore` now also ignores the dependency symlink; package files unchanged. DESIGN/PRODUCT and spec/plan/audit/evidence provide future work contracts, not runtime behavior. Existing build/header/budget/asset checks and desktop/mobile suite remain the shipping consumers; no migration or backend/data-schema path exists.

## Recommendations

Resolve both Important findings in the bounded disposal/retry paths, add meaningful production browser regressions for those exact user-visible sequences, and rerun the required aggregate gate after the fixes. Recheck the initial JS budget precisely: the current 30711/30720-byte result leaves only nine bytes. Do not weaken the budget or broaden the visual design to accommodate fixes. Keep the recorded tool-warning rulings and physical-device limitations explicit.

## Declined to judge

- Physical iOS/Android virtual-keyboard behavior, cross-GPU frame-rate distributions and every display's banding: neither browser emulation nor one native AMD renderer can certify them; the committed audit already limits those claims.
- Live mid-session OS reduced-motion changes for existing scene/toys: explicitly documented incumbent follow-up in the prior audit; this work's initial reduced-motion contract was reviewed and tested.
- Existing Cloudflare analytics injection and host-side production CSP noise: host configuration outside this source branch; application policy was reviewed without weakening it.
- Public-content expansion, projects section or a different desk composition: excluded by the approved product/design contracts; this branch preserves incumbent content.
- Push/PR/CI/review-thread resolution/merge/worktree removal and production publication: future controller-owned shipping actions at this pre-PR review stage, not source correctness evidence.
- Preserved raw gate transcript whitespace and pre-existing tool-warning cleanup: documentary/environment hygiene, accepted as deferred rather than mixed into the two runtime fixes.

## Assessment

**Ready to merge? With fixes.**

The normal console handoff, readiness synchronization, shading changes and generated asset set are well supported by the complete gate and retained visual/geometry evidence. Two independently reproducible fallback lifecycle defects still violate the approved containment and usable-lite invariants; fix and verify them before the remaining PR/CI/merge gates.
