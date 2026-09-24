// The long terminal text (src/term/text.ts) is a chunk loaded on first use (R75, R90). Every
// caller goes through here: one shared import, never waited on for more than TEXT_WAIT_MS (a
// stalled or failed chunk resolves to null and the caller falls back to its short answer),
// and a failed import is forgotten, so the next use tries again.
export type Text = typeof import('./text');

export const TEXT_WAIT_MS = 3000;
let pending: Promise<Text | null> | null = null;

export function loadText(waitMs = TEXT_WAIT_MS): Promise<Text | null> {
  const p = (pending ??= import('./text').catch(() => {
    pending = null;
    return null;
  }));
  let timer = 0;
  const late = new Promise<null>((r) => (timer = setTimeout(() => r(null), waitMs) as unknown as number));
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/** Warms the chunk (idle time, after the boot), so the first `man` or phrase answers at once. */
export function prefetchText(): void {
  void loadText();
}
