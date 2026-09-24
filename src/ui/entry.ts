// Page entry: wires the real terminal core to the DOM, composes the world the terminal
// talks to (page theme + sound + the lazy 3D desk), and runs the 3D gate after load.
import type { FanSpeed, Landmark, SoundLevel, Theme, WorldPort, WorldState } from '../term/types';
import { TermStore } from '../term/store';
import { Shell } from '../term/exec';
import { complete } from '../term/complete';
import { suggest } from '../term/suggest';
import { createFs } from '../term/vfs';
import { bootLines } from '../term/boot';
import { DEFAULT_WORLD } from '../term/world';
import { createSound } from '../audio/sound';
import { decide3D } from '../scene/gate';
import type { SceneWorld } from '../scene/index';
import * as prefs from '../lib/prefs';
import { parseRgb } from '../lib/rgb';
import { loadRgb, saveRgb } from './accent';
import { SOUND_EVENT, soundLevel, start } from './app';
import { currentTheme, setTheme, THEME_EVENT } from './theme';
import { FrameView } from './terminal-dom';
import { prefetchText } from '../term/lazy';

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const narrow = () => innerWidth < 640;

/** The world the terminal talks to. Works without 3D; the scene attaches when it loads. */
class AppWorld implements WorldPort {
  scene: SceneWorld | null = null;
  readonly sound = createSound();
  private s: WorldState;

  constructor() {
    const { rgb, accent } = loadRgb();
    saveRgb(rgb, accent); // what the <head> script applied, now validated (or corrected)
    this.s = { ...DEFAULT_WORLD, theme: currentTheme(), sound: soundLevel(), rgb, accent };
  }

  get(): WorldState {
    return { ...this.s, theme: currentTheme(), landmark: this.scene?.landmark() ?? this.s.landmark };
  }
  has3d(): boolean {
    return this.scene !== null;
  }
  fly(to: Landmark): void {
    this.s.landmark = to;
    this.scene?.fly(to);
  }
  /** The desk was moved directly (press-and-hold on the paddle). */
  noteDesk(h: number): void {
    this.s.desk = h;
  }
  setDesk(h: number): Promise<void> {
    this.s.desk = h;
    this.sound.motor(reducedMotion() || !this.scene ? 200 : 1500);
    return this.scene ? this.scene.setDesk(h) : Promise.resolve();
  }
  setTheme(t: Theme): void {
    setTheme(t); // page tokens + persistence; the THEME_EVENT listener updates the scene
  }
  setRgb(spec: string): void {
    const rgb = parseRgb(spec);
    if (rgb === null) return;
    const accent = rgb === 'off' ? this.s.accent : rgb;
    this.s.rgb = rgb;
    this.s.accent = accent;
    saveRgb(rgb, accent);
    this.scene?.setRgb(rgb, accent);
  }
  setFan(f: FanSpeed): void {
    this.s.fan = f;
    this.sound.fan(f);
    this.scene?.setFan(f);
  }
  setSound(l: SoundLevel): void {
    this.s.sound = l;
    prefs.set('sound', l);
    this.sound.setLevel(l);
    document.dispatchEvent(new CustomEvent<SoundLevel>(SOUND_EVENT, { detail: l }));
  }
  meow(): void {
    this.sound.meow();
    this.scene?.meow();
  }
  stare(): void {
    this.scene?.stare();
  }
  sfx(kind: 'key' | 'enter' | 'tick'): void {
    this.sound[kind]();
  }
}

const world = new AppWorld();
const store = new TermStore();
const fs = createFs();
const shell = new Shell(store, world, fs);
let booting: AbortController | null = null;

async function boot(first: boolean) {
  // fastfetch's block-art cat and box lines use the symbols subset (R69). It is fetched here,
  // during the boot log, not preloaded in <head> where it competed with the first paint
  void document.fonts?.load('400 16px "JetBrains Mono"', '█─').catch(() => {});
  if (first) {
    booting = new AbortController();
    const { signal } = booting;
    const lines = bootLines();
    const step = reducedMotion() ? 0 : 1200 / lines.length;
    for (const l of lines) {
      if (signal.aborted) break;
      store.print(l);
      if (step) await new Promise((r) => setTimeout(r, step));
    }
    booting = null;
  }
  // the autologin's own command: not the visitor's history, and the first chips stay put
  await shell.run(first && !narrow() ? 'fastfetch' : 'fastfetch --compact', { record: false });
}

