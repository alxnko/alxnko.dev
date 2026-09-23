import { describe, expect, it } from 'vitest';
import { catStep, frameInterval, nextFlickIn, Tween, type CatState } from '../../../src/scene/anim';

const idle: CatState = { mode: 'idle', since: 0, lastActivity: 0 };

describe('cat state machine', () => {
  it('idle → notice on activity → watch after 400 ms → idle 4 s after last activity', () => {
    let s = catStep(idle, 1000, { activity: true });
    expect(s.mode).toBe('notice');
    s = catStep(s, 1300);
    expect(s.mode).toBe('notice');
    s = catStep(s, 1400);
    expect(s.mode).toBe('watch');
    s = catStep(s, 3000, { activity: true });
    s = catStep(s, 6999);
    expect(s.mode).toBe('watch');
    s = catStep(s, 7000);
    expect(s.mode).toBe('idle');
  });
  it('stays idle without activity', () => expect(catStep(idle, 99999).mode).toBe('idle'));
  it('stare overrides any mode for 3 s then returns to idle', () => {
    let s = catStep({ mode: 'watch', since: 0, lastActivity: 0 }, 100, { stare: true });
    expect(s.mode).toBe('stare');
    s = catStep(s, 3000, { activity: true });
    expect(s.mode).toBe('stare');
    s = catStep(s, 3100);
    expect(s.mode).toBe('idle');
  });
});

describe('timing helpers', () => {
  it('flick interval is 15–40 s', () => {
    expect(nextFlickIn(() => 0)).toBe(15);
    expect(nextFlickIn(() => 0.999999)).toBeCloseTo(40, 3);
  });
  it('tween eases from a to b and clamps', () => {
    const t = new Tween(0.74, 1.12, 1000, 1500);
    expect(t.value(0)).toBeCloseTo(0.74);
    expect(t.value(1750)).toBeCloseTo(0.93);
    expect(t.value(99999)).toBeCloseTo(1.12);
    expect(t.done(2500)).toBe(true);
  });
  it('render policy', () => {
    expect(frameInterval({ animating: true, hidden: false, reducedMotion: false, idleMs: 0 })).toBe(0);
    expect(frameInterval({ animating: false, hidden: false, reducedMotion: false, idleMs: 5000 })).toBe(50);
    expect(frameInterval({ animating: false, hidden: false, reducedMotion: false, idleMs: 61000 })).toBe(125);
    expect(frameInterval({ animating: false, hidden: false, reducedMotion: true, idleMs: 0 })).toBeNull();
    expect(frameInterval({ animating: true, hidden: true, reducedMotion: false, idleMs: 0 })).toBeNull();
  });
});
