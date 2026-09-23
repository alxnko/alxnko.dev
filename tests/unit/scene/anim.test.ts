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
    // a spinning fan keeps a steady frame rate however long the page has been idle
    expect(frameInterval({ animating: false, hidden: false, reducedMotion: false, idleMs: 61000, spinning: true })).toBe(33);
    expect(frameInterval({ animating: false, hidden: true, reducedMotion: false, idleMs: 0, spinning: true })).toBeNull();
  });
});

import { constrainGaze } from '../../../src/scene/anim';

describe('constrainGaze', () => {
  const D = Math.PI / 180;
  const lim = { yaw: 50 * D, up: 12 * D, down: 20 * D };
  const el = (v: number[]) => Math.asin(v[1]) / D;
  const az = (v: number[]) => Math.atan2(v[0], v[2]) / D;
  it('passes a target inside the range through', () => {
    const v = constrainGaze([0, 0, 1], [0.2, 0.05, 1], [0, 1, 0], lim);
    expect(az(v)).toBeCloseTo(Math.atan2(0.2, 1) / D, 1);
  });
  it('never looks steeply up (head would go into the body)', () => {
    const v = constrainGaze([0, 0, 1], [0, 1, 0.01], [0, 1, 0], lim);
    expect(el(v)).toBeLessThanOrEqual(12.01);
  });
  it('clamps sideways and downward', () => {
    expect(Math.abs(az(constrainGaze([0, 0, 1], [1, 0, -0.5], [0, 1, 0], lim)))).toBeLessThanOrEqual(50.01);
    expect(el(constrainGaze([0, 0, 1], [0, -1, 0.1], [0, 1, 0], lim))).toBeGreaterThanOrEqual(-20.01);
  });
  it('limits are relative to a tilted rest pose', () => {
    const rest = [0, Math.sin(10 * D), Math.cos(10 * D)] as [number, number, number];
    expect(el(constrainGaze(rest, [0, 1, 0.01], [0, 1, 0], lim))).toBeCloseTo(22, 0);
  });
});
