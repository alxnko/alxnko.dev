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
  /** How far the day floor shadow slides per metre the desk rises (glTF x/y/z), if baked. */
  sunShift?: [number, number, number];
  /** The cat's resting gaze as posed in Blender (rig space = the cat body's frame), if baked. */
  headForward?: [number, number, number];
}

const isStr = (v: unknown): v is string => typeof v === 'string' && /^[\w.-]+$/.test(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(isNum);

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
  const sun = m.nodes?.shadow_floor?.runtime?.sunShiftPerMetre;
  const gaze = m.nodes?.cat_body?.headForward;
  const axis = Array.isArray(m.fanAxis) && m.fanAxis.length === 3 && m.fanAxis.every(isNum) ? m.fanAxis : [0, 0, 1];
  return {
    version: String(m.version ?? ''),
    deskBase: m.deskBase,
    presets: m.presets,
    range: m.range,
    files: { glb: m.files.glb, atlas },
    fanAxis: axis as [number, number, number],
    ...(isVec3(sun) ? { sunShift: sun } : {}),
    ...(isVec3(gaze) && Math.hypot(...gaze) > 0.5 ? { headForward: gaze } : {}),
  };
}
