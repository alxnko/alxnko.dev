// Test-only: serve dist/ the way Cloudflare Pages would for our purposes, applying the
// headers from dist/_headers (so the generated CSP is enforced). `astro preview` does not.
// Usage: bun scripts/serve-dist.ts [port]
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;
const port = Number(process.argv[2] ?? 4322);

type Rule = { re: RegExp; headers: [string, string][] };

export function parseHeaders(src: string): Rule[] {
  const rules: Rule[] = [];
  let cur: Rule | null = null;
  for (const raw of src.split('\n')) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      const pat = raw.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      cur = { re: new RegExp(`^${pat}$`), headers: [] };
      rules.push(cur);
    } else if (cur) {
      const i = raw.indexOf(':');
      cur.headers.push([raw.slice(0, i).trim(), raw.slice(i + 1).trim()]);
    }
  }
  return rules;
}

const rules = parseHeaders(readFileSync(join(DIST, '_headers'), 'utf8'));

function resolve(pathname: string): { file: string; status: number } {
  const p = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  for (const cand of [p, join(p, 'index.html'), `${p}.html`]) {
    const f = join(DIST, cand);
    if (f.startsWith(DIST) && existsSync(f) && statSync(f).isFile()) return { file: f, status: 200 };
  }
  return { file: join(DIST, '404.html'), status: 404 };
}

Bun.serve({
  port,
  fetch(req) {
    const { pathname } = new URL(req.url);
    const { file, status } = resolve(pathname);
    const headers = new Headers();
    for (const r of rules) {
      if (r.re.test(pathname)) for (const [k, v] of r.headers) headers.set(k, v);
    }
    const body = Bun.file(file);
    headers.set('Content-Type', body.type);
    return new Response(body, { status, headers });
  },
});
console.log(`serving dist/ with _headers on http://localhost:${port}`);
