# Startup viewport correction report

Worktree: /home/alxnko/Projects/code/meow/alxnko.dev/.claude/worktrees/console-intro
Branch: feat/console-intro
Pre-fix HEAD: 4db0f602dc6cc0292bbf5c0a1e2d4cf8b183287d

## Behavior and governing refinement

The native startup evidence in the brief was innerWidth/innerHeight=0 followed by a real 1280×800 window, while the initial logical grid remained 2×1.25. Bootstrap now rejects the authoritative computed initial console rectangle before assigning frozen metrics, style properties, fonts, or a resize listener. It sets data-boot=failed and retains SSR lite. __consoleIntro remains registered for explicit retry, and returns activation success so enter3d can return before disabling its button, creating an AbortController, starting a deadline, or importing the scene.

Root's subsequent ruling refined the unusable threshold: "Prefer using already computed authoritative l.rect.width <256 (16:10 height<160) as readable-lite threshold, before freezing; all five approved test viewports including320×568 stay valid." This rejects tiny positive phantom viewports as well as zero. Unit cases exercise 0, 32, 33, 100, and a 287px viewport whose contained rectangle is 255px, plus height/safe-inset boundaries. Later viewport restoration alone does not activate an invalid startup. Healthy existing frozen-layout resize behavior is preserved.

The synchronous safe-inset probe now directly assigns its padding property. Its temporary fixed positioning was unnecessary to read computed env padding before removing it in the same task. This avoids duplicated runtime viewport acquisition and keeps the unchanged initial JS limit: 30,711 bytes / 30,720 bytes. No scene assets, geometry, GPU helpers, budgets, or new dependencies changed.

## RED proof

Production browser test was added before source changes and run:
`rtk proxy bunx playwright test tests/e2e/intro.spec.ts --grep 'zero initial viewport' --workers=1`

Both desktop/mobile failed for the expected product behavior:
```
Expected: "failed"
Received: "3d"
Timeout: 5000ms
2 failed
    [desktop] › zero initial viewport keeps lite usable until an explicit valid retry
    [mobile] › zero initial viewport keeps lite usable until an explicit valid retry
```

The refined real bootstrap unit regression was also run with only src/ui/intro.ts temporarily restored to pre-fix HEAD, followed by unconditional restoration of the current fix:
`rtk proxy bunx vitest run tests/unit/ui/intro.test.ts --testNamePattern 'viewport 33'`
```
FAIL bootstrap rejects viewport 33×568 with left/top insets 0/0 without freezing or later takeover
AssertionError: expected '3d' to be 'failed'
Expected: "failed"
Received: "3d"
Test Files 1 failed (1)
Tests 1 failed | 10 skipped (11)
RED exit: 1
```
No original source from other owners was replaced or reverted.

## Resize failure investigation

Temporary instrumentation counted actual resize event delivery and measured the real terminal rectangle immediately after setViewportSize. The existing app listener is working; event delivery is asynchronous. Across 20 diagnostic desktop/mobile repetitions, one immediate state was:
```
events: 0
viewport: [844, 390]
rect: { x:80, y:50, width:1280, height:800, right:1360, bottom:850 }
```
After delivery:
```
events: 1
viewport: [844, 390]
rect: { x:161.1999969482422, y:32, width:521.5999755859375,
        height:326, right:682.7999725341797, bottom:358 }
20 passed (22.6s)
```
Mobile could likewise report events=0 with the old bottom=538.25 in a newly 390px-high viewport. Diagnostic logging was removed. The production test now expect.polls actual geometry wholly contained in 844×390, then retains the original unchanged intrinsic grid and exact horizontal bounds assertions. No sleep, widened bound, ignored failure, or weakened grid assertion was introduced.

## Final scoped proof

The browser startup regression exercises real SSR/CSP/entry/scene code with initial window dimensions forced to zero. It runs a real lite terminal command, checks contacts, rejects an invalid manual attempt with the button enabled and no scene request/canvas, restores real 320×568 dimensions without automatic enhancement, explicitly enters 3D, verifies DOM identity/readable effective font/logical width, and checks preservation of the command output after scene readiness. All five approved real handoff viewports pass in desktop and mobile projects.

No tests and builds ran concurrently. Root owns the subsequent aggregate full browser gate, fresh whole-branch requirements review, native preview confirmation, PR/CI, and shipping. This worker has not pushed or opened/merged a PR.

### rtk proxy bun run lint

