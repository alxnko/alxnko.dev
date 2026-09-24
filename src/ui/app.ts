// Page-level behaviour (spec §3.2, §3.4, §11): theme + sound toggles, type-anywhere,
// the 404 path, first-visit boot, the KG clock, and the post-load idle hook where the
// 3D gate runs. The terminal shell itself is injected (see entry.ts).
import type { SoundLevel, Theme } from '../term/types';
import * as prefs from '../lib/prefs';
import { mountTerminal, type TermDeps, type TermHandle } from './terminal-dom';
import { THEME_EVENT, applyTheme, currentTheme, followSystem, toggleTheme } from './theme';

export const SOUND_EVENT = 'alxnko:sound';

export interface AppDeps {
  createTerm(): TermDeps;
  /** Plays the boot log (`first` = first visit, full boot) or the short motd. */
  boot?(first: boolean): void | Promise<void>;
  /** Runs once after `load` + idle: the place for decide3D and the lazy scene import. */
  afterIdle?(): void;
  onTheme?(t: Theme): void;
  onSound?(level: SoundLevel): void;
}

export interface App {
  term: TermHandle | null;
  deps: TermDeps | null;
  destroy(): void;
}

const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const ACTIVATES_ON_SPACE = 'button, a[href], summary, [role="button"], [role="link"]';

export function isTypingKey(e: KeyboardEvent): boolean {
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing;
}

function bindTheme(onTheme?: (t: Theme) => void): () => void {
  const btn = document.getElementById('t-theme');
  const sync = () => btn?.setAttribute('aria-pressed', String(currentTheme() === 'light'));
  const click = () => {
    const t = toggleTheme(); // not inside `onTheme?.(…)`: optional calls skip their arguments
    onTheme?.(t);
  };
  sync();
  btn?.addEventListener('click', click);
  document.addEventListener(THEME_EVENT, sync);
  const unfollow = followSystem();
  return () => {
    btn?.removeEventListener('click', click);
    document.removeEventListener(THEME_EVENT, sync);
    unfollow();
  };
}

export function soundLevel(): SoundLevel {
  const v = prefs.get('sound');
  return v === 'on' || v === 'low' ? v : 'off';
}

function bindSound(onSound?: (l: SoundLevel) => void): () => void {
  const btn = document.getElementById('t-sound');
  const sync = () => btn?.setAttribute('aria-pressed', String(soundLevel() !== 'off'));
  const click = () => {
    const next: SoundLevel = soundLevel() === 'off' ? 'on' : 'off';
    prefs.set('sound', next);
    document.dispatchEvent(new CustomEvent<SoundLevel>(SOUND_EVENT, { detail: next }));
    onSound?.(next);
  };
  sync();
  btn?.addEventListener('click', click);
  document.addEventListener(SOUND_EVENT, sync);
  return () => {
    btn?.removeEventListener('click', click);
    document.removeEventListener(SOUND_EVENT, sync);
  };
}

/** 404: show the path that was asked for, as text only. */
export function fillNotFound(path = location.pathname): void {
  let p = path;
  try {
    p = decodeURIComponent(path);
  } catch {
    /* keep the raw path */
  }
  if (p.length > 96) p = p.slice(0, 95) + '…';
  for (const el of document.querySelectorAll('.nf-path')) el.textContent = p;
}

const clockFmt = (() => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bishkek', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  } catch {
    return null;
  }
})();

function startClock(): () => void {
  const el = document.getElementById('clock');
  if (!el || !clockFmt) return () => {};
  let t = 0;
  const tick = () => {
    const now = new Date();
    el.textContent = clockFmt.format(now);
    el.setAttribute('datetime', now.toISOString());
    t = window.setTimeout(tick, 1000 - (now.getTime() % 1000) + 5);
  };
  tick();
  return () => clearTimeout(t);
}

function whenIdle(fn: () => void) {
  const go = () => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    if (ric) ric(fn, { timeout: 1500 });
    else setTimeout(fn, 1500);
  };
  if (document.readyState === 'complete') go();
  else addEventListener('load', go, { once: true });
}

export function start(app: AppDeps): App {
  const cleanup: (() => void)[] = [];
  applyTheme(currentTheme()); // posters + theme-color follow a stored theme, not only the OS
  cleanup.push(bindTheme(app.onTheme), bindSound(app.onSound), startClock());
  fillNotFound();

  const root = document.getElementById('term');
  const deps = root ? app.createTerm() : null;
  const term = root && deps ? mountTerminal(root, deps) : null;

  // Type anywhere: a printable key with nothing editable focused lands in the terminal.
  const onKey = (e: KeyboardEvent) => {
    document.body.dataset.interacted = '';
    if (!term || !deps || e.defaultPrevented) return;
    const active = document.activeElement;
    // a running full-screen toy owns the keyboard (q, ctrl+c), like typing anywhere goes to
    // the prompt; a focused control keeps its own Enter/Space
    const activates = (e.key === 'Enter' || e.key === ' ') && active?.closest(ACTIVATES_ON_SPACE);
    if (!active?.closest(EDITABLE) && !activates && term.toyKey(e)) return;
    if (!isTypingKey(e)) return;
    if (active?.closest(EDITABLE)) return;
    if (e.key === ' ' && active?.closest(ACTIVATES_ON_SPACE)) return;
    e.preventDefault();
    const { input, cursor } = deps.store.state;
    term.focus();
    deps.store.setInput(input.slice(0, cursor) + e.key + input.slice(cursor), cursor + 1);
    deps.onFocus?.();
  };
  const onPointer = () => {
    document.body.dataset.interacted = '';
  };
  addEventListener('keydown', onKey);
  addEventListener('pointerdown', onPointer, { once: true, passive: true });
  cleanup.push(() => {
    removeEventListener('keydown', onKey);
    removeEventListener('pointerdown', onPointer);
  });

  // Boot: the full log on a first visit only, skippable by any key or tap; never under
  // reduced motion (spec §3.2, §3.4).
  if (deps && app.boot) {
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const first = !prefs.get('booted') && !reduced;
    prefs.set('booted', '1');
    if (first) {
      const skip = () => deps.interrupt();
      addEventListener('keydown', skip, { once: true, capture: true });
      addEventListener('pointerdown', skip, { once: true, capture: true });
      void Promise.resolve(app.boot(true)).finally(() => {
        removeEventListener('keydown', skip, { capture: true });
        removeEventListener('pointerdown', skip, { capture: true });
      });
    } else {
      void app.boot(false);
    }
  }

  if (app.afterIdle) whenIdle(app.afterIdle);

  return {
    term,
    deps,
    destroy() {
      term?.destroy();
      cleanup.forEach((f) => f());
    },
  };
}
