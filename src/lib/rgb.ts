// `rgb`: the site-wide accent (R86). One colour drives the UI accent tokens, the terminal's
// accent, the desk's RGB (ring light, wall glow, fan ring, keyboard backlights, the server's
// status LED) and the tint of the baked accent parts (accent keycaps, paddle legends, the cat).
// Presets are hand-tuned (design/rgb.json); any other #hex gets a palette derived in
// OKLCH that meets the same contrast targets. Pure: no DOM here, so it is unit-tested.
import TABLE from '../../design/rgb.json';

export interface Palette {
  /** Bright: glows, the ring, fills behind text (selection, skip link). */
  fill: string;
  /** Accent text on the dark theme and the terminal (>= 4.5:1 on every dark background). */
  dark: string;
  /** Accent text on the day theme's paper (>= 4.5:1 on bg and surface). */
  light: string;
  /** Text on `fill` (>= 4.5:1). */
  onFill: string;
  /** Base colour of the neutral-baked accent parts (the atlas is multiplied by it). */
  tint: string;
}

export type Preset = keyof typeof TABLE;
/**
 * design/rgb.json, in the order `rgb` lists them. Every preset is checked by
 * tests/unit/rgb.test.ts against the targets above (dark: DARK_BGS, light: LIGHT_BGS, onFill).
 */
export const PRESETS = TABLE as Record<Preset, Palette>;
export const PRESET_NAMES = Object.keys(PRESETS) as Preset[];
export const DEFAULT_RGB: Preset = 'green';

/** The backgrounds accent text sits on (tokens: bg, surface; the terminal's screen). */
export const DARK_BGS = ['#0a0a0b', '#151517', '#050506'] as const;
export const LIGHT_BGS = ['#e9e8e4', '#dfded9'] as const;
export const AA = 4.5;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/;

/**
 * Normalises what a visitor typed (or what storage holds) into a spec: a preset name, `off`,
 * or `#rrggbb` (lower case; a hex equal to a preset's fill is that preset). Anything else:
 * null. Strict: no names beyond the presets, no rgb()/hsl(), no whitespace inside.
 */
export function parseRgb(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 64) return null;
  const s = input.trim().toLowerCase();
  if (s.length > 7) return null;
  if (s === 'off' || s in PRESETS) return s;
  if (!HEX.test(s)) return null;
  const hex = s.length === 4 ? '#' + [...s.slice(1)].map((c) => c + c).join('') : s;
  return PRESET_NAMES.find((n) => PRESETS[n].fill === hex) ?? hex;
}

/** The palette for a non-off spec (a preset, or derived from the hex). */
export function palette(spec: string): Palette {
  return spec in PRESETS ? PRESETS[spec as Preset] : derive(spec);
}

/** Compact form for the <head> script (Base.astro): `dark,light,fill,onFill`. */
export const cssOf = (p: Palette): string => [p.dark, p.light, p.fill, p.onFill].join(',');

// ---------------------------------------------------------------- colour math

type RGB = [number, number, number];
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export const hexToRgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
const rgbToHex = (c: RGB) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');

/** Linear-light sRGB of a #rrggbb colour (what a shader multiplies by). */
export const linear = (h: string): RGB => hexToRgb(h).map(toLin) as RGB;

/** WCAG 2.x relative luminance and contrast (the same formula as scripts/gen-tokens.ts). */
function lum(h: string): number {
  const [r, g, b] = hexToRgb(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const passes = (fg: string, bgs: readonly string[]) => bgs.every((bg) => contrast(fg, bg) >= AA);

// OKLab (Björn Ottosson) on linear sRGB; OKLCH is its polar form
function toOklch(h: string): RGB {
  const [r, g, b] = linear(h);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

/** Linear sRGB of an OKLCH colour (may be out of gamut). */
function fromOklch(L: number, C: number, H: number): RGB {
  const A = C * Math.cos(H), B = C * Math.sin(H);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (c: RGB) => c.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** #rrggbb at lightness L and hue H, with the chroma clamped (binary search) into sRGB. */
function lch(L: number, C: number, H: number): string {
  let lo = 0, hi = C;
  if (!inGamut(fromOklch(L, hi, H))) {
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(fromOklch(L, mid, H))) lo = mid;
      else hi = mid;
    }
    hi = lo;
  }
  return rgbToHex(fromOklch(L, hi, H).map(toGamma) as RGB);
}

/** Steps lightness from L (keeping hue, clamping chroma) until the text passes on `bgs`. */
function text(L: number, C: number, H: number, bgs: readonly string[], dir: 1 | -1): string {
  for (let l = L; l >= 0 && l <= 1; l += dir * 0.01) {
    const hex = lch(l, C, H);
    if (passes(hex, bgs)) return hex;
  }
  return dir > 0 ? '#ffffff' : '#000000';
}

/** A full palette for any #rrggbb: fill is the colour itself, the rest meets every target. */
export function derive(fill: string): Palette {
  const [L, C, H] = toOklch(fill);
  const dark = text(L, C, H, DARK_BGS, 1);
  const light = text(L, C, H, LIGHT_BGS, -1);
  // text on the fill: a near-black or near-white of the same hue, else plain black / white
  const best = (cands: string[]) => cands.reduce((a, b) => (contrast(b, fill) > contrast(a, fill) ? b : a));
  let onFill = best([lch(0.2, Math.min(C, 0.04), H), lch(0.98, Math.min(C, 0.02), H)]);
  if (contrast(onFill, fill) < AA) onFill = best(['#000000', '#ffffff']);
  // the baked parts: a deeper, calmer shade of the fill, like the presets' hand-tuned tints
  // (their lightness is 0.7-0.9 of the fill's, their chroma 0.6-0.95)
  const tint = lch(Math.min(0.78, Math.max(0.35, L * 0.8)), C * 0.8, H);
  return { fill, dark, light, onFill, tint };
}
