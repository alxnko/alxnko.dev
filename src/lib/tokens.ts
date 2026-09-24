import tokens from '../../design/tokens.json';
import type { Color, Theme } from '../term/types';

export const TOKENS = tokens;

export type SemanticName = keyof typeof tokens.semantic.dark;

export const sem = (theme: Theme, name: SemanticName): string =>
  tokens.semantic[theme === 'light' ? 'light' : 'dark'][name];

const ANSI: Record<Color, string> = {
  fg: tokens.ansi.fg,
  muted: tokens.ansi.muted,
  dim: tokens.ansi.dim,
  white: tokens.ansi.white,
  green: tokens.ansi.green,
  amber: tokens.ansi.amber,
  red: tokens.ansi.red,
  blue: tokens.ansi.blue,
  magenta: tokens.ansi.magenta,
  cyan: tokens.ansi.cyan,
  accent: tokens.ansi.green,
};

/** The terminal's accent follows `rgb` (its dark-theme shade: the screens are always dark). */
export const setAnsiAccent = (hex: string): void => {
  ANSI.accent = hex;
};

/** Terminal palette (screens are always dark). */
export const ansi = (c: Color | undefined): string => ANSI[c ?? 'fg'];
export const TERM_BG = tokens.ansi.bg;
