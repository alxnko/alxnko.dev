import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// AdSense was declined (owner, 2026-11-26) and removed. The site shows no ads; guard against it creeping back in
// (the privacy copy says so on the sibling sites too).
const root = (p: string) => new URL(`../../${p}`, import.meta.url);

describe('no advertising', () => {
  it('ships no ads.txt', () => {
    expect(existsSync(root('public/ads.txt'))).toBe(false);
  });
  it('the layout has no AdSense meta tag or ad script', () => {
    const base = readFileSync(root('src/layouts/Base.astro'), 'utf8');
    expect(base).not.toMatch(/adsbygoogle|googlesyndication|google-adsense-account|pub-6264955766359992/);
  });
});
