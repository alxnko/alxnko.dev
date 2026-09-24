// The single terminal state (spec §5.1). Renderers subscribe; commands mutate via Shell.
import * as prefs from '../lib/prefs';
import { SITE } from '../content/site';
import { fg, sanitize } from './format';
import { HOME, pretty } from './vfs';
import type { Line, TermState } from './types';

export const MAX_INPUT = 256;
const MAX_HISTORY = 100;

const toLines = (l: Line | string): Line[] =>
  typeof l === 'string' ? l.split('\n').map((t) => [{ text: t }]) : [sanitize(l)];

export class TermStore {
  private s: TermState;
  private subs = new Set<(s: TermState) => void>();
  private readonly maxLines: number;
  private readonly historyKey: string;
  private _trimmed = 0;

  constructor(opts: { historyKey?: string; maxLines?: number } = {}) {
    this.maxLines = opts.maxLines ?? 500;
    this.historyKey = opts.historyKey ?? 'history';
    this.s = {
      lines: [],
      input: '',
      cursor: 0,
      cwd: HOME,
      busy: false,
      queued: null,
      history: loadHistory(this.historyKey),
      overlay: null,
      monitor: null,
      version: 0,
    };
  }

  get state(): Readonly<TermState> {
    return this.s;
  }

  /** Lines dropped from the front since the last clear() (lets renderers reconcile incrementally). */
  get trimmed(): number {
    return this._trimmed;
  }

  subscribe(fn: (s: TermState) => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  print(line: Line | string): void {
    this.append(toLines(line));
  }

  printAll(lines: (Line | string)[]): void {
    this.append(lines.flatMap(toLines));
  }

  clear(): void {
    this._trimmed = 0;
    this.commit({ lines: [] });
  }

  setInput(text: string, cursor?: number): void {
    const input = text.slice(0, MAX_INPUT);
    const c = Math.max(0, Math.min(input.length, cursor ?? input.length));
    this.commit({ input, cursor: c });
  }

  setCwd(abs: string): void {
    this.commit({ cwd: abs });
  }

  setBusy(b: boolean): void {
    this.commit({ busy: b });
  }

  /** Enter while busy (at most one line; a later call replaces it, `null` drops it). */
  setQueued(line: string | null): void {
    this.commit({ queued: line });
  }

  setOverlay(frame: Line[] | null): void {
    this.commit({ overlay: frame });
  }

  /** Both screens in one commit (one render) per frame. */
  setFrames(overlay: Line[] | null, monitor: Line[] | null): void {
    this.commit({ overlay, monitor });
  }

  /** Forgets the history (`history -c`). */
  clearHistory(): void {
    prefs.set(this.historyKey, '[]');
    this.commit({ history: [] });
  }

  /** Dedupes consecutive entries, caps at 100, persists. Blank commands are ignored. */
  pushHistory(cmd: string): void {
    if (!cmd.trim()) return;
    const h = this.s.history;
    if (h[h.length - 1] === cmd) return;
    const history = [...h, cmd].slice(-MAX_HISTORY);
    prefs.set(this.historyKey, JSON.stringify(history));
    this.commit({ history });
  }

  /** `[alxnko@nitro ~]$ ` */
  prompt(): Line {
    return [
      { text: '[' },
      { text: `${SITE.handle}@${SITE.host}`, bold: true },
      { text: ' ' },
      fg('accent', pretty(this.s.cwd)),
      { text: ']$ ' },
    ];
  }

  private append(add: Line[]): void {
    if (add.length === 0) return;
    let lines = this.s.lines.concat(add);
    const over = lines.length - this.maxLines;
    if (over > 0) {
      lines = lines.slice(over);
      this._trimmed += over;
    }
    this.commit({ lines });
  }

  private commit(patch: Partial<TermState>): void {
    this.s = { ...this.s, ...patch, version: this.s.version + 1 };
    for (const fn of this.subs) fn(this.s);
  }
}

function loadHistory(key: string): string[] {
  const raw = prefs.get(key);
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-MAX_HISTORY) : [];
  } catch {
    return [];
  }
}
