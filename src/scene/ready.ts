/** A covered frame is ready only after its GPU fence signals. The deadline counts
 * visible time; abort, context loss and failed drivers release the lite fallback. */
export async function gpuDone(gl: WebGL2RenderingContext, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (gl.isContextLost()) throw new Error('GPU context lost');
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!sync) throw new Error('GPU fence unavailable');
  try {
    gl.flush();
    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let remaining = 3000, last = performance.now(), visible = !document.hidden;
      const cleanup = () => {
        clearTimeout(timer);
        document.removeEventListener('visibilitychange', visibility);
        signal?.removeEventListener('abort', abort);
      };
      const fail = (error: unknown) => { cleanup(); reject(error); };
      const account = () => {
        const now = performance.now();
        if (visible) remaining -= now - last;
        last = now;
      };
      const poll = () => {
        clearTimeout(timer);
        account();
        try {
          signal?.throwIfAborted();
          if (gl.isContextLost()) throw new Error('GPU context lost');
          const status = gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (status === gl.SIGNALED) { cleanup(); resolve(); return; }
          if (status !== gl.UNSIGNALED) throw new Error('GPU fence failed');
          if (remaining <= 0) throw new Error('GPU fence timed out');
          timer = setTimeout(poll, visible ? Math.min(8, remaining) : 1000);
        } catch (error) { fail(error); }
      };
      const visibility = () => { account(); visible = !document.hidden; poll(); };
      const abort = () => fail(signal?.reason);
      document.addEventListener('visibilitychange', visibility);
      signal?.addEventListener('abort', abort, { once: true });
      poll();
    });
  } finally { gl.deleteSync(sync); }
}
