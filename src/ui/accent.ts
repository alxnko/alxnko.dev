// The page side of `rgb` (R86): the stored choice, re-validated on load, and the accent's
// custom properties on <html>. The <head> script in Base.astro applies the cached palette
// before the first paint; this module takes over from there.
import * as prefs from '../lib/prefs';
import { cssOf, DEFAULT_RGB, palette, parseRgb } from '../lib/rgb';
/**
 * `rgb` from storage, re-validated (R86): `rgb` (a preset, #rrggbb or off) and, only while
 * it is off, `rgb-accent` (the colour to come back to; an older build also stored it for a
 * colour: ignored then, since `rgb` itself is the accent). A visitor from before `rgb` has `ring` (green,
 * purple or off): it is read once, moved to `rgb` and dropped.
 */
export function loadRgb(): { rgb: string; accent: string } {
  let rgb = parseRgb(prefs.get('rgb'));
  const old = prefs.get('ring');
  if (old !== null) {
    rgb ??= parseRgb(old);
    prefs.del('ring');
  }
  rgb ??= DEFAULT_RGB;
  let accent = rgb;
  if (rgb === 'off') {
    const a = parseRgb(prefs.get('rgb-accent'));
    accent = a && a !== 'off' ? a : DEFAULT_RGB;
  }
  return { rgb, accent };
}

export const RGB_VARS = ['dark', 'light', 'fill', 'on'];
/**
 * The page's accent: the --rgb-* properties the tokens read (none for the default green, so
 * every token is exactly its own value), set through the CSSOM (allowed by the strict CSP),
 * and the same palette cached for the <head> script, so the next visit paints it at once.
 */
export function saveRgb(rgb: string, accent: string): void {
  const root = document.documentElement.style;
  const css = accent === DEFAULT_RGB ? null : cssOf(palette(accent));
  RGB_VARS.forEach((k, i) => (css ? root.setProperty(`--rgb-${k}`, css.split(',')[i]) : root.removeProperty(`--rgb-${k}`)));
  for (const [k, v] of [['rgb', rgb === DEFAULT_RGB ? null : rgb], ['rgb-accent', rgb === 'off' && css ? accent : null], ['rgb-css', css]] as const) {
    if (v) prefs.set(k, v);
    else prefs.del(k);
  }
}

