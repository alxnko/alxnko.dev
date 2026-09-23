// Per-visitor conveniences only (theme, sound, history, booted). Storage can be missing
// or throw (private mode, blocked site data), so every access is guarded.

const PREFIX = 'alxnko:';

export function get(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(PREFIX + key) ?? null;
  } catch {
    return null;
  }
}

export function set(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, value);
  } catch {
    /* storage unavailable */
  }
}

export function del(key: string): void {
  try {
    globalThis.localStorage?.removeItem(PREFIX + key);
  } catch {
    /* storage unavailable */
  }
}
