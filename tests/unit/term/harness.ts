// Shared test harness: a Shell on NullWorld with instant sleeps and a fixed clock.
import { Shell, type ShellOptions } from '../../../src/term/exec';
import { TermStore } from '../../../src/term/store';
import { NullWorld } from '../../../src/term/world';
import { text } from '../../../src/term/format';
import type { Line } from '../../../src/term/types';

export const T0 = Date.UTC(2026, 8, 23, 8, 2, 11); // 14:02:11 in Bishkek (+06)

export const instant = (_ms: number, signal: AbortSignal): Promise<void> =>
  signal.aborted ? Promise.reject(new Error('aborted')) : Promise.resolve();

export function setup(opts: ShellOptions = {}) {
  const store = new TermStore({ historyKey: 'test-history' });
  const world = new NullWorld();
  const opened: string[] = [];
  let clock = T0;
  let sleeps = 0;
  const shell: Shell = new Shell(store, world, undefined, {
    opener: (u) => opened.push(u),
    // instant sleeps; a toy that runs until quit (cmatrix) gets a `q` every 100 frames
    sleep: (ms, signal) => {
      if (++sleeps % 100 === 0) shell.key('q');
      return instant(ms, signal);
    },
    now: () => clock,
    random: () => 0.42,
    ...opts,
  });
  /** Runs a line and returns the output lines (excluding the echoed prompt line). */
  async function run(line: string): Promise<Line[]> {
    const before = store.state.lines.length;
    await shell.run(line);
    return store.state.lines.slice(before + 1);
  }
  /** Same as run() but joined text. */
  async function out(line: string): Promise<string> {
    return (await run(line)).map(text).join('\n');
  }
  return { store, world, shell, opened, run, out, tick: (ms: number) => (clock += ms) };
}
