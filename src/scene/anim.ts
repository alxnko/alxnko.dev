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
export function frameInterval(o: { animating: boolean; hidden: boolean; reducedMotion: boolean; idleMs: number }): number | null {
  if (o.hidden) return null;
  if (o.animating) return 0;
  if (o.reducedMotion) return null;
  return o.idleMs > 60_000 ? 125 : 50;
}
