import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../../src/scene/manifest';

const base = {
  version: '1', deskBase: 0.74, presets: [0.74, 0.9, 1.12], range: [0.7, 1.2],
  files: { glb: 'desk.glb', atlas: { day: { 2048: 'd2.webp', 1024: 'd1.webp' }, night: { 2048: 'n2.webp', 1024: 'n1.webp' } } },
};

describe('parseManifest', () => {
  it('reads the day floor-shadow slide when baked', () => {
    const m = parseManifest({ ...base, nodes: { shadow_floor: { runtime: { sunShiftPerMetre: [1.56, 0, -0.76] } } } });
    expect(m.sunShift).toEqual([1.56, 0, -0.76]);
  });

  it('leaves it out for older builds or bad values', () => {
    expect(parseManifest(base).sunShift).toBeUndefined();
    expect(parseManifest({ ...base, nodes: { shadow_floor: { runtime: { sunShiftPerMetre: [1, 'x', 0] } } } }).sunShift).toBeUndefined();
  });

  it('rejects a manifest missing required fields', () => {
    expect(() => parseManifest({ ...base, deskBase: 'x' })).toThrow();
  });
});
