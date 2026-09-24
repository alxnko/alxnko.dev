// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setup } from './harness';

afterEach(() => {
  vi.doUnmock('../../../src/term/text');
  vi.resetModules();
  vi.useRealTimers();
});

describe('the lazy text chunk (R75, R90)', () => {
  it('a failed chunk: an unknown word still gets command not found, man its summary and a note', async () => {
    vi.resetModules();
    vi.doMock('../../../src/term/text', () => {
      throw new Error('chunk failed');
    });
    const { setup: fresh } = await import('./harness');
    const { out, store } = fresh();
    expect(await out('hi')).toContain('bash: hi: command not found');
    expect(store.state.busy).toBe(false);
    const man = await out('man rgb');
    expect(man).toContain('One color for the lights, keys, cat and accent.');
    expect(man).toContain('(full manual unavailable right now)');
    expect(await out('cmatrix --help')).toContain('usage: cmatrix');
  });

  it('a stalled chunk: answers after the wait as if missing, and ctrl+c ends the wait at once', async () => {
    vi.resetModules();
    vi.doMock('../../../src/term/text', () => new Promise(() => {})); // never settles
    const { setup: fresh } = await import('./harness');
    const { TEXT_WAIT_MS } = await import('../../../src/term/lazy');
    vi.useFakeTimers();
    const { shell, store } = fresh();
    const first = shell.run('hi');
    await vi.advanceTimersByTimeAsync(TEXT_WAIT_MS + 10);
    await first;
    expect(store.state.lines.map((l) => l.map((s) => s.text).join('')).join('\n')).toContain('bash: hi: command not found');
    // the next unknown word waits again: ctrl+c drops it and the prompt is free
    const second = shell.run('hello there');
    await vi.advanceTimersByTimeAsync(50);
    expect(store.state.busy).toBe(true);
    shell.interrupt();
    await second;
    expect(store.state.busy).toBe(false);
    const tail = store.state.lines.slice(-1).map((l) => l.map((s) => s.text).join(''));
    expect(tail).toEqual(['^C']);
    // and a real command runs right after
    await shell.run('echo ok');
    expect(store.state.lines.at(-1)!.map((s) => s.text).join('')).toBe('ok');
  });

  it('with the chunk there, phrases and cat sounds still answer', async () => {
    const { out } = setup();
    expect(await out('who are you')).toContain('# whoami -v');
    expect(await out('meow meow')).toContain('=^..^=');
  });
});
