# Task 1 independent source review

Reviewed range: `dbd50944f610331da9ce7bddbea27e7047dbb418..5dfad2a837e974ca97a99917191487b11152294f`. Read all 12 owned changed files, the filled mandatory review prompt, task report, and surrounding world/input/render/disposal paths. Read-only inspection; no browser runner or checkout/index mutation.

## Strengths

- One real terminal persists; the old progress DOM and poster backdrop were removed rather than layered into another loading system. Responsive logical dimensions are selected synchronously, then retained across projection and flight.
- The camera calculation derives its axes, position, and aspect calibration from actual world screen corners. Real-asset browser assertions cover corner and text-box continuity in five viewports, rather than comparing two approximated screenshots.
- Cancellation takes the current camera pose/up/aspect as its start. The private projecting phase establishes layout before revealing without incorrectly advertising public scene readiness. Monitor focus notification follows Dock visibility.
- No-script/blocked-bootstrap lite baseline, visible-time deadline, late-entry gate, abort cleanup, and context-loss fallback are substantially stronger than the former loader. Inline build-time minification preserves CSP and the existing budgets without a runtime dependency.
- The report distinguishes scoped green tests from the still-pending aggregate gate and identifies earlier harness mistakes honestly.

## Issues

### Critical (Must Fix)

None found.

### Important (Should Fix)

1. **GPU timeout is treated as successful covered-frame readiness.** `src/scene/index.ts:153` (helper through line 163), new readiness callers at lines 1359 and 1391. `gpuDone()` exits its poll after three seconds and resolves even when the fence remains unsignaled; it also resolves if fence creation returns null. `prepare()` subsequently sets `revealed` and scene mode. A slow or failing driver can therefore uncover before the required covered frame has completed, recreating a blank/stalled visual handoff. This helper was formerly a bounded warm-up wait; the new architecture promotes its return into an authoritative readiness barrier without strengthening its success contract. Reject on failed fence creation, context loss, or unsignaled deadline (while deleting the sync in all cases), letting existing mount/entry failure handling retain the lite terminal. Add a focused helper regression proving an unsignaled timeout cannot resolve as readiness. Successful drivers need no extra delay.

2. **Preferences can change during the final GPU wait and escape the readiness synchronization.** `src/scene/index.ts:1382` (particularly lines 1385–1395). The theme-stability loop finishes before the final covered render/fence. During that asynchronous GPU wait, `world.scene` is already attached (`src/ui/entry.ts:226`), so a real terminal/theme action can request another theme and start an atlas load. After the earlier fence resolves, `prepare()` unconditionally exposes the scene without checking that `read()` still matches the covered state. The new theme may consequently load or crossfade only after the old-theme room is visible. RGB/desk/fan changes in that interval likewise need a rendered-state check. Loop over a snapshot of the relevant visual settings: apply/await that snapshot, render/fence, then compare with current settings before exposing; repeat while changed, still bounded by the existing visible-time watchdog and abort. Add a regression that changes theme after the covered frame starts and delays the newly requested atlas, asserting no reveal until the current choice has rendered. The existing manifest-held settings tests change preferences earlier and do not cover this window.

### Minor (Nice to Have)

None raised.

## Requirements and dependent-path trace

- Requirements 1–4: bootstrapConsole/consoleLayout → root CSS variables → scene CSS → persistent terminal DOM/FrameView and unchanged boot/store. Black contain presentation, font gate, phone readability, initial resize, and frozen dimensions are implemented; geometry checks exercise these.
- Requirement 5: actual screenCorners/world matrices → screenPose → camera matrix → Dock projection. Aspect calibration is a justified recorded deviation accommodating quantized geometry rather than a hardcoded screen approximation.
- Requirement 6 and readiness clarification: fonts/assets/program warm-up → covered frame → gpuDone → prepare → entry scene-ready. **Issue 1 prevents accepting the strict successful-frame contract.** Optional opposite atlas and exact-view refinements remain idle work.
- Requirements 7–9: intro state/time → current pose/up/aspect → existing Rail/springs/render loop; entry keyboard/focus/nav and attachInput zoom/orbit can cancel the intro. Reduced motion selects the ordinary desk and existing near-zero CSS transition path. Resize rebases frozen geometry.
- Requirement 10 and no-script clarification: Base baseline → gate/visibleDeadline → scene:failed → leave3d/controller.abort → mount undo/renderer/Dock/input/timers. The active code disposes the renderer and late successful mount, cancels loop/listeners, and preserves lite content. Unit visibility accounting and real late-entry tests are relevant; native hidden-tab timing remains outside this source seat's empirical proof.
- Requirement 11: saved first-paint CSS → AppWorld preferences → scene initial resources → world setters/prepare. **Issue 2 prevents accepting settings synchronization up to actual exposure.** Existing post-reveal optional-atlas failure preserves the displayed lighting.
- Requirement 12: AppWorld and terminal commands continue using the same SceneWorld setters; raycast paddles, hold/release, cmatrix screens, touch input, contact focus, view mode/history, and scene gate remain surrounding consumers. The new public ready phase and landmark callback timing affect these consumers, making the complete existing suite necessary. No source-only additional regression identified.
- Requirement 13/night assets: these are independent source/asset tasks, not part of this 12-file range.
- SceneHandle consumers: entry attaches `world`, awaits `prepare`, selects camera request or `beginIntro`, and invokes `destroy` on leave/abort. SceneWorld.setTheme now returns a promise; existing fire-and-forget theme event calls are safe because the setter handles atlas failure internally. World API/model terminal state remains shared rather than duplicated.
- CSS consumers: public scene mode, private projecting mode, boot state, Dock flags, view, rain, noui, and reduced-motion selectors govern both persistent screens/chrome. Poster is retained for lite/OG and lazily loaded; no remaining progress callback consumers survive in this range.

## Recommendations

Fix the two narrow readiness gaps without expanding the visual scope, rerun meaningful regressions plus the required aggregate gate, and review the resulting tip. The plan is technically reasonable; neither finding requires changing the approved black-console direction or timing.

## Declined to judge

- Prop smoothing/baked shadow quality and asset generation: separate task range; not covered by this source review.
- Final slowed-browser recordings, physical phone/GPU legibility and motion craft: root's visual/runtime verification; source plus scoped headless measurements cannot certify those displays.
- Final full-suite pass, pre-PR aggregate review, CI/review disposition, merge and publication: not yet complete at this source review's dispatch.

## Assessment

**Ready to merge? With fixes.** The design and most implementation contracts are sound, but authoritative GPU readiness and preference stability at the last asynchronous handoff need the two targeted fixes above. No security, data-loss, or architectural blocker found in the reviewed source; this is not an aggregate shipping approval.
