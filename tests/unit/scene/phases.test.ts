import { describe, expect, it, vi } from 'vitest';
import { TermStore } from '../../../src/term/store';
import { watchMonitor, yieldToMain } from '../../../src/scene/phases';
import type { Line } from '../../../src/term/types';

describe('watchMonitor', () => {
  it('ignores terminal output, input and busy changes (the text is DOM, not WebGL)', () => {
    const store = new TermStore({ historyKey: 'test-watch' });
    const apply = vi.fn();
    store.subscribe(watchMonitor(apply));
    for (let i = 0; i < 20; i++) store.print(`boot line ${i}`);
    store.setInput('help');
    store.setBusy(true);
    store.setOverlay([[{ text: 'rain on the laptop only' }]]);
    store.setBusy(false);
    store.clear();
    expect(apply).not.toHaveBeenCalled();
  });

  it('applies every monitor frame, and the stop', () => {
    const store = new TermStore({ historyKey: 'test-watch2' });
    const seen: (Line[] | null)[] = [];
    store.subscribe(watchMonitor((f) => seen.push(f)));
    const a: Line[] = [[{ text: 'a' }]], b: Line[] = [[{ text: 'b' }]];
    store.setFrames(a, a);
    store.print('a line while it rains');
    store.setFrames(b, b);
    store.setFrames(null, null);
    store.setFrames(null, null);
    expect(seen).toEqual([a, b, null]);
  });
});

describe('yieldToMain', () => {
  it('uses scheduler.yield when there is one', async () => {
    const y = vi.fn(() => Promise.resolve());
    const setTimeout = vi.fn();
    await yieldToMain({ scheduler: { yield: y }, setTimeout });
    expect(y).toHaveBeenCalledOnce();
    expect(setTimeout).not.toHaveBeenCalled();
  });

  it('falls back to a zero timeout (never a rAF: covered windows get none)', async () => {
    const setTimeout = vi.fn((f: () => void) => f());
    await yieldToMain({ setTimeout });
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
  });
});
