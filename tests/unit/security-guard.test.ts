import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const SRC = new URL('../../src', import.meta.url).pathname;
const files = walk(SRC).filter((f) => /\.(ts|astro|js|mjs)$/.test(f));

describe('security guard', () => {
  it('scans source files', () => expect(files.length).toBeGreaterThan(0));

  it('never uses HTML-injection or eval sinks', () => {
    const bad = /\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|document\.write|\beval\(|new Function\(/;
    const hits = files.filter((f) => bad.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('has no inline style attributes in markup (CSP forbids unsafe-inline)', () => {
    const hits = files.filter((f) => f.endsWith('.astro') && /\sstyle=["{]/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('never names the upstream distro', () => {
    const hits = files.filter((f) => /\barch\s?linux\b|archlinux/i.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
