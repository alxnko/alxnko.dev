# Mobile fastfetch worker evidence

Commit: `5466529c581655ceb7261e6e9a744ce802751c1a`.
Upstream (not pushed, by brief): `4a3ef104052aa42993842e4d7e9fd53f91295282`.
PR/review/push/merge: root-owned, not performed.

Source cause: compact command reused 18-column × 12-row full cat beside ten facts and the long rank caption. Phone soft wrapping split art/facts into extra rows; autoscroll hid ears. Frozen terminal 24px font / 30px line height were preserved.

Fix: exact supplied 11×7 static mark only for --compact/-c, bottom-aligned after three blank art rows. All ten facts retained; '#1 in KG' retains original link. Compact uptime after one minute uses whole minutes, preserving full uptime formatting. Original CAT_MARK data remains untouched. Full fastfetch contacts/palette/text stay unchanged. Gutter whitespace joins decorative art in its aria-hidden accent span; plain text and layout are unchanged. Formatter reuses pad, fixed widths, rows.length, and removes a redundant palette array spread to retain strict budget.

Files:
- src/content/mark.ts
- src/term/commands/info.ts
- tests/unit/term/commands.test.ts
- tests/e2e/fastfetch.spec.ts

All shell commands prefixed rtk; heavy checks run nice -n 19 ionice -c 3, serially; browser workers=1. Worktree/branch confirmed before edits. Other root-owned docs/audit-assets files preserved, not staged.

## RED

Commands (working directory is this worktree):
`rtk proxy bun run test tests/unit/term/commands.test.ts` (heavy wrapper/log redirection used): 2 failed | 59 passed; compact expected ten rows, got twelve. Raw: red/unit.log.
`rtk proxy bunx playwright test tests/e2e/fastfetch.spec.ts --project=desktop --workers=1 --output=.superpowers/mobile-fastfetch/red/browser`: 8 failed, including 60px wrapped rows at 320/360. Raw: red/browser.log. Each case contains initial.png, error-context.md and trace.zip. Geometry attached in trace. First/cached boot at320×780,360×780,390×844,844×390 captured before source fix.
Long uptime test: 1 failed | 61 passed before abbreviation. Raw red/uptime.log.

## GREEN

Fresh final commands:
`rtk proxy bun run lint` → green/lint.log
`rtk proxy bun run test` → green/unit.log
`rtk proxy bun run build` → green/build.log
`rtk proxy bun run budget` → green/budget.log
`rtk proxy bunx playwright test tests/e2e/fastfetch.spec.ts --project=desktop --workers=1 --output=.superpowers/mobile-fastfetch/green/browser-final` → green/browser-final.log
`rtk proxy bunx playwright test tests/e2e/intro.spec.ts --project=desktop --workers=1 --grep "held handoff.*(320|390|844)" --output=.superpowers/mobile-fastfetch/green/handoff` → green/handoff.log

Exact size measured with a local copy of existing budget script changing only output formatter and dist path: green/exact-budget.log. Initial JS gzip **30720 / 30720 bytes**, zero headroom; limits unchanged. Temporary measurement script ignored under .superpowers.

