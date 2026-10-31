import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// AdSense verification (owner, 2026-10-31): ownership meta tag + ads.txt only. No Google script may load
// before the consent work ships, so the layout must not reference adsbygoogle/googlesyndication.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('AdSense verification', () => {
  it('ads.txt authorises exactly our publisher id', () => {
    expect(read('../../public/ads.txt')).toBe('google.com, pub-6264955766359992, DIRECT, f08c47fec0942fa0\n');
  });
  it('the layout carries the ownership meta tag and no ad script', () => {
    const base = read('../../src/layouts/Base.astro');
    expect(base).toContain('<meta name="google-adsense-account" content="ca-pub-6264955766359992" />');
    expect(base).not.toMatch(/adsbygoogle|googlesyndication/);
  });
});
