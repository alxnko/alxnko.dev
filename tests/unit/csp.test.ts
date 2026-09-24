import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCsp, inlineBlocks, run, styleAttrs } from '../../scripts/postbuild-csp';

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

  it('requires Trusted Types for every script sink, with no policy allowed (R78)', () => {
    expect(csp).toContain("require-trusted-types-for 'script'");
    expect(csp).toContain("trusted-types 'none'");
    expect(buildCsp([html], { trustedTypes: false })).not.toMatch(/trusted-types/);
  });

  it('ships Trusted Types report-only by default; CSP_TT=enforce enforces them (R83)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'csp-'));
    try {
      const put = () => {
        writeFileSync(join(dir, 'index.html'), html);
        writeFileSync(join(dir, '_headers'), '/*\n  Content-Security-Policy: __CSP__\n');
      };
      put();
      const enforced = run(dir, 'enforce');
      expect(readFileSync(join(dir, '_headers'), 'utf8')).not.toContain('Report-Only');
      put();
      const staged = run(dir);
      const h = readFileSync(join(dir, '_headers'), 'utf8');
      expect(staged).toBe(buildCsp([html], { trustedTypes: false }));
      expect(enforced).toBe(csp);
      expect(h).toContain("Content-Security-Policy-Report-Only: require-trusted-types-for 'script'; trusted-types 'none'");
    } finally {
      rmSync(dir, { recursive: true, force: true });
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
    expect(h).toMatch(/\/scene\/\*\.glb\n\s+Cache-Control: public, max-age=31536000, immutable/);
    expect(h).toMatch(/\/scene\/manifest\.json\n\s+Cache-Control: public, max-age=0, must-revalidate/);
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
