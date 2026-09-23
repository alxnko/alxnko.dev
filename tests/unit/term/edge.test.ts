import { afterEach, describe, expect, it, vi } from 'vitest';
import { Shell } from '../../../src/term/exec';
import { TermStore } from '../../../src/term/store';
import { NullWorld } from '../../../src/term/world';
import { autolink, link, text } from '../../../src/term/format';
import { complete } from '../../../src/term/complete';
import { createFs, HOME } from '../../../src/term/vfs';
import { setup } from './harness';

afterEach(() => vi.useRealTimers());

/** A Shell on real (fake-timer driven) sleeps. */
function timed(world = new NullWorld()) {
  vi.useFakeTimers();
  const store = new TermStore({ historyKey: 'edge' });
  const shell = new Shell(store, world, undefined, { opener: () => {} });
  const texts = () => store.state.lines.map(text);
  return { store, shell, world, texts };
}

describe('performance', () => {
  it('1000 prints finish in < 50 ms and the store caps at 500 lines', () => {
    const store = new TermStore();
    let notified = 0;
    store.subscribe(() => notified++);
    const line = [{ text: 'x'.repeat(60), fg: 'green' as const }, { text: ' tail' }];
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) store.print(line);
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(50);
    expect(store.state.lines).toHaveLength(500);
    expect(notified).toBe(1000);
    expect(store.trimmed).toBe(500);
  });

  it('a full 256-char line of operators parses and runs quickly', async () => {
    const { shell, store } = setup();
    const line = Array.from({ length: 60 }, () => 'pwd').join(';').slice(0, 256);
    const t0 = performance.now();
    await shell.run(line);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(store.state.lines.filter((l) => text(l) === HOME).length).toBeGreaterThan(50);
  });
});

describe('input clamp', () => {
  it('store input over 256 characters is clamped', () => {
    const store = new TermStore();
    store.setInput('a'.repeat(1000));
    expect(store.state.input.length).toBe(256);
  });

  it('Shell.run clamps the line to 256 characters', async () => {
    const { shell, store, out } = setup();
    const long = 'echo ' + 'b'.repeat(400);
    const o = await out(long);
    expect(o).toBe('b'.repeat(251));
    expect(store.state.history.at(-1)!.length).toBe(256);
    void shell;
  });
});

describe('busy guard', () => {
  it('run() while a command is running is ignored', async () => {
    const { shell, store, texts } = timed();
    const p = shell.run('pacman -Syu');
    await vi.advanceTimersByTimeAsync(100);
    expect(store.state.busy).toBe(true);
    const before = store.state.lines.length;
    await shell.run('pwd');
    expect(store.state.lines.length).toBe(before);
    expect(texts()).not.toContain(HOME);
    await vi.advanceTimersByTimeAsync(3000);
    await p;
    expect(store.state.busy).toBe(false);
    expect(texts().at(-1)).toBe(' there is nothing to do');
  });
});

