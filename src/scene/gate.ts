// Whether to load the 3D desk (spec §6.6). Pure so it can be unit-tested.

export type Gate = 'auto' | 'offer' | 'never';

export interface GateEnv {
  url: string;
  webgl2: boolean;
  saveData?: boolean;
  effectiveType?: string;
  cores?: number;
  /** navigator.deviceMemory, GB */
  memory?: number;
  /**
   * WebGL runs on the CPU (SwiftShader, llvmpipe…): no GPU, so the desk would crawl.
   * Detected by the <head> gate from the renderer string (Base.astro).
   */
  softwareGL?: boolean;
}

export function decide3D(e: GateEnv): Gate {
  if (!e.webgl2) return 'never';
  const q = new URL(e.url).searchParams;
  if (q.has('3d')) return 'auto';
  if (q.has('lite')) return 'offer';
  if (e.saveData || e.effectiveType === '2g' || e.effectiveType === 'slow-2g') return 'offer';
  if ((e.cores !== undefined && e.cores < 4) || (e.memory !== undefined && e.memory < 4)) return 'offer';
  if (e.softwareGL) return 'offer';
  return 'auto';
}