Final production-browser cases: all ten compact rows each30px, all seven art rows within visible screen, same24px font and >=12px effective font, rank caption one line. User echo still wraps. Existing held handoff checks verify same DOM nodes, line heights/scroll/geometry and projection within one pixel at320×568,390×844,844×390. Screenshot inspected at320px shows full ears/body/tail without torn facts; green/browser-final/*/initial.png preserves each first/cached shot.

Test correction: first wide844px boot intentionally runs full fastfetch per unchanged entry.ts policy; initial GREEN browser attempt had7 passed/1 failed due to erroneous compact expectation. Corrected test to verify18 full rows/12 art rows and original caption there; cached wide/portrait compact. Full landscape screenshot has no wrapping. Earlier RED included this already-existing policy mismatch as well as actual phone failures; phone RED is genuine.

Self-review: scoped diff only; original mark unchanged; normal output shape/fields/links/colors/contact/palette preserved; whitespace gutter now hidden with art; no renderer/CSS/scene/history/dependency/budget changes. git diff --check exit0. Unit asserts both flags, exact compact pixels/all facts/link, full mark preservation, >3day uptime and full long uptime. Full mark fixed width18 and compact11 plus3 gutter are grounded in static marks. Full rows always exceed art count.

Limits: complete aggregate Playwright gate, independent review, native focus/laptop screenshots, PR/CI/merge/deploy remain root-owned by explicit brief. Chromium desktop project uses exact viewport sizes; root native phone evidence follows separately. No source changes after root copied stable dist. No agents launched.

## Verbatim final check output excerpts

### lint

```text
$ astro check && tsc --noEmit
15:43:30 [types] Generated 24ms
15:43:30 [check] Getting diagnostics for Astro files in /home/alxnko/Projects/code/meow/alxnko.dev/.claude/worktrees/mobile-fastfetch...
[96msrc/term/lazy.ts[0m:[93m10[0m:[93m17[0m - [93mwarning[0m[90m ts(80006): [0mThis may be converted to an async function.

[7m10[0m export function loadText(waitMs = TEXT_WAIT_MS): Promise<Text | null> {
[7m  [0m [93m                ~~~~~~~~[0m

Result (70 files): 
- 0 errors
- 0 warnings
- 1 hint
```

### unit

```text
(Use `node --trace-warnings ...` to show where the warning was created)

 Test Files  29 passed (29)
      Tests  430 passed (430)
   Start at  15:43:40
   Duration  795ms (transform 39%, environment 32%, tests 16%, import 10%, worker 2%)
```

### build

```text
15:43:46 [build] ✓ Completed in 292ms.
15:43:46 [build] 10 page(s) built in 333ms
15:43:46 [build] Complete!
csp: 979 chars, 12 hashes → dist/_headers
```

### budget

```text
$ bun scripts/budget.ts
ok   initial JS (gz)             30.0 KB  (budget 30.0 KB)
ok   CSS (gz)                     6.6 KB  (budget 10.0 KB)
ok   fonts (woff2 total)         55.7 KB  (budget 60.0 KB)
ok   lazy 3D JS (gz)            168.6 KB  (budget 170.0 KB)
ok   lazy text JS (gz)            3.6 KB  (budget 6.0 KB)
ok   desk.glb                   243.7 KB  (budget 250.0 KB)
ok   atlas 1024 (max)           107.4 KB  (budget 120.0 KB)
ok   atlas 2048 (max)           267.7 KB  (budget 450.0 KB)
ok   poster 800 avif (max)       22.9 KB  (budget 45.0 KB)
ok   poster 1600 avif (max)      42.3 KB  (budget 90.0 KB)
```

### browser-final

```text
Running 8 tests using 1 worker

(node:17972) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  1 [desktop] › tests/e2e/fastfetch.spec.ts:6:5 › autologin mark stays whole 320×780 first boot (1.6s)
  ✓  2 [desktop] › tests/e2e/fastfetch.spec.ts:6:5 › autologin mark stays whole 320×780 cached boot (201ms)
  ✓  3 [desktop] › tests/e2e/fastfetch.spec.ts:6:5 › autologin mark stays whole 360×780 first boot (1.5s)
  ✓  4 [desktop] › tests/e2e/fastfetch.spec.ts:6:5 › autologin mark stays whole 360×780 cached boot (187ms)
  ✓  5 [desktop] › tests/e2e/fastfetch.spec.ts:6:5 › autologin mark stays whole 390×844 first boot (1.5s)
  ✓  6 [desktop] › tests/e2e/fastfetch.spec.ts:6:5 › autologin mark stays whole 390×844 cached boot (187ms)
  ✓  7 [desktop] › tests/e2e/fastfetch.spec.ts:6:5 › autologin mark stays whole 844×390 first boot (1.5s)
  ✓  8 [desktop] › tests/e2e/fastfetch.spec.ts:6:5 › autologin mark stays whole 844×390 cached boot (188ms)

  8 passed (7.3s)
```

### handoff

```text
Running 3 tests using 1 worker

(node:18350) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  1 [desktop] › tests/e2e/intro.spec.ts:74:3 › held handoff preserves nodes, text and real screen projection 320×568 (2.7s)
  ✓  2 [desktop] › tests/e2e/intro.spec.ts:74:3 › held handoff preserves nodes, text and real screen projection 390×844 (2.6s)
  ✓  3 [desktop] › tests/e2e/intro.spec.ts:74:3 › held handoff preserves nodes, text and real screen projection 844×390 (2.6s)

  3 passed (8.3s)
```

### exact-budget

```text
ok   initial JS (gz)          30720 bytes  (budget 30720 bytes)
ok   CSS (gz)                 6746 bytes  (budget 10240 bytes)
ok   fonts (woff2 total)      57012 bytes  (budget 61440 bytes)
ok   lazy 3D JS (gz)          172659 bytes  (budget 174080 bytes)
ok   lazy text JS (gz)        3726 bytes  (budget 6144 bytes)
ok   desk.glb                 249508 bytes  (budget 256000 bytes)
ok   atlas 1024 (max)         109936 bytes  (budget 122880 bytes)
ok   atlas 2048 (max)         274098 bytes  (budget 460800 bytes)
ok   poster 800 avif (max)    23422 bytes  (budget 46080 bytes)
ok   poster 1600 avif (max)   43341 bytes  (budget 92160 bytes)
```

