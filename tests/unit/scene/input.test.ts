// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachInput } from '../../../src/scene/input';

let detach: (() => void) | undefined;
afterEach(() => { detach?.(); detach = undefined; document.body.replaceChildren(); });

function fixture() {
  const canvas = document.createElement('div'), surface = document.createElement('a');
  document.body.append(canvas, surface);
  const h = { canvas, reducedMotion: false, zoom: vi.fn(), orbit: vi.fn(), pointer: vi.fn(), tap: vi.fn(), press: vi.fn(), release: vi.fn(() => false), surfaces: [surface] };
  detach = attachInput(h);
  const send = (type: string, id = 1, x = 100, y = 100, target: EventTarget = canvas) =>
    target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
  return { h, surface, send };
}

describe('scene pointer gestures', () => {
  it('never turns a consumed first-finger release into a delayed tap after a pinch', () => {
    const { h, send } = fixture();
    h.release.mockReturnValueOnce(true);
    send('pointerdown');
    send('pointerdown', 2, 120); // consumes the first finger's active hold
    expect(h.release).toHaveReturnedWith(true);
    send('pointerup');
    send('pointerup', 2, 120);
    expect(h.tap).not.toHaveBeenCalled();
    // The latch ends with the gesture, so an ordinary subsequent touch still taps.
    send('pointerdown'); send('pointerup');
    expect(h.tap).toHaveBeenCalledTimes(1);
  });

  it('a pinch without a consumed release zooms but never taps on either finger release', () => {
    const { h, send } = fixture();
    send('pointerdown'); send('pointerdown', 2, 120);
    send('pointermove', 2, 140);
    expect(h.zoom).toHaveBeenCalledWith(0.5, 120, 100);
    send('pointerup', 2, 140); send('pointerup');
    expect(h.tap).not.toHaveBeenCalled();
  });

  it('pointercancel ends a single press without becoming a short tap', () => {
    const { h, send } = fixture();
    send('pointerdown'); send('pointercancel');
    expect(h.release).toHaveBeenCalledTimes(1);
    expect(h.tap).not.toHaveBeenCalled();
    send('pointerdown'); send('pointerup');
    expect(h.tap).toHaveBeenCalledTimes(1);
  });

  it('cancelling one finger suppresses the remaining finger tap', () => {
    const { h, send } = fixture();
    send('pointerdown'); send('pointerdown', 2, 120);
    send('pointercancel'); send('pointerup', 2, 120);
    expect(h.tap).not.toHaveBeenCalled();
  });

  it('single taps stay taps, consumed holds do not, and dragging still orbits', () => {
    const { h, send } = fixture();
    send('pointerdown'); send('pointerup');
    expect(h.tap).toHaveBeenCalledWith(100, 100);
    h.tap.mockClear();
    h.release.mockReturnValueOnce(true);
    send('pointerdown'); send('pointerup');
    expect(h.tap).not.toHaveBeenCalled();
    send('pointerdown'); send('pointermove', 1, 115); send('pointerup', 1, 115);
    expect(h.orbit).toHaveBeenCalledWith(15, 0);
    expect(h.tap).not.toHaveBeenCalled();
  });

  it('a surface drag still suppresses its link click', () => {
    const { h, send, surface } = fixture();
    send('pointerdown', 1, 100, 100, surface);
    send('pointermove', 1, 115, 100, surface);
    send('pointerup', 1, 115, 100, surface);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    surface.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(h.orbit).toHaveBeenCalledWith(15, 0);
    expect(h.tap).not.toHaveBeenCalled();
  });
});
