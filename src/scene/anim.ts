// Pure animation logic (unit-tested); the scene applies the results to nodes.

export type CatMode = 'idle' | 'notice' | 'watch' | 'stare';
export interface CatState { mode: CatMode; since: number; lastActivity: number }

export const CAT_NOTICE_MS = 400;
export const CAT_WATCH_MS = 4000;
export const CAT_STARE_MS = 3000;

/** IDLE → (activity) NOTICE → WATCH (≤4 s after last activity) → IDLE; STARE overrides for 3 s. */
export function catStep(s: CatState, now: number, ev: { activity?: boolean; stare?: boolean } = {}): CatState {
  if (ev.stare) return { mode: 'stare', since: now, lastActivity: now };
  if (s.mode === 'stare') {
    return now - s.since >= CAT_STARE_MS ? { mode: 'idle', since: now, lastActivity: s.lastActivity } : s;
  }
  const last = ev.activity ? now : s.lastActivity;
  switch (s.mode) {
    case 'idle':
      return ev.activity ? { mode: 'notice', since: now, lastActivity: now } : s;
    case 'notice':
      return now - s.since >= CAT_NOTICE_MS ? { mode: 'watch', since: now, lastActivity: last } : { ...s, lastActivity: last };
    case 'watch':
      return now - last >= CAT_WATCH_MS ? { mode: 'idle', since: now, lastActivity: last } : { ...s, lastActivity: last };
  }
}

/** Seconds until the next idle tail flick: uniformly 15–40 s. */
export const nextFlickIn = (rand: () => number = Math.random) => 15 + rand() * 25;

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A time-based tween from a to b; value(now) is pure. */
export class Tween {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly start: number,
    readonly ms: number,
    readonly ease: (t: number) => number = easeInOut,
  ) {}
  value(now: number) {
    const t = this.ms <= 0 ? 1 : clamp((now - this.start) / this.ms, 0, 1);
    return this.from + (this.to - this.from) * this.ease(t);
  }
  done(now: number) {
    return now - this.start >= this.ms;
  }
}

/** Render-rate policy (spec §6.3): ms between frames, or null = render only on change. */
/**
 * Delay before the next frame: 0 = next vsync, null = sleep until something invalidates.
 * A spinning fan in view keeps a steady 30 fps (no idle slowdown); otherwise idle frames
 * drop to 20 fps and, after a minute without input, to 8 fps.
 */
export function frameInterval(o: { animating: boolean; hidden: boolean; reducedMotion: boolean; idleMs: number; spinning?: boolean }): number | null {
  if (o.hidden) return null;
  if (o.animating) return 0;
  if (o.reducedMotion) return null;
  if (o.spinning) return SPIN_FRAME_MS;
  return o.idleMs > 60_000 ? 125 : 50;
}
export const SPIN_FRAME_MS = 33;

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export interface GazeLimits { yaw: number; up: number; down: number }

/**
 * Where the cat may look: `want` constrained to a natural head range around `rest`
 * (radians: ±yaw sideways, `up` above and `down` below the resting line), measured in a
 * frame whose vertical is `up`. Keeps the head out of its own body whatever the target.
 */
export function constrainGaze(rest: V3, want: V3, upAxis: V3, lim: GazeLimits): V3 {
  const u = norm(upAxis);
  // rest direction split into horizontal heading + elevation
  const restEl = Math.asin(Math.max(-1, Math.min(1, dot(norm(rest), u))));
  const f = norm([rest[0] - u[0] * dot(rest, u), rest[1] - u[1] * dot(rest, u), rest[2] - u[2] * dot(rest, u)]);
  const r = norm(cross(f, u));
  const w = norm(want);
  const az = Math.atan2(dot(w, r), dot(w, f));
  const el = Math.asin(Math.max(-1, Math.min(1, dot(w, u))));
  const a = Math.max(-lim.yaw, Math.min(lim.yaw, az));
  const e = Math.max(restEl - lim.down, Math.min(restEl + lim.up, el));
  const c = Math.cos(e);
  return norm([
    f[0] * c * Math.cos(a) + r[0] * c * Math.sin(a) + u[0] * Math.sin(e),
    f[1] * c * Math.cos(a) + r[1] * c * Math.sin(a) + u[1] * Math.sin(e),
    f[2] * c * Math.cos(a) + r[2] * c * Math.sin(a) + u[2] * Math.sin(e),
  ]);
}
