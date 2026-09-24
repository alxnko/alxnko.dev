// ls, cd, pwd, cat, tree, open.
import { CONTACTS, LINK_ALLOWLIST } from '../../content/site';
import { autolink, fg, isAllowed, link, pad } from '../format';
import { completePath } from '../complete';
import { fail, flags, type ShellEnv } from '../registry';
import { HOME, lookup, resolve, type VNode } from '../vfs';
import { ExitError, type Command, type CommandCtx, type Line, type Span } from '../types';
import { lsDate } from './info';

const byName = (a: VNode, b: VNode) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** A coloured name span: dirs blue with `/`, links cyan. */
export function nameSpan(n: VNode, label = n.name): Span {
  if (n.kind === 'dir') return fg('blue', label + '/');
  if (n.kind === 'link') return fg('cyan', label);
  return { text: label };
}

export function fsCommands(env: ShellEnv): Command[] {
  const at = (ctx: CommandCtx, p: string) => lookup(env.fs, resolve(ctx.cwd, p));
  const content = (n: VNode) => n.read?.(env.world.get()) ?? '';
  const pathArgs = (args: string[], cwd: string) => completePath(args[args.length - 1] ?? '', cwd, env.fs);

  const ls: Command = {
    name: 'ls',
    summary: 'list directory contents',
    usage: 'ls [-la] [path...]',
    group: 'files',
    complete: pathArgs,
    run(ctx) {
      const f = flags(ctx, 'ls', 'laA1');
      const all = f.short.has('a') || f.short.has('A');
      const long = f.short.has('l');
      const targets = f.rest.length ? f.rest : ['.'];
      let status = 0;
      const blocks: { label: string; abs: string; node: VNode }[] = [];
      for (const t of targets) {
        const abs = resolve(ctx.cwd, t);
        const node = lookup(env.fs, abs);
        if (!node) {
          ctx.err(`ls: cannot access '${t}': No such file or directory`);
          status = 2;
        } else blocks.push({ label: t, abs, node });
      }
      blocks.forEach(({ label, abs, node }, i) => {
        if (blocks.length > 1 && node.kind === 'dir') ctx.out(`${label}:`);
        let entries: { n: VNode; label: string; path: string }[];
        if (node.kind !== 'dir') entries = [{ n: node, label, path: abs }];
        else {
          entries = (node.children ?? [])
            .filter((c) => all || !(c.hidden || c.name.startsWith('.')))
            .sort(byName)
            .map((n) => ({ n, label: n.name, path: resolve(abs, n.name) }));
          if (f.short.has('a')) {
            const up = resolve(abs, '..');
            entries.unshift({ n: node, label: '.', path: abs }, { n: lookup(env.fs, up) ?? node, label: '..', path: up });
          }
        }
        if (long) {
          const rows = entries.map(({ n, label: l, path }) => {
            const owner = path === HOME || path.startsWith(HOME + '/') ? 'alxnko' : 'root';
            const size = n.kind === 'dir' ? 4096 : n.kind === 'link' ? (n.href ?? '').length : new TextEncoder().encode(content(n) + '\n').length; // files end in a newline (as wc counts)
            const perms = n.kind === 'dir' ? 'drwxr-xr-x' : n.kind === 'link' ? 'lrwxrwxrwx' : '-rw-r--r--';
            const nlink = n.kind === 'dir' ? 2 + (n.children ?? []).filter((c) => c.kind === 'dir').length : 1;
            return { n, l, size, perms, nlink, owner };
          });
          const w = Math.max(...rows.map((r) => String(r.size).length), 1);
          const ow = Math.max(...rows.map((r) => r.owner.length));
          if (node.kind === 'dir') ctx.out(`total ${rows.reduce((s, r) => s + Math.ceil(r.size / 4096) * 4, 0)}`);
          for (const r of rows) {
            const line: Line = [
              { text: `${r.perms} ${r.nlink} ${pad(r.owner, ow)} ${pad(r.owner, ow)} ${String(r.size).padStart(w)} ${lsDate(env.bootTime)} ` },
              nameSpan(r.n, r.l),
            ];
            if (r.n.kind === 'link' && r.n.href) line.push({ text: ' -> ' }, link(r.n.href, r.n.href));
            ctx.out(line);
          }
        } else if (env.tty && !f.short.has('1')) {
          const line: Line = [];
          entries.forEach(({ n, label: l }, j) => {
            if (j) line.push({ text: '  ' });
            line.push(nameSpan(n, l));
          });
          if (line.length) ctx.out(line);
        } else for (const { n, label: l } of entries) ctx.out([nameSpan(n, l)]);
        if (blocks.length > 1 && i < blocks.length - 1) ctx.out('');
      });
      if (status) throw new ExitError(status);
    },
  };

  const cd: Command = {
    name: 'cd',
    summary: 'change directory (and walk over there)',
    usage: 'cd [dir]',
    group: 'files',
    complete: (args, cwd) => completePath(args[args.length - 1] ?? '', cwd, env.fs, true),
    run(ctx) {
      if (ctx.args.length > 1) fail(ctx, 'bash: cd: too many arguments');
      let target = ctx.args[0] ?? '~';
      if (target === '-') {
        if (!env.oldpwd) fail(ctx, 'bash: cd: OLDPWD not set');
        target = env.oldpwd;
        ctx.out(target);
      }
      const abs = resolve(ctx.cwd, target);
      const node = lookup(env.fs, abs);
      if (!node) fail(ctx, `bash: cd: ${target}: No such file or directory`);
      if (node.kind !== 'dir') fail(ctx, `bash: cd: ${target}: Not a directory`);
      env.oldpwd = ctx.cwd;
      ctx.setCwd(abs);
      if (node.landmark) ctx.world.fly(node.landmark);
    },
  };

  const pwd: Command = {
    name: 'pwd',
    summary: 'print name of current directory',
    usage: 'pwd',
    group: 'files',
    run: (ctx) => ctx.out(ctx.cwd),
  };

  const cat: Command = {
    name: 'cat',
    summary: 'concatenate files and print',
    usage: 'cat [file...]',
    group: 'files',
    complete: pathArgs,
    run(ctx) {
      if (ctx.args.length === 0) {
        if (ctx.stdin) ctx.out(ctx.stdin);
        return;
      }
      let status = 0;
      for (const p of ctx.args) {
        const n = at(ctx, p);
        if (!n) {
          ctx.err(`cat: ${p}: No such file or directory`);
          status = 1;
        } else if (n.kind === 'dir') {
          ctx.err(`cat: ${p}: Is a directory`);
          status = 1;
        } else for (const l of content(n).split('\n')) ctx.out(autolink(l));
      }
      if (status) throw new ExitError(status);
    },
  };

  const tree: Command = {
    name: 'tree',
    summary: 'list contents of directories in a tree',
    usage: 'tree [-a] [dir]',
    group: 'files',
    complete: (args, cwd) => completePath(args[args.length - 1] ?? '', cwd, env.fs, true),
    run(ctx) {
      const f = flags(ctx, 'tree', 'a');
      const label = f.rest[0] ?? '.';
      const root = at(ctx, label);
      if (!root || root.kind !== 'dir') {
        ctx.out(`${label} [error opening dir]`);
        ctx.out('');
        ctx.out('0 directories, 0 files');
        throw new ExitError(2);
      }
      let dirs = 0;
      let files = 0;
      ctx.out([fg('blue', label)]);
      const walk = (n: VNode, prefix: string) => {
        const kids = (n.children ?? []).filter((c) => f.short.has('a') || !(c.hidden || c.name.startsWith('.'))).sort(byName);
        kids.forEach((c, i) => {
          const lastKid = i === kids.length - 1;
          const line: Line = [{ text: prefix + (lastKid ? '└── ' : '├── ') }, c.kind === 'dir' ? fg('blue', c.name) : nameSpan(c)];
          if (c.kind === 'link' && c.href) line.push({ text: ' -> ' }, link(c.href, c.href));
          ctx.out(line);
          if (c.kind === 'dir') {
            dirs++;
            walk(c, prefix + (lastKid ? '    ' : '│   '));
          } else files++;
        });
      };
      walk(root, '');
      ctx.out('');
      ctx.out(`${dirs} ${dirs === 1 ? 'directory' : 'directories'}, ${files} ${files === 1 ? 'file' : 'files'}`);
    },
  };

  const contactIds = [...new Set(CONTACTS.flatMap((c) => [c.id, c.short, c.label]))].sort();

  const open: Command = {
    name: 'open',
    summary: 'open a contact in a new tab',
    usage: `open <${CONTACTS.map((c) => c.id).join('|')}|path>`,
    group: 'files',
    complete: (args, cwd) => {
      const w = args[args.length - 1] ?? '';
      return [...contactIds.filter((id) => id.startsWith(w)), ...completePath(w, cwd, env.fs)];
    },
    run(ctx) {
      const target = ctx.args[0];
      if (!target) fail(ctx, `usage: ${this.usage}`, 2);
      let href: string | undefined;
      const contact = CONTACTS.find((c) => [c.id, c.short, c.label].includes(target.toLowerCase()));
      if (contact) href = contact.href;
      else if (LINK_ALLOWLIST.has(target)) href = target;
      else {
        const n = at(ctx, target);
        if (n?.kind === 'link') href = n.href;
        else if (n?.kind === 'dir') fail(ctx, `open: ${target}: is a directory (try cd)`);
        else if (n) fail(ctx, `open: ${target}: not a link (try cat)`);
        else if (/^[a-z][a-z0-9+.-]*:/i.test(target)) fail(ctx, `open: refusing to open '${target}': not in the allowlist`);
        else fail(ctx, `open: ${target}: No such file or directory`);
      }
      if (!isAllowed(href)) fail(ctx, `open: refusing to open '${target}': not in the allowlist`);
      ctx.out([{ text: 'opening ' }, link(href, href)]);
      env.opener(href);
    },
  };

  return [ls, cd, pwd, cat, tree, open, { ...open, name: 'xdg-open', hidden: true, usage: open.usage.replace('open', 'xdg-open') }];
}
