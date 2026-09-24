// Small, pure helpers the desk's mount and store wiring use (unit-tested without WebGL).
import type { TermState } from '../term/types';
// (the build helper's one constant: the bundler drops the Vite plugin around it)
import { SUPPORTED_EXTENSIONS } from '../../scripts/slim-gltf.mjs';

/**
 * The only terminal state the 3D draws itself: cmatrix --both's frames on the monitor. The
 * terminal text is DOM seen through a transparent window in the canvas, so printing a line
 * changes no WebGL pixel: redrawing a frame for it is pure waste (on CPU-only WebGL each one
 * blocked the page for a full-resolution raster). `apply` runs only when the monitor frame
 * itself changes (a new rain frame, or the rain starting or stopping).
 */
export function watchMonitor(apply: (frame: TermState['monitor']) => void): (s: TermState) => void {
  let last: TermState['monitor'] = null;
  return (s) => {
    if (s.monitor === last) return;
    last = s.monitor;
    apply(last);
  };
}

type Sched = { yield?: () => Promise<void> };

/**
 * Give the main thread back between the mount's heavy steps, so input and paint can run in
 * between. Never a rAF: a covered or background window gets no animation frames, and the desk
 * must still finish loading there (R63).
 */
export function yieldToMain(g: { scheduler?: Sched; setTimeout: (f: () => void, ms: number) => unknown } = globalThis as never): Promise<void> {
  const y = g.scheduler?.yield;
  if (typeof y === 'function') return y.call(g.scheduler);
  return new Promise((r) => { g.setTimeout(r, 0); });
}

/**
 * The glTF extensions a glb uses that the slimmed GLTFLoader (scripts/slim-gltf.mjs) no longer
 * reads. Anything here would load silently wrong, so the scene refuses the file instead.
 */
export function unsupportedExtensions(json: { extensionsUsed?: string[] }): string[] {
  return (json.extensionsUsed ?? []).filter((e) => !(SUPPORTED_EXTENSIONS as string[]).includes(e));
}
