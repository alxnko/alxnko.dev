// Build-time reader for the baked desk posters (spec §3.2). The scene pipeline writes
// public/scene/manifest.json; until it exists (or if it is malformed) the page renders no
// poster at all, never a broken <img>.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type PosterTheme = 'day' | 'night';
export interface PosterSet {
  /** 1600×1000 landscape. */
  wide: { avif: string; webp: string };
  /** 800×1000 portrait crop for phones. */
  tall: { avif: string; webp: string };
}
export type Posters = Record<PosterTheme, PosterSet>;

const SAFE = /^[\w.-]+\.(avif|webp)$/;

export function readPosters(root = process.cwd()): Posters | null {
  const dir = join(root, 'public', 'scene');
  let m: unknown;
  try {
    m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  } catch {
    return null;
  }
  const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined);
  const src = obj(obj(obj(m)?.files)?.poster) ?? obj(obj(m)?.poster);
  if (!src) return null;
  const file = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const name = v.replace(/^\/?scene\//, '');
    return SAFE.test(name) && existsSync(join(dir, name)) ? `/scene/${name}` : null;
  };
  const pair = (v: unknown) => {
    const p = obj(v);
    const avif = file(p?.avif);
    const webp = file(p?.webp);
    return avif && webp ? { avif, webp } : null;
  };
  const out: Partial<Posters> = {};
  for (const t of ['day', 'night'] as const) {
    const th = obj(src[t]);
    const wide = pair(th?.['1600']);
    const tall = pair(th?.['800']);
    if (!wide || !tall) return null;
    out[t] = { wide, tall };
  }
  return out as Posters;
}
