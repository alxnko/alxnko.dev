// history, clear, exit, alias, unalias, true, false.
import { expand, parse, ParseError } from '../parse';
import { fail, type ShellEnv } from '../registry';
import { ExitError, type Command } from '../types';

/** `ll='ls -l'` with bash's quoting: single quotes, and ' inside as '\'' */
const quote = (words: string[]) => `'${words.map((w) => expand(w, (n) => `$${n}`)).join(' ').replace(/'/g, `'\\''`)}'`;

export function sessionCommands(env: ShellEnv): Command[] {
  return [
    {
      name: 'history',
      summary: 'command history',
      usage: 'history [-c] [n]',
      group: 'info',
      run(ctx) {
        if (ctx.args[0] === '-c') return env.store.clearHistory();
        const h = ctx.history();
        let from = 0;
        if (ctx.args[0] !== undefined) {
          const n = Number(ctx.args[0]);
          if (!Number.isInteger(n) || n < 0) fail(ctx, `bash: history: ${ctx.args[0]}: numeric argument required`);
          from = Math.max(0, h.length - n);
        }
        for (let i = from; i < h.length; i++) ctx.out(`${String(i + 1).padStart(5)}  ${h[i]}`);
      },
    },
    {
      name: 'clear',
      summary: 'clear the terminal screen',
      usage: 'clear',
      group: 'info',
      run: (ctx) => ctx.clear(),
    },
    {
      name: 'exit',
      summary: 'log out (step back from the desk)',
      usage: 'exit',
      group: 'info',
      run(ctx) {
        ctx.out('logout');
        ctx.world.fly('wide');
      },
    },
    {
      name: 'alias',
      summary: 'define or list aliases',
      usage: "alias [name[='command']]",
      group: 'info',
      run(ctx) {
        if (!ctx.args.length) {
          for (const [n, w] of [...env.aliases].sort(([a], [b]) => (a < b ? -1 : 1))) ctx.out(`alias ${n}=${quote(w)}`);
          return;
        }
        let status = 0;
        for (const a of ctx.args) {
          const eq = a.indexOf('=');
          const name = eq < 0 ? a : a.slice(0, eq);
          if (!/^[\w.:@+-]+$/.test(name) || name.startsWith('-')) {
            ctx.err(`bash: alias: \`${a}': invalid alias name`);
            status = 1;
            continue;
          }
          if (eq < 0) {
            const w = env.aliases.get(name);
            if (w) ctx.out(`alias ${name}=${quote(w)}`);
            else {
              ctx.err(`bash: alias: ${name}: not found`);
              status = 1;
            }
            continue;
          }
          // one simple command (no pipes or lists): the value is tokenised like a command line
          let words: string[] = [];
          try {
            const chains = parse(a.slice(eq + 1));
            if (chains.length > 1 || (chains[0]?.pipeline.length ?? 0) > 1) throw new ParseError('only a simple command');
            words = chains[0]?.pipeline[0] ?? []; // variables stay unexpanded until the alias runs
          } catch {
            ctx.err(`bash: alias: ${name}: only a simple command can be an alias here`);
            status = 1;
            continue;
          }
          if (!words.length) env.aliases.delete(name);
          else env.aliases.set(name, words);
        }
        if (status) throw new ExitError(status);
      },
    },
    {
      name: 'unalias',
      summary: 'remove aliases',
      usage: 'unalias [-a] name...',
      group: 'info',
      hidden: true,
      complete: () => [...env.aliases.keys()],
      run(ctx) {
        if (ctx.args[0] === '-a') return env.aliases.clear();
        if (!ctx.args.length) fail(ctx, 'unalias: usage: unalias [-a] name [name ...]', 2);
        let status = 0;
        for (const n of ctx.args) {
          if (!env.aliases.delete(n)) {
            ctx.err(`bash: unalias: ${n}: not found`);
            status = 1;
          }
        }
        if (status) throw new ExitError(status);
      },
    },
    { name: 'true', summary: 'do nothing, successfully', usage: 'true', group: 'info', hidden: true, run: () => {} },
    {
      name: 'false',
      summary: 'do nothing, unsuccessfully',
      usage: 'false',
      group: 'info',
      hidden: true,
      run: () => {
        throw new ExitError(1);
      },
    },
  ];
}
