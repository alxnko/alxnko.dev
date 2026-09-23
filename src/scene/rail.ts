// The camera is a continuous 1-D field t ∈ [0,3] through four landmarks (spec §3.4):
// a centripetal Catmull-Rom spline (no cusps or self-intersections) over position,
// target and fov together, so all three stay in step.
import type { Landmark } from '../term/types';

export type Vec3 = [number, number, number];
export interface Pose { pos: Vec3; target: Vec3; fov: number }

export const LANDMARKS: readonly Landmark[] = ['wide', 'desk', 'laptop', 'monitor'];
export const landmarkT = (l: Landmark): number => LANDMARKS.indexOf(l);

type V = number[];
const pack = (p: Pose): V => [...p.pos, ...p.target, p.fov / 100];
const unpack = (v: V): Pose => ({ pos: [v[0], v[1], v[2]], target: [v[3], v[4], v[5]], fov: v[6] * 100 });
const lerp = (a: V, b: V, t: number): V => a.map((x, i) => x + (b[i] - x) * t);
const dist = (a: V, b: V) => Math.hypot(...a.map((x, i) => x - b[i]));

export class Rail {
  private pts: V[] = [];

  constructor(private poses: Record<Landmark, Pose>) {
    this.rebuild();
  }

  setPoses(p: Partial<Record<Landmark, Pose>>): void {
    this.poses = { ...this.poses, ...p };
    this.rebuild();
  }

  private rebuild() {
    this.pts = LANDMARKS.map((l) => pack(this.poses[l]));
  }

  sample(t: number): Pose {
    const n = this.pts.length;
    const c = Math.min(Math.max(t, 0), n - 1);
    const i = Math.min(Math.floor(c), n - 2);
    const u = c - i;
    const p1 = this.pts[i], p2 = this.pts[i + 1];
    const p0 = i > 0 ? this.pts[i - 1] : lerp(p2, p1, 2); // mirrored phantom endpoints
    const p3 = i + 2 < n ? this.pts[i + 2] : lerp(p1, p2, 2);
    return unpack(centripetal(p0, p1, p2, p3, u));
  }

  nearest(t: number): Landmark {
    return LANDMARKS[Math.min(Math.max(Math.round(t), 0), LANDMARKS.length - 1)];
  }
}

// Barry–Goldman evaluation with alpha = 0.5.
function centripetal(p0: V, p1: V, p2: V, p3: V, u: number): V {
  const EPS = 1e-6;
  const k = (a: V, b: V) => Math.max(Math.sqrt(dist(a, b)), EPS);
  const t0 = 0, t1 = t0 + k(p0, p1), t2 = t1 + k(p1, p2), t3 = t2 + k(p2, p3);
  const t = t1 + (t2 - t1) * u;
  const mix = (a: V, b: V, ta: number, tb: number) => lerp(a, b, (t - ta) / (tb - ta));
  const a1 = mix(p0, p1, t0, t1), a2 = mix(p1, p2, t1, t2), a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2), b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

/** Critically damped spring (no overshoot from rest), solved analytically so any dt is stable. */
export class Spring {
  value = 0;
  target = 0;
  velocity = 0;
  private readonly w: number;

  constructor(k = 120) {
    this.w = Math.sqrt(k);
  }

  snap(v: number): void {
    this.value = this.target = v;
    this.velocity = 0;
  }

  /** Advances by dt seconds; returns true while still moving. */
  step(dt: number): boolean {
    const { w } = this;
    const c1 = this.value - this.target;
    const c2 = this.velocity + w * c1;
    const e = Math.exp(-w * dt);
    const off = (c1 + c2 * dt) * e;
    this.velocity = (c2 - w * (c1 + c2 * dt)) * e;
    this.value = this.target + off;
    if (Math.abs(off) < 1e-4 && Math.abs(this.velocity) < 1e-3) {
      this.value = this.target;
      this.velocity = 0;
      return false;
    }
    return true;
  }
}
