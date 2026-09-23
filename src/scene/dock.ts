// Pins the live DOM onto the 3D screens (spec §3.3, §6.4, revised): the terminal on the
// laptop and the contacts on the monitor are mapped with a projective matrix3d every frame,
// at every camera distance. Only a screen that faces away or leaves the view is hidden.
import { homography, toMatrix3d, type Pt } from './homography';

export interface ScreenQuad {
  /** Projected corners TL, TR, BR, BL in CSS px, or null when behind the camera. */
  quad: Pt[] | null;
  /** True when the screen's front faces the camera. */
  facing: boolean;
}

export class Dock {
  private last = new Map<HTMLElement, string>();
  private sizes = new Map<HTMLElement, [number, number]>();

  constructor(private els: HTMLElement[]) {}

  /** Logical (untransformed) size of each overlay, in CSS px; measured once per resize. */
  size(el: HTMLElement): [number, number] {
    let s = this.sizes.get(el);
    if (!s || !s[0]) this.sizes.set(el, (s = [el.offsetWidth, el.offsetHeight]));
    return s;
  }

  /** Call after the overlays' logical size changes (resize). */
  remeasure() {
    this.sizes.clear();
  }

  private pin(el: HTMLElement, s: ScreenQuad) {
    const [w, h] = this.size(el);
    const on = !!s.quad && s.facing && w > 0 && h > 0;
    const t = on ? safeMatrix([[0, 0], [w, 0], [w, h], [0, h]], s.quad!) : null;
    const mode = t ? 'screen' : 'off';
    if (el.dataset.dock !== mode) el.dataset.dock = mode;
    if (t && t !== this.last.get(el)) {
      el.style.transform = t;
      this.last.set(el, t);
    }
  }

  /** One quad per element, in constructor order. */
  update(quads: ScreenQuad[]) {
    this.els.forEach((el, i) => this.pin(el, quads[i]));
  }

  destroy() {
    for (const el of this.els) {
      delete el.dataset.dock;
      el.style.removeProperty('transform');
    }
  }
}

function safeMatrix(src: Pt[], dst: Pt[]): string | null {
  if (dst.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e5 || Math.abs(y) > 1e5)) return null;
  try {
    return toMatrix3d(homography(src, dst));
  } catch {
    return null;
  }
}
