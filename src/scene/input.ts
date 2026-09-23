// Camera input (spec §3.4): wheel / vertical swipe / pinch scrub along the rail; drag
// orbits a little and springs back; a tap on the laptop or monitor flies there.
// Every gesture has a button alternative (the landmark nav), per spec §11.

export interface InputHandlers {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
  scrub(dt: number): void;
  orbit(dx: number, dy: number): void;
  release(): void;
  pointer(x: number, y: number): void;
  tap(x: number, y: number): void;
}

const WHEEL_K = 0.0015;
const SWIPE_K = 0.006;
const PINCH_K = 0.012;
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
  let axis: 'x' | 'y' | null = null;

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || inScrollable(e.target)) return; // ctrl+wheel = browser zoom
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    h.scrub(Math.max(-0.6, Math.min(0.6, px * WHEEL_K)));
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
      h.scrub((d - pinch0) * PINCH_K * 0.1);
      pinch0 = d;
      return;
    }
    const tx = p.x - p.x0, ty = p.y - p.y0;
    if (!axis && Math.hypot(tx, ty) > TAP_PX) axis = Math.abs(ty) > Math.abs(tx) ? 'y' : 'x';
    if (e.pointerType === 'touch') {
      if (axis === 'y') h.scrub(-dy * SWIPE_K * 0.1);
      else if (axis === 'x') h.orbit(tx, 0);
    } else if (axis) {
      h.orbit(tx, ty);
    }
  };

  const onUp = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (!p) return;
    if (!axis && performance.now() - p.t0 < TAP_MS && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < TAP_PX) h.tap(e.clientX, e.clientY);
    if (pts.size === 0) { axis = null; h.release(); }
  };

  addEventListener('wheel', onWheel, { passive: true });
  canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerup', onUp, { passive: true });
  addEventListener('pointercancel', onUp, { passive: true });
  return () => {
    removeEventListener('wheel', onWheel);
    canvas.removeEventListener('pointerdown', onDown);
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onUp);
  };
}
