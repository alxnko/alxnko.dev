// history, clear, exit.
import { fail, type ShellEnv } from '../registry';
import type { Command } from '../types';

export function sessionCommands(_env: ShellEnv): Command[] {
  return [
    {
      name: 'history',
      summary: 'command history',
      usage: 'history [n]',
      group: 'info',
      run(ctx) {
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
  ];
}
