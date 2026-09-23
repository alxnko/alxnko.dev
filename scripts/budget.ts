// Enforces spec §7.4 byte budgets on the built site (gzip level 9, like the CDN).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = resolve(import.meta.dir, '../dist');
const gz = (p: string) => gzipSync(readFileSync(p), { level: 9 }).length;
const kb = (n: number) => (n / 1024).toFixed(1) + ' KB';

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const attr = (re: RegExp) => [...html.matchAll(re)].map((m) => m[1]);
const entryJs = attr(/<script[^>]+type="module"[^>]+src="([^"]+)"/g);
const css = attr(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g);
const inlineJs = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('');
const inlineCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('');

/** Static import graph (dynamic import() is excluded: that's the lazy scene). */
function staticClosure(files: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = files.map((f) => join(DIST, f));
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f) || !existsSync(f)) continue;
    seen.add(f);
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?["'](\.{1,2}\/[^"']+\.js)["']/g)) {
      stack.push(resolve(dirname(f), m[1]));
    }
  }
  return seen;
}

const initial = staticClosure(entryJs);
const initialJs = [...initial].reduce((n, f) => n + gz(f), 0) + gzipSync(inlineJs).length;
const cssBytes = css.reduce((n, f) => n + gz(join(DIST, f)), 0) + gzipSync(inlineCss).length;
const astroDir = join(DIST, '_astro');
const allJs = readdirSync(astroDir).filter((f) => f.endsWith('.js')).map((f) => join(astroDir, f));
const lazyJs = allJs.filter((f) => !initial.has(f)).reduce((n, f) => n + gz(f), 0);
const fonts = readdirSync(astroDir).filter((f) => f.endsWith('.woff2')).reduce((n, f) => n + statSync(join(astroDir, f)).size, 0);

const sceneDir = join(DIST, 'scene');
const sceneFiles = existsSync(sceneDir) ? readdirSync(sceneDir) : [];
const size = (re: RegExp) => Math.max(0, ...sceneFiles.filter((f) => re.test(f)).map((f) => statSync(join(sceneDir, f)).size));

const checks: [string, number, number][] = [
  ['initial JS (gz)', initialJs, 30 * 1024],
  ['CSS (gz)', cssBytes, 10 * 1024],
  ['fonts (woff2 total)', fonts, 60 * 1024],
  ['lazy 3D JS (gz)', lazyJs, 170 * 1024],
  ['desk.glb', size(/^desk\..*\.glb$/), 250 * 1024],
  ['atlas 1024 (max)', size(/^atlas-.*-1024\..*\.webp$/), 120 * 1024],
  ['atlas 2048 (max)', size(/^atlas-.*-2048\..*\.webp$/), 450 * 1024],
  ['poster 800 avif (max)', size(/^poster-.*-800\..*\.avif$/), 45 * 1024],
  ['poster 1600 avif (max)', size(/^poster-.*-1600\..*\.avif$/), 90 * 1024],
];

let fail = false;
for (const [name, val, max] of checks) {
  const ok = val <= max;
  if (!ok) fail = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(24)} ${kb(val).padStart(10)}  (budget ${kb(max)})`);
}
if (fail) process.exit(1);
