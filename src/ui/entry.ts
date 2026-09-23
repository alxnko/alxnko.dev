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

function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

const $ = (id: string) => document.getElementById(id);

function enter3d() {
  const stage = $('stage'), termEl = $('term'), contactsEl = $('contacts');
  const btn = $('enter3d') as HTMLButtonElement | null;
  if (!stage || !termEl || !contactsEl) return;
  if (btn) { btn.disabled = true; btn.textContent = 'loading 3d'; }
  document.body.dataset.scene = 'loading';
  import('../scene/index')
    .then((m) =>
      m.mount({
        stage,
        store,
        initial: world.get(),
        reducedMotion: reducedMotion(),
        mobile: matchMedia('(pointer: coarse)').matches || innerWidth < 720,
        termEl,
        contactsEl,
        onLandmark(l) {
          for (const b of document.querySelectorAll<HTMLButtonElement>('#nav [data-landmark]')) {
            if (b.dataset.landmark === l) b.setAttribute('aria-current', 'true');
            else b.removeAttribute('aria-current');
          }
        },
        onFallback: () => leave3d(),
      }),
    )
    .then((handle) => {
      handle3d = handle;
      world.scene = handle.world;
      document.body.dataset.mode = 'scene';
      document.body.dataset.scene = 'ready';
      if (btn) btn.hidden = true;
    })
    .catch(() => leave3d());
}

let handle3d: { destroy(): void } | null = null;
function leave3d() {
  handle3d?.destroy();
  handle3d = null;
  world.scene = null;
  document.body.dataset.mode = 'page';
  delete document.body.dataset.scene;
  const btn = $('enter3d') as HTMLButtonElement | null;
  if (btn && hasWebGL2()) { btn.hidden = false; btn.disabled = false; btn.textContent = 'enter 3d'; }
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
  if (gate === 'auto') enter3d();
  else if (gate === 'offer' && btn) btn.hidden = false;
}

// camera nav, focus → fly, theme → scene
for (const b of document.querySelectorAll<HTMLButtonElement>('#nav [data-landmark]'))
  b.addEventListener('click', () => world.fly(b.dataset.landmark as Landmark));
$('term')?.addEventListener('focusin', () => { if (world.scene) world.fly('laptop'); });
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