describe('interrupt (Ctrl+C)', () => {
  it('aborts pacman -Syu mid-way, prints ^C, skips the rest of the chain', async () => {
    const { shell, store, texts } = timed();
    const p = shell.run('pacman -Syu && echo after');
    await vi.advanceTimersByTimeAsync(500);
    expect(texts().some((l) => l.startsWith(' core'))).toBe(true);
    shell.interrupt();
    await p;
    const t = texts();
    expect(t.at(-1)).toBe('^C');
    expect(t).not.toContain(' there is nothing to do');
    expect(t).not.toContain('after');
    expect(store.state.busy).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(texts().at(-1)).toBe('^C');
    // the shell is usable again, and $? is 130
    await shell.run('echo $?');
    expect(texts().at(-1)).toBe('130');
  });

  it('aborts a desk move that never finishes', async () => {
    const world = new NullWorld();
    world.setDesk = () => new Promise(() => {});
    const { shell, texts, store } = timed(world);
    const p = shell.run('desk 3');
    await vi.advanceTimersByTimeAsync(10);
    expect(texts().at(-1)).toBe('desk: moving to 112 cm…');
    shell.interrupt();
    await p;
    expect(texts().at(-1)).toBe('^C');
    expect(store.state.busy).toBe(false);
  });

  it('aborts sudo before the incident is reported', async () => {
    const { shell, texts, world } = timed();
    const stare = vi.spyOn(world, 'stare');
    const p = shell.run('sudo ls');
    await vi.advanceTimersByTimeAsync(300);
    shell.interrupt();
    await p;
    expect(texts().join('\n')).not.toContain('sudoers');
    expect(stare).not.toHaveBeenCalled();
  });

  it('stops cmatrix quietly (no ^C) and clears the overlay', async () => {
    const { shell, store, texts } = timed();
    const p = shell.run('cmatrix');
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.state.overlay).not.toBeNull();
    shell.interrupt();
    await p;
    expect(store.state.overlay).toBeNull();
    expect(texts()).not.toContain('^C');
    expect(store.state.busy).toBe(false);
  });

  it('cmatrix runs at ~12 fps and stops by itself within 8 s', async () => {
    const { shell, store } = timed();
    let frames = 0;
    store.subscribe((s) => void (s.overlay && frames++));
    const p = shell.run('cmatrix');
    await vi.advanceTimersByTimeAsync(1000);
    expect(frames).toBeGreaterThanOrEqual(11);
    expect(frames).toBeLessThanOrEqual(13);
    await vi.advanceTimersByTimeAsync(7100);
    await p;
    expect(frames).toBeLessThanOrEqual(97);
    expect(store.state.overlay).toBeNull();
    expect(store.state.busy).toBe(false);
  });

  it('when idle, cancels the input line like bash', () => {
    const store = new TermStore();
    const shell = new Shell(store, new NullWorld());
    store.setInput('ls -la');
    shell.interrupt();
    expect(text(store.state.lines.at(-1)!)).toBe('[alxnko@nitro ~]$ ls -la^C');
    expect(store.state.input).toBe('');
  });
});

describe('completion cycles', () => {
  const { shell } = setup();
  const fs = createFs();
  it('ca -> cat | catsay', () => {
    const r = complete('ca', 2, HOME, shell.registry, fs);
    expect(r.candidates).toEqual(['cat', 'catsay']);
    expect(r.insert).toBe('cat');
  });
  it('cd mo -> cd monitor/', () => {
    const r = complete('cd mo', 5, HOME, shell.registry, fs);
    const line = 'cd mo'.slice(0, r.replace[0]) + r.insert + 'cd mo'.slice(r.replace[1]);
    expect(line).toBe('cd monitor/');
  });
});

describe('link allowlist', () => {
  const hostile = [
    'javascript:alert(1)',
    'https://evil.example',
    'https://github.com/alxnko/',
    'https://github.com/alxnko?x=1',
    'HTTPS://GITHUB.COM/ALXNKO',
    ' https://github.com/alxnko',
    'data:text/html,hi',
    'mailto:someone@else.com',
    '//github.com/alxnko',
    '',
  ];

  it('link() never produces an href for a non-allowlisted target', () => {
    for (const h of hostile) expect(link('x', h).href).toBeUndefined();
  });

  it('the store strips any smuggled href', () => {
    const store = new TermStore();
    store.printAll(hostile.map((h) => [{ text: 'x', href: h }]));
    expect(store.state.lines.flat().some((s) => s.href !== undefined)).toBe(false);
  });

  it('autolink only links exact allowlisted URLs', () => {
    const spans = autolink('see https://evil.example and https://github.com/alxnko and javascript:alert(1)');
    expect(spans.filter((s) => s.href).map((s) => s.href)).toEqual(['https://github.com/alxnko']);
    expect(spans.map((s) => s.text).join('')).toBe('see https://evil.example and https://github.com/alxnko and javascript:alert(1)');
  });

  it('no command output carries a non-allowlisted href', async () => {
    const { shell, store } = setup();
    for (const c of ['fastfetch', 'ls -la monitor', 'tree', 'cat about.md monitor/github.lnk', 'whoami -v', 'open https://evil.example', 'echo https://evil.example', 'open gh'])
      await shell.run(c);
    const hrefs = store.state.lines.flat().filter((s) => s.href).map((s) => s.href!);
    expect(hrefs.length).toBeGreaterThan(5);
    const { LINK_ALLOWLIST } = await import('../../../src/content/site');
    expect(hrefs.every((h) => LINK_ALLOWLIST.has(h))).toBe(true);
  });
});
