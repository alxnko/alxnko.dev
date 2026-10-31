import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import AdSlot from '../../src/components/AdSlot.astro';
import AdHead from '../../src/components/AdHead.astro';
import { AD_CLIENT, AD_UNITS, adMode, wantsPreview } from '../../src/lib/ads';

const css = readFileSync(new URL('../../src/styles/ads.css', import.meta.url), 'utf8');

describe('ad slot flag', () => {
  it('is off unless spelled exactly "preview"', () => {
    for (const v of [undefined, '', '0', '1', 'true', 'on', 'Preview', ' preview', 'live']) expect(adMode(v)).toBe('off');
    expect(adMode('preview')).toBe('preview');
  });

  it('off: the slot and the head part render nothing at all (no DOM, no CSS, no script)', async () => {
    const c = await AstroContainer.create();
    for (const mode of [undefined, '', 'nope']) {
      expect((await c.renderToString(AdSlot, { props: { id: 'x', placement: 'lite', unit: 'rect', mode } })).trim()).toBe('');
      expect((await c.renderToString(AdHead, { props: { mode } })).trim()).toBe('');
    }
  });

  it('the default comes from AD_SLOTS, which is unset in the test and CI environment', async () => {
    expect(process.env.AD_SLOTS).toBeUndefined();
    const c = await AstroContainer.create();
    expect((await c.renderToString(AdSlot, { props: { id: 'x', placement: 'hud', unit: 'leader' } })).trim()).toBe('');
    expect((await c.renderToString(AdHead, {})).trim()).toBe('');
  });

  it('preview: a labelled aside with the real unit ids and no Google script', async () => {
    const c = await AstroContainer.create();
    const html = await c.renderToString(AdSlot, { props: { id: 'ad-lite', placement: 'lite', unit: 'rect', mode: 'preview' } });
    expect(html).toMatch(/<aside id="ad-lite" class="ad ad-lite ad-300x250"[^>]*aria-labelledby="ad-lite-h"/);
    expect(html).toMatch(/<p class="ad-label" id="ad-lite-h"><span>sponsored<\/span>/);
    expect(html).toContain(`data-ad-client="${AD_CLIENT}"`);
    expect(html).toContain('data-ad-slot="5740008220"');
    expect(html).not.toMatch(/<script|style=/);
    const head = await c.renderToString(AdHead, { props: { mode: 'preview' } });
    expect(head).not.toMatch(/googlesyndication|adsbygoogle\.js|\.push\(/);
    expect(head).toMatch(/dataset\.ads=["']preview["']/);
  });

  it('a unit without an id yet renders no data-ad-slot', async () => {
    const c = await AstroContainer.create();
    const html = await c.renderToString(AdSlot, { props: { id: 'p', placement: 'hud', unit: 'banner', mode: 'preview' } });
    expect(html).not.toContain('data-ad-slot');
  });
});

describe('slot reservation', () => {
  it('the units are the fixed sizes and ids the owner created', () => {
    expect(AD_UNITS.rect).toEqual({ name: 'meow-rect', w: 300, h: 250, slot: '5740008220' });
    expect(AD_UNITS.leader).toEqual({ name: 'meow-leader', w: 728, h: 90, slot: '8242435529' });
    expect(AD_UNITS.banner).toMatchObject({ w: 320, h: 100 });
  });

  it('every unit class reserves exactly its creative size', () => {
    for (const u of Object.values(AD_UNITS)) {
      expect(css).toContain(`.ad-${u.w}x${u.h} { --ad-w: ${u.w}px; --ad-h: ${u.h}px; }`);
    }
    // the creative box is the variables, unscaled; the frame pads outside it (content-box)
    expect(css).toMatch(/\.ad-unit,\s*\.ad-sample \{\s*display: block;\s*width: var\(--ad-w\);\s*height: var\(--ad-h\);/);
    expect(css).toMatch(/\.ad-frame \{[^}]*box-sizing: content-box;/);
    // nothing may scale, tint, blur or clip the creative or its frame (moving the slot is fine)
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (!/\.ad-unit|\.ad-frame|\bins\b/.test(m[1])) continue;
      expect(m[2], m[1].trim()).not.toMatch(/transform|zoom|filter|opacity|clip|mask|mix-blend/);
    }
  });

  it('collapses by default and when Google reports no fill', () => {
    expect(css).toMatch(/^\.ad \{\s*display: none;\s*\}/m);
    expect(css).toMatch(/\.ad:has\(ins\[data-ad-status="unfilled"\]\) \{\s*display: none !important;/);
  });

  it('?adpreview=1 is matched exactly', () => {
    expect(wantsPreview('?adpreview=1')).toBe(true);
    expect(wantsPreview('?3d&adpreview=1')).toBe(true);
    expect(wantsPreview('?adpreview=1&lite')).toBe(true);
    for (const s of ['', '?adpreview', '?adpreview=0', '?adpreview=10', '?xadpreview=1']) expect(wantsPreview(s)).toBe(false);
  });
});
