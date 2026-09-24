import { describe, expect, it } from 'vitest';
import { didYouMean } from '../../../src/term/registry';
import { ExitError } from '../../../src/term/types';
import { text } from '../../../src/term/format';
import { setup } from './harness';

describe('Shell.run', () => {
  it('echoes the prompt and the line, clears input, pushes history', async () => {
    const { store, shell } = setup();
    store.setInput('pwd');
    await shell.run('pwd');
    expect(text(store.state.lines[0])).toBe('[alxnko@nitro ~]$ pwd');
    expect(text(store.state.lines[1])).toBe('/home/alxnko');
    expect(store.state.input).toBe('');
    expect(store.state.history.at(-1)).toBe('pwd');
    expect(store.state.busy).toBe(false);
  });

  it('an empty line only echoes the prompt and is not stored in history', async () => {
    const { store, shell } = setup();
    const h = store.state.history.length;
    await shell.run('   ');
    expect(store.state.lines.map(text)).toEqual(['[alxnko@nitro ~]$    ']);
    expect(store.state.history.length).toBe(h);
  });

  it('unknown command prints bash: foo: command not found and exits 127', async () => {
    const { out } = setup();
    // alone on the line it points at a next step; inside a list or pipe it stays terse
    expect(await out('foo')).toBe("bash: foo: command not found\ntype help to see what's here.");
    expect(await out('foo; echo $?')).toBe('bash: foo: command not found\n127');
  });

  it('suggests a close command', async () => {
    const { out } = setup();
    expect(await out('claer')).toBe("bash: claer: command not found\ndid you mean 'clear'?");
    expect(await out('sl')).toBe("bash: sl: command not found\ndid you mean 'ls'?");
  });

  it('&& runs only on success, || only on failure, ; always', async () => {
    const { out } = setup();
    expect(await out('echo a && echo b')).toBe('a\nb');
    expect(await out('foo && echo b')).toBe('bash: foo: command not found');
    expect(await out('foo || echo b')).toBe('bash: foo: command not found\nb');
    expect(await out('echo a || echo b')).toBe('a');
    expect(await out('foo; echo c')).toBe('bash: foo: command not found\nc');
    expect(await out('foo && echo x || echo y')).toBe('bash: foo: command not found\ny');
  });

  it('pipes stdout into stdin', async () => {
    const { out } = setup();
    expect(await out('echo hello world | wc -w')).toBe('2');
    expect(await out('cat about.md | grep -i TECH | wc -l')).toBe('1');
  });

  it('stderr is not piped', async () => {
    const { out } = setup();
    expect(await out('cat nope | wc -l')).toBe('cat: nope: No such file or directory\n0');
  });

  it('expands variables at execution time', async () => {
    const { out } = setup();
    expect(await out('echo $USER $HOME $SHELL $HOSTNAME')).toBe('alxnko /home/alxnko /bin/bash nitro');
    expect(await out("echo '$USER'")).toBe('$USER');
    expect(await out('cd /etc; echo $PWD')).toBe('/etc');
  });

  it('reports parse errors like bash', async () => {
    const { out } = setup();
    expect(await out('echo "abc')).toBe('bash: unexpected EOF while looking for matching `"\'');
    expect(await out('&& ls')).toBe("bash: syntax error near unexpected token `&&'");
  });

  it('a throwing command becomes an internal error, never a crash', async () => {
    const { shell, out, store } = setup();
    shell.registry.add({ name: 'boom', summary: '', usage: 'boom', group: 'fun', hidden: true, run() { throw new TypeError('x'); } });
    expect(await out('boom || echo survived')).toBe('bash: boom: internal error\nsurvived');
    expect(store.state.busy).toBe(false);
  });

  it('ExitError codes drive && / ||', async () => {
    const { shell, out } = setup();
    shell.registry.add({ name: 'nope', summary: '', usage: '', group: 'fun', hidden: true, run() { throw new ExitError(3); } });
    expect(await out('nope; echo $?')).toBe('3');
  });

  it('path-like commands behave like a shell', async () => {
    const { out } = setup();
    expect(await out('./about.md')).toBe('bash: ./about.md: Permission denied');
    expect(await out('./monitor')).toBe('bash: ./monitor: Is a directory');
    expect(await out('./nope')).toBe('bash: ./nope: No such file or directory');
  });

  it('an empty expansion as the command is a no-op', async () => {
    const { out } = setup();
    expect(await out('$NOPE')).toBe('');
  });
});

/** Lets a test hold a command "running" until release(), or reject it via the abort signal. */
function busyCommand() {
  let release: () => void = () => {};
  const sleep = (_ms: number, signal: AbortSignal): Promise<void> =>
    new Promise((res, rej) => {
      if (signal.aborted) return rej(new Error('aborted'));
      release = res;
      signal.addEventListener('abort', () => rej(new Error('aborted')), { once: true });
    });
  const harness = setup({ sleep });
  harness.shell.registry.add({
    name: 'wait', summary: '', usage: 'wait', group: 'fun', hidden: true,
    async run(ctx) {
      await ctx.sleep(999999);
    },
  });
  return { ...harness, release: () => release() };
}

/** Real timers: gives the fire-and-forget queued run() (Shell.runQueued) a tick to land. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Shell: queued input (Enter while busy)', () => {
  it('a queued line runs automatically once the prompt returns, recorded in history, pipes intact', async () => {
    const { store, shell, release } = busyCommand();
    const p = shell.run('wait');
    expect(store.state.busy).toBe(true);
    store.setQueued('echo a | wc -c');
    release();
    await p;
    await flush();
    expect(store.state.queued).toBeNull();
    expect(store.state.busy).toBe(false);
    expect(store.state.history.at(-1)).toBe('echo a | wc -c');
    expect(text(store.state.lines.at(-1)!)).toBe('2');
  });

  it('a later Enter replaces an earlier queued line: only the last one runs', async () => {
    const { store, shell, release } = busyCommand();
    const p = shell.run('wait');
    store.setQueued('echo first');
    store.setQueued('echo second');
    release();
    await p;
    await flush();
    expect(store.state.history).not.toContain('echo first');
    expect(store.state.history.at(-1)).toBe('echo second');
  });

  it('ctrl+c (interrupt) while busy drops the queued line, like real typeahead after ^C', async () => {
    const { store, shell } = busyCommand();
    const p = shell.run('wait');
    store.setQueued('echo dropped');
    shell.interrupt(); // aborts `wait`; its sleep rejects via the abort listener
    await p;
    await flush();
    expect(store.state.queued).toBeNull();
    expect(store.state.history).not.toContain('echo dropped');
    expect(store.state.lines.map(text).join('\n')).not.toContain('dropped');
  });
});

describe('didYouMean', () => {
  const names = ['help', 'clear', 'ls', 'fastfetch', 'history', 'cat', 'catsay', 'pwd'];
  it('finds close names (Damerau, transpositions count as 1)', () => {
    expect(didYouMean('claer', names)).toBe('clear');
    expect(didYouMean('hepl', names)).toBe('help');
    expect(didYouMean('fastfech', names)).toBe('fastfetch');
    expect(didYouMean('histroy', names)).toBe('history');
    expect(didYouMean('sl', names)).toBe('ls');
    expect(didYouMean('catsy', names)).toBe('catsay');
  });
  it('returns null when nothing is close enough', () => {
    expect(didYouMean('zzzzzz', names)).toBeNull();
    expect(didYouMean('foo', names)).toBeNull();
    expect(didYouMean('', names)).toBeNull();
  });
  it('allows distance 2 for longer names', () => {
    expect(didYouMean('fstfetc', names)).toBe('fastfetch');
  });
});
