// catsay, cmatrix, pacman/yay, rm. Text-only toys.
import { fg, pad } from '../format';
import { loadText } from '../lazy';
import { fail, flags, type ShellEnv } from '../registry';
import { lookup, resolve } from '../vfs';
import { ExitError, type Color, type Command, type Line } from '../types';

const CAT_BODY = ['    \\', '     \\  /\\_/\\', '       ( o.o )', '        > ^ <'];

function wrap(msg: string, width: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const word of msg.split(/\s+/).filter(Boolean)) {
    for (let w = word; w; w = w.slice(width)) {
      const part = w.slice(0, width);
      if (!cur) cur = part;
      else if (cur.length + 1 + part.length <= width) cur += ' ' + part;
      else {
        out.push(cur);
        cur = part;
      }
    }
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}

export function bubble(msg: string, width = 40): string[] {
  const lines = wrap(msg, width);
  const w = Math.max(...lines.map((l) => l.length));
  const out = [' ' + '_'.repeat(w + 2)];
  if (lines.length === 1) out.push(`< ${lines[0]} >`);
  else
    lines.forEach((l, i) => {
      const [a, b] = i === 0 ? ['/', '\\'] : i === lines.length - 1 ? ['\\', '/'] : ['|', '|'];
      out.push(`${a} ${pad(l, w)} ${b}`);
    });
  out.push(' ' + '-'.repeat(w + 2));
  return out;
}

// cmatrix
export const MATRIX_COLS = 80;
export const MATRIX_ROWS = 24;
/** The ultrawide's rain (cmatrix --both): 21:9, the same rows. */
export const WALL_COLS = 128;
const MATRIX_FPS = 12;
const GLYPHS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!"#$%&()*+-./:;<=>?@[]^_{|}~';
/** Real cmatrix's -C names, on the site's ANSI palette (yellow is the palette's amber). */
export const MATRIX_COLORS: Readonly<Record<string, Color>> = {
  green: 'green', red: 'red', blue: 'blue', white: 'white', yellow: 'amber', cyan: 'cyan', magenta: 'magenta',
};

export function matrix(random: () => number, cols = MATRIX_COLS, rows = MATRIX_ROWS, color: Color = 'accent') {
  const glyph = () => GLYPHS[Math.floor(random() * GLYPHS.length) % GLYPHS.length];
  const grid: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, glyph));
  // Per column: head row (can be negative = not yet on screen), trail length, active flag.
  const head = Array.from({ length: cols }, () => -Math.floor(random() * rows * 1.5));
  const len = Array.from({ length: cols }, () => 4 + Math.floor(random() * 14));
  const on = Array.from({ length: cols }, (_, c) => c % 2 === 0 || random() < 0.3);

  const step = () => {
    for (let c = 0; c < cols; c++) {
      if (!on[c]) continue;
      head[c]++;
      if (head[c] - len[c] > rows) {
        head[c] = -Math.floor(random() * 10);
        len[c] = 4 + Math.floor(random() * 14);
      }
      if (head[c] >= 0 && head[c] < rows) grid[head[c]][c] = glyph();
    }
    // A little shimmer in the trails.
    for (let k = 0; k < 20; k++) grid[Math.floor(random() * rows) % rows][Math.floor(random() * cols) % cols] = glyph();
  };

  const render = (): Line[] => {
    const frame: Line[] = [];
    for (let r = 0; r < rows; r++) {
      const row: Line = [];
      let run = '';
      let runColor: Color | 'blank' | 'head' = 'blank';
      const flush = () => {
        if (!run) return;
        row.push(runColor === 'blank' ? { text: run } : runColor === 'head' ? { text: run, fg: 'white', bold: true } : fg(runColor, run));
        run = '';
      };
      for (let c = 0; c < cols; c++) {
        const d = head[c] - r;
        const kind: Color | 'blank' | 'head' = !on[c] || d < 0 || d > len[c] ? 'blank' : d === 0 ? 'head' : d > len[c] - 3 ? 'dim' : color;
        if (kind !== runColor) {
          flush();
          runColor = kind;
        }
        run += kind === 'blank' ? ' ' : grid[r][c];
      }
      flush();
      frame.push(row);
    }
    return frame;
  };
  return { step, render };
}


