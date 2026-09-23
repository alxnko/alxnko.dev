// The one scene secret: sudo. Hidden from help and man.
import { SITE } from '../../content/site';
import { fg } from '../format';
import type { ShellEnv } from '../registry';
import { ExitError, type Command } from '../types';

export function secretCommands(_env: ShellEnv): Command[] {
  return [
    {
      name: 'sudo',
      summary: 'execute a command as another user',
      usage: 'sudo command',
      group: 'fun',
      hidden: true,
      async run(ctx) {
        if (ctx.args.length === 0) {
          ctx.err('usage: sudo command');
          throw new ExitError(1);
        }
        ctx.out(`[sudo] password for ${SITE.handle}: `);
        await ctx.sleep(700);
        ctx.out([fg('amber', `${SITE.handle} is not in the sudoers file.  This incident will be reported.`)]);
        ctx.world.stare();
        throw new ExitError(1);
      },
    },
  ];
}
