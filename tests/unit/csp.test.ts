import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildCsp, inlineBlocks, styleAttrs } from '../../scripts/postbuild-csp';

const sha = (s: string) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
const directive = (csp: string, name: string) =>
  csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' ')) ?? '';

describe('postbuild CSP', () => {
  const html = `<!doctype html><html><head>
    <script>a()</script>
    <script type="module" src="/_astro/x.js"></script>
    <style>b{}</style>
    <style media="print">c{}</style>
    <script type="application/ld+json">{"@type":"Person"}</script>
  </head><body><p>a</p><script is:inline>d()</script></body></html>`;
  const csp = buildCsp([html]);

  it('hashes every inline script and style, not external ones', () => {
    expect(directive(csp, 'script-src')).toContain(sha('a()'));
    expect(directive(csp, 'script-src')).toContain(sha('d()'));
    expect(directive(csp, 'style-src')).toContain(sha('b{}'));
    expect(directive(csp, 'style-src')).toContain(sha('c{}'));
    expect(inlineBlocks(html).scripts).not.toContain('');
  });

  it('never allows unsafe-inline, schemes or third-party origins', () => {
    expect(csp).not.toMatch(/unsafe-inline|'unsafe-eval'|https:|http:|googleapis|gstatic|\*/);
  });

  it('matches the spec §7.3 policy shape', () => {
    expect(csp.startsWith("default-src 'none';")).toBe(true);
    expect(directive(csp, 'script-src')).toMatch(/^script-src 'self' 'wasm-unsafe-eval'( 'sha256-[A-Za-z0-9+/=]+')+$/);
    expect(directive(csp, 'img-src')).toBe("img-src 'self' data: blob:");
    expect(directive(csp, 'font-src')).toBe("font-src 'self'");
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self'");
    expect(directive(csp, 'manifest-src')).toBe("manifest-src 'self'");
    expect(directive(csp, 'worker-src')).toBe("worker-src 'self' blob:");
    for (const d of ["base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'", 'upgrade-insecure-requests']) {
      expect(csp).toContain(d);
    }
  });

  it('deduplicates hashes and is deterministic', () => {
    const twice = buildCsp([html, html]);
    expect(twice).toBe(csp);
    expect(buildCsp([html]).split(sha('a()')).length).toBe(2);
  });

  it('finds style attributes (which hashes cannot allow)', () => {
    expect(styleAttrs('<p style="color:red">x</p>')).toBe(1);
    expect(styleAttrs('<p data-style="x">x</p><style>p{}</style>')).toBe(0);
  });

  it('public/_headers carries the placeholder and the hardened headers', () => {
    const h = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
    expect(h).toContain('Content-Security-Policy: __CSP__');
    expect(h).not.toMatch(/unsafe-inline|googleapis|gstatic/);
    expect(h).toMatch(/Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\)/);
    expect(h).toContain('Cross-Origin-Opener-Policy: same-origin');
    expect(h).toContain('Cross-Origin-Resource-Policy: same-origin');
    expect(h).toMatch(/\/scene\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
    expect(h).toMatch(/\/404\.html\n\s+Cache-Control: public, max-age=0/);
  });

  it('security.txt is valid: no dead Policy link, Expires within a year', () => {
    const t = readFileSync(new URL('../../public/.well-known/security.txt', import.meta.url), 'utf8');
    expect(t).not.toMatch(/^Policy:/m);
    const exp = new Date(/^Expires: (.+)$/m.exec(t)![1]);
    expect(exp.getTime()).toBeGreaterThan(Date.parse('2026-09-23'));
    expect(exp.getTime()).toBeLessThanOrEqual(Date.parse('2027-09-23T23:59:59Z'));
  });
});