Exit: 0
```
$ astro check && tsc --noEmit
15:21:01 [types] Generated 28ms
15:21:01 [check] Getting diagnostics for Astro files in /home/alxnko/Projects/code/meow/alxnko.dev/.claude/worktrees/console-intro...
[96msrc/term/lazy.ts[0m:[93m10[0m:[93m17[0m - [93mwarning[0m[90m ts(80006): [0mThis may be converted to an async function.

[7m10[0m export function loadText(waitMs = TEXT_WAIT_MS): Promise<Text | null> {
[7m  [0m [93m                ~~~~~~~~[0m

Result (70 files): 
- 0 errors
- 0 warnings
- 1 hint

```

### rtk proxy bun run test

Exit: 0
```
$ vitest run

 RUN  v5.0.1 /home/alxnko/Projects/code/meow/alxnko.dev/.claude/worktrees/console-intro

(node:70703) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:70710) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:70728) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:70760) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:70837) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:70892) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)

 Test Files  29 passed (29)
      Tests  427 passed (427)
   Start at  15:21:26
   Duration  905ms (transform 38%, environment 32%, tests 17%, import 11%, worker 2%)

  Transform  transforming modules took 2.10s · 38% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns

```

### rtk proxy bun run build

Exit: 0
```
$ bun run tokens:check && astro build && bun scripts/postbuild-csp.ts
$ bun scripts/gen-tokens.ts --check
15:18:45 [types] Generated 29ms
15:18:45 [build] output: "static"
15:18:45 [build] mode: "static"
15:18:45 [build] directory: /home/alxnko/Projects/code/meow/alxnko.dev/.claude/worktrees/console-intro/dist/
15:18:45 [build] Collecting build info...
15:18:45 [build] ✓ Completed in 48ms.
15:18:45 [build] Building static entrypoints...
15:18:45 [vite] ✓ built in 102ms
15:18:45 [WARN] [vite] [plugin builtin:vite-reporter] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
15:18:45 [vite] ✓ built in 137ms
15:18:45 [build] Rearranging server assets...

 generating static routes 
15:18:45   ├─ /404.html (+10ms) 
15:18:45   ├─ /email/index.html (+1ms) 
15:18:45   ├─ /gh/index.html (+1ms) 
15:18:45   ├─ /github/index.html (+1ms) 
15:18:45   ├─ /ig/index.html (+1ms) 
15:18:45   ├─ /in/index.html (+1ms) 
15:18:45   ├─ /li/index.html (+1ms) 
15:18:45   ├─ /mail/index.html (+1ms) 
15:18:45   ├─ /tg/index.html (+1ms) 
15:18:45   ├─ /index.html (+5ms) 
15:18:45 ✓ Completed in 29ms.

15:18:45 [build] ✓ Completed in 286ms.
15:18:45 [build] 10 page(s) built in 338ms
15:18:45 [build] Complete!
csp: 979 chars, 12 hashes → dist/_headers
```

### rtk proxy bun run budget

Exit: 0
```
$ bun scripts/budget.ts
ok   initial JS (gz)             30.0 KB  (budget 30.0 KB)
ok   CSS (gz)                     6.6 KB  (budget 10.0 KB)
ok   fonts (woff2 total)         55.7 KB  (budget 60.0 KB)
ok   lazy 3D JS (gz)            168.5 KB  (budget 170.0 KB)
ok   lazy text JS (gz)            3.6 KB  (budget 6.0 KB)
ok   desk.glb                   243.7 KB  (budget 250.0 KB)
ok   atlas 1024 (max)           107.4 KB  (budget 120.0 KB)
ok   atlas 2048 (max)           267.7 KB  (budget 450.0 KB)
ok   poster 800 avif (max)       22.9 KB  (budget 45.0 KB)
ok   poster 1600 avif (max)      42.3 KB  (budget 90.0 KB)
```

### rtk proxy bunx playwright test tests/e2e/intro.spec.ts --grep 'zero initial viewport|resize during loading|held handoff' --workers=2

