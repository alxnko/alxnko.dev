// Postbuild: hash every inline <script>/<style> in dist/**/*.{html,svg} and write the strict
// CSP (spec §7.3) into dist/_headers in place of the `__CSP__` placeholder.
// No 'unsafe-inline', no third-party origin. 'wasm-unsafe-eval' is only for the meshopt decoder.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sha = (s: string) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

/** Inline (no src) script bodies and style bodies, exactly as the browser hashes them. */
export function inlineBlocks(html: string): { scripts: string[]; styles: string[] } {
  const scripts: string[] = [];
  const styles: string[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\ssrc\s*=/i.test(m[1])) continue;
    if (m[2] === '') continue;
    scripts.push(m[2]);
  }
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) styles.push(m[1]);
  return { scripts, styles };
}

/** Count of `style="…"` attributes: hashes cannot allow those, so the build must not emit any. */
export function styleAttrs(html: string): number {
  return (html.match(/<[a-z][^>]*\sstyle\s*=/gi) ?? []).length;
}

export function buildCsp(htmls: string[]): string {
  const s = new Set<string>();
  const st = new Set<string>();
  for (const h of htmls) {
    const b = inlineBlocks(h);
    b.scripts.forEach((x) => s.add(sha(x)));
    b.styles.forEach((x) => st.add(sha(x)));
  }
  const list = (set: Set<string>) => [...set].sort().map((x) => ' ' + x).join('');
  return [
    "default-src 'none'",
    `script-src 'self' 'wasm-unsafe-eval'${list(s)}`,
    `style-src 'self'${list(st)}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function run(dist: string): string {
  const files = walk(dist).filter((f) => /\.(html|svg)$/.test(f));
  const docs = files.map((f) => readFileSync(f, 'utf8'));
  const withAttrs = files.filter((_, i) => files[i].endsWith('.html') && styleAttrs(docs[i]) > 0);
  if (withAttrs.length) throw new Error(`style="" attributes are blocked by the CSP: ${withAttrs.join(', ')}`);
  const csp = buildCsp(docs);
  const headersPath = join(dist, '_headers');
  const headers = readFileSync(headersPath, 'utf8');
  const slot = 'Content-Security-Policy: __CSP__';
  if (headers.split(slot).length !== 2) throw new Error(`dist/_headers needs exactly one "${slot}" line`);
  writeFileSync(headersPath, headers.replace(slot, `Content-Security-Policy: ${csp}`));
  return csp;
}

if (import.meta.main) {
  const dist = new URL('../dist', import.meta.url).pathname;
  const csp = run(dist);
  console.log(`csp: ${csp.length} chars, ${(csp.match(/sha256-/g) ?? []).length} hashes → dist/_headers`);
}
