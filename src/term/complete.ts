// Tab completion: command names, then paths (cwd-relative), then per-command args.
import type { Registry } from './registry';
import { lookup, resolve, type VNode } from './vfs';

export interface Completion {
  /** [start, end) of the text to replace (the word under the cursor, up to the cursor). */
  replace: [number, number];
  /** What to show when there are several (basenames for paths, dirs end in `/`). */
  candidates: string[];
  /** Text to put in `replace`: the whole candidate (+ ' ' or '/') when unique, else the longest common prefix if it extends the word. */
  insert: string | null;
}

const SEP = /[\s|;&]/;

/** Full-word path candidates for `word` (dirs end in `/`). Dotfiles only when the basename starts with `.`. */
export function completePath(word: string, cwd: string, fs: VNode, dirsOnly = false): string[] {
  const slash = word.lastIndexOf('/');
  const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
  const base = slash >= 0 ? word.slice(slash + 1) : word;
  const dirAbs = dirPart ? resolve(cwd, dirPart) : cwd;
  const dir = lookup(fs, dirAbs);
  if (!dir || dir.kind !== 'dir') return [];
  return (dir.children ?? [])
    .filter((c) => c.name.startsWith(base) && (!c.hidden && !c.name.startsWith('.') ? true : base.startsWith('.')))
    .filter((c) => !dirsOnly || c.kind === 'dir')
    .map((c) => dirPart + c.name + (c.kind === 'dir' ? '/' : ''))
    .sort();
}

function lcp(xs: string[]): string {
  let p = xs[0] ?? '';
  for (const x of xs) while (!x.startsWith(p)) p = p.slice(0, -1);
  return p;
}

const display = (c: string): string => {
  const trail = c.endsWith('/') ? '/' : '';
  const body = trail ? c.slice(0, -1) : c;
  return body.slice(body.lastIndexOf('/') + 1) + trail;
};

export function complete(line: string, cursor: number, cwd: string, reg: Registry, fs: VNode): Completion {
  const before = line.slice(0, cursor);
  let start = before.length;
  while (start > 0 && !SEP.test(before[start - 1])) start--;
  const word = before.slice(start);

  // Words of the current simple command, before the cursor.
  let segStart = start;
  while (segStart > 0 && !/[|;&]/.test(before[segStart - 1])) segStart--;
  const prior = before.slice(segStart, start).trim().split(/\s+/).filter(Boolean);

  let full: string[];
  if (prior.length === 0 && !word.includes('/')) {
    full = reg.names().filter((n) => n.startsWith(word));
  } else {
    const cmd = prior.length ? reg.get(prior[0]) : undefined;
    const own = cmd?.complete ? cmd.complete([...prior.slice(1), word], cwd).filter((c) => c.startsWith(word)) : null;
    full = own ?? completePath(word, cwd, fs);
  }
  full = [...new Set(full)];

  let insert: string | null = null;
  if (full.length === 1) insert = full[0] + (full[0].endsWith('/') ? '' : ' ');
  else if (full.length > 1) {
    const p = lcp(full);
    if (p.length > word.length) insert = p;
  }
  return { replace: [start, cursor], candidates: full.map(display), insert };
}
