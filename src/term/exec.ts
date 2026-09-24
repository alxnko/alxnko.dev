// Shell: runs a parsed line against the registry (pipes, &&, ||, ;), owns busy + Ctrl+C.
import { SITE } from '../content/site';
import { catspeak } from './catspeak';
import { phrase } from './phrases';
import { text } from './format';
import { expand, parse, ParseError, type Chain, type Pipeline } from './parse';
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
  // mailto: hands off to the mail app; a new tab for it would be left empty
  if (url.startsWith('mailto:')) globalThis.location?.assign(url);
  else globalThis.open?.(url, '_blank', 'noopener,noreferrer');
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

/** Aliases every session starts with (like a distro's default ~/.bashrc). */
export const DEFAULT_ALIASES: [string, string[]][] = [
  ['ll', ['ls', '-l']],
  ['la', ['ls', '-a']],
];

/**
 * Commands people reach for that live elsewhere: a suggestion, or (`!`) a plain note.
 * Did-you-mean covers typos; this covers habits from other systems.
 */
const SUBSTITUTES: Readonly<Record<string, string>> = {
  neofetch: 'fastfetch', screenfetch: 'fastfetch', pfetch: 'fastfetch',
  apt: 'pacman -Syu', 'apt-get': 'pacman -Syu', brew: 'pacman -Syu', dnf: 'pacman -Syu', yum: 'pacman -Syu',
  cls: 'clear', dir: 'ls', quit: 'exit', logout: 'exit', about: 'cat ~/about.md', who: 'whoami',
  vi: '!no editors on this desk: the files are read-only. try cat.',
  vim: '!no editors on this desk: the files are read-only. try cat.',
  nvim: '!no editors on this desk: the files are read-only. try cat.',
  nano: '!no editors on this desk: the files are read-only. try cat.',
  emacs: '!no editors on this desk: the files are read-only. try cat.',
  git: '!no git here. the code lives on github: open github',
};

const toLines = (l: Line | string): Line[] => (typeof l === 'string' ? l.split('\n').map((t) => [{ text: t }]) : [l]);

export class Shell {
  readonly registry = new Registry();
  private readonly env: ShellEnv;
  private readonly sleepImpl: (ms: number, signal: AbortSignal) => Promise<void>;
  private ac: AbortController | null = null;
  private status = 0;
  /** The running command's key handler (a full-screen toy owns the tty); null otherwise. */
  private keyFn: ((key: string) => void) | null = null;
  /** The line being run is one simple command (not-found then gets a friendly next step). */
  private solo = false;
  /** Last line run and its status (the suggestion chips follow it). */
  last: { line: string; status: number } | null = null;

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
      aliases: new Map(DEFAULT_ALIASES),
    };
    for (const make of [infoCommands, fsCommands, sessionCommands, worldCommands, toyCommands, secretCommands, textCommands])
      this.registry.add(...make(this.env));
  }

  /** True while a command line is executing. */
  get running(): boolean {
    return this.ac !== null;
  }

  /** True while the running command owns the keyboard (see CommandCtx.onKey). */
  get ownsKeys(): boolean {
    return this.ac !== null && this.keyFn !== null;
  }

  /** Hands a key to the running command that owns the keyboard. False when none does. */
  key(k: string): boolean {
    if (!this.ownsKeys) return false;
    this.keyFn!(k);
    return true;
  }

  /** Echoes prompt+line, pushes history, executes. Ignored while busy. Input is clamped to 256 chars. */
  async run(line: string): Promise<void> {
    if (this.store.state.busy || this.ac) return;
    const src = line.slice(0, MAX_INPUT);
    this.store.print([...this.store.prompt(), { text: src }]);
    this.store.setInput('');
    if (!src.trim()) return;
    this.store.pushHistory(src);

    // Catspeak: a line that isn't a command but is all cat sounds / faces gets a cat reply
    // (and the cat reacts) instead of "command not found". Then plain-language lines
    // ("who are you", "contact") answer with the real command that does it.
    let cmdline = src;
    const first = src.trim().split(/\s+/)[0] ?? '';
    if (!this.known(first)) {
      const cat = catspeak(src, this.env.random);
      if (cat) {
        this.store.print([{ text: '=^..^=  ', fg: 'green' }, { text: cat.text }]);
        this.world.meow();
        if (cat.excited) setTimeout(() => this.world.meow(), 450);
        this.done(src, 0);
        return;
      }
      const p = phrase(src);
      if (p) {
        this.store.print(p.say);
        if (!p.run) return this.done(src, 0);
        cmdline = p.run;
      }
    }

    let chains: Chain[];
    try {
      chains = parse(cmdline);
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      this.store.print(
        e.message === 'unterminated quote'
          ? `bash: unexpected EOF while looking for matching \`${e.token}'`
          : `bash: ${e.message}`,
      );
      return this.done(src, 2);
    }
    this.solo = chains.length === 1 && chains[0].pipeline.length === 1;

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
      this.keyFn = null;
      this.env.tty = true;
      this.last = { line: src, status: this.status };
      this.store.setBusy(false);
    }
  }

  private done(line: string, status: number): void {
    this.status = status;
    this.last = { line, status };
    this.store.setBusy(false); // one commit so the chips follow
  }

  /** A command or an alias. */
  private known(name: string): boolean {
    return !!this.registry.get(name) || this.env.aliases.has(name);
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
    // aliases expand once, like bash (so `alias ls='ls -l'` works)
    const alias = words[0] === undefined ? undefined : this.env.aliases.get(words[0]);
    const [name = '', ...args] = alias ? [...alias.map((w) => expand(w, (n) => this.variable(n))), ...words.slice(1)] : words;
    if (!name) return 0;
    const err = (t: string | Line) => {
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
      const lower = name.toLowerCase();
      const sub = SUBSTITUTES[lower];
      const hint = lower !== name && this.known(lower) ? lower : sub?.startsWith('!') ? null : sub ?? didYouMean(name, [...this.registry.names(), ...this.env.aliases.keys()]);
      if (sub?.startsWith('!')) err([{ text: sub.slice(1), fg: 'muted' }]);
      else if (hint) err([{ text: 'did you mean \'' }, { text: hint, run: hint }, { text: "'?" }]);
      else if (this.solo) err([{ text: 'type ', fg: 'muted' }, { text: 'help', fg: 'green', run: 'help' }, { text: " to see what's here.", fg: 'muted' }]);
      return 127;
    }
    // GNU style: --help anywhere before `--` prints the usage (echo prints it, like bash)
    const dashes = args.indexOf('--');
    const helpAt = args.indexOf('--help');
    if (name !== 'echo' && helpAt >= 0 && (dashes < 0 || helpAt < dashes)) {
      for (const l of cmd.help ?? [`usage: ${cmd.usage}`, `  ${cmd.summary}`]) write(l);
      if (!cmd.help && !cmd.hidden) write([{ text: 'more: ', fg: 'muted' }, { text: `man ${cmd.name}`, fg: 'green', run: `man ${cmd.name}` }]);
      return 0;
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
      onKey: (fn) => {
        // only the stage that owns the terminal takes it over (never a stage inside a pipe)
        if (this.env.tty) this.keyFn = fn;
      },
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