Exit: 0
```

Running 14 tests using 2 workers

(node:66285) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:66286) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓   2 [mobile] › tests/e2e/intro.spec.ts:4:1 › zero initial viewport keeps lite usable until an explicit valid retry (816ms)
  ✓   1 [desktop] › tests/e2e/intro.spec.ts:4:1 › zero initial viewport keeps lite usable until an explicit valid retry (831ms)
  ✓   4 [desktop] › tests/e2e/intro.spec.ts:74:3 › held handoff preserves nodes, text and real screen projection 320×568 (1.6s)
  ✓   3 [mobile] › tests/e2e/intro.spec.ts:74:3 › held handoff preserves nodes, text and real screen projection 320×568 (2.6s)
  ✓   5 [desktop] › tests/e2e/intro.spec.ts:74:3 › held handoff preserves nodes, text and real screen projection 390×844 (1.6s)
  ✓   6 [mobile] › tests/e2e/intro.spec.ts:74:3 › held handoff preserves nodes, text and real screen projection 390×844 (1.7s)
  ✓   7 [desktop] › tests/e2e/intro.spec.ts:74:3 › held handoff preserves nodes, text and real screen projection 844×390 (1.7s)
  ✓   8 [mobile] › tests/e2e/intro.spec.ts:74:3 › held handoff preserves nodes, text and real screen projection 844×390 (2.7s)
  ✓   9 [desktop] › tests/e2e/intro.spec.ts:74:3 › held handoff preserves nodes, text and real screen projection 768×1024 (2.7s)
  ✓  10 [mobile] › tests/e2e/intro.spec.ts:74:3 › held handoff preserves nodes, text and real screen projection 768×1024 (1.7s)
  ✓  11 [desktop] › tests/e2e/intro.spec.ts:74:3 › held handoff preserves nodes, text and real screen projection 1440×900 (1.7s)
  ✓  12 [mobile] › tests/e2e/intro.spec.ts:74:3 › held handoff preserves nodes, text and real screen projection 1440×900 (1.7s)
  ✓  13 [desktop] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (1.8s)
  ✓  14 [mobile] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (1.9s)

  14 passed (13.6s)
```

### rtk proxy bunx playwright test tests/e2e/intro.spec.ts --grep 'resize during loading' --repeat-each=10 --workers=2

Exit: 0
```

Running 20 tests using 2 workers

(node:67118) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:67119) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓   1 [desktop] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (1.9s)
  ✓   2 [desktop] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (2.0s)
(node:67339) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:67346) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓   3 [desktop] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (1.9s)
  ✓   4 [desktop] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (1.9s)
(node:67594) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:67601) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓   5 [desktop] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (2.0s)
  ✓   6 [desktop] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (1.9s)
(node:67792) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:67799) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓   7 [desktop] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (1.9s)
  ✓   8 [desktop] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (2.0s)
(node:67990) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:67999) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓   9 [desktop] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (2.0s)
  ✓  10 [desktop] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (1.8s)
(node:68189) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:68196) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  11 [mobile] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (1.9s)
  ✓  12 [mobile] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (1.9s)
(node:68430) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:68438) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  13 [mobile] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (2.0s)
  ✓  14 [mobile] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (1.9s)
(node:68633) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:68634) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  16 [mobile] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (2.0s)
  ✓  15 [mobile] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (2.0s)
(node:68854) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:68853) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  17 [mobile] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (2.0s)
  ✓  18 [mobile] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (2.0s)
(node:69051) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:69050) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  19 [mobile] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (2.0s)
  ✓  20 [mobile] › tests/e2e/intro.spec.ts:167:1 › resize during loading and flight keeps the same intrinsic terminal grid (2.0s)

  20 passed (22.8s)
```

## Budget triage and ownership

First implementation imported the viewport reader into entry, duplicating safe-area acquisition and failing initial JS at 30.4KB. Reusing bootstrap activation removed that duplicate. Intermediate revisions still exceeded the exact byte limit despite the rounded display reading 30.0KB; the final direct-padding probe and shared activation result pass the unchanged gate. All source/test changes are restricted to src/ui/intro.ts, src/ui/entry.ts, tests/unit/ui/intro.test.ts, and tests/e2e/intro.spec.ts. The report is a local ignored handoff artifact, not part of the source commit.

Pre-commit `rtk git diff --check`: exit 0, no output. Pre-commit `rtk git diff --shortstat origin/main..HEAD`: 59 files changed, 2066 insertions(+), 512 deletions(-). Aggregate branch shipping remains root-owned.

Commit: 779ee85 (fix(ui): retain lite startup for unusable viewports). Only the four owned source/test files were committed; no push, PR, merge, or --no-verify. Scoped test runs were serial; each browser run finished before the next started, and all builds ran outside test execution. The brief now explicitly appends the final authoritative rect.width<256 ruling, superseding its original minimum width/height guard. Report ready; no worker commands or tests remain running.

