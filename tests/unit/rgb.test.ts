import { describe, expect, it } from 'vitest';
import tokens from '../../design/tokens.json';
import { contrast as tokenContrast, gen } from '../../scripts/gen-tokens';
import { AA, contrast, cssOf, DARK_BGS, derive, LIGHT_BGS, palette, parseRgb, PRESET_NAMES, PRESETS, type Palette } from '../../src/lib/rgb';

const HEX6 = /^#[0-9a-f]{6}$/;
// the regex the <head> script (Base.astro) accepts from storage
const HEAD_CSS = /^#[0-9a-f]{6}(,#[0-9a-f]{6}){3}$/;

/** Every target a palette must meet, in both themes. */
function meetsTargets(p: Palette) {
  for (const bg of DARK_BGS) expect(contrast(p.dark, bg), `dark ${p.dark} on ${bg}`).toBeGreaterThanOrEqual(AA);
  for (const bg of LIGHT_BGS) expect(contrast(p.light, bg), `light ${p.light} on ${bg}`).toBeGreaterThanOrEqual(AA);
  expect(contrast(p.onFill, p.fill), `onFill ${p.onFill} on ${p.fill}`).toBeGreaterThanOrEqual(AA);
  for (const v of Object.values(p)) expect(v).toMatch(HEX6);
  expect(cssOf(p)).toMatch(HEAD_CSS);
}

describe('rgb palettes', () => {
  it('lists the ten presets, green (the brand default) first', () => {
    expect(PRESET_NAMES).toEqual(['green', 'purple', 'red', 'orange', 'amber', 'yellow', 'cyan', 'blue', 'pink', 'white']);
  });

  it('green is exactly the design tokens (so `rgb green` is the untouched default)', () => {
    const g = PRESETS.green;
    expect(g.dark).toBe(tokens.semantic.dark.accent);
    expect(g.dark).toBe(tokens.semantic.dark.focus);
    expect(g.light).toBe(tokens.semantic.light.accent);
    expect(g.light).toBe(tokens.semantic.light.focus);
    expect(g.fill).toBe(tokens.semantic.dark.accentFill);
    expect(g.fill).toBe(tokens.semantic.light.accentFill);
    expect(g.onFill).toBe(tokens.semantic.dark.onAccent);
    expect(g.dark).toBe(tokens.ansi.green);
    expect(g.tint).toBe(tokens.primitive.scene.cat); // the cat keeps its colour
  });

  for (const name of PRESET_NAMES) {
    it(`preset ${name} meets every contrast target in both themes`, () => meetsTargets(PRESETS[name]));
  }

  it('200 random hexes derive palettes that meet every target', () => {
    let seed = 20260924;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const hexes = ['#000000', '#ffffff', '#808080', '#777777', '#0000ff', '#ff0000', '#ffff00', '#010101', '#fefefe'];
    while (hexes.length < 209) hexes.push('#' + Math.floor(rand() * 0x1000000).toString(16).padStart(6, '0'));
    for (const h of hexes) {
      const p = derive(h);
      expect(p.fill).toBe(h);
      meetsTargets(p);
    }
  });

  it('pure magenta: the day-theme shade the e2e no-flash test expects', () => {
    expect(derive('#ff00ff').light).toBe('#ac00ac');
  });

  it('keeps the hue: a derived text shade is the colour itself when that already passes', () => {
    expect(derive('#ff00ff').dark).toBe('#ff00ff');
    expect(derive('#22e5ff').dark).toBe('#22e5ff');
    // too dark for night text: lightened, same hue family (blue stays blue)
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(derive('#0000ff').dark.slice(i, i + 2), 16));
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });

  it('uses the same WCAG formula as the token generator', () => {
    for (const [a, b] of [['#00ff82', '#0a0a0b'], ['#0a6e3c', '#e9e8e4'], ['#777777', '#ffffff']])
      expect(contrast(a, b)).toBeCloseTo(tokenContrast(a, b), 10);
  });
});

describe('parseRgb', () => {
  it('accepts presets, off, #rgb and #rrggbb, normalised', () => {
    expect(parseRgb('green')).toBe('green');
    expect(parseRgb(' Cyan ')).toBe('cyan');
    expect(parseRgb('OFF')).toBe('off');
    expect(parseRgb('#F0a')).toBe('#ff00aa');
    expect(parseRgb('#ABCDEF')).toBe('#abcdef');
    expect(parseRgb('#00ff82')).toBe('green'); // a preset's own fill is the preset
    expect(parseRgb('#b061ff')).toBe('purple');
  });

  it('rejects everything else', () => {
    for (const bad of [null, undefined, 42, {}, '', ' ', 'on', 'grey', 'javascript:', '#12', '#1234', '#12345', '#1234567', '#ff00ff00',
      '#gggggg', 'ff00ff', 'rgb(1,2,3)', 'hsl(1 2% 3%)', 'red;', '#fff;', '# fff', 'x'.repeat(10_000), '#fff\u0000', 'url(a)', 'аqua'])
      expect(parseRgb(bad), JSON.stringify(bad)?.slice(0, 20)).toBeNull();
  });

  it('palette() returns the hand-tuned preset, else the derived one', () => {
    expect(palette('cyan')).toBe(PRESETS.cyan);
    expect(palette('#123456')).toEqual(derive('#123456'));
  });
});

describe('accent tokens', () => {
  const css = gen(tokens);
  it('read the --rgb-* properties, falling back to the token itself', () => {
    expect(css).toContain('--c-accent: var(--rgb-dark, #00ff82);');
    expect(css).toContain('--c-accent: var(--rgb-light, #0a6e3c);');
    expect(css).toContain('--c-accent-fill: var(--rgb-fill, #00ff82);');
    expect(css).toContain('--c-on-accent: var(--rgb-on, #06170d);');
    expect(css).toContain('--c-focus: var(--rgb-dark, #00ff82);');
    expect(css).toContain('--c-focus: var(--rgb-light, #0a6e3c);');
    expect(css).toContain('--ansi-accent: var(--rgb-dark, #00ff82);');
    expect(css).toContain('--ansi-green: #00ff82;'); // the ANSI green itself never moves
    expect(css).not.toMatch(/--c-(bg|fg|warn|danger|ok|info)[^;]*var\(/);
  });
});
