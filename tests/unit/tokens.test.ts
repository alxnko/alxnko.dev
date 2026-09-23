import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import tokens from '../../design/tokens.json';
import { contrast, gen } from '../../scripts/gen-tokens';

describe('design tokens', () => {
  const css = gen(tokens);

  it('emits both themes and a system-light fallback', () => {
    expect(css).toMatch(/:root \{[\s\S]*--c-bg: #0a0a0b;/);
    expect(css).toMatch(/:root\[data-theme="light"\] \{[\s\S]*--c-bg: #e9e8e4;/);
    expect(css).toContain('@media (prefers-color-scheme: light)');
    expect(css).toContain(':root:not([data-theme="dark"])');
  });

  for (const theme of ['dark', 'light'] as const) {
    const s = tokens.semantic[theme];
    for (const name of ['fg', 'fgMuted', 'fgSubtle', 'accent', 'warn', 'danger'] as const) {
      it(`${theme}: ${name} on bg and surface is AA (>= 4.5)`, () => {
        expect(contrast(s[name], s.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(s[name], s.surface)).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`${theme}: onAccent on accentFill is AA`, () => {
      expect(contrast(s.onAccent, s.accentFill)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${theme}: strong line is visible (>= 1.8) against bg`, () => {
      expect(contrast(s.lineStrong, s.bg)).toBeGreaterThanOrEqual(1.8);
    });
  }

  for (const name of ['fg', 'muted', 'dim', 'white', 'green', 'amber', 'red', 'blue', 'magenta', 'cyan'] as const) {
    it(`terminal ansi ${name} is AA on the screen background`, () => {
      expect(contrast(tokens.ansi[name], tokens.ansi.bg)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('committed tokens.css matches generator (no drift)', () => {
    const committed = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
    expect(committed).toBe(css);
  });

  it('contrast() is the WCAG formula', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});
