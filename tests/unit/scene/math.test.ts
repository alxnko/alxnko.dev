import { describe, expect, it } from 'vitest';
import { decide3D } from '../../../src/scene/gate';
import { Rail, Spring, type Pose } from '../../../src/scene/rail';
import { homography, applyH, toMatrix3d } from '../../../src/scene/homography';

const base = { url: 'https://alxnko.dev/', webgl2: true, cores: 8, memory: 8 };

describe('decide3D', () => {
  it('auto on a capable device', () => expect(decide3D(base)).toBe('auto'));
  it('auto when memory/cores unknown', () => expect(decide3D({ ...base, cores: undefined, memory: undefined })).toBe('auto'));
  it('never without webgl2, even with ?3d', () => {
    expect(decide3D({ ...base, webgl2: false })).toBe('never');
    expect(decide3D({ ...base, webgl2: false, url: 'https://alxnko.dev/?3d' })).toBe('never');
  });
  it('?lite forces offer', () => expect(decide3D({ ...base, url: 'https://alxnko.dev/?lite' })).toBe('offer'));
  it('save-data and 2g offer', () => {
    expect(decide3D({ ...base, saveData: true })).toBe('offer');
    expect(decide3D({ ...base, effectiveType: '2g' })).toBe('offer');
    expect(decide3D({ ...base, effectiveType: 'slow-2g' })).toBe('offer');
  });
  it('weak devices get offer', () => {
    expect(decide3D({ ...base, cores: 2 })).toBe('offer');
    expect(decide3D({ ...base, memory: 2 })).toBe('offer');
  });
  it('software WebGL (no GPU) gets offer, ?3d still forces it', () => {
    expect(decide3D({ ...base, softwareGL: true })).toBe('offer');
    expect(decide3D({ ...base, softwareGL: true, url: 'https://x.dev/?3d' })).toBe('auto');
  });
  it('?3d forces auto over save-data and weak device', () =>
    expect(decide3D({ ...base, url: 'https://x.dev/?3d', saveData: true, cores: 2 })).toBe('auto'));
});

const P = (x: number, fov = 50): Pose => ({ pos: [x, 1, -1], target: [x, 0.8, 0], fov });
const poses = { wide: P(0, 55), desk: P(1), laptop: P(2, 40), monitor: P(4, 40) };

describe('Rail', () => {
  const rail = new Rail(poses);
  it('passes through every landmark exactly', () => {
    (['wide', 'desk', 'laptop', 'monitor'] as const).forEach((k, i) => {
      const s = rail.sample(i);
      expect(s.pos[0]).toBeCloseTo(poses[k].pos[0], 9);
      expect(s.target[0]).toBeCloseTo(poses[k].target[0], 9);
      expect(s.fov).toBeCloseTo(poses[k].fov, 9);
    });
  });
  it('clamps t outside [0,3]', () => {
    expect(rail.sample(-1).pos[0]).toBeCloseTo(0);
    expect(rail.sample(9).pos[0]).toBeCloseTo(4);
  });
  it('is continuous (no jumps between samples)', () => {
    let prev = rail.sample(0).pos[0];
    for (let t = 0.01; t <= 3; t += 0.01) {
      const x = rail.sample(t).pos[0];
      expect(Math.abs(x - prev)).toBeLessThan(0.1);
      prev = x;
    }
  });
  it('nearest landmark', () => {
    expect(rail.nearest(0.4)).toBe('wide');
    expect(rail.nearest(1.6)).toBe('laptop');
    expect(rail.nearest(2.9)).toBe('monitor');
  });
  it('setPoses updates a landmark', () => {
    const r = new Rail(poses);
    r.setPoses({ laptop: P(7) });
    expect(r.sample(2).pos[0]).toBeCloseTo(7);
  });
});

describe('Spring', () => {
  it('converges without overshoot', () => {
    const s = new Spring(120);
    s.snap(0);
    s.target = 1;
    let max = 0;
    let t = 0;
    while (t < 1.2) { s.step(1 / 60); max = Math.max(max, s.value); t += 1 / 60; }
    expect(max).toBeLessThanOrEqual(1 + 1e-9);
    expect(s.value).toBeCloseTo(1, 3);
    expect(s.step(1 / 60)).toBe(false);
  });
  it('is stable with a large dt (tab resume)', () => {
    const s = new Spring(120);
    s.snap(0); s.target = 1;
    s.step(2);
    expect(Number.isFinite(s.value)).toBe(true);
    expect(s.value).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('homography', () => {
  const unit: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  it('maps unit square onto a known quad', () => {
    const quad: [number, number][] = [[10, 20], [110, 25], [105, 95], [5, 90]];
    const H = homography(unit, quad);
    unit.forEach((p, i) => {
      const [x, y] = applyH(H, p[0], p[1]);
      expect(x).toBeCloseTo(quad[i][0], 6);
      expect(y).toBeCloseTo(quad[i][1], 6);
    });
  });
  it('maps an 800x500 element onto a quad (element px space)', () => {
    const src: [number, number][] = [[0, 0], [800, 0], [800, 500], [0, 500]];
    const dst: [number, number][] = [[100, 50], [900, 70], [880, 560], [120, 540]];
    const H = homography(src, dst);
    const [x, y] = applyH(H, 400, 250);
    expect(x).toBeGreaterThan(100); expect(x).toBeLessThan(900);
    expect(y).toBeGreaterThan(50); expect(y).toBeLessThan(560);
  });
  it('identity matrix3d', () => {
    expect(toMatrix3d(homography(unit, unit))).toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)');
  });
  it('rejects degenerate quads', () => {
    expect(() => homography(unit, [[0, 0], [0, 0], [0, 0], [0, 0]])).toThrow();
  });
});