/**
 * The terminal's long text (man pages, phrases) warms in idle time once nothing else is loading:
 * after the desk is up, or when there is no desk to wait for (R90). Once per visit.
 */
let warmed = false;
function warmText() {
  if (warmed) return;
  warmed = true;
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(prefetchText, { timeout: 4000 });
  else setTimeout(prefetchText, 1500);
}

/** Answered once in <head> (Base.astro); probe only if that script did not run. */
function hasWebGL2(): boolean {
  const known = document.documentElement.dataset.gl;
  if (known) return known === '2';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/** The <head> gate's WebGL canvas (Base.astro), handed to the desk once so its context is reused. */
function takeProbe(): HTMLCanvasElement | undefined {
  const w = window as typeof window & { __glProbe?: HTMLCanvasElement };
  const c = w.__glProbe;
  delete w.__glProbe;
  return c;
}

// the same deadline as the head watchdog (Base.astro): once the page has been revealed the
// desk never takes it over mid-read
const MOUNT_TIMEOUT_MS = 15000;

const $ = (id: string) => document.getElementById(id);

function enter3d() {
  const stage = $('stage'), termEl = $('term'), contactsEl = $('contacts');
  const btn = $('enter3d') as HTMLButtonElement | null;
  if (!stage || !termEl || !contactsEl) return;
  if (btn) { btn.disabled = true; btn.textContent = 'loading 3d'; }
  document.body.dataset.scene = 'loading';
  const initial = world.get();
  const mounting = import('../scene/index').then((m) =>
      m.mount({
        stage,
        store,
        initial,
        reducedMotion: reducedMotion(),
        probe: takeProbe(),
        mobile: matchMedia('(pointer: coarse)').matches || innerWidth < 720,
        termEl,
        contactsEl,
        infoEl: $('mon-info') ?? undefined,
        onLandmark(l) {
          const from = document.activeElement;
          document.body.dataset.view = l; // scene.css: only the screen you're at is selectable
          syncMonitorLinks();
          // arrived by keyboard (the contacts' tab stop, or the nav's monitor button): focus
          // goes on to the first contact, which is live now
          if (l === 'monitor' && (from === $('contacts') || (from as HTMLElement | null)?.dataset?.landmark === 'monitor')) {
            document.querySelector<HTMLElement>('#contacts a')?.focus({ preventScroll: true });
          }
          for (const b of document.querySelectorAll<HTMLButtonElement>('#nav [data-landmark]')) {
            if (b.dataset.landmark === l) b.setAttribute('aria-current', 'true');
            else b.removeAttribute('aria-current');
          }
        },
        onStep(stepName, state) {
          const li = document.querySelector<HTMLElement>(`#loader-steps [data-step="${stepName}"]`);
          if (!li) return;
          li.dataset.state = state;
          const st = li.querySelector('.st');
          if (st) st.textContent = state === 'ok' ? '[  OK  ]' : '[  ..  ]';
        },
        onProgress(p) {
          $('loader-fill')?.style.setProperty('--p', String(Math.min(1, Math.max(0, p))));
        },
        onHold(state, h) {
          if (state === 'start') { stopMotor = world.sound.motorHold(); return; }
          stopMotor?.();
          stopMotor = null;
          world.noteDesk(h);
          store.print([{ text: 'desk: ' }, { text: `${Math.round(h * 100)} cm`, fg: 'white' }]);
        },
        onPaddle(key) {
          // the paddle is just another way to type `desk N`: the terminal shows it too
          const { input, cursor } = store.state; // a half-typed line survives the press
          void shell.run(`desk ${key}`).then(() => store.setInput(input, cursor));
        },
        onAway(away) {
          const b = $('back');
          if (b) b.hidden = !away;
          syncAwayHistory(away);
        },
      }));
  let timedOut = false;
  // the deadline only counts time the page is actually shown (a background tab loads slowly
  // and that is fine; it must not fall back to the page for it)
  const timeout = new Promise<never>((_, reject) => {
    let left = MOUNT_TIMEOUT_MS, since = performance.now();
    const tick = () => {
      const now = performance.now();
      if (!document.hidden) left -= now - since;
      since = now;
      if (left <= 0) { timedOut = true; reject(new Error('3d load timed out')); }
      else setTimeout(tick, Math.min(1000, left));
    };
    setTimeout(tick, 1000);
  });
  // a mount that finishes after the timeout cleans up after itself
  mounting.then((h) => { if (timedOut) h.destroy(); }, () => {});
  Promise.race([mounting, timeout])
    .then((handle) => {
      handle3d = handle;
      world.scene = handle.world;
      // anything changed while the desk was loading (theme, desk height, rgb, fan) was only
      // applied to the page: bring the scene up to date now that it is listening
      const now = world.get(), was = initial;
      if (now.theme !== was.theme) handle.world.setTheme(now.theme);
      if (now.rgb !== was.rgb || now.accent !== was.accent) handle.world.setRgb(now.rgb, now.accent);
      if (now.fan !== was.fan) handle.world.setFan(now.fan);
      if (now.desk !== was.desk) void handle.world.setDesk(now.desk);
      document.body.dataset.mode = 'scene';
      document.body.dataset.scene = 'ready';
      syncMonitorLinks();
      if (btn) btn.hidden = true;
      warmText();
      // the live desk covers the poster for good: a download still under way is dropped
      const img = document.querySelector<HTMLImageElement>('#poster img');
      if (img && !img.complete) { img.parentElement?.querySelectorAll('source').forEach((s) => s.remove()); img.removeAttribute('src'); }
    })
    .catch((e) => {
      console.warn('3d unavailable:', e);
      leave3d();
    });
}

let handle3d: { destroy(): void } | null = null;
let stopMotor: (() => void) | null = null;
function leave3d() {
  // a <head> probe context the desk never took (the chunk failed to load, or the boot timed
  // out first) is released now rather than whenever it is collected
  takeProbe()?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  handle3d?.destroy();
  handle3d = null;
  world.scene = null;
  document.body.dataset.mode = 'page';
  delete document.body.dataset.scene;
  syncMonitorLinks();
  delete document.documentElement.dataset.boot; // reveal the page (no loader, no 3D)
  warmText();
  const btn = $('enter3d') as HTMLButtonElement | null;
  if (btn && hasWebGL2()) { btn.hidden = false; btn.disabled = false; btn.textContent = 'enter 3d'; }
}

// The <head> check already decided this visit boots into 3D: start now, not after idle.
const booting3d = document.documentElement.dataset.boot === '3d';
// just after the first paint: the loader and hint show at once, and the desk's downloads
// don't compete with the page's own first paint (a timer backs up rAF in covered windows)
if (booting3d) {
  let started = false;
  const go = () => { if (!started) { started = true; enter3d(); } };
  requestAnimationFrame(() => setTimeout(go, 0));
  setTimeout(go, 120);
}

function afterIdle() {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number };
  const gate = decide3D({
    url: location.href,
    webgl2: hasWebGL2(),
    saveData: nav.connection?.saveData,
    effectiveType: nav.connection?.effectiveType,
    cores: nav.hardwareConcurrency || undefined,
    memory: nav.deviceMemory,
  });
  const btn = $('enter3d') as HTMLButtonElement | null;
  btn?.addEventListener('click', enter3d);
  if (gate === 'auto' && !booting3d) enter3d();
  else if (gate === 'offer' && btn) btn.hidden = false;
  if (gate !== 'auto' && !booting3d) warmText(); // no desk loading: nothing to compete with
}

