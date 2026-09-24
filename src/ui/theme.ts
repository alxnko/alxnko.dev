// Theme: data-theme on <html> (set before paint by the inline bootstrap in Base.astro),
// persisted as prefs 'theme', following the system until the visitor picks one.
import type { Theme } from '../term/types';
import * as prefs from '../lib/prefs';

export const THEME_EVENT = 'alxnko:theme';
const root = () => document.documentElement;

export function systemTheme(): Theme {
  return globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function currentTheme(): Theme {
  const t = root().dataset.theme;
  return t === 'light' || t === 'dark' ? t : systemTheme();
}

/** Swap poster sources that carry data-theme-src='{"day":…,"night":…}'. */
function swapPosters(t: Theme) {
  // the desk is up (it never hands back to the page): the poster is hidden for good, so a
  // theme change must not fetch another one nobody sees
  if (document.body?.dataset.scene === 'ready') return;
  const key = t === 'light' ? 'day' : 'night';
  for (const el of document.querySelectorAll<HTMLSourceElement | HTMLImageElement>('#poster [data-theme-src]')) {
    try {
      const src = (JSON.parse(el.dataset.themeSrc ?? '{}') as Record<string, string>)[key];
      if (!src) continue;
      if (el instanceof HTMLImageElement) {
        el.src = src;
        continue;
      }
      // The theme is now explicit: keep only the portrait/wide width query.
      const m = /\(max-width:[^)]*\)/.exec(el.media);
      if (m) el.media = m[0];
      else el.removeAttribute('media');
      el.srcset = src;
    } catch {
      /* malformed attribute: leave the source alone */
    }
  }
}

export function applyTheme(t: Theme): void {
  root().dataset.theme = t;
  const bg = getComputedStyle(root()).getPropertyValue('--c-bg').trim();
  if (bg) for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) m.content = bg;
  swapPosters(t);
  document.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: t }));
}

export function setTheme(t: Theme): void {
  prefs.set('theme', t);
  applyTheme(t);
}

export function toggleTheme(): Theme {
  const t: Theme = currentTheme() === 'light' ? 'dark' : 'light';
  setTheme(t);
  return t;
}

/** Follow OS changes while the visitor has not chosen. Returns an unsubscribe. */
export function followSystem(): () => void {
  const mq = globalThis.matchMedia?.('(prefers-color-scheme: light)');
  if (!mq) return () => {};
  const on = () => {
    if (!prefs.get('theme')) applyTheme(systemTheme());
  };
  mq.addEventListener('change', on);
  return () => mq.removeEventListener('change', on);
}
