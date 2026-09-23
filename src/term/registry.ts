// Command registry, did-you-mean, and the environment command factories close over.
import type { TermStore } from './store';
import type { VNode } from './vfs';
import { ExitError, type Command, type CommandCtx, type WorldPort } from './types';

export class Registry {
  private map = new Map<string, Command>();

  constructor(cmds: Command[] = []) {
    this.add(...cmds);
  }

  add(...cmds: Command[]): this {
    for (const c of cmds) this.map.set(c.name, c);
    return this;
  }

  get(name: string): Command | undefined {
    return this.map.get(name);
  }

  /** Sorted by name. Hidden commands only when `all`. */
  list(all = false): Command[] {
    return [...this.map.values()].filter((c) => all || !c.hidden).sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  names(all = false): string[] {
    return this.list(all).map((c) => c.name);
  }
}

/** Optimal string alignment (restricted Damerau-Levenshtein) distance. */
export function damerau(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array<number>(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/**
 * Closest name within Damerau distance 2 (1 for names of 4 chars or fewer, so short typos
 * like `foo` don't get silly suggestions). Ties go to the earlier name.
 */
export function didYouMean(name: string, names: string[]): string | null {
  if (!name || name.length > 32) return null;
  const max = name.length <= 4 ? 1 : 2;
  let best: string | null = null;
  let bestD = max + 1;
  for (const n of names) {
    const d = damerau(name, n);
    if (d > 0 && d < bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

/** What command factories close over (things CommandCtx doesn't carry). */
export interface ShellEnv {
  readonly store: TermStore;
  readonly world: WorldPort;
  readonly fs: VNode;
  readonly registry: Registry;
  /** Opens an allowlisted URL (window.open in the browser; injectable for tests). */
  opener(url: string): void;
  now(): number;
  random(): number;
  /** When the session started (page load), ms. */
  readonly bootTime: number;
  /** True when the running stage writes to the terminal, false inside a pipe. */
  tty: boolean;
  oldpwd: string | null;
}

/** Prints to stderr and exits with `code`. */
export function fail(ctx: CommandCtx, msg: string, code = 1): never {
  ctx.err(msg);
  throw new ExitError(code);
}

export interface Flags {
  short: Set<string>;
  long: Set<string>;
  rest: string[];
}

/** Splits short (`-la`) and long (`--x`) flags from operands; `--` ends flags. Fails on unknown shorts. */
export function flags(ctx: CommandCtx, cmd: string, allowed: string, args = ctx.args): Flags {
  const f: Flags = { short: new Set(), long: new Set(), rest: [] };
  let done = false;
  for (const a of args) {
    if (done || a === '-' || !a.startsWith('-')) f.rest.push(a);
    else if (a === '--') done = true;
    else if (a.startsWith('--')) f.long.add(a.slice(2));
    else
      for (const ch of a.slice(1)) {
        if (!allowed.includes(ch)) fail(ctx, `${cmd}: invalid option -- '${ch}'`, 2);
        f.short.add(ch);
      }
  }
  return f;
}

/** Resolves when `p` does, rejects as soon as `signal` aborts. */
export function untilAborted<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new AbortedError());
  return new Promise<T>((res, rej) => {
    const onAbort = () => rej(new AbortedError());
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        res(v);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort);
        rej(e);
      },
    );
  });
}

export class AbortedError extends Error {
  constructor() {
    super('aborted');
    this.name = 'AbortError';
  }
}
