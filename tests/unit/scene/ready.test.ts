// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { gpuDone } from '../../../src/scene/ready';

function driver() {
  const sync = {} as WebGLSync;
  const gl = { SYNC_GPU_COMMANDS_COMPLETE: 1, SYNC_STATUS: 2, SIGNALED: 3, UNSIGNALED: 4,
    fenceSync: vi.fn((): WebGLSync | null => sync), flush: vi.fn(), deleteSync: vi.fn(),
    isContextLost: vi.fn(() => false), getSyncParameter: vi.fn(() => 4) };
  return { gl: gl as unknown as WebGL2RenderingContext, calls: gl, sync };
}
beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it('accepts only a signaled fence and deletes it without an extra timer', async () => {
  const { gl, calls, sync } = driver(); calls.getSyncParameter.mockReturnValue(gl.SIGNALED);
  await expect(gpuDone(gl)).resolves.toBeUndefined();
  expect(calls.deleteSync).toHaveBeenCalledExactlyOnceWith(sync);
  expect(vi.getTimerCount()).toBe(0);
});
it('rejects an unsignaled visible-time deadline instead of claiming readiness', async () => {
  const { gl, calls, sync } = driver();
  const result = expect(gpuDone(gl)).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(3008); await result;
  expect(calls.deleteSync).toHaveBeenCalledExactlyOnceWith(sync);
  expect(vi.getTimerCount()).toBe(0);
});
it('rejects failed fence creation', async () => {
  const { gl, calls } = driver(); calls.fenceSync.mockReturnValue(null);
  await expect(gpuDone(gl)).rejects.toThrow();
  expect(calls.deleteSync).not.toHaveBeenCalled();
  expect(calls.flush).not.toHaveBeenCalled();
});
it('rejects context loss while waiting and deletes the owned fence', async () => {
  const { gl, calls, sync } = driver();
  const result = expect(gpuDone(gl)).rejects.toThrow();
  calls.isContextLost.mockReturnValue(true);
  await vi.advanceTimersByTimeAsync(8); await result;
  expect(calls.deleteSync).toHaveBeenCalledExactlyOnceWith(sync);
  expect(vi.getTimerCount()).toBe(0);
});
it('abort immediately clears the poll and deletes the owned fence', async () => {
  const { gl, calls, sync } = driver(), controller = new AbortController();
  const result = expect(gpuDone(gl, controller.signal)).rejects.toThrow();
  controller.abort(); await result;
  expect(calls.deleteSync).toHaveBeenCalledExactlyOnceWith(sync);
  expect(vi.getTimerCount()).toBe(0);
});
it('a hidden interval does not exhaust readiness and returning visibility wakes the poll', async () => {
  const { gl, calls } = driver();
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  let settled = false; const waiting = gpuDone(gl).then(() => { settled = true; }, () => { settled = true; });
  await vi.advanceTimersByTimeAsync(100);
  hidden.mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(10000); expect(settled).toBe(false);
  calls.getSyncParameter.mockReturnValue(gl.SIGNALED);
  hidden.mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0); await waiting;
  expect(vi.getTimerCount()).toBe(0);
});

it('rejects an already aborted owner before allocating a fence', async () => {
  const { gl, calls } = driver(), controller = new AbortController(); controller.abort();
  await expect(gpuDone(gl, controller.signal)).rejects.toThrow();
  expect(calls.fenceSync).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it('preserves a falsy abort reason without resolving as readiness', async () => {
  const { gl, calls, sync } = driver(), controller = new AbortController();
  const waiting = gpuDone(gl, controller.signal); controller.abort(null);
  await expect(waiting).rejects.toBeNull();
  expect(calls.deleteSync).toHaveBeenCalledExactlyOnceWith(sync); expect(vi.getTimerCount()).toBe(0);
});
it('deletes its fence when a driver query throws and removes its listeners', async () => {
  const { gl, calls, sync } = driver(), controller = new AbortController();
  const removeDocument = vi.spyOn(document, 'removeEventListener'), removeSignal = vi.spyOn(controller.signal, 'removeEventListener');
  calls.getSyncParameter.mockImplementation(() => { throw new Error('driver failure'); });
  await expect(gpuDone(gl, controller.signal)).rejects.toThrow('driver failure');
  expect(calls.deleteSync).toHaveBeenCalledExactlyOnceWith(sync);
  expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  expect(removeSignal).toHaveBeenCalledWith('abort', expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
});
it('deletes its fence when flushing throws', async () => {
  const { gl, calls, sync } = driver(); calls.flush.mockImplementation(() => { throw new Error('flush failure'); });
  await expect(gpuDone(gl)).rejects.toThrow('flush failure');
  expect(calls.deleteSync).toHaveBeenCalledExactlyOnceWith(sync); expect(vi.getTimerCount()).toBe(0);
});