// A pinned screen seen from afar is one big button: the first click flies you there (links
// don't fire, text doesn't select); once you're at it, it behaves like a normal screen.
const SCREENS: [string, Landmark][] = [['term', 'laptop'], ['contacts', 'monitor'], ['mon-info', 'monitor']];
for (const [id, l] of SCREENS) {
  const el = $(id);
  if (!el) continue;
  el.addEventListener('click', (e) => {
    if (!world.scene || document.body.dataset.view === l) return;
    e.preventDefault();
    e.stopPropagation();
    world.fly(l);
    if (l === 'laptop') (document.getElementById('term-input') as HTMLInputElement | null)?.focus({ preventScroll: true });
  }, { capture: true });
}

// camera nav, back to desk (button or Esc), focus → fly, theme → scene
$('back')?.addEventListener('click', () => world.fly('desk'));
// View mode: the interface fades away and the camera gets wider (bounded) free-look. Leave it
// with the eye button, Esc, or the phone's Back (an extra history entry catches it).
const viewBtn = $('t-view') as HTMLButtonElement | null;
const exitBtn = $('noui-exit') as HTMLButtonElement | null;
const inViewMode = () => document.body.dataset.noui !== undefined;
function setViewMode(on: boolean, fromHistory = false) {
  if (on === inViewMode() || (on && !world.scene)) return;
  if (on) {
    document.body.dataset.noui = '';
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (!fromHistory) history.pushState({ noui: true }, '');
    if (exitBtn) exitBtn.hidden = false;
    viewBtn?.setAttribute('aria-pressed', 'true');
    exitBtn?.focus({ preventScroll: true });
  } else {
    delete document.body.dataset.noui;
    if (exitBtn) exitBtn.hidden = true;
    viewBtn?.setAttribute('aria-pressed', 'false');
    if (!fromHistory && history.state?.noui) popQuietly();
    viewBtn?.focus({ preventScroll: true });
  }
  world.scene?.setFreeLook(on);
}
viewBtn?.addEventListener('click', () => setViewMode(true));
exitBtn?.addEventListener('click', () => setViewMode(false));
// Back (phone gesture/button, browser Back) peels one layer: view mode → interface, then
// "away from the desk" → the desk, then it leaves the page as usual. Each layer is one history
// entry; leaving a layer another way (button, Esc) removes its entry so history stays clean.
let skipPop = false;
// a reload starts at the desk with the interface shown: an entry left over from before it
// would make the first Back do nothing visible
if (history.state?.away || history.state?.noui) history.replaceState(null, '');
function popQuietly() { skipPop = true; history.back(); }
function syncAwayHistory(away: boolean) {
  if (away && !history.state?.away && !history.state?.noui) history.pushState({ away: true }, '');
  else if (!away && history.state?.away) popQuietly();
}
const isAway = () => !!world.scene && !$('back')?.hidden;
addEventListener('popstate', () => {
  if (skipPop) skipPop = false;
  else if (inViewMode()) setViewMode(false, true);
  else if (isAway()) { world.fly('desk'); return; }
  // back on the interface but still away from the desk (e.g. after view mode): re-arm Back
  if (isAway()) syncAwayHistory(true);
});

addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && inViewMode()) { e.preventDefault(); setViewMode(false); return; }
  // the terminal claims Esc first (completions, history search, a running toy)
  if (e.key === 'Escape' && world.scene && !e.defaultPrevented) {
    (document.activeElement as HTMLElement | null)?.blur?.();
    world.fly('desk');
  }
});
for (const b of document.querySelectorAll<HTMLButtonElement>('#nav [data-landmark]'))
  b.addEventListener('click', () => world.fly(b.dataset.landmark as Landmark));
$('term')?.addEventListener('focusin', () => { if (world.scene) world.fly('laptop'); });
// Phones: "typing mode" follows the on-screen keyboard itself, not just focus (Android keeps
// focus when the keyboard is dismissed with back/arrow). The keyboard shrinks the viewport
// (interactive-widget=resizes-content): while it is up and the terminal has focus, the chrome
// steps aside and the laptop screen fills what's left; when it goes down, focus is released
// and everything returns.
const coarse = matchMedia('(pointer: coarse)');
const input = document.getElementById('term-input') as HTMLInputElement | null;
// Browsers differ: some shrink the layout viewport for the keyboard (innerHeight), others only
// the visual viewport; take the smaller of the two against the tallest height seen.
const viewH = () => Math.min(innerHeight, visualViewport?.height ?? innerHeight);
let fullH = viewH();
let keyboardWasUp = false;
const syncTyping = () => {
  const h = viewH();
  const kbUp = h < fullH * 0.8;
  if (!kbUp) fullH = Math.max(fullH, h);
  // phones: the keyboard going down ends typing (desktop windows resize for other reasons)
  if (coarse.matches && keyboardWasUp && !kbUp && document.activeElement === input) input?.blur();
  keyboardWasUp = kbUp;
  const on = coarse.matches && !!world.scene && kbUp && document.activeElement === input;
  // already typing: the visible slice can still move (iOS pans the visual viewport)
  if (on && document.body.dataset.typing !== undefined) { dispatchEvent(new Event('scene:refit')); return; }
  if (on === (document.body.dataset.typing !== undefined)) return;
  if (on) document.body.dataset.typing = ''; else delete document.body.dataset.typing;
  dispatchEvent(new Event('scene:refit'));
};
addEventListener('resize', syncTyping);
visualViewport?.addEventListener('resize', syncTyping);
visualViewport?.addEventListener('scroll', syncTyping);
addEventListener('orientationchange', () => { fullH = 0; setTimeout(() => { fullH = viewH(); syncTyping(); }, 400); });
input?.addEventListener('focus', () => setTimeout(syncTyping, 350));
input?.addEventListener('blur', syncTyping);
$('contacts')?.addEventListener('focusin', () => { if (world.scene) world.fly('monitor'); });
document.addEventListener(THEME_EVENT, () => world.scene?.setTheme(currentTheme()));

