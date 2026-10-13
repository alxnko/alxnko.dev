/** The logical grid is chosen once; its initial contain rect follows the viewport. */
export interface Viewport { width: number; height: number; left?: number; top?: number; right?: number; bottom?: number }
export interface ConsoleLayout { width: number; height: number; rect: { x: number; y: number; width: number; height: number }; scale: number }
// Self contained: Base emits this same calculation in the CSP-hashed first-paint bootstrap.
export function consoleLayout(view: Viewport, frozen?: { width: number; height: number }): ConsoleLayout {
  const left = view.left ?? 0, top = view.top ?? 0;
  const availableW = Math.max(1, view.width - left - (view.right ?? 0));
  const availableH = Math.max(1, view.height - top - (view.bottom ?? 0));
  const rw = Math.max(1, Math.min(availableW - 32, (availableH - 64) * 1.6, 1280));
  const rh = rw / 1.6;
  const width = frozen?.width ?? Math.min(1280, rw * 2);
  const height = frozen?.height ?? width / 1.6;
  return { width, height, rect: { x: left + (availableW - rw) / 2, y: top + (availableH - rh) / 2, width: rw, height: rh }, scale: rw / width };
}

export function introViewport(): Viewport {
  const el = document.createElement('i');
  el.style.cssText = 'position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.documentElement.append(el);
  const s = getComputedStyle(el);
  const view = { width: innerWidth, height: innerHeight, left: parseFloat(s.paddingLeft) || 0, top: parseFloat(s.paddingTop) || 0, right: parseFloat(s.paddingRight) || 0, bottom: parseFloat(s.paddingBottom) || 0 };
  el.remove();
  return view;
}

// Emitted at build time as ordinary script, without eval or a second layout implementation.
export function bootstrapConsole(layout: typeof consoleLayout, viewport: typeof introViewport) {
  const root = document.documentElement;
  const activate = () => {
    let frozen: ConsoleLayout | undefined;
    const position = () => {
      if (root.dataset.boot !== '3d' || document.body?.dataset.scene === 'ready') { removeEventListener('resize', position); return; }
      const l = layout(viewport(), frozen);
      frozen = l;
      for (const [k, v] of Object.entries({ '--screen-w': l.width + 'px', '--screen-h': l.height + 'px', '--intro-x': l.rect.x + 'px', '--intro-y': l.rect.y + 'px', '--intro-scale': String(l.scale) })) root.style.setProperty(k, v);
    };
    // DOMContentLoaded waits for the stylesheet defining both font faces. Its preload can
    // finish sooner, but a fonts.load call before @font-face registration would resolve [].
    const fonts = () => Promise.all(['400', '700'].map(w => document.fonts.load(`${w} 24px "JetBrains Mono"`, 'a█─')))
      .then(() => { root.dataset.consoleFont = 'ready'; }, () => {});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fonts, { once: true });
    else void fonts();
    position();
    addEventListener('resize', position);
  };
  (window as typeof window & { __consoleIntro?: () => void }).__consoleIntro = activate;
  if (root.dataset.boot === '3d') activate();
}

/** The activated boot's single deadline counts only previously visible elapsed time. */
export function visibleDeadline() {
  const owner = visibleDeadline as typeof visibleDeadline & { stop?: () => void };
  owner.stop?.();
  let left = 15000, since = Date.now(), hidden = document.hidden;
  let timer = 0;
  const elapsed = () => {
    const now = Date.now();
    if (!hidden) left -= now - since;
    since = now; hidden = document.hidden;
  };
  const stop = () => { clearTimeout(timer); document.removeEventListener('visibilitychange', elapsed); };
  const tick = () => {
    elapsed();
    if (document.documentElement.dataset.boot !== '3d' || document.body?.dataset.scene === 'ready') { stop(); return; }
    if (left <= 0) { stop(); document.documentElement.dataset.boot = 'failed'; dispatchEvent(new Event('scene:failed')); return; }
    timer = window.setTimeout(tick, Math.min(1000, left));
  };
  owner.stop = stop;
  document.addEventListener('visibilitychange', elapsed);
  tick();
  return stop;
}
