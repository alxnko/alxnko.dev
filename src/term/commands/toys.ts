// catsay, cmatrix, pacman/yay, rm. Text-only toys.
import { fg, pad } from '../format';
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
const MATRIX_FPS = 12;
const MATRIX_MAX_MS = 8000;
const GLYPHS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!"#$%&()*+-./:;<=>?@[]^_{|}~';

function matrix(random: () => number) {
  const glyph = () => GLYPHS[Math.floor(random() * GLYPHS.length) % GLYPHS.length];
  const grid: string[][] = Array.from({ length: MATRIX_ROWS }, () => Array.from({ length: MATRIX_COLS }, glyph));
  // Per column: head row (can be negative = not yet on screen), trail length, active flag.
  const head = Array.from({ length: MATRIX_COLS }, () => -Math.floor(random() * MATRIX_ROWS * 1.5));
  const len = Array.from({ length: MATRIX_COLS }, () => 4 + Math.floor(random() * 14));
  const on = Array.from({ length: MATRIX_COLS }, (_, c) => c % 2 === 0 || random() < 0.3);

  const step = () => {
    for (let c = 0; c < MATRIX_COLS; c++) {
      if (!on[c]) continue;
      head[c]++;
      if (head[c] - len[c] > MATRIX_ROWS) {
        head[c] = -Math.floor(random() * 10);
        len[c] = 4 + Math.floor(random() * 14);
      }
      if (head[c] >= 0 && head[c] < MATRIX_ROWS) grid[head[c]][c] = glyph();
    }
    // A little shimmer in the trails.
    for (let k = 0; k < 20; k++) grid[Math.floor(random() * MATRIX_ROWS) % MATRIX_ROWS][Math.floor(random() * MATRIX_COLS) % MATRIX_COLS] = glyph();
  };

  const render = (): Line[] => {
    const frame: Line[] = [];
    for (let r = 0; r < MATRIX_ROWS; r++) {
      const row: Line = [];
      let run = '';
      let runColor: Color | 'blank' | 'head' = 'blank';
      const flush = () => {
        if (!run) return;
        row.push(runColor === 'blank' ? { text: run } : runColor === 'head' ? { text: run, fg: 'white', bold: true } : fg(runColor, run));
        run = '';
      };
      for (let c = 0; c < MATRIX_COLS; c++) {
        const d = head[c] - r;
        const kind: Color | 'blank' | 'head' = !on[c] || d < 0 || d > len[c] ? 'blank' : d === 0 ? 'head' : d > len[c] - 3 ? 'dim' : 'green';
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
  fg('green', '#'.repeat(22)),
  { text: '] 100%' },
];
const colons = (t: string): Line => [fg('blue', '::'), { text: ` ${t}`, bold: true }];

export function toyCommands(env: ShellEnv): Command[] {
  const catsay: Command = {
    name: 'catsay',
    summary: 'a cow, but a cat',
    usage: 'catsay [message]',
    group: 'fun',
    run(ctx) {
      const msg = ctx.args.length ? ctx.args.join(' ') : ctx.stdin?.trim() || 'meow';
      for (const l of bubble(msg)) ctx.out(l);
      for (const l of CAT_BODY) ctx.out([{ text: l, art: true }]);
    },
  };

  const cmatrix: Command = {
    name: 'cmatrix',
    summary: 'the rain. any key stops it',
    usage: 'cmatrix',
    group: 'fun',
    async run(ctx) {
      const m = matrix(env.random);
      // reduced motion: one still frame of the rain instead of the animation
      const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const frameMs = still ? 1500 : Math.round(1000 / MATRIX_FPS);
      const frames = still ? 1 : Math.floor(MATRIX_MAX_MS / frameMs);
      // the rain starts above the screen; the still frame shows it already falling
      if (still) for (let i = 0; i < MATRIX_ROWS; i++) m.step();
      try {
        for (let f = 0; f < frames && !ctx.signal.aborted; f++) {
          m.step();
          env.store.setOverlay(m.render());
          await ctx.sleep(frameMs);
        }
      } finally {
        env.store.setOverlay(null);
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
    complete: () => ['-Syu'],
    async run(ctx) {
      const op = ctx.args[0];
      if (!op || !op.startsWith('-')) fail(ctx, 'error: no operation specified (use -h for help)');
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
