// grep, head, tail, wc: pipe-able filters over stdin (or files).
import { b } from '../format';
import { completePath } from '../complete';
import { fail, flags, type ShellEnv } from '../registry';
import { lookup, resolve } from '../vfs';
import { ExitError, type Command, type CommandCtx, type Line } from '../types';

const lines = (s: string): string[] => (s === '' ? [] : s.replace(/\n$/, '').split('\n'));

export function textCommands(env: ShellEnv): Command[] {
  const pathArgs = (args: string[], cwd: string) => completePath(args[args.length - 1] ?? '', cwd, env.fs);

  /** Input text from files (if given) or stdin; null when there is neither. */
  function input(ctx: CommandCtx, cmd: string, files: string[]): string | null {
    if (!files.length) return ctx.stdin;
    const parts: string[] = [];
    let ok = false;
    for (const p of files) {
      const n = lookup(env.fs, resolve(ctx.cwd, p));
      if (!n) ctx.err(`${cmd}: ${p}: No such file or directory`);
      else if (n.kind === 'dir') ctx.err(`${cmd}: ${p}: Is a directory`);
      else {
        parts.push(n.read?.(env.world.get()) ?? '');
        ok = true;
      }
    }
    return ok ? parts.join('\n') : null;
  }

  /** No input: the files named were missing (already reported, exit 1), or nothing was given. */
  function missing(ctx: CommandCtx, files: string[], usage: string): never {
    if (files.length) throw new ExitError(1);
    fail(ctx, `usage: ${usage}`, 2);
  }

  /** `-n N`, `-nN`, `-N`; default 10. */
  function count(ctx: CommandCtx, cmd: string): { n: number; rest: string[] } {
    const rest: string[] = [];
    let n = 10;
    const a = ctx.args;
    for (let i = 0; i < a.length; i++) {
      let v: string | undefined;
      if (a[i] === '-n') v = a[++i];
      else if (/^-n./.test(a[i])) v = a[i].slice(2);
      else if (/^-\d+$/.test(a[i])) v = a[i].slice(1);
      else {
        rest.push(a[i]);
        continue;
      }
      if (v === undefined || !/^\d+$/.test(v)) fail(ctx, `${cmd}: invalid number of lines: '${v ?? ''}'`);
      n = Number(v);
    }
    return { n, rest };
  }

  const grep: Command = {
    name: 'grep',
    summary: 'print lines that match a pattern',
    usage: 'grep [-iv] PATTERN [FILE...]',
    group: 'text',
    complete: pathArgs,
    run(ctx) {
      const f = flags(ctx, 'grep', 'iv');
      const [pat, ...files] = f.rest;
      if (pat === undefined) fail(ctx, `usage: ${this.usage}`, 2);
      const src = input(ctx, 'grep', files);
      if (src === null) {
        if (files.length) throw new ExitError(2); // each missing file was already reported
        fail(ctx, `usage: ${this.usage}`, 2);
      }
      const ci = f.short.has('i');
      const needle = ci ? pat.toLowerCase() : pat;
      let hits = 0;
      for (const l of lines(src)) {
        const hay = ci ? l.toLowerCase() : l;
        const match = hay.includes(needle);
        if (match === f.short.has('v')) continue;
        hits++;
        if (!env.tty || f.short.has('v') || !needle) {
          ctx.out(l);
          continue;
        }
        const out: Line = [];
        let from = 0;
        for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) {
          if (at > from) out.push({ text: l.slice(from, at) });
          out.push(b(l.slice(at, at + needle.length), 'red'));
          from = at + needle.length;
        }
        if (from < l.length) out.push({ text: l.slice(from) });
        ctx.out(out);
      }
      if (!hits) throw new ExitError(1);
    },
  };

  const head: Command = {
    name: 'head',
    summary: 'output the first part of input',
    usage: 'head [-n N] [FILE]',
    group: 'text',
    complete: pathArgs,
    run(ctx) {
      const { n, rest } = count(ctx, 'head');
      const src = input(ctx, 'head', rest);
      if (src === null) return missing(ctx, rest, this.usage);
      for (const l of lines(src).slice(0, n)) ctx.out(l);
    },
  };

  const tail: Command = {
    name: 'tail',
    summary: 'output the last part of input',
    usage: 'tail [-n N] [FILE]',
    group: 'text',
    complete: pathArgs,
    run(ctx) {
      const { n, rest } = count(ctx, 'tail');
      const src = input(ctx, 'tail', rest);
      if (src === null) return missing(ctx, rest, this.usage);
      for (const l of n ? lines(src).slice(-n) : []) ctx.out(l);
    },
  };

  const wc: Command = {
    name: 'wc',
    summary: 'count lines, words and bytes',
    usage: 'wc [-lwc] [FILE]',
    group: 'text',
    complete: pathArgs,
    run(ctx) {
      const f = flags(ctx, 'wc', 'lwc');
      const src = input(ctx, 'wc', f.rest);
      if (src === null) return missing(ctx, f.rest, this.usage);
      const ls = lines(src);
      const counts = {
        l: ls.length,
        w: ls.reduce((s, l) => s + l.split(/\s+/).filter(Boolean).length, 0),
        c: new TextEncoder().encode(ls.map((l) => l + '\n').join('')).length,
      };
      const pick = (['l', 'w', 'c'] as const).filter((k) => f.short.size === 0 || f.short.has(k));
      const name = f.rest[0] ? ' ' + f.rest[0] : '';
      if (pick.length === 1) return ctx.out(`${counts[pick[0]]}${name}`);
      ctx.out(pick.map((k) => String(counts[k]).padStart(7)).join(' ') + name);
    },
  };

  return [grep, head, tail, wc];
}
