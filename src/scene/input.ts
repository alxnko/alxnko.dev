// Camera input: drag (mouse or one finger) looks around the current spot, wheel / pinch
// zoom in and out, a tap on the laptop or monitor flies there.
// Every gesture has a button alternative (the landmark nav), per spec §11.

export interface InputHandlers {
  /** The element that receives camera input (the stage layer under the pinned screens). */
  canvas: HTMLElement;
  reducedMotion: boolean;
  /** Multiply the viewing distance by f (<1 closer), toward the point under (x, y). */
  zoom(f: number, x: number, y: number): void;
  /** Incremental drag in CSS px. */
  orbit(dx: number, dy: number): void;
  pointer(x: number, y: number): void;
  tap(x: number, y: number): void;
  /** Pointer went down (press-and-hold targets); `release` returns true if it consumed the press. */
  press?(x: number, y: number): void;
  release?(): boolean;
  /**
   * Pinned screens that are not scroll areas (the monitor's panes): a touch drag that starts
   * on one still moves the camera, so a screen filling the view can never trap it. A tap on
   * them stays theirs (links), and a drag never ends in a click.
   */
  surfaces?: HTMLElement[];
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
  const pts = new Map<number, { x: number; y: number; x0: number; y0: number; t0: number; surface: boolean }>();
  let draggedAt = -1e9; // when a drag that began on a surface ended (its click is swallowed)
  let pinch0 = 0;
  let axis: 'x' | null = null;

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || inScrollable(e.target)) return; // ctrl+wheel = browser zoom
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    h.zoom(Math.exp(Math.max(-0.5, Math.min(0.5, px * WHEEL_K))), e.clientX, e.clientY);
    e.preventDefault?.();
  };

  const onDown = (e: PointerEvent, surface = false) => {
    if (pts.size === 0 && !surface) h.press?.(e.clientX, e.clientY);
    // (a surface keeps its pointer, or its links would never get their click)
    if (!surface) try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), surface });
    axis = null;
    if (pts.size === 2) {
      h.release?.(); // a pinch is not a press on the paddle
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
      if (pinch0 > 0 && d > 0) h.zoom(pinch0 / d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch0 = d;
      return;
    }
    if (!axis && Math.hypot(p.x - p.x0, p.y - p.y0) > TAP_PX) { axis = 'x'; h.release?.(); }
    if (axis) h.orbit(dx, dy);
  };

  const onUp = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (!p) return;
    // the last finger up always ends a paddle hold, wherever it was
    const held = pts.size === 0 && (h.release?.() ?? false);
    if (p.surface) { if (axis) draggedAt = performance.now(); }
    else if (!held && !axis && performance.now() - p.t0 < TAP_MS && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < TAP_PX) h.tap(e.clientX, e.clientY);
    if (pts.size === 0) axis = null;
  };

  const onCanvasDown = (e: PointerEvent) => onDown(e);
  // touch only: mouse and pen keep selecting text and hovering on the panes
  const onSurfaceDown = (e: PointerEvent) => { if (e.pointerType === 'touch') onDown(e, true); };
  const surfaces = h.surfaces ?? [];
  // on the window, capture phase: runs before any handler on the panes themselves
  const onSurfaceClick = (e: MouseEvent) => {
    if (performance.now() - draggedAt < 400 && surfaces.some((el) => el.contains(e.target as Node))) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  for (const el of surfaces) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', onSurfaceDown);
  }
  addEventListener('click', onSurfaceClick, { capture: true });
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onCanvasDown);
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerup', onUp, { passive: true });
  addEventListener('pointercancel', onUp, { passive: true });
  return () => {
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('pointerdown', onCanvasDown);
    for (const el of surfaces) {
      el.style.removeProperty('touch-action');
      el.removeEventListener('pointerdown', onSurfaceDown);
    }
    removeEventListener('click', onSurfaceClick, { capture: true });
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onUp);
  };
}
