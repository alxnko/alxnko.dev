// Page entry: wires the real terminal core to the DOM, composes the world the terminal
// talks to (page theme + sound + the lazy 3D desk), and runs the 3D gate after load.
import type { FanSpeed, Landmark, Ring, SoundLevel, Theme, WorldPort, WorldState } from '../term/types';
import { TermStore } from '../term/store';
import { Shell } from '../term/exec';
import { complete } from '../term/complete';
import { createFs } from '../term/vfs';
import { bootLines } from '../term/boot';
import { DEFAULT_WORLD } from '../term/world';
import { createSound } from '../audio/sound';
import { decide3D } from '../scene/gate';
import type { SceneWorld } from '../scene/index';
import * as prefs from '../lib/prefs';
import { SOUND_EVENT, soundLevel, start } from './app';
import { currentTheme, setTheme, THEME_EVENT } from './theme';

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const narrow = () => innerWidth < 640;
const RINGS: readonly Ring[] = ['green', 'purple', 'off'];

/** The world the terminal talks to. Works without 3D; the scene attaches when it loads. */
class AppWorld implements WorldPort {
  scene: SceneWorld | null = null;
  readonly sound = createSound();
  private s: WorldState;

  constructor() {
    const ring = prefs.get('ring');
    this.s = {
      ...DEFAULT_WORLD,
      theme: currentTheme(),
      sound: soundLevel(),
      ring: RINGS.includes(ring as Ring) ? (ring as Ring) : 'green',
    };
  }

  get(): WorldState {
    return { ...this.s, theme: currentTheme(), landmark: this.scene?.landmark() ?? this.s.landmark };
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
  setRing(r: Ring): void {
    this.s.ring = r;
    prefs.set('ring', r);
    this.scene?.setRing(r);
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
  await shell.run(first && !narrow() ? 'fastfetch' : 'fastfetch --compact');
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

const MOUNT_TIMEOUT_MS = 20000;

const $ = (id: string) => document.getElementById(id);

function enter3d() {
  const stage = $('stage'), termEl = $('term'), contactsEl = $('contacts');
  const btn = $('enter3d') as HTMLButtonElement | null;
  if (!stage || !termEl || !contactsEl) return;
  if (btn) { btn.disabled = true; btn.textContent = 'loading 3d'; }
  document.body.dataset.scene = 'loading';
  const mounting = import('../scene/index').then((m) =>
      m.mount({
        stage,
        store,
        initial: world.get(),
        reducedMotion: reducedMotion(),
        mobile: matchMedia('(pointer: coarse)').matches || innerWidth < 720,
        termEl,
        contactsEl,
        infoEl: $('mon-info') ?? undefined,
        onLandmark(l) {
          document.body.dataset.view = l; // scene.css: only the screen you're at is selectable
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
        },
      }));
  let timedOut = false;
  const timeout = new Promise<never>((_, reject) => setTimeout(() => { timedOut = true; reject(new Error('3d load timed out')); }, MOUNT_TIMEOUT_MS));
  // a mount that finishes after the timeout cleans up after itself
  mounting.then((h) => { if (timedOut) h.destroy(); }, () => {});
  Promise.race([mounting, timeout])
    .then((handle) => {
      handle3d = handle;
      world.scene = handle.world;
      document.body.dataset.mode = 'scene';
      document.body.dataset.scene = 'ready';
      if (btn) btn.hidden = true;
    })
    .catch((e) => {
      console.warn('3d unavailable:', e);
      leave3d();
    });
}

let handle3d: { destroy(): void } | null = null;
let stopMotor: (() => void) | null = null;
function leave3d() {
  handle3d?.destroy();
  handle3d = null;
  world.scene = null;
  document.body.dataset.mode = 'page';
  delete document.body.dataset.scene;
  delete document.documentElement.dataset.boot; // reveal the page (no loader, no 3D)
  const btn = $('enter3d') as HTMLButtonElement | null;
  if (btn && hasWebGL2()) { btn.hidden = false; btn.disabled = false; btn.textContent = 'enter 3d'; }
}

// The <head> check already decided this visit boots into 3D: start now, not after idle.
const booting3d = document.documentElement.dataset.boot === '3d';
if (booting3d) enter3d();

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
addEventListener('keydown', (e) => {
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
let fullH = innerHeight;
let keyboardWasUp = false;
const syncTyping = () => {
  const kbUp = innerHeight < fullH * 0.8;
  if (!kbUp) fullH = Math.max(fullH, innerHeight);
  if (keyboardWasUp && !kbUp && document.activeElement === input) input?.blur();
  keyboardWasUp = kbUp;
  const on = coarse.matches && !!world.scene && kbUp && document.activeElement === input;
  if (on === (document.body.dataset.typing !== undefined)) return;
  if (on) document.body.dataset.typing = ''; else delete document.body.dataset.typing;
  dispatchEvent(new Event('scene:refit'));
};
addEventListener('resize', syncTyping);
addEventListener('orientationchange', () => { fullH = 0; setTimeout(() => { fullH = innerHeight; syncTyping(); }, 400); });
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

start({
  createTerm: () => ({
    store,
    run: async (line) => {
      world.sfx('enter');
      await shell.run(line);
    },
    interrupt: () => (booting ? booting.abort() : shell.interrupt()),
    complete: (line, cursor) => complete(line, cursor, store.state.cwd, shell.registry, fs),
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
