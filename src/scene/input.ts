// Camera input: drag (mouse or one finger) looks around the current spot, wheel / pinch
// zoom in and out, a tap on the laptop or monitor flies there.
// Every gesture has a button alternative (the landmark nav), per spec §11.

export interface InputHandlers {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
  /** Multiply the viewing distance by f (<1 closer). */
  zoom(f: number): void;
  /** Incremental drag in CSS px. */
  orbit(dx: number, dy: number): void;
  pointer(x: number, y: number): void;
  tap(x: number, y: number): void;
}

const WHEEL_K = 0.0012;
const TAP_PX = 8;
const TAP_MS = 350;

/** Wheel events that belong to a scrollable DOM region (e.g. docked terminal) are left alone. */
function inScrollable(t: EventTarget | null): boolean {
  let el = t instanceof Element ? t : null;
  while (el && el !== document.body) {
    if (el instanceof HTMLElement && el.scrollHeight > el.clientHeight + 1) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') return true;
    }
    el = el.parentElement;
  }
  return false;
}

export function attachInput(h: InputHandlers): () => void {
  const { canvas } = h;
  canvas.style.touchAction = 'none';
  const pts = new Map<number, { x: number; y: number; x0: number; y0: number; t0: number }>();
  let pinch0 = 0;
  let axis: 'x' | null = null;

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || inScrollable(e.target)) return; // ctrl+wheel = browser zoom
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    h.zoom(Math.exp(Math.max(-0.5, Math.min(0.5, px * WHEEL_K))));
    e.preventDefault?.();
  };

  const onDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    axis = null;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && !pts.has(e.pointerId)) { h.pointer(e.clientX, e.clientY); return; }
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0 && d > 0) h.zoom(pinch0 / d);
      pinch0 = d;
      return;
    }
    if (!axis && Math.hypot(p.x - p.x0, p.y - p.y0) > TAP_PX) axis = 'x';
    if (axis) h.orbit(dx, dy);
  };

  const onUp = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (!p) return;
    if (!axis && performance.now() - p.t0 < TAP_MS && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < TAP_PX) h.tap(e.clientX, e.clientY);
    if (pts.size === 0) axis = null;
  };

  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerup', onUp, { passive: true });
  addEventListener('pointercancel', onUp, { passive: true });
  return () => {
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('pointerdown', onDown);
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onUp);
  };
}
