// help, man, whoami, fastfetch, uname, uptime, date, echo, hostname.
import { CONTACTS, SITE } from '../../content/site';
import { CAT_MARK } from '../../content/mark';
import { b, fg, link, pad, PALETTE } from '../format';
import { fail, flags, type ShellEnv } from '../registry';
import type { Command, Line } from '../types';

export const KERNEL = '7.2.6-meow';
const KG_OFFSET = 6 * 3600_000; // Asia/Bishkek, UTC+6, no DST

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number) => String(n).padStart(2, '0');

/** Wall clock in Bishkek (a UTC Date shifted by +6h; read it with getUTC*). */
export const kg = (ms: number): Date => new Date(ms + KG_OFFSET);
export const hms = (d: Date) => `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
/** `Sep 23 14:02` (ls -l style). */
export const lsDate = (ms: number) => {
  const d = kg(ms);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, ' ')} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
};

function wrapWords(s: string, width: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of s.split(' ')) {
    if (cur && cur.length + 1 + w.length > width) {
      out.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  return cur ? [...out, cur] : out;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

function since(env: ShellEnv) {
  const s = Math.max(0, Math.floor((env.now() - env.bootTime) / 1000));
  return { s, d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60) };
}

/** fastfetch style: `3 mins`, `1 hour, 2 mins`, `12 secs`. */
function shortUptime(env: ShellEnv): string {
  const { s, d, h, m } = since(env);
  if (s < 60) return plural(s, 'sec');
  const parts = [d && plural(d, 'day'), h && plural(h, 'hour'), m && plural(m, 'min')].filter(Boolean);
  return parts.join(', ');
}

// The cat mark (shared with the monitor screen), padded to a fixed width.
const CAT_W = Math.max(...CAT_MARK.map((l) => l.length));
const CAT = CAT_MARK.map((l) => l.padEnd(CAT_W, ' '));

const MAN: Record<string, string> = {
  help: 'Lists the commands on this machine, grouped. Hidden ones stay hidden.',
  man: 'Formats and displays these manual pages. Pages are short on purpose.',
  fastfetch: 'Prints system information beside the cat mark. --compact skips contacts and colors.',
  ls: 'Lists directory contents. -a includes dotfiles, -l uses a long listing format. Directories end in /.',
  cd: 'Changes the working directory. Directories bound to a place on the desk (~, laptop, monitor, /) move the camera there. cd - goes back.',
  cat: 'Concatenates files to standard output. Files under ~/desk reflect the live state of the desk.',
  open: 'Opens a contact in a new tab. Only the five contacts and the committers.top rank are allowed.',
  desk: 'Moves the sit-stand desk. Presets 1, 2, 3 are 74, 95 and 112 cm; up and down step 5 cm within 70 to 120 cm.',
  theme: 'Switches between day and night lighting. Without an argument, toggles.',
  ring: 'Sets the ring light behind the monitor: green, purple or off.',
  fan: 'Sets the desk fan speed 0 to 3. Without an argument, cycles.',
  sound: 'Sets the sound level. All sounds are synthesized; off by default.',
  meow: 'Meows. The cat on the fan may react.',
  cmatrix: 'Shows falling characters for up to eight seconds. Any key stops it.',
  pacman: 'Package manager. -Syu synchronizes and upgrades the system.',
  grep: 'Prints lines matching a fixed-string pattern. -i ignores case, -v inverts the match.',
  history: 'Shows the last commands, numbered. Kept for this browser only.',
  exit: 'Logs out, which here means stepping back from the desk.',
};

export function infoCommands(env: ShellEnv): Command[] {
  const help: Command = {
    name: 'help',
    summary: 'this list',
    usage: 'help',
    group: 'info',
    run(ctx) {
      ctx.out('GNU bash, version 5.3.3(1)-release (x86_64-pc-linux-gnu)');
      ctx.out("These commands are defined on this desk.  Type `help' to see this list.");
      ctx.out("Type `man name' to find out more about the command `name'.");
      ctx.out('Tab completes, up/down walks history, ctrl+c stops things.');
      for (const g of ['info', 'files', 'world', 'fun', 'text'] as const) {
        ctx.out('');
        ctx.out([fg('muted', g)]);
        for (const c of env.registry.list().filter((c) => c.group === g)) ctx.out([{ text: '  ' }, b(pad(c.name, 10)), { text: ' ' + c.summary }]);
      }
    },
  };

  const man: Command = {
    name: 'man',
    summary: 'an interface to the manuals',
    usage: 'man <command>',
    group: 'info',
    complete: () => env.registry.names(),
    run(ctx) {
      const name = ctx.args[0];
      if (!name) {
        ctx.err('What manual page do you want?');
        fail(ctx, "For example, try 'man man'.");
      }
      const c = env.registry.get(name);
      if (!c || c.hidden) fail(ctx, `No manual entry for ${name}`, 16);
      const title = `${c.name.toUpperCase()}(1)`;
      const mid = `${SITE.os} Manual`;
      const gap = Math.max(1, 64 - title.length * 2 - mid.length);
      const left = Math.floor(gap / 2);
      ctx.out(title + ' '.repeat(left) + mid + ' '.repeat(gap - left) + title);
      ctx.out('');
      ctx.out([b('NAME')]);
      ctx.out(`       ${c.name} - ${c.summary}`);
      ctx.out('');
      ctx.out([b('SYNOPSIS')]);
      ctx.out(`       ${c.usage}`);
      ctx.out('');
      ctx.out([b('DESCRIPTION')]);
      const desc = MAN[c.name] ?? c.summary[0].toUpperCase() + c.summary.slice(1) + '.';
      for (const l of wrapWords(desc, 57)) ctx.out(`       ${l}`);
    },
  };

  const whoami: Command = {
    name: 'whoami',
    summary: 'print effective user name',
    usage: 'whoami [-v]',
    group: 'info',
    run(ctx) {
      const f = flags(ctx, 'whoami', 'v');
      if (!f.short.has('v')) return ctx.out(SITE.handle);
      ctx.out([
        { text: `${SITE.name} (${SITE.handle}) · ${SITE.role} @ ${SITE.company} · ${SITE.country} · ` },
        link(SITE.rank.text, SITE.rank.href),
      ]);
    },
  };

  const fastfetch: Command = {
    name: 'fastfetch',
    summary: 'system information, with a cat',
    usage: 'fastfetch [--compact]',
    group: 'info',
    run(ctx) {
      const compact = ctx.args.includes('--compact') || ctx.args.includes('-c');
      const kv = (k: string, v: Line | string): Line => [b(pad(k, 7), 'blue'), ...(typeof v === 'string' ? [{ text: v }] : v)];
      const rows: Line[] = [
        [b(SITE.handle, 'green'), { text: '@' }, b(SITE.host, 'green')],
        [{ text: '-'.repeat(SITE.handle.length + SITE.host.length + 1) }],
        kv('os', `${SITE.os} x86_64`),
        kv('host', SITE.host),
        kv('kernel', KERNEL),
        kv('uptime', shortUptime(env)),
        kv('shell', 'bash 5.3'),
        kv('role', `${SITE.role} @ ${SITE.company}`),
        kv('loc', SITE.country),
        kv('rank', [link(SITE.rank.short, SITE.rank.href)]),
      ];
      if (!compact) {
        rows.push([], ...CONTACTS.map((c) => kv(c.short, [link(c.display, c.href)])), [], [...PALETTE.map((c) => fg(c, '███'))]);
      }
      const width = CAT[0].length;
      const n = Math.max(CAT.length, rows.length);
      for (let i = 0; i < n; i++) {
        const art: Line = i < CAT.length ? [fg('green', CAT[i])] : [{ text: ' '.repeat(width) }];
        ctx.out([...art, { text: '   ' }, ...(rows[i] ?? [])]);
      }
    },
  };

  const uname: Command = {
    name: 'uname',
    summary: 'print system information',
    usage: 'uname [-asnrmo]',
    group: 'info',
    run(ctx) {
      const f = flags(ctx, 'uname', 'asnrmo');
      if (f.short.has('a')) return ctx.out(`Linux ${SITE.host} ${KERNEL} #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux`);
      const parts: string[] = [];
      if (f.short.has('s') || f.short.size === 0) parts.push('Linux');
      if (f.short.has('n')) parts.push(SITE.host);
      if (f.short.has('r')) parts.push(KERNEL);
      if (f.short.has('m')) parts.push('x86_64');
      if (f.short.has('o')) parts.push('GNU/Linux');
      ctx.out(parts.join(' '));
    },
  };

  const uptime: Command = {
    name: 'uptime',
    summary: 'tell how long the system has been running',
    usage: 'uptime [-p]',
    group: 'info',
    run(ctx) {
      const f = flags(ctx, 'uptime', 'p');
      const { d, h, m } = since(env);
      if (f.short.has('p')) {
        const parts = [d && plural(d, 'day'), h && plural(h, 'hour'), plural(m, 'minute')].filter(Boolean);
        return ctx.out('up ' + parts.join(', '));
      }
      const days = d ? `${plural(d, 'day')}, ` : '';
      const clock = h ? `${String(h).padStart(2, ' ')}:${two(m)}` : `${m} min`;
      ctx.out(` ${hms(kg(env.now()))} up ${days}${clock},  1 user,  load average: 0.08, 0.03, 0.01`);
    },
  };

  const date: Command = {
    name: 'date',
    summary: 'print the date (Bishkek time)',
    usage: 'date [-u]',
    group: 'info',
    run(ctx) {
      const bad = ctx.args.find((a) => a !== '-u');
      if (bad) fail(ctx, `date: invalid date '${bad}'`);
      const utc = ctx.args.includes('-u');
      const d = utc ? new Date(env.now()) : kg(env.now());
      ctx.out(
        `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, ' ')} ${hms(d)} ${utc ? 'UTC' : '+06'} ${d.getUTCFullYear()}`,
      );
    },
  };

  const echo: Command = {
    name: 'echo',
    summary: 'display a line of text',
    usage: 'echo [-n] [string...]',
    group: 'info',
    run(ctx) {
      const args = ctx.args[0] === '-n' ? ctx.args.slice(1) : ctx.args;
      ctx.out(args.join(' '));
    },
  };

  const hostname: Command = {
    name: 'hostname',
    summary: 'show the system host name',
    usage: 'hostname',
    group: 'info',
    run: (ctx) => ctx.out(SITE.host),
  };

  return [help, man, whoami, fastfetch, uname, uptime, date, echo, hostname];
}
