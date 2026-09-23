// Span helpers. All terminal output is data (spans), never markup.
import { LINK_ALLOWLIST } from '../content/site';
import type { Color, Line, Span } from './types';

/** ANSI palette names, in swatch order (black, red, green, yellow, blue, magenta, cyan, white). */
export const PALETTE: readonly Color[] = ['dim', 'red', 'green', 'amber', 'blue', 'magenta', 'cyan', 'white'];

export const fg = (c: Color, text: string): Span => ({ text, fg: c });

export const b = (text: string, c?: Color): Span => (c ? { text, bold: true, fg: c } : { text, bold: true });

export const isAllowed = (href: string | undefined): href is string => !!href && LINK_ALLOWLIST.has(href);

/** A link span. `href` is set only for exact LINK_ALLOWLIST members; anything else is plain text. */
export const link = (text: string, href: string): Span =>
  isAllowed(href) ? { text, fg: 'green', href } : { text };

/** Plain text of a line. */
export const text = (line: Line): string => line.map((s) => s.text).join('');

/** Removes any href that is not allowlisted (returns the same array when nothing changes). */
export function sanitize(line: Line): Line {
  if (line.every((s) => s.href === undefined || isAllowed(s.href))) return line;
  return line.map((s) => {
    if (s.href === undefined || isAllowed(s.href)) return s;
    const { href: _drop, ...rest } = s;
    return rest;
  });
}

/** Splits text into spans, turning allowlisted URLs into links (like a terminal's URL detection). */
export function autolink(str: string): Line {
  const out: Line = [];
  let rest = str;
  for (;;) {
    let best = -1;
    let hit = '';
    for (const href of LINK_ALLOWLIST) {
      const at = rest.indexOf(href);
      if (at >= 0 && (best < 0 || at < best || (at === best && href.length > hit.length))) {
        best = at;
        hit = href;
      }
    }
    if (best < 0) break;
    if (best > 0) out.push({ text: rest.slice(0, best) });
    out.push(link(hit, hit));
    rest = rest.slice(best + hit.length);
  }
  if (rest || out.length === 0) out.push({ text: rest });
  return out;
}

/** Right-pads to width (by code points). */
export const pad = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - [...s].length));
