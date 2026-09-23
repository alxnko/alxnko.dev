// Shape of public/scene/manifest.json (written by scene/export.py). Parsed defensively:
// a malformed manifest must fall back to the page, never throw into the UI.

export interface Manifest {
  version: string;
  deskBase: number;
  presets: [number, number, number];
  range: [number, number];
  files: {
    glb: string;
    atlas: Record<'day' | 'night', Record<'2048' | '1024', string>>;
  };
  /** Axis (glTF node-local) the fan blades spin around. */
  fanAxis: [number, number, number];
}

const isStr = (v: unknown): v is string => typeof v === 'string' && /^[\w.-]+$/.test(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function parseManifest(raw: unknown): Manifest {
  const m = raw as Record<string, any>;
  const atlas = m?.files?.atlas;
  const ok =
    m && isNum(m.deskBase) &&
    Array.isArray(m.presets) && m.presets.length === 3 && m.presets.every(isNum) &&
    Array.isArray(m.range) && m.range.length === 2 && m.range.every(isNum) &&
    isStr(m.files?.glb) &&
    ['day', 'night'].every((t) => isStr(atlas?.[t]?.['2048']) && isStr(atlas?.[t]?.['1024']));
  if (!ok) throw new Error('bad scene manifest');
  const axis = Array.isArray(m.fanAxis) && m.fanAxis.length === 3 && m.fanAxis.every(isNum) ? m.fanAxis : [0, 0, 1];
  return {
    version: String(m.version ?? ''),
    deskBase: m.deskBase,
    presets: m.presets,
    range: m.range,
    files: { glb: m.files.glb, atlas },
    fanAxis: axis as [number, number, number],
  };
}
