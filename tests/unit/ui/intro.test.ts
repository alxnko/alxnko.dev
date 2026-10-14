// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { bootstrapConsole, consoleLayout, introViewport, visibleDeadline } from '../../../src/ui/intro';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); delete document.documentElement.dataset.boot; delete document.body.dataset.scene; });

it('does not debit a hidden interval, including the sub-second visibility boundary', () => {
  vi.useFakeTimers();
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  document.documentElement.dataset.boot = '3d';
  const failed = vi.fn(); window.addEventListener('scene:failed', failed);
  const stop = visibleDeadline();
  vi.advanceTimersByTime(4250);
  hidden.mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange'));
  vi.advanceTimersByTime(30000);
  hidden.mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange'));
  expect(document.documentElement.dataset.boot).toBe('3d');
  vi.advanceTimersByTime(10749);
  expect(failed).not.toHaveBeenCalled();
  vi.advanceTimersByTime(251);
  expect(failed).toHaveBeenCalledTimes(1);
  expect(document.documentElement.dataset.boot).toBe('failed');
  expect(vi.getTimerCount()).toBe(0);
  stop(); window.removeEventListener('scene:failed', failed);
});

it('cancels deadline timers and visibility listeners idempotently', () => {
  vi.useFakeTimers();
  document.documentElement.dataset.boot = '3d';
  const remove = vi.spyOn(document, 'removeEventListener');
  const stop = visibleDeadline();
  expect(vi.getTimerCount()).toBe(1);
  stop(); stop();
  expect(vi.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
});

it('a new attempt replaces the old deadline rather than inheriting its remaining time', () => {
  vi.useFakeTimers();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  document.documentElement.dataset.boot = '3d';
  visibleDeadline(); vi.advanceTimersByTime(4000);
  const stop = visibleDeadline();
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(14999);
  expect(document.documentElement.dataset.boot).toBe('3d');
  stop();
});

it.each([
  [0, 0, 0, 0],
  [32, 568, 0, 0],
  [33, 568, 0, 0],
  [100, 568, 0, 0],
  [287, 568, 0, 0],
  [320, 64, 0, 0],
  [52, 568, 20, 0],
  [320, 84, 0, 20],
])('bootstrap rejects viewport %i×%i with left/top insets %i/%i without freezing or later takeover', (width, height, left, top) => {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('innerHeight', height);
  vi.stubGlobal('getComputedStyle', () => ({ paddingLeft: `${left}px`, paddingTop: `${top}px`, paddingRight: '0px', paddingBottom: '0px' }));
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
  document.documentElement.dataset.boot = '3d';
  bootstrapConsole(consoleLayout, introViewport);
  expect(document.documentElement.dataset.boot).toBe('failed');
  expect(document.documentElement.style.getPropertyValue('--screen-w')).toBe('');
  vi.stubGlobal('innerWidth', 320);
  vi.stubGlobal('innerHeight', 568);
  dispatchEvent(new Event('resize'));
  expect(document.documentElement.dataset.boot).toBe('failed');
  expect(document.documentElement.style.getPropertyValue('--screen-w')).toBe('');
  expect(typeof (window as typeof window & { __consoleIntro?: () => void }).__consoleIntro).toBe('function');
});
