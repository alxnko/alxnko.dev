- **GPU timeout is treated as successful covered-frame readiness** — ADDRESSED. `src/scene/ready.ts:4` rejects an already aborted owner; `src/scene/ready.ts:5` and `src/scene/ready.ts:29` reject context loss; `src/scene/ready.ts:7` rejects failed fence creation. Only `SIGNALED` resolves (`src/scene/ready.ts:31`); invalid status and an unsignaled visible-time deadline reject (`src/scene/ready.ts:32`). The allocated fence is deleted in `finally` (`src/scene/ready.ts:43`), and success/error/abort remove listeners and timers (`src/scene/ready.ts:13`). All three readiness callers now supply the mount signal (`src/scene/index.ts:1332`, `src/scene/index.ts:1347`, `src/scene/index.ts:1382`).
- **Preferences can change during the final GPU wait and escape readiness synchronization** — ADDRESSED. `src/scene/index.ts:1374` captures the visual preference snapshot, awaits its theme and desk, applies RGB/accent/fan, renders, and awaits the covered fence. `src/scene/index.ts:1385` reads current preferences after that asynchronous boundary; `src/scene/index.ts:1386` retries if any of theme/RGB/accent/desk/fan changed. Reveal occurs synchronously immediately after the successful comparison (`src/scene/index.ts:1387`), without another asynchronous preference window. Abort and disposal guard the waits and prevent stale reveal (`src/scene/index.ts:1376`, `src/scene/index.ts:1383`, `src/scene/index.ts:1392`).

### New Breakage in the Fix Diff

None.

### Out-of-Scope Observations

None.

### Checks

- Read the filled scoped prompt, task brief, four-file fix diff, appended fix report, and relevant setter/caller context. No tests rerun, browser runner started, or code/index/branch state changed.
- Confirmed the report identifies the production helper test file and includes output showing all 10 helper regressions passing. The tests cover signaled success, timeout rejection, missing fence, context loss, immediate/preexisting/falsy-reason abort, hidden-time accounting, query failure, and flush failure (`tests/unit/scene/ready.test.ts:16`).
- Confirmed the report includes six passing desktop/mobile browser regressions: preferences changed at the held final fence while the newly requested day atlas remains delayed (`tests/e2e/intro.spec.ts:267`), plus missing/unsignaled fence fallback with working terminal and contacts (`tests/e2e/intro.spec.ts:312`). Assertions require continued coverage until atlas release, another fence, current lighting, and zero RGB glow. These specifically cover the two original findings.
- Aggregate lint/unit/build/budget results (419 unit tests) are reported by the controller; the appended report marks the full browser suite still running. This scoped verdict does not certify the aggregate shipping gate.

### Verdict

**Fix round:** All findings addressed, no new Critical/Important breakage.
