// Shell: runs a parsed line against the registry (pipes, &&, ||, ;), owns busy + Ctrl+C.
import { SITE } from '../content/site';
import { text } from './format';
import { expand, parse, ParseError, type Pipeline } from './parse';
import { AbortedError, Registry, didYouMean, type ShellEnv } from './registry';
import { MAX_INPUT, type TermStore } from './store';
import { createFs, HOME, lookup, resolve, type VNode } from './vfs';
import { ExitError, type CommandCtx, type Line, type WorldPort } from './types';
import { infoCommands } from './commands/info';
import { fsCommands } from './commands/fs';
import { sessionCommands } from './commands/session';
import { worldCommands } from './commands/world';
import { toyCommands } from './commands/toys';
import { secretCommands } from './commands/secret';
import { textCommands } from './commands/text';

export interface ShellOptions {
  /** Opens an allowlisted URL. Default: window.open(url, '_blank', 'noopener,noreferrer'). */
  opener?: (url: string) => void;
  /** Abortable sleep. Default: setTimeout. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

const defaultOpener = (url: string): void => {
  globalThis.open?.(url, '_blank', 'noopener,noreferrer');
};

const defaultSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((res, rej) => {
    if (signal.aborted) return rej(new AbortedError());
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      res();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      rej(new AbortedError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

const toLines = (l: Line | string): Line[] => (typeof l === 'string' ? l.split('\n').map((t) => [{ text: t }]) : [l]);

export class Shell {
  readonly registry = new Registry();
  private readonly env: ShellEnv;
  private readonly sleepImpl: (ms: number, signal: AbortSignal) => Promise<void>;
  private ac: AbortController | null = null;
  private status = 0;

  constructor(
    private readonly store: TermStore,
    private readonly world: WorldPort,
    fs: VNode = createFs(),
    opts: ShellOptions = {},
  ) {
    const now = opts.now ?? Date.now;
    this.sleepImpl = opts.sleep ?? defaultSleep;
    this.env = {
      store,
      world,
      fs,
      registry: this.registry,
      opener: opts.opener ?? defaultOpener,
      now,
      random: opts.random ?? Math.random,
      bootTime: now(),
      tty: true,
      oldpwd: null,
    };
    for (const make of [infoCommands, fsCommands, sessionCommands, worldCommands, toyCommands, secretCommands, textCommands])
      this.registry.add(...make(this.env));
  }

  /** True while a command line is executing. */
  get running(): boolean {
    return this.ac !== null;
  }

  /** Echoes prompt+line, pushes history, executes. Ignored while busy. Input is clamped to 256 chars. */
  async run(line: string): Promise<void> {
    if (this.store.state.busy || this.ac) return;
    const src = line.slice(0, MAX_INPUT);
    this.store.print([...this.store.prompt(), { text: src }]);
    this.store.setInput('');
    if (!src.trim()) return;
    this.store.pushHistory(src);

    let chains;
    try {
      chains = parse(src);
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      this.store.print(
        e.message === 'unterminated quote'
          ? `bash: unexpected EOF while looking for matching \`${e.token}'`
          : `bash: ${e.message}`,
      );
      this.status = 2;
      return;
    }

    const ac = new AbortController();
    this.ac = ac;
    this.store.setBusy(true);
    try {
      for (const chain of chains) {
        if (chain.op === '&&' && this.status !== 0) continue;
        if (chain.op === '||' && this.status === 0) continue;
        this.status = await this.pipeline(chain.pipeline, ac.signal);
        if (ac.signal.aborted) break;
      }
    } finally {
      this.ac = null;
      this.env.tty = true;
      this.store.setBusy(false);
    }
  }

  /**
   * Ctrl+C. While a command runs: aborts it and prints `^C` (silently when a full-screen toy
   * like cmatrix is up, so "any key quits" can call this too). When idle: cancels the input line.
   */
  interrupt(): void {
    if (this.ac) {
      const quiet = this.store.state.overlay !== null;
      this.ac.abort();
      if (!quiet) this.store.print('^C');
      return;
    }
    const { input } = this.store.state;
    this.store.print([...this.store.prompt(), { text: input + '^C' }]);
    this.store.setInput('');
    this.status = 130;
  }

  private async pipeline(p: Pipeline, signal: AbortSignal): Promise<number> {
    let stdin: string | null = null;
    let status = 0;
    for (let i = 0; i < p.length; i++) {
      const last = i === p.length - 1;
      const words = p[i].map((w) => expand(w, (n) => this.variable(n)));
      const buf: Line[] = [];
      const write = last ? (l: Line | string) => this.store.print(l) : (l: Line | string) => void buf.push(...toLines(l));
      this.env.tty = last;
      status = await this.exec(words, stdin, write, signal);
      if (signal.aborted) return 130;
      stdin = buf.map(text).join('\n');
    }
    return status;
  }

  private async exec(words: string[], stdin: string | null, write: (l: Line | string) => void, signal: AbortSignal): Promise<number> {
    const [name = '', ...args] = words;
    if (!name) return 0;
    const err = (t: string) => {
      if (!signal.aborted) this.store.print(t);
    };
    const cmd = this.registry.get(name);
    if (!cmd) {
      if (name.includes('/')) {
        const node = lookup(this.env.fs, resolve(this.store.state.cwd, name));
        err(`bash: ${name}: ${!node ? 'No such file or directory' : node.kind === 'dir' ? 'Is a directory' : 'Permission denied'}`);
        return node ? 126 : 127;
      }
      err(`bash: ${name}: command not found`);
      const hint = didYouMean(name, this.registry.names());
      if (hint) err(`did you mean '${hint}'?`);
      return 127;
    }
    const ctx: CommandCtx = {
      args,
      stdin,
      cwd: this.store.state.cwd,
      world: this.world,
      out: (l) => {
        if (!signal.aborted) write(l);
      },
      err,
      setCwd: (p) => this.store.setCwd(p),
      clear: () => this.store.clear(),
      signal,
      sleep: (ms) => this.sleepImpl(ms, signal),
      history: () => this.store.state.history,
    };
    try {
      await cmd.run(ctx);
      return 0;
    } catch (e) {
      if (signal.aborted) return 130;
      if (e instanceof ExitError) return e.code;
      err(`bash: ${name}: internal error`);
      return 1;
    }
  }

  private variable(name: string): string | undefined {
    switch (name) {
      case '?':
        return String(this.status);
      case 'USER':
      case 'LOGNAME':
        return SITE.handle;
      case 'HOME':
        return HOME;
      case 'SHELL':
        return '/bin/bash';
      case 'PWD':
        return this.store.state.cwd;
      case 'OLDPWD':
        return this.env.oldpwd ?? undefined;
      case 'HOSTNAME':
        return SITE.host;
      case 'PATH':
        return '/usr/local/bin:/usr/bin';
      case 'TERM':
        return 'xterm-256color';
      default:
        return undefined;
    }
  }
}