// sound: a saved "on" resumes at the first gesture (autoplay rules)
if (soundLevel() !== 'off') {
  const resume = () => world.sound.setLevel(soundLevel());
  addEventListener('pointerdown', resume, { once: true, capture: true });
  addEventListener('keydown', resume, { once: true, capture: true });
}

// ^C: the interrupt key for fingers (phones have no ctrl). Shown while a foreground job runs
// (CSS holds it back for a moment, so a quick command doesn't flash it); a tap on a running
// toy's screen makes it stand out.
const intr = $('intr') as HTMLButtonElement | null;
intr?.addEventListener('click', () => (booting ? booting.abort() : shell.interrupt()));
intr?.addEventListener('animationend', () => intr.classList.remove('nudge'));
const nudge = () => {
  if (!intr || intr.hidden) return;
  intr.classList.remove('nudge');
  void intr.offsetWidth; // restart the animation
  intr.classList.add('nudge');
};
// cmatrix --both on the page (no 3D): the rain covers the contacts; in 3D the scene draws it
// on the monitor itself and the pinned panels step aside (scene.css, [data-rain])
const wallEl = $('contacts-rain');
const wall = wallEl ? new FrameView(wallEl) : null;
const contactsEl = $('contacts');
const contactList = document.querySelector<HTMLElement>('#contacts ul');
const infoList = document.querySelector<HTMLElement>('#mon-info dl');
/**
 * The monitor's links are live only when they can be used: in 3D, while the camera is at the
 * monitor (from afar the panel is a small far-off screen, and a tap there flies to it: the
 * capture handler below), and never under the cmatrix rain. Elsewhere they are out of the tab
 * order and the accessibility tree, so no tiny off-view target is reachable or announced.
 */
function syncMonitorLinks() {
  const b = document.body.dataset;
  const off = b.rain !== undefined || (b.mode === 'scene' && b.view !== 'monitor');
  for (const el of [contactList, infoList]) {
    if (!el || el.inert === off) continue;
    el.inert = off;
    if (off) el.setAttribute('aria-hidden', 'true');
    else el.removeAttribute('aria-hidden');
  }
  // while its links are out of reach in 3D, the contacts panel itself is one tab stop that
  // says what it does (focusing it flies to the monitor, see the focusin handler below), so
  // the keyboard and screen readers still get to the contacts
  if (!contactsEl) return;
  const stop = off && b.mode === 'scene' && b.rain === undefined;
  if (stop === (contactsEl.getAttribute('tabindex') === '0')) return;
  if (stop) {
    contactsEl.tabIndex = 0;
    contactsEl.setAttribute('aria-label', 'contacts: show them on the monitor');
    contactsEl.removeAttribute('aria-labelledby');
  } else {
    contactsEl.removeAttribute('tabindex');
    contactsEl.removeAttribute('aria-label');
    contactsEl.setAttribute('aria-labelledby', 'contacts-h');
  }
}
store.subscribe((s) => {
  if (intr && intr.hidden === s.busy) {
    intr.hidden = !s.busy;
    if (!s.busy) intr.classList.remove('nudge'); // the next job's ^C starts calm
  }
  const raining = s.monitor !== null;
  if (raining !== (document.body.dataset.rain !== undefined)) {
    if (raining) document.body.dataset.rain = '';
    else delete document.body.dataset.rain;
    syncMonitorLinks(); // links under the rain are out of reach for the keyboard too
  }
  wall?.show(document.body.dataset.mode === 'scene' ? null : s.monitor);
});

start({
  createTerm: () => ({
    store,
    run: async (line) => {
      world.sfx('enter');
      await shell.run(line);
    },
    interrupt: () => (booting ? booting.abort() : shell.interrupt()),
    complete: (line, cursor) => complete(line, cursor, store.state.cwd, shell.registry, fs),
    key: (k) => shell.key(k),
    chips: () => suggest(shell.last, world.get(), world.has3d()),
    onToyTap: nudge,
    clear: () => store.clear(),
    onActivity: () => {
      world.sfx('key');
      world.scene?.activity();
    },
    onFocus: () => world.fly('laptop'),
  }),
  boot,
  afterIdle,
  onSound: (l) => world.setSound(l),
});
