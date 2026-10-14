# Controller addendum to final review

Source base: `873b7e4`; independently verified during the existing final fix wave.

## Important: manual entry after a blocked bootstrap activates an unrecoverable loading state

`src/ui/entry.ts:163–165` writes `data-boot=3d` before calling the optional
`__consoleIntro` activator. If that script did not run, the call is absent and
the function returns without a controller, scene import, or visible-time watchdog.
The existing blocked-bootstrap test strips inline scripts but does not click the
manual entry button. The resulting enhancement state hides contacts indefinitely.

Native reproduction against frozen production source: open lite; remove the
bootstrap-installed activator/deadline to represent their missing script; click
`#enter3d`. Observed `boot=3d`, no canvas, contacts visibility hidden, deadline
undefined. The source establishes the missing completion path. The implementer
must confirm RED with the existing real blocked-inline HTML fixture plus actual
manual click, then prove usable terminal/contacts and enabled button remain.

Requirement10 (bootstrap failure retains lite) is violated on manual activation.
The bounded fix must reject absent activation before changing boot or restore lite
synchronously. Add `src/ui/entry.ts` to the same final fix wave, preserving the
30KiB initial JS budget. No new dependency, weakening, or separate fix wave.