// pacman
const REPOS: [string, string, string][] = [
  ['core', '118.2 KiB', '912 KiB/s'],
  ['extra', '7.9 MiB', '12.1 MiB/s'],
  ['multilib', '139.4 KiB', '1204 KiB/s'],
];
const bar = (name: string, size: string, rate: string): Line => [
  { text: ` ${pad(name, 18)} ${size.padStart(10)} ${rate.padStart(11)} 00:00 [` },
  fg('accent', '#'.repeat(22)),
  { text: '] 100%' },
];
const colons = (t: string): Line => [fg('blue', '::'), { text: ` ${t}`, bold: true }];

// the --help texts load with the rest of the long text, on first use (R75)
const cmatrixHelp = async () => (await loadText())?.CMATRIX_HELP ?? ['usage: cmatrix [-s] [-C color] [--both]'];
const pacmanHelp = async () => (await loadText())?.PACMAN_HELP ?? ['usage:  pacman <operation> [...]'];

export function toyCommands(env: ShellEnv): Command[] {
  const catsay: Command = {
    name: 'catsay',
    summary: 'a cow, but a cat',
    usage: 'catsay [message]',
    group: 'fun',
    run(ctx) {
      if (ctx.args[0] === '-h') return ctx.out(`usage: ${this.usage}  (or: echo hi | catsay)`);
      const msg = ctx.args.length ? ctx.args.join(' ') : ctx.stdin?.trim() || 'meow';
      for (const l of bubble(msg)) ctx.out(l);
      for (const l of CAT_BODY) ctx.out([{ text: l, art: true }]);
    },
  };

  const cmatrix: Command = {
    name: 'cmatrix',
    summary: 'the rain. q or ctrl+c stops it',
    usage: 'cmatrix [-s] [-C color] [--both]',
    group: 'fun',
    help: cmatrixHelp,
    complete: (args) => (args[args.length - 2] === '-C' ? Object.keys(MATRIX_COLORS) : ['--both', '-C', '-s']),
    async run(ctx) {
      let color: Color = 'accent'; // the rain is the site accent unless -C picks one
      let saver = false;
      let both = false;
      const a = ctx.args;
      for (let i = 0; i < a.length; i++) {
        const w = a[i];
        if (w === '--both') both = true;
        else if (w === '--help') return (await cmatrixHelp()).forEach((l) => ctx.out(l));
        else if (/^-[a-zA-Z]+$/.test(w)) {
          for (let j = 1; j < w.length; j++) {
            const ch = w[j];
            if (ch === 'h') return (await cmatrixHelp()).forEach((l) => ctx.out(l));
            if (ch === 's') saver = true;
            else if (ch === 'C') {
              const v = w.slice(j + 1) || a[++i];
              if (!v) fail(ctx, "cmatrix: option requires an argument -- 'C'");
              const c = MATRIX_COLORS[v.toLowerCase()];
              if (!c) fail(ctx, `cmatrix: invalid color '${v}' (${Object.keys(MATRIX_COLORS).join(', ')})`);
              color = c;
              break;
            } else {
              ctx.err(`cmatrix: invalid option -- '${ch}'`);
              fail(ctx, "try 'cmatrix -h' for the options");
            }
          }
        } else {
          ctx.err(`cmatrix: unexpected argument '${w}'`);
          fail(ctx, "try 'cmatrix -h' for the options");
        }
      }
      if (!env.tty) fail(ctx, 'cmatrix: stdout is not a terminal');

      // the toy owns the tty: q quits like the real one, a screensaver quits on any key, and
      // everything else is swallowed (ctrl+c and esc never reach here: they stay the shell's)
      let quit = false;
      let wake = () => {};
      ctx.onKey((k) => {
        if (saver || k === 'q' || k === 'Q') {
          quit = true;
          wake();
        }
      });
      /** Resolves on quit, abort, or (with `visible`) when the page is shown again. */
      const until = (visible: boolean) =>
        new Promise<void>((res) => {
          const done = () => {
            ctx.signal.removeEventListener('abort', done);
            if (visible) document.removeEventListener('visibilitychange', onVis);
            res();
          };
          const onVis = () => void (!document.hidden && done());
          wake = done;
          ctx.signal.addEventListener('abort', done, { once: true });
          if (visible) document.addEventListener('visibilitychange', onVis);
          if (quit || ctx.signal.aborted) done();
        });
      const hidden = () => typeof document !== 'undefined' && document.hidden;
      // said once, through the log (the rain itself is aria-hidden)
      ctx.out([fg('muted', `cmatrix running, press ${saver ? 'any key' : 'ctrl+c'} to stop`)]);

      const m = matrix(env.random, MATRIX_COLS, MATRIX_ROWS, color);
      const wall = both ? matrix(env.random, WALL_COLS, MATRIX_ROWS, color) : null;
      // reduced motion: one still frame of the rain (pre-rolled one screen, so it is already
      // falling) until it is stopped, instead of the animation
      const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (still) for (let i = 0; i < MATRIX_ROWS; i++) m.step(), wall?.step();
      const frameMs = Math.round(1000 / MATRIX_FPS);
      try {
        // no time limit: it rains until q or ctrl+c, like the real one
        while (!ctx.signal.aborted && !quit) {
          // a hidden tab draws nothing (no store commits, no monitor canvas): wait to be seen
          if (hidden()) {
            await until(true);
            continue;
          }
          m.step();
          wall?.step();
          env.store.setFrames(m.render(), wall?.render() ?? null);
          // the still frame just waits for q or ctrl+c; nothing wakes up meanwhile
          if (still) await until(false);
          else await ctx.sleep(frameMs);
        }
      } finally {
        env.store.setFrames(null, null);
      }
    },
  };

  async function sync(ctx: Parameters<Command['run']>[0], aur: boolean) {
    ctx.out(colons('Synchronizing package databases...'));
    for (const [name, size, rate] of REPOS) {
      await ctx.sleep(400);
      ctx.out(bar(name, size, rate));
    }
    if (aur) {
      ctx.out(colons('Searching databases for updates...'));
      await ctx.sleep(150);
      ctx.out(colons('Searching AUR for updates...'));
    } else ctx.out(colons('Starting full system upgrade...'));
    await ctx.sleep(150);
    ctx.out(' there is nothing to do');
  }

  const pacman: Command = {
    name: 'pacman',
    summary: 'package manager',
    usage: 'pacman -Syu',
    group: 'fun',
    help: pacmanHelp,
    complete: () => ['-Syu', '-h', '-V'],
    async run(ctx) {
      const op = ctx.args[0];
      if (!op || !op.startsWith('-')) fail(ctx, 'error: no operation specified (use -h for help)');
      if (op === '-h' || op === '--help') return (await pacmanHelp()).forEach((l) => ctx.out(l));
      if (op === '-V' || op === '--version') {
        ctx.out(' .--.                  Pacman v7.0.0 - libalpm v15.0.0');
        ctx.out("/ _.-' .-.  .-.  .-.   meow meow meow meow");
        ctx.out("\\  '-. '-'  '-'  '-'");
        return ctx.out(" '--'");
      }
      if (/^-S(?=.*u)[yu]+$/.test(op)) return sync(ctx, false);
      fail(ctx, 'error: you cannot perform this operation unless you are root.');
    },
  };

  const yay: Command = {
    name: 'yay',
    summary: 'package manager, with extra steps',
    usage: 'yay [-Syu]',
    group: 'fun',
    hidden: true,
    async run(ctx) {
      const op = ctx.args[0];
      if (op === undefined || /^-S(?=.*u)[yu]+$/.test(op)) return sync(ctx, true);
      fail(ctx, 'error: you cannot perform this operation unless you are root.');
    },
  };

  const rm: Command = {
    name: 'rm',
    summary: 'remove files or directories',
    usage: 'rm [-rf] file...',
    group: 'files',
    hidden: true,
    run(ctx) {
      const f = flags(ctx, 'rm', 'rfRiv');
      const recursive = f.short.has('r') || f.short.has('R');
      const force = f.short.has('f');
      if (f.rest.length === 0) fail(ctx, 'rm: missing operand');
      let status = 0;
      const say = (m: string) => {
        ctx.err(m);
        status = 1;
      };
      for (const t of f.rest) {
        const abs = resolve(ctx.cwd, t);
        if (abs === '/' && recursive) {
          if (f.long.has('no-preserve-root')) {
            ctx.out('nice try. meow.');
            throw new ExitError(1);
          }
          ctx.err(`rm: it is dangerous to operate recursively on '/'`);
          fail(ctx, 'rm: use --no-preserve-root to override this failsafe');
        }
        const n = lookup(env.fs, abs);
        if (!n) {
          if (!force) say(`rm: cannot remove '${t}': No such file or directory`);
        } else if (n.kind === 'dir' && !recursive) say(`rm: cannot remove '${t}': Is a directory`);
        else say(`rm: cannot remove '${t}': Read-only file system`);
      }
      if (status) throw new ExitError(status);
    },
  };

  return [catsay, cmatrix, pacman, yay, rm];
}
