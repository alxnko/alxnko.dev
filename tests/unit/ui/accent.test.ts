// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { loadRgb, saveRgb } from '../../../src/ui/accent';
import { cssOf, PRESETS } from '../../../src/lib/rgb';

const ls = () => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]));
const vars = () => ['dark', 'light', 'fill', 'on'].map((k) => document.documentElement.style.getPropertyValue(`--rgb-${k}`));

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
});

describe('rgb preference', () => {
  it('defaults to green with nothing stored and nothing set on <html>', () => {
    expect(loadRgb()).toEqual({ rgb: 'green', accent: 'green' });
    saveRgb('green', 'green');
    expect(ls()).toEqual({});
    expect(vars()).toEqual(['', '', '', '']);
  });

  it('saves a colour: the spec, the accent and the palette the <head> script paints', () => {
    saveRgb('#ff00ff', '#ff00ff');
    const p = ls();
    expect(p['alxnko:rgb']).toBe('#ff00ff');
    expect(p['alxnko:rgb-accent']).toBe('#ff00ff');
    expect(p['alxnko:rgb-css']).toMatch(/^#ff00ff,#[0-9a-f]{6},#ff00ff,#[0-9a-f]{6}$/);
    expect(vars()[2]).toBe('#ff00ff');
    expect(loadRgb()).toEqual({ rgb: '#ff00ff', accent: '#ff00ff' });
  });

  it('off keeps the last accent, and green clears everything again', () => {
    saveRgb('off', 'cyan');
    expect(loadRgb()).toEqual({ rgb: 'off', accent: 'cyan' });
    expect(vars()).toEqual(cssOf(PRESETS.cyan).split(','));
    saveRgb('green', 'green');
    expect(ls()).toEqual({});
    expect(vars()).toEqual(['', '', '', '']);
  });

  it('migrates the old ring preference once', () => {
    localStorage.setItem('alxnko:ring', 'purple');
    expect(loadRgb()).toEqual({ rgb: 'purple', accent: 'purple' });
    expect(localStorage.getItem('alxnko:ring')).toBeNull();
    localStorage.setItem('alxnko:ring', 'off');
    expect(loadRgb()).toEqual({ rgb: 'off', accent: 'green' });
  });

  it('re-validates what storage holds (tampered or stale values fall back safely)', () => {
    for (const bad of ['javascript:alert(1)', '#12', 'x'.repeat(5000), '</style>', 'rgb(0,0,0)']) {
      localStorage.clear();
      localStorage.setItem('alxnko:rgb', bad);
      expect(loadRgb()).toEqual({ rgb: 'green', accent: 'green' });
    }
    localStorage.setItem('alxnko:rgb', 'off');
    localStorage.setItem('alxnko:rgb-accent', 'off');
    expect(loadRgb()).toEqual({ rgb: 'off', accent: 'green' });
    localStorage.setItem('alxnko:rgb-accent', 'url(x)');
    expect(loadRgb()).toEqual({ rgb: 'off', accent: 'green' });
    // a forged palette cache is rewritten from the validated spec on load
    localStorage.setItem('alxnko:rgb', 'cyan');
    localStorage.setItem('alxnko:rgb-css', '#000000,#000000,#000000,#000000');
    const { rgb, accent } = loadRgb();
    saveRgb(rgb, accent);
    expect(localStorage.getItem('alxnko:rgb-css')).toBe(cssOf(PRESETS.cyan));
  });
});
