// Lazy 3D desk (spec §6). Loaded via dynamic import only when decide3D() allows.
// Renders on demand; every surface is unlit (baked), so it stays cheap on phones.
import {
  Box3, Color, Frustum, LinearFilter, Matrix4, Mesh, type Object3D, PerspectiveCamera, Quaternion, Raycaster,
  Scene, Sphere, SRGBColorSpace, type Texture, TextureLoader, Vector2, Vector3, type Vector4, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { FanSpeed, Landmark, Theme, WorldState } from '../term/types';
import { parseManifest, type Manifest } from './manifest';
import { setAnsiAccent, TERM_BG, TOKENS } from '../lib/tokens';
import { linear, palette } from '../lib/rgb';
import { shadowMaterial, windowMaterial, bakedMaterial, ghostMaterial, tintedMaterial, emissiveMaterial, glowMaterial, screenMaterial, skyMaterial } from './materials';
import { lerpPose, Rail, Spring, type Pose, type Vec3 } from './rail';
import { FanDisplay, MonitorScreen } from './monitor-screen';
import { catStep, constrainGaze, clamp, easeOut, frameInterval, nextFlickIn, SPIN_FRAME_MS, Tween, type CatState } from './anim';
import { attachInput } from './input';
import { Dock } from './dock';
import { consoleLayout, introViewport } from '../ui/intro';
import { screenPose, type ScreenPose } from './intro';
import { resolveTarget, type Named } from './pick';
import { unsupportedExtensions, watchMonitor, yieldToMain } from './phases';
import { isSoftwareRenderer } from './gate';
import { gpuDone } from './ready';
import type { Line, TermState } from '../term/types';

export interface SceneStore {
  readonly state: TermState;
  subscribe(fn: (s: TermState) => void): () => void;
  prompt(): Line;
}

export interface SceneOptions {
  stage: HTMLElement;
  store: SceneStore;
  initial: WorldState;
  reducedMotion: boolean;
  mobile: boolean;
  /**
   * WebGL runs on the CPU (no GPU: SwiftShader, llvmpipe). The desk renders the same scene
   * at a lighter internal resolution while anything moves and at a steadier pace, then
   * redraws at full resolution once the view settles, so a still view keeps every detail.
   * Left out, it is read from the context's renderer string (after first paint, not in <head>).
   */
  softwareGL?: boolean;
  /**
   * The <head> gate's probe canvas (Base.astro). Its WebGL2 context is the one the desk renders
   * with when its attributes are what the renderer wants, so the GPU context starts once.
   */
  probe?: HTMLCanvasElement;
  termEl: HTMLElement;
  contactsEl: HTMLElement;
  /** The monitor's right pane (role, location, rank link), pinned like the contacts. */
  infoEl?: HTMLElement;
  onLandmark(l: Landmark): void;
  /** True whenever the view is anywhere but the resting desk view (flown or looked around). */
  onAway?(away: boolean): void;
  /** A paddle button under the desk was pressed ('1' | '2' | '3' | 'up' | 'down'). */
  onPaddle?(key: string): void;
  /** ▲/▼ held: the desk moves until release; `end` reports the final height (m). */
  onHold?(state: 'start' | 'end', height: number): void;
  signal?: AbortSignal;
  onFailure?(): void;
}

export interface SceneWorld {
  fly(to: Landmark): void;
  setDesk(h: number): Promise<void>;
  setTheme(t: Theme): Promise<void>;
  /** `rgb`: the lights (ring, glow, fan ring, backlights) and the tinted parts; `accent` is
   * the colour in use (the last one while `rgb` is off: the server LED and screens keep it). */
  setRgb(rgb: string, accent: string): void;
  setFan(s: FanSpeed): void;
  meow(): void;
  stare(): void;
  activity(): void;
  landmark(): Landmark;
  /** View mode: wider (still bounded) free-look; turning it off glides back inside the normal limits. */
  setFreeLook(on: boolean): void;
}

export interface SceneHandle { world: SceneWorld; beginIntro(): void; prepare(read: () => WorldState): Promise<void>; destroy(): void }

const RING_OFF = '#161618';
// `rgb off`: the tinted parts show their own colours (the lime caps, white legends, green cat)
const OWN = { keys: TOKENS.primitive.scene.keyLime, legend: TOKENS.primitive.scene.legend, cat: TOKENS.primitive.scene.cat };
const TINT_BASE = linear(TOKENS.primitive.scene.tintBase)[0];
/** A tint uniform: tint / base, linear (the parts were baked neutral grey). */
const tintOf = (hex: string, out = new Color()) => {
  const [r, g, b] = linear(hex);
  return out.setRGB(r / TINT_BASE, g / TINT_BASE, b / TINT_BASE);
};
/** Target colours of everything `rgb` drives in the scene (linear Colors, tween targets). */
function rgbTargets(rgb: string, accent: string) {
  const p = palette(accent), on = rgb !== 'off';
  return {
    ring: new Color(on ? p.fill : RING_OFF),
    keys: tintOf(on ? p.tint : OWN.keys),
    cat: tintOf(on ? p.tint : OWN.cat),
    // the legends are lit labels: the bright fill, not the deeper tint
    legend: tintOf(on ? p.fill : OWN.legend),
    led: new Color(p.fill),
    screen: p.dark,
  };
}
// `astro build --mode recording`: the video pipeline's build (video/). It renders frame by frame
// on a GPU, so it takes full resolution, MSAA and the sharp atlases, and never steps
// resolution down. MODE is a build-time constant: in the site's own builds this is
// "production" === "recording", folded away, and no environment variable can turn it on.
const RECORDING = import.meta.env.MODE === 'recording';
const FAN_SPEED = [0, 28, 42, 56]; // rad/s (shown as rotation up to FAN_MAX_STEP a frame, the rest as blur)
// shown rotation is capped so it looks the same at any frame rate (30 fps idle, 60+ while
// moving) and never strobes (5 blades 72° apart: a step near 36° reads as spinning backwards);
// speed beyond it shows as motion blur
const FAN_SHOWN = 12; // rad/s
const FAN_MAX_STEP = 0.45; // rad per frame (~26°, well under the 36° strobe point)
const FAN_PCT = ['0', '40', '70', '100'];
/** Portrait phones: the laptop screen sits between the name block and the on-screen keyboard. */
const PHONE_BAND: [number, number] = [0.2, 0.62];
/**
 * Typing on a phone: the part of the stage the on-screen keyboard leaves visible. Android
 * shrinks the layout viewport (the stage itself gets shorter, so this is the whole view);
 * iOS keeps the layout and only shrinks/pans the visual viewport, so the band is the slice
 * of the stage that is actually on screen.
 */
function typingBand(): [number, number] {
  const vv = window.visualViewport;
  if (!vv || innerHeight <= 0) return [0.02, 0.98];
  const top = Math.min(0.8, Math.max(0, vv.offsetTop / innerHeight));
  const bottom = Math.min(1, Math.max(top + 0.2, (vv.offsetTop + vv.height) / innerHeight));
  return [top + 0.02, bottom - 0.02];
}
// UV rects (u0, u1, v0, v1; v down) of the monitor that the live DOM panels cover
const MON_CONTACTS_UV = [0.24, 0.76, 0.12, 0.92] as const;
const MON_INFO_UV = [0.765, 0.995, 0.12, 0.92] as const;
const DEG = Math.PI / 180;
// a loaf cat turns its head, it doesn't crane: wider than this lifts the head out of its chest
const GAZE = { yaw: 40 * DEG, up: 6 * DEG, down: 14 * DEG };

/** Reads the renderer string (a blocking call on a cold GPU: made here, after first paint, not
 *  in <head>). Without a live context it probes a throwaway one. */
function isSoftwareGL(gl: WebGL2RenderingContext | null): boolean {
  try {
    const c = gl ?? document.createElement('canvas').getContext('webgl2');
    if (!c) return false;
    const dbg = c.getExtension('WEBGL_debug_renderer_info');
    const name = String(c.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : c.RENDERER));
    if (!gl) c.getExtension('WEBGL_lose_context')?.loseContext();
    return isSoftwareRenderer(name);
  } catch {
    return false;
  }
}

/**
 * Load and start the desk. If anything fails partway, whatever was already created (GL
 * context, canvas, subscriptions, listeners, pinned-screen transforms) is torn down before
 * the error propagates, so the page falls back to its no-3D form cleanly.
 */
export async function mount(o: SceneOptions): Promise<SceneHandle> {
  const undo: (() => void)[] = [];
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    for (const f of undo.splice(0).reverse()) { try { f(); } catch { /* keep tearing down */ } }
  };
  o.signal?.addEventListener('abort', cleanup, { once: true });
  try {
    o.signal?.throwIfAborted();
    const handle = await build(o, undo);
    o.signal?.throwIfAborted();
    return { ...handle, destroy() { o.signal?.removeEventListener('abort', cleanup); cleanup(); } };
  } catch (e) {
    // Work resolving after abort may have registered further resources. Dispose those too.
    cleaned = false;
    cleanup();
    o.signal?.removeEventListener('abort', cleanup);
    throw e;
  }
}

async function build(o: SceneOptions, undo: (() => void)[]): Promise<Omit<SceneHandle, 'destroy'>> {
  const base = '/scene/';
  const res = await fetch(base + 'manifest.json', { cache: 'no-cache', signal: o.signal });
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  const manifest: Manifest = parseManifest(await res.json());


  // ---------- renderer ----------
  // one GL context: the <head> probe's, when it is alive and made the way the renderer needs
  const probed = o.probe?.getContext('webgl2') ?? null;
  const live = probed && !probed.isContextLost() ? probed : null;
  const softwareGL = o.softwareGL ?? isSoftwareGL(live);
  o = { ...o, softwareGL };
  const dprCap = RECORDING ? 4 : o.mobile ? 1.5 : 2;
  const antialias = RECORDING || (!o.softwareGL && devicePixelRatio < 2); // MSAA on the CPU costs more than it shows
  const powerPreference = o.mobile ? 'default' : 'high-performance';
  const got = live?.getContextAttributes();
  const reuse = !!(live && o.probe && got && got.antialias === antialias && got.alpha && got.depth && !got.stencil && !got.preserveDrawingBuffer && got.premultipliedAlpha);
  if (live && !reuse) live.getExtension('WEBGL_lose_context')?.loseContext();
  const canvas = reuse ? o.probe! : document.createElement('canvas');
  const onLost = (e: Event) => { e.preventDefault(); o.onFailure?.(); };
  canvas.addEventListener('webglcontextlost', onLost);
  undo.push(() => canvas.removeEventListener('webglcontextlost', onLost));
  canvas.className = 'stage-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new WebGLRenderer({
    canvas,
    context: reuse ? live! : undefined,
    antialias,
    alpha: true, // screen regions are transparent windows onto the pinned DOM beneath
    powerPreference,
  });
  undo.push(() => { renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); });
  renderer.outputColorSpace = SRGBColorSpace;
  let dprScale = 1;
  // CPU WebGL: pixel budgets for moving and settled frames (the pinned screens are DOM text,
  // always sharp; only the 3D behind them uses these)
  const SW_MOVE_PX = 260_000, SW_STILL_PX = 1_400_000, SW_SETTLE_MS = 180;
  const SW_FRAME_MS = 40, SW_SPIN_MS = 66, SW_IDLE_MS = 200;
  let sharp = !o.softwareGL;
  // CPU WebGL: something changed since the last drawn frame (a settled, sharp view is not
  // redrawn until it does), and when things last moved
  let dirty = true, lastMove = 0;
  let roomK = 1; // how far the room walls pulled this frame's view in (1: not at all)
  const pixelRatio = () => {
    const w = o.stage.clientWidth || innerWidth, h = o.stage.clientHeight || innerHeight;
    const full = Math.min(devicePixelRatio, dprCap);
    if (!o.softwareGL) return full * dprScale;
    return Math.min(full * (sharp ? 1 : dprScale), Math.sqrt((sharp ? SW_STILL_PX : SW_MOVE_PX) / (w * h)));
  };
  const applySize = () => {
    const w = o.stage.clientWidth || innerWidth, h = o.stage.clientHeight || innerHeight;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    rebuildPoses();
    invalidate();
  };

  // ---------- assets ----------
  const big = RECORDING || (!o.mobile && Math.min(devicePixelRatio, 2) * innerWidth >= 1400 && ((navigator as any).deviceMemory ?? 8) >= 8);
  const size = big ? '2048' : '1024';
  const texLoader = new TextureLoader();
  const loadAtlas = (t: 'day' | 'night') =>
    texLoader.loadAsync(base + manifest.files.atlas[t][size]).then((tx) => {
      tx.flipY = false;
      tx.colorSpace = SRGBColorSpace;
      tx.minFilter = LinearFilter;
      tx.generateMipmaps = false;
      tx.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      return tx;
    });
  const atlases: Partial<Record<'day' | 'night', Promise<Texture>>> = {};
  const atlas = (t: 'day' | 'night') => (atlases[t] ??= loadAtlas(t));
  undo.push(() => Object.values(atlases).forEach(p => void p?.then(tx => tx.dispose(), () => {})));
  const themeKey = (t: Theme) => (t === 'light' ? 'day' : 'night');

  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);


  const [gltf, firstAtlas] = await Promise.all([
    gltfLoader.loadAsync(base + manifest.files.glb),
    atlas(themeKey(o.initial.theme)),
  ]);
  undo.push(() => gltf.scene.traverse((obj) => {
    const mesh = obj as Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    materials.forEach(m => m.dispose());
  }));
  o.signal?.throwIfAborted();
  // the loader is slimmed to the extensions the desk uses: a glb needing more would load half
  // parsed, so refuse it (the boot then falls back to the page)
  const unsupported = unsupportedExtensions(gltf.parser.json as { extensionsUsed?: string[] });
  if (unsupported.length) throw new Error(`glb needs unsupported glTF extensions: ${unsupported.join(', ')}`);


  // the mount runs as a few short tasks, not one long one: input and paint get in between
  await yieldToMain();

  // ---------- scene graph ----------
  const scene = new Scene();
  scene.background = new Color(o.initial.theme === 'light' ? '#e9e8e4' : '#0a0a0b');
  scene.add(gltf.scene);
  const node = (n: string): Object3D => {
    const x = gltf.scene.getObjectByName(n);
    if (!x) throw new Error(`scene node missing: ${n}`);
    return x;
  };
  const meshesOf = (obj: Object3D) => {
    const out: Mesh[] = [];
    obj.traverse((c) => { if ((c as Mesh).isMesh) out.push(c as Mesh); });
    return out;
  };

  const opt = (n: string) => gltf.scene.getObjectByName(n) ?? null;
  let mix = o.initial.theme === 'light' ? 0 : 1;
  const baked = bakedMaterial(firstAtlas, firstAtlas, mix);
  for (const n of ['static', 'desk_baked', 'fan_blades']) meshesOf(node(n)).forEach((m) => (m.material = baked));
  // the accent parts, baked neutral and tinted by `rgb` (R86)
  let rgbNow = rgbTargets(o.initial.rgb, o.initial.accent);
  setAnsiAccent(rgbNow.screen);
  const keysMat = tintedMaterial(baked, rgbNow.keys.clone());
  const catMat = tintedMaterial(baked, rgbNow.cat.clone());
  const legendMat = tintedMaterial(baked, rgbNow.legend.clone());
  for (const [n, mat] of [['kbd_accent', keysMat], ['paddle_glyphs', legendMat], ['cat_body', catMat], ['cat_head', catMat], ['cat_tail', catMat]] as const) {
    const g = opt(n);
    if (g) meshesOf(g).forEach((m) => (m.material = mat));
  }

  const monitor = new MonitorScreen(o.mobile);
  undo.push(() => monitor.dispose());
  monitor.texture.flipY = false;
  const laptopScreen = node('screen_laptop'), monitorScreen = node('screen_monitor');
  const laptopMat = windowMaterial(null, [[0, 1, 0, 1]], TERM_BG);
  const monitorMat = windowMaterial(monitor.texture, o.infoEl ? [[...MON_CONTACTS_UV], [...MON_INFO_UV]] : [[...MON_CONTACTS_UV]]);
  meshesOf(laptopScreen).forEach((m) => (m.material = laptopMat));
  meshesOf(monitorScreen).forEach((m) => (m.material = monitorMat));
  // the terminal typed into is the DOM one pinned on this screen, seen through a transparent
  // window: its output changes no pixel of the canvas, so it never redraws the frame.
  // cmatrix --both rains on the whole monitor: drawn into its canvas, windows closed, and each
  // rain frame (a new texture) is the one terminal change that does redraw
  const holes: Vector4[] = monitorMat.uniforms.uRects.value, open = holes.map((h) => h.clone());
  let rain: TermState['monitor'] = null;
  const unsubStore = o.store.subscribe(watchMonitor((frame) => {
    if (!rain !== !frame) holes.forEach((h, i) => (frame ? h.setScalar(2) : h.copy(open[i])));
    monitor.rain((rain = frame));
    invalidate();
  }));
  undo.push(unsubStore);

  const ringMat = emissiveMaterial(RING_OFF);
  (ringMat.uniforms.uColor.value as Color).copy(rgbNow.ring);
  meshesOf(node('ring')).forEach((m) => (m.material = ringMat));
  const glow = glowMaterial();
  meshesOf(node('ring_glow')).forEach((m) => { m.material = glow; m.renderOrder = 2; });
  const sky = skyMaterial(mix);
  meshesOf(node('window_sky')).forEach((m) => (m.material = sky));

  const led = (n: string, hex: string) => {
    const mat = emissiveMaterial(hex);
    meshesOf(node(n)).forEach((m) => (m.material = mat));
    return mat.uniforms.uColor.value as Color;
  };
  const LED_OFF = '#1d1d20';
  const ledPaddle = led('led_paddle', LED_OFF);
  led('led_kbd', '#c9d4ff');
  // led_srv_0: the server's status LED, in the accent (it stays lit while `rgb` is off)
  const srvLeds = [0, 1, 2, 3, 4, 5].map((i) => led(`led_srv_${i}`, LED_OFF));
  srvLeds[0].copy(rgbNow.led);
  // optional nodes (older scene builds lack them): the fan's glowing bezel and speed display,
  // and the keyboard backlights. All follow the ring colour, like the real RGB does.
  // movable baked shadows (newer builds): the floor one softens/spreads as the desk rises,
  // the wall one rides up with the desk (it is parented to desk_rig)
  const shadowMat = shadowMaterial(firstAtlas, firstAtlas, mix);
  const shadowFloor = opt('shadow_floor'), shadowWall = opt('shadow_wall');
  for (const sh of [shadowFloor, shadowWall]) if (sh) meshesOf(sh).forEach((m) => { m.material = shadowMat; m.renderOrder = 1; });
  const floorScale0 = shadowFloor?.scale.clone(), floorPos0 = shadowFloor?.position.clone();
  // day: the sun shadow of a raised top slides along the sun's horizontal direction; night:
  // the soft screen/lamp shadow spreads and fades. Blended by the theme mix (manifest note).
  const sunShift = manifest.sunShift;
  const placeFloorShadow = () => {
    if (!shadowFloor || !floorScale0 || !floorPos0) return;
    const up = Math.max(0, rigDy), day = 1 - mix;
    const k = 1 + 0.35 * up * (sunShift ? mix : 1);
    shadowFloor.scale.set(floorScale0.x * k, floorScale0.y, floorScale0.z * k);
    shadowFloor.position.copy(floorPos0);
    if (sunShift) shadowFloor.position.add(new Vector3(sunShift[0], sunShift[1], sunShift[2]).multiplyScalar(up * day));
    // uFade is shared by both decals: with a sun-aware bake (sunShift) the night shadows only
    // widen as the desk rises (the screens rise with it), they do not get lighter
    shadowMat.uniforms.uFade.value = sunShift ? 0 : Math.min(0.6, up * 1.4);
  };
  const fanRing = opt('fan_ring');
  if (fanRing) meshesOf(fanRing).forEach((m) => (m.material = ringMat));
  const backlight = glowMaterial();
  backlight.uniforms.uShape.value = 0; // flat, not radial
  for (const n of ['kbd_glow', 'laptop_kbd_glow']) {
    const g = opt(n);
    if (g) meshesOf(g).forEach((m) => { m.material = backlight; m.renderOrder = 1; });
  }
  const fanDisplay = opt('fan_display');
  const fanReadout = fanDisplay ? new FanDisplay() : null;
  undo.push(() => fanReadout?.dispose());
  if (fanDisplay && fanReadout) {
    fanReadout.texture.flipY = false;
    meshesOf(fanDisplay).forEach((m) => (m.material = screenMaterial(fanReadout.texture)));
    fanReadout.set(FAN_PCT[o.initial.fan]);
  }

  const paddleHits = ['1', '2', '3', 'up', 'down'].map((k) => opt(`hit_paddle_${k}`)).filter((x): x is Object3D => !!x);
  const hits = [node('hit_laptop'), node('hit_monitor'), ...paddleHits];
  hits.forEach((h) => (h.visible = false));

  const rig = node('desk_rig');
  const rigBaseY = rig.position.y;
  const cable = opt('cable_drop'); // older builds only: the desk is cable-free now
  const cableLen0 = cable ? Math.max(0.05, rig.getWorldPosition(new Vector3()).y - cable.getWorldPosition(new Vector3()).y) : 1;
  const fan = node('fan_blades');
  const fanQ0 = fan.quaternion.clone();
  // motion blur: trailing copies of the blades between this frame's angle and the last one,
  // fading in once the fan spins faster than a frame can show (hidden, so free, when slow)
  // the spinning fan only keeps frames coming while it is actually on screen
  const fanSphere = new Box3().setFromObject(fan).getBoundingSphere(new Sphere());
  fan.parent!.worldToLocal(fanSphere.center);
  const frustum = new Frustum(), projView = new Matrix4(), fanWorld = new Sphere();
  const fanInView = () => {
    fanWorld.copy(fanSphere).applyMatrix4(fan.parent!.matrixWorld);
    return frustum.setFromProjectionMatrix(projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)).intersectsSphere(fanWorld);
  };
  const FAN_TRAILS = 3;
  const fanTrails = Array.from({ length: FAN_TRAILS }, (_, i) => {
    const g = fan.clone();
    const mat = ghostMaterial(baked);
    meshesOf(g).forEach((m) => { m.material = mat; m.renderOrder = 2; });
    g.name = `${fan.name}__trail${i}`;
    g.visible = false;
    fan.parent!.add(g);
    return { g, mat };
  });
  const fanAxis = new Vector3(...manifest.fanAxis).normalize();
  const head = node('cat_head'), tail = node('cat_tail');
  const headQ0 = head.quaternion.clone(), tailQ0 = tail.quaternion.clone();

  await yieldToMain();

  // ---------- camera + landmarks ----------
  const camera = new PerspectiveCamera(45, 16 / 10, 0.05, 30);
  const camPose = (name: string): { pose: Pose; refAspect: number } => {
    const obj = node(name);
    let cam: PerspectiveCamera | null = null;
    obj.traverse((c) => { if ((c as PerspectiveCamera).isPerspectiveCamera && !cam) cam = c as PerspectiveCamera; });
    obj.updateWorldMatrix(true, true);
    const src: Object3D = cam ?? obj;
    const pos = src.getWorldPosition(new Vector3());
    const dir = src.getWorldDirection(new Vector3()); // cameras look down -Z; getWorldDirection handles it
    const target = pos.clone().add(dir.multiplyScalar(1.6));
    const c = cam as PerspectiveCamera | null;
    return { pose: { pos: pos.toArray() as Vec3, target: target.toArray() as Vec3, fov: c?.fov ?? 45 }, refAspect: c?.aspect && c.aspect > 0 ? c.aspect : 16 / 10 };
  };
  const wideRef = camPose('cam_wide'), deskRef = camPose('cam_desk');

  /** World-space corners TL, TR, BR, BL of a UV sub-rectangle of a screen mesh (nearest
   *  vertices; the monitor strip is finely subdivided along its curve). */
  // For each requested u, the nearest vertex on the screen's top edge (v≈0) and bottom edge
  // (v≈1); points at any v are interpolated between them. Exact for any mesh that is subdivided
  // along u only (curved strips have vertices only on the top and bottom edges).
  const colIdx = new Map<string, { mesh: Mesh; top: number; bottom: number }>();
  const column = (obj: Object3D, u: number) => {
    const key = `${obj.name}:${u}`;
    let c = colIdx.get(key);
    if (!c) {
      const mesh = meshesOf(obj)[0];
      const uv = mesh.geometry.getAttribute('uv');
      const near = (v: number) => {
        let best = 0, bd = Infinity;
        for (let i = 0; i < uv.count; i++) {
          const d = (uv.getX(i) - u) ** 2 + (uv.getY(i) - v) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
        return best;
      };
      colIdx.set(key, (c = { mesh, top: near(0), bottom: near(1) }));
    }
    return c;
  };
  /** World-space corners TL, TR, BR, BL of a UV sub-rectangle of a screen mesh. */
  const screenCorners = (obj: Object3D, u0 = 0, u1 = 1, v0 = 0, v1 = 1): Vector3[] => {
    const at = (u: number, v: number) => {
      const { mesh, top, bottom } = column(obj, u);
      const pos = mesh.geometry.getAttribute('position');
      const uv = mesh.geometry.getAttribute('uv');
      const vt = uv.getY(top), vb = uv.getY(bottom);
      const k = vb === vt ? 0 : (v - vt) / (vb - vt);
      const a = new Vector3(pos.getX(top), pos.getY(top), pos.getZ(top));
      const b = new Vector3(pos.getX(bottom), pos.getY(bottom), pos.getZ(bottom));
      mesh.updateWorldMatrix(true, false);
      return a.lerp(b, k).applyMatrix4(mesh.matrixWorld);
    };
    return [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
  };
  // the live contacts panel covers the middle of the curved monitor (a short arc, so the flat
  // DOM panel sits on the curve within a few mm); the canvas draws the side panes around it
  const CONTACTS_UV = MON_CONTACTS_UV;
  const INFO_UV = MON_INFO_UV;
  const contactsCorners = () => screenCorners(monitorScreen, ...CONTACTS_UV);
  const infoCorners = () => screenCorners(monitorScreen, ...INFO_UV);

  const adaptFov = (vfov: number, refAspect: number) => {
    const hfov = 2 * Math.atan(Math.tan((vfov * DEG) / 2) * refAspect);
    const need = (2 * Math.atan(Math.tan(hfov / 2) / camera.aspect)) / DEG;
    return Math.min(Math.max(vfov, need), 85);
  };
  const withRig = (p: Pose, dy: number): Pose => ({ pos: [p.pos[0], p.pos[1] + dy, p.pos[2]], target: [p.target[0], p.target[1] + dy, p.target[2]], fov: p.fov });

  // Things that can stand between the viewer and a screen (the cat, the fan, the laptop lid).
  const occluders: Object3D[] = ['static', 'desk_baked', 'cat_body', 'fan_blades'].map(node);
  const occlusionRay = new Raycaster();
  /** The points of a screen a view must see: its centre and slightly inset corners. */
  const samplesOf = (corners: Vector3[]) => {
    const c = corners.reduce((acc, q) => acc.add(q), new Vector3()).multiplyScalar(0.25);
    return [c, ...corners.map((q) => q.clone().lerp(c, 0.12))];
  };
  /** True if nothing solid sits between `eye` and `p`. */
  const rayClear = (eye: Vector3, p: Vector3) => {
    const dir = p.clone().sub(eye);
    const dist = dir.length();
    occlusionRay.set(eye, dir.normalize());
    occlusionRay.far = dist - 0.01;
    return occlusionRay.intersectObjects(occluders, true).length === 0;
  };
  /** True if nothing solid sits between `eye` and the screen (centre + inset corners). */
  const clearView = (eye: Vector3, corners: Vector3[]) => samplesOf(corners).every((p) => rayClear(eye, p));
  // The first unobstructed view around the screen's normal, in order of how little it tilts:
  // straight on, then slightly raised or turned. Chosen once per screen and aspect (resize),
  // then reused while the desk moves.
  const ANGLES: [number, number][] = [[0, 0], [0, 10], [12, 0], [-12, 0], [12, 10], [-12, 10], [0, 20], [20, 12], [-20, 12], [0, 30], [25, 25], [-25, 25]];
  const viewChoice = new Map<string, [number, number]>();
  // The line-of-sight rays are the costly part of a screen pose, and the desk view needs none:
  // a screen's are cast all at once on the first flight to it, or else one ray at a time in
  // idle slots after the first frame (`views`). Until then its pose is the straight-on one,
  // which nothing shows.
  const exact = new Set<string>();
  type ViewJob = { eyeFor: (a: [number, number]) => Vector3; samples: Vector3[]; i: number; s: number };
  const views = new Map<string, ViewJob>();
  /** One ray of the oldest pending view choice; true while more remain. */
  const viewStep = () => {
    const next = views.entries().next();
    if (next.done) return false;
    const [ck, j] = next.value;
    if (viewChoice.has(ck)) { views.delete(ck); return views.size > 0; }
    const clear = rayClear(j.eyeFor(ANGLES[j.i]), j.samples[j.s]);
    if (clear && ++j.s < j.samples.length) return true;
    if (!clear && ++j.i < ANGLES.length) { j.s = 0; return true; }
    viewChoice.set(ck, clear ? ANGLES[j.i] : [0, 0]);
    views.delete(ck);
    rebuildPoses(); // (cached now: no rays)
    return views.size > 0;
  };
  const idleViews = () => {
    if (disposed || !views.size) return;
    const idle = window.requestIdleCallback ?? ((f: IdleRequestCallback) => setTimeout(() => f({ didTimeout: true, timeRemaining: () => 8 }), 50));
    idle((dl) => {
      const t0 = performance.now();
      // a few ms at a time, so no idle slot grows into a long task
      while (!disposed && viewStep() && performance.now() - t0 < 8 && (dl.didTimeout || dl.timeRemaining() > 4));
      idleViews();
    }, { timeout: 1000 });
  };
  const needViews = (...keys: string[]) => {
    const add = keys.filter((k) => !exact.has(k));
    if (!add.length) return;
    add.forEach((k) => exact.add(k));
    rebuildPoses();
  };
  /** `band` = [top, bottom] fractions of the view the screen should occupy (phones: below the
   *  name block and above the on-screen keyboard); the default is the whole view. */
  const fitScreen = (key: string, corners: Vector3[], margin: number, fov: number, band: [number, number] = [0, 1]): Pose => {
    const [tl, tr, , bl] = corners;
    const c = corners.reduce((acc, v) => acc.add(v), new Vector3()).multiplyScalar(0.25);
    const w = tl.distanceTo(tr), h = tl.distanceTo(bl);
    const n = tr.clone().sub(tl).cross(bl.clone().sub(tl)).normalize();
    // face the side the seated viewer (cam_desk) is on
    if (n.dot(new Vector3(...deskRef.pose.pos).sub(c)) < 0) n.negate();
    const t = Math.tan((fov * DEG) / 2);
    const span = band[1] - band[0];
    const d = Math.max(h / (margin * span), w / (margin * camera.aspect)) / (2 * t);
    // slide the view so the screen's centre sits at the middle of the band (0.5 = centred)
    const up = tl.clone().sub(bl).normalize();
    const shift = ((band[0] + band[1]) / 2 - 0.5) * 2 * d * t; // >0: screen higher in view
    const eyeFor = ([yaw, lift]: [number, number]) => {
      const dir = n.clone().applyAxisAngle(upWorldConst, yaw * DEG);
      const right = new Vector3().crossVectors(dir, upWorldConst).normalize();
      return c.clone().add(dir.applyAxisAngle(right, lift * DEG).multiplyScalar(d)).addScaledVector(up, shift);
    };
    // the line-of-sight test uses the final eye (after the band shift)
    const ck = `${key}:${camera.aspect.toFixed(3)}:${band.join(',')}`;
    let choice = viewChoice.get(ck);
    if (!choice && !exact.has(key)) {
      // not needed yet (see needViews): worked out in idle time
      if (!views.has(ck)) views.set(ck, { eyeFor, samples: samplesOf(corners), i: 0, s: 0 });
      choice = [0, 0];
    } else if (!choice) {
      choice = ANGLES.find((ang) => clearView(eyeFor(ang), corners)) ?? [0, 0];
      viewChoice.set(ck, choice);
    }
    return { pos: eyeFor(choice).toArray() as Vec3, target: c.clone().addScaledVector(up, shift).toArray() as Vec3, fov };
  };
  const upWorldConst = new Vector3(0, 1, 0);

  let rigDy = 0;
  const rail = new Rail({ wide: wideRef.pose, desk: deskRef.pose, laptop: deskRef.pose, monitor: deskRef.pose });
  function rebuildPoses() {
    rig.updateWorldMatrix(true, true);
    const wide = { ...wideRef.pose, fov: adaptFov(wideRef.pose.fov, wideRef.refAspect) };
    wide.target = [wide.target[0], wide.target[1] + rigDy, wide.target[2]];
    const desk = withRig({ ...deskRef.pose, fov: adaptFov(deskRef.pose.fov, deskRef.refAspect) }, rigDy);
    // portrait phones: the laptop screen sits in the top ~55 %, leaving room for the keyboard
    // typing on a phone (keyboard up, chrome hidden): the screen fills what's left of the view
    const typing = document.body.dataset.typing !== undefined;
    // screen views sit between the top row and the bottom nav (px → fractions of the view)
    const vh = o.stage.clientHeight || innerHeight;
    const clear: [number, number] = [Math.min(0.2, 64 / vh), Math.max(0.8, 1 - 108 / vh)];
    const laptop = fitScreen('laptop', screenCorners(laptopScreen), 0.96, 34, camera.aspect < 1 ? (typing ? typingBand() : PHONE_BAND) : clear);
    // the whole ultrawide on landscape screens; on portrait phones the live contacts panel fills
    // the width (readable), and the side panes are a drag away
    const mon = camera.aspect < 1 ? fitScreen('contacts', contactsCorners(), 0.96, 34, clear) : fitScreen('monitor', screenCorners(monitorScreen), 0.96, 34, clear);
    rail.setPoses({ wide, desk, laptop, monitor: mon });
  }

  // ---------- state ----------
  // flights go straight from wherever the camera is to the chosen landmark
  let dest: Landmark = o.initial.landmark === 'wide' ? 'wide' : 'desk';
  let from: Pose = rail.pose(dest);
  const flight = new Spring(70);
  /** Where the camera actually looks this frame (landmark + pan + orbit applied). */
  const lookAt = new Vector3();
  /** The camera exactly as it is now: every flight starts here, never from a stored pose. */
  const currentPose = (): Pose => ({ pos: camera.position.toArray() as Vec3, target: lookAt.toArray() as Vec3, fov: camera.fov });
  const settled = () => flight.value === 1 && [orbit.yaw, orbit.pitch, ...pan].every((sp) => sp.target === 0 && sp.value === 0) && orbit.dolly.value === 1 && orbit.dolly.target === 1;
  flight.snap(1);
  let intro: 'held' | 'reveal' | 'flight' | 'done' | 'cancelled' = o.reducedMotion ? 'done' : 'held';
  let revealed = false;
  let introElapsed = 0;
  let introFrom: ScreenPose | null = null;
  const introActive = () => intro === 'held' || intro === 'reveal' || intro === 'flight';
  const frozen = {
    width: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--screen-w')) || consoleLayout(introViewport()).width,
    height: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--screen-h')) || consoleLayout(introViewport()).height,
  };
  let heldPose: ScreenPose | null = null;
  const initialPose = () => {
    if (heldPose) return heldPose;
    const view = introViewport();
    const rect = consoleLayout(view, frozen).rect;
    return heldPose = screenPose(screenCorners(laptopScreen), rect, view, new Vector3(...deskRef.pose.pos));
  };
  const beginIntro = () => {
    if (disposed || intro !== 'held' || (new URLSearchParams(location.search).has('test') && (window as any).__holdIntro)) return;
    intro = 'reveal'; introElapsed = 0;
    invalidate();
  };
  const fromUp = new Vector3(0, 1, 0);
  let fromAspect = camera.aspect;
  const orientation = new Spring(160);
  orientation.snap(1);
  const cancelIntro = () => {
    if (!introActive()) return;
    intro = 'cancelled';
    from = currentPose(); fromUp.copy(camera.up); fromAspect = camera.aspect; orientation.snap(0); orientation.target = 1;
  };
  const basePose = (): Pose => lerpPose(from, rail.pose(dest), flight.value);
  // free look on top of the landmark pose: drag orbits around what you look at, wheel or
  // pinch dolly in and out; both stay where you leave them until the next flight
  const orbit = { yaw: new Spring(160), pitch: new Spring(160), dolly: new Spring(160) };
  orbit.dolly.snap(1);
  // zoom-to-cursor shifts what you orbit around toward the point under the cursor
  const pan = [new Spring(160), new Spring(160), new Spring(160)];

  // the room's inside (three.js axes; scene/dims.py: left wall x -1.40 with the window,
  // back wall z -0.35, floor 0, ceiling 2.7, open toward the viewer and the right) less a margin
  const ROOM_MIN = new Vector3(-1.40 + 0.15, 0.12, -0.35 + 0.15), ROOM_MAX = new Vector3(Infinity, 2.7 - 0.15, Infinity);
  /** Largest t in (0, 1] keeping tgt + off·t inside the room (tgt is inside). */
  const roomFit = (tgt: Vector3, off: Vector3) => {
    let t = 1;
    for (const ax of ['x', 'y', 'z'] as const) {
      const p = tgt[ax] + off[ax] * t;
      if (p < ROOM_MIN[ax]) t = (ROOM_MIN[ax] - tgt[ax]) / off[ax];
      else if (p > ROOM_MAX[ax]) t = (ROOM_MAX[ax] - tgt[ax]) / off[ax];
    }
    return Math.max(0.05, t);
  };

  // normal limits; view mode widens them (still bounded to the front of the models)
  // (the room bounds and the desk-top floor keep every view presentable, so these can be
  // generous; "up" tilts the eye lower, "down" raises it to look down at the desk)
  const LIM = { normal: { yaw: 55, up: 30, down: 35, dolly: [0.35, 1.9], pan: 0.9 }, free: { yaw: 80, up: 38, down: 50, dolly: [0.25, 2.6], pan: 1.3 } } as const;
  let lim: { yaw: number; up: number; down: number; dolly: readonly [number, number]; pan: number } = LIM.normal;
  const YAW = () => lim.yaw * DEG, PITCH_UP = () => lim.up * DEG, PITCH_DOWN = () => lim.down * DEG;
  let deskTween: Tween | null = null, deskDone: (() => void) | null = null;
  let mixTween: Tween | null = null, themeReq = 0;
  // one 300 ms tween moves every `rgb` colour: [uniform, from, to]
  let ringTween: { pairs: [Color, Color, Color][]; start: number } | null = null;
  let ringKind = o.initial.rgb;
  let fanSpeed = FAN_SPEED[o.initial.fan], fanTarget = fanSpeed, fanAngle = 0;
  let pulse = 0, pulseStart = 0;
  let cat: CatState = { mode: 'idle', since: 0, lastActivity: 0 };
  let flickAt = performance.now() + nextFlickIn() * 1000, flickStart = -1e9;
  let tiltStart = -1e9;
  let lastInput = performance.now();
  let srvNext = 0;
  let currentLandmark: Landmark = o.initial.landmark;
  let announcedLandmark: Landmark | null = currentLandmark;
  let wasAway = false;
  // press-and-hold on ▲/▼: after HOLD_MS the desk runs at a real desk's speed until release
  const HOLD_MS = 260, HOLD_SPEED = 0.06; // m/s
  let hold: { dir: 1 | -1; start: number; active: boolean } | null = null;
  const pointer = new Vector2(0, 0);
  let hasPointer = false;
  let disposed = false;

  const setDeskHeight = (h: number) => {
    rigDy = h - manifest.deskBase;
    rig.position.y = rigBaseY + rigDy;
    placeFloorShadow();
    if (cable) cable.scale.y = Math.max(0.2, (cableLen0 + rigDy) / cableLen0);
  };
  setDeskHeight(clamp(o.initial.desk, manifest.range[0], manifest.range[1]));


  // ---------- render loop ----------
  let raf = 0, timer = 0, last = performance.now();
  // the monitor clock: when no frames run (reduced motion, or a GPU-less still view), a timer
  // wakes at each minute boundary and redraws only if the shown minute is really out of date
  let clockTimer = 0;
  const tickClock = () => {
    clockTimer = window.setTimeout(() => {
      if (disposed) return;
      if (monitor.stale()) invalidate();
      tickClock();
    }, 60_000 - (Date.now() % 60_000) + 50);
  };
  undo.push(() => { disposed = true; cancelAnimationFrame(raf); clearTimeout(timer); clearTimeout(clockTimer); });
  const frameTimes: number[] = [];
  let slept = -1; // ms this frame was deliberately delayed by (-1: it was not scheduled as a paced frame)
  const hidden = () => document.visibilityState === 'hidden';
  // no frame is drawn (or scheduled) until the mount's last phase draws the first one: a frame
  // in one of its gaps would compile the shaders and upload the textures all at once
  let drawing = false;
  function invalidate() {
    dirty = true;
    if (disposed || !drawing || raf) return;
    clearTimeout(timer);
    timer = 0;
    raf = requestAnimationFrame(frame);
  }

  const dock = new Dock([o.termEl, o.contactsEl, ...(o.infoEl ? [o.infoEl] : [])]);
  undo.push(() => dock.destroy());
  // logical overlay sizes: the laptop terminal is a 16:10 grid (fewer columns on phones so
  // text stays readable when the screen fills the view); contacts match their arc's aspect
  const sizeOverlays = () => {
    const px = (el: HTMLElement, name: string, v: number) => el.style.setProperty(name, `${v}px`);
    const tw = frozen.width, th = frozen.height;
    px(o.termEl, '--screen-w', tw); px(o.termEl, '--screen-h', th);
    dock.setSize(o.termEl, tw, th);
    const [tl, tr, , bl] = contactsCorners();
    const cw = 1120, ch = Math.round((cw * tl.distanceTo(bl)) / tl.distanceTo(tr));
    px(o.contactsEl, '--contacts-w', cw); px(o.contactsEl, '--contacts-h', ch);
    dock.setSize(o.contactsEl, cw, ch);
    if (o.infoEl) {
      const [a, b, , d] = infoCorners();
      const iw = 480, ih = Math.round((iw * a.distanceTo(d)) / a.distanceTo(b));
      px(o.infoEl, '--info-w', iw); px(o.infoEl, '--info-h', ih);
      dock.setSize(o.infoEl, iw, ih);
    }
  };

  const q = new Quaternion(), q2 = new Quaternion(), v = new Vector3(), v2 = new Vector3();
  const upWorld = new Vector3(0, 1, 0);

  function frame(now: number) {
    // one chain of frames only, however this one was started (rAF, the pacing timer, or the
    // mount's direct first frame)
    if (raf) cancelAnimationFrame(raf);
    clearTimeout(timer);
    raf = timer = 0;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    let animating = false;
    if (!hidden() && (intro === 'reveal' || intro === 'flight')) {
      introElapsed += dt * 1000;
      if (intro === 'reveal' && introElapsed >= 240) {
        introFrom = initialPose(); intro = 'flight'; introElapsed = 0;
      }
      if (intro === 'flight' && introElapsed >= 600) { intro = 'done'; camera.up.set(0, 1, 0); }
      animating = introActive();
    }

    // camera
    animating = orientation.step(dt) || animating;
    animating = flight.step(dt) || animating;
    animating = orbit.yaw.step(dt) || animating;
    animating = orbit.pitch.step(dt) || animating;
    animating = orbit.dolly.step(dt) || animating;
    for (const s of pan) animating = s.step(dt) || animating;

    // desk motion: press-and-hold
    if (hold && !hold.active && now - hold.start >= HOLD_MS) {
      hold.active = true;
      deskTween = null;
      deskDone?.();
      deskDone = null;
      o.onHold?.('start', rigDy + manifest.deskBase);
    }
    if (hold?.active) {
      const h = clamp(rigDy + manifest.deskBase + hold.dir * HOLD_SPEED * dt, manifest.range[0], manifest.range[1]);
      setDeskHeight(h);
      rebuildPoses();
      ledPaddle.set('#ffb454');
      animating = true;
    }
    // desk motion
    if (deskTween) {
      setDeskHeight(deskTween.value(now));
      rebuildPoses();
      animating = true;
      ledPaddle.set('#ffb454');
      if (deskTween.done(now)) {
        deskTween = null;
        ledPaddle.set(LED_OFF);
        deskDone?.();
        deskDone = null;
      }
    }
    // theme mix
    if (mixTween) {
      mix = mixTween.value(now);
      baked.uniforms.uMix.value = mix;
      shadowMat.uniforms.uMix.value = mix;
      placeFloorShadow();
      sky.uniforms.uMix.value = mix;
      scene.background = (scene.background as Color).set('#e9e8e4').lerp(new Color('#0a0a0b'), mix);
      animating = true;
      if (mixTween.done(now)) mixTween = null;
    }
    // ring colour + breathe + meow pulse
    const ringCol = ringMat.uniforms.uColor.value as Color;
    if (ringTween) {
      const t = clamp((now - ringTween.start) / 300, 0, 1), k = easeOut(t);
      for (const [u, from, to] of ringTween.pairs) u.copy(from).lerp(to, k);
      animating = true;
      if (t >= 1) ringTween = null;
    }
    const breathe = o.reducedMotion ? 1 : 1 + 0.06 * Math.sin((now / 8000) * Math.PI * 2);
    if (pulse > 0) {
      const t = (now - pulseStart) / 800;
      pulse = t >= 1 ? 0 : 0.6 * (1 - t);
      animating = animating || pulse > 0;
    }
    (glow.uniforms.uColor.value as Color).copy(ringCol);
    glow.uniforms.uIntensity.value = ringKind === 'off' && !ringTween ? 0 : (0.35 + 0.65 * mix) * breathe * (1 + pulse);
    (backlight.uniforms.uColor.value as Color).copy(ringCol);
    backlight.uniforms.uIntensity.value = ringKind === 'off' && !ringTween ? 0 : (0.3 + 0.45 * mix) * (1 + pulse * 0.5);

    // fan
    fanSpeed = o.reducedMotion ? fanTarget : fanSpeed + (fanTarget - fanSpeed) * Math.min(1, dt * 1.5);
    if (Math.abs(fanTarget - fanSpeed) > 0.05) animating = true;
    if (o.softwareGL) {
      // CPU WebGL: a spinning fan is drawn as what a fast fan is to the eye, a blurred disc
      // (blades plus trails spread across the gap between them), so it needs no redraws
      const blur = fanSpeed > 0.05 ? 0.55 + 0.45 * clamp(fanSpeed / FAN_SPEED[3], 0, 1) : 0;
      const gap = (2 * Math.PI) / 5 / (FAN_TRAILS + 1);
      fan.quaternion.copy(fanQ0).multiply(q.setFromAxisAngle(fanAxis, fanAngle));
      fanTrails.forEach(({ g, mat }, i) => {
        g.visible = blur > 0;
        if (!g.visible) return;
        mat.uniforms.uAlpha.value = blur * 0.5;
        g.quaternion.copy(fanQ0).multiply(q.setFromAxisAngle(fanAxis, fanAngle - gap * (i + 1)));
      });
    } else if (!o.reducedMotion || fanTarget !== fanSpeed) {
      const drift = o.reducedMotion ? 1 : 1 + 0.04 * Math.sin(now / 3100);
      // capped per frame below half the 72° blade spacing, so a slow frame never turns the
      // spin into a backwards-looking strobe
      const step = Math.min(Math.min(fanSpeed, FAN_SHOWN) * drift * dt, FAN_MAX_STEP);
      fanAngle = (fanAngle + step) % (Math.PI * 2);
      fan.quaternion.copy(fanQ0).multiply(q.setFromAxisAngle(fanAxis, fanAngle));
      // blur carries the speed the rotation can't show, so the levels read apart
      const blur = clamp((fanSpeed - FAN_SHOWN * 0.8) / (FAN_SPEED[3] - FAN_SHOWN * 0.8), 0, 1); // levels 1/2/3 ≈ 0.4/0.7/1
      fanTrails.forEach(({ g, mat }, i) => {
        g.visible = blur > 0.02;
        if (!g.visible) return;
        mat.uniforms.uAlpha.value = blur * 0.45 * (1 - i / FAN_TRAILS);
        g.quaternion.copy(fanQ0).multiply(q.setFromAxisAngle(fanAxis, fanAngle - (step * (i + 1)) / (FAN_TRAILS + 1)));
      });
    }

    // server LEDs: a new pattern every 2–6 s
    if (!o.reducedMotion && now >= srvNext) {
      srvNext = now + 2000 + Math.random() * 4000;
      srvLeds.slice(1).forEach((c) => c.set(Math.random() < 0.45 ? (Math.random() < 0.5 ? '#ffb454' : '#d8d8d6') : LED_OFF));
    }

    // cat
    cat = catStep(cat, now);
    head.parent!.updateWorldMatrix(true, false);
    let look: Vector3 | null = null;
    if (cat.mode === 'stare') look = camera.position.clone();
    else if (cat.mode === 'notice' || cat.mode === 'watch') {
      if (hasPointer) {
        raycaster.setFromCamera(pointer, camera);
        look = raycaster.ray.at(1.2, v2.set(0, 0, 0)).clone();
      } else look = screenCorners(laptopScreen)[0].clone().lerp(screenCorners(laptopScreen)[2], 0.5);
    }
    if (o.reducedMotion) look = null; // reduced motion: the cat keeps its pose
    const restQ = headQ0.clone();
    if (!o.reducedMotion && tiltStart > 0 && now - tiltStart < 900) {
      const k = Math.sin(((now - tiltStart) / 900) * Math.PI);
      restQ.multiply(q2.setFromAxisAngle(new Vector3(1, 0, 0), 14 * DEG * k));
      animating = true;
    }
    if (look) {
      const wantLocal = head.parent!.worldToLocal(look.clone()).sub(head.position).normalize();
      // world up in the body's frame, so the limits are "above/below" as a cat would feel them
      const upLocal = head.parent!.worldToLocal(head.parent!.getWorldPosition(v2).add(upWorld)).sub(head.parent!.worldToLocal(head.parent!.getWorldPosition(new Vector3()))).normalize();
      const g = constrainGaze(restForward.toArray() as [number, number, number], wantLocal.toArray() as [number, number, number], upLocal.toArray() as [number, number, number], GAZE);
      const delta = q.setFromUnitVectors(restForward, new Vector3(...g));
      const want = delta.multiply(restQ);
      head.quaternion.slerp(want, Math.min(1, dt * (cat.mode === 'stare' ? 2.2 : 6)));
      // only while it is still turning: a cat holding its gaze needs no new frames
      if (head.quaternion.angleTo(want) > 0.002) animating = true;
    } else {
      head.quaternion.slerp(restQ, Math.min(1, dt * 3));
      if (head.quaternion.angleTo(restQ) > 0.002) animating = true;
    }
    // tail flicks every 15–40 s, and on meow
    if (!o.reducedMotion && now >= flickAt) { flickStart = now; flickAt = now + nextFlickIn() * 1000; }
    const ft = (now - flickStart) / 700;
    // the tail flicks outward only: swinging inward it would cut into the body and the fan
    if (ft >= 0 && ft < 1) {
      const upLocal = tail.parent!.worldToLocal(tail.getWorldPosition(v).add(upWorld)).sub(tail.position).normalize();
      tail.quaternion.copy(q.setFromAxisAngle(upLocal, -Math.abs(Math.sin(ft * Math.PI * 3)) * (1 - ft) * 28 * DEG)).multiply(tailQ0);
      animating = true;
    } else tail.quaternion.copy(tailQ0);

    // screens
    if (monitor.update()) dirty = true;

    // apply camera
    if (introActive()) {
      const initial = intro === 'flight' && introFrom ? introFrom : initialPose();
      const progress = intro === 'flight' ? Math.min(1, introElapsed / 600) : 0;
      const k = progress * progress * (3 - 2 * progress);
      const p = lerpPose(initial, rail.pose('desk'), k);
      camera.position.set(...p.pos); camera.fov = p.fov;
      camera.aspect = initial.aspect + ((o.stage.clientWidth || innerWidth) / (o.stage.clientHeight || innerHeight) - initial.aspect) * k;
      camera.up.set(...initial.up).lerp(upWorld, k).normalize();
      camera.updateProjectionMatrix(); camera.lookAt(...p.target); lookAt.set(...p.target);
    } else {
    const p = basePose();
    camera.aspect = fromAspect + ((o.stage.clientWidth || innerWidth) / (o.stage.clientHeight || innerHeight) - fromAspect) * orientation.value;
    const pv = new Vector3(pan[0].value, pan[1].value, pan[2].value);
    camera.position.set(...p.pos).add(pv);
    camera.fov = p.fov;
    camera.updateProjectionMatrix();
    {
      camera.up.copy(fromUp).lerp(upWorld, orientation.value).normalize();
      const tgt = v.set(...p.target).add(pv);
      const off = camera.position.clone().sub(tgt).multiplyScalar(orbit.dolly.value);
      off.applyAxisAngle(upWorld, orbit.yaw.value);
      const right = new Vector3().crossVectors(off, upWorld).normalize();
      off.applyAxisAngle(right, -orbit.pitch.value);
      // stay inside the room: past a wall, the window or the ceiling, the camera slides in
      // toward what it looks at (the desk side stays free), and the dolly follows so zooming
      // back in answers at once instead of unwinding the overshoot first
      // (only this frame's view comes in: the zoom setting stays, so turning away from the wall
      // brings the view back out; a pinch/wheel continues from what is seen, see zoom())
      roomK = roomFit(tgt.clamp(ROOM_MIN, ROOM_MAX), off);
      if (roomK < 1) off.multiplyScalar(roomK);
      // looking around never takes the eye under the desk top, whose underside is not meant to
      // be seen. The orbit tilts back up to that height (same distance, same direction around),
      // so the zoom never changes, and the pitch spring stops there so a drag back answers at
      // once. Never above where the preset view itself puts the eye: landmarks are unchanged
      const floorY = Math.min(rigDy + manifest.deskBase + 0.04, p.pos[1]);
      if (tgt.y + off.y < floorY) {
        const need = floorY - tgt.y, len = off.length(), before = off.clone();
        if (len > Math.abs(need)) {
          const flat = Math.hypot(off.x, off.z) || 1, h = Math.sqrt(len * len - need * need);
          off.set((off.x / flat) * h, need, (off.z / flat) * h);
          const back = before.angleTo(off); // positive pitch lowers the eye
          const v = orbit.pitch.value - back, keep = Math.min(orbit.pitch.target, v);
          orbit.pitch.snap(v);
          orbit.pitch.target = keep; // a drag back up (target above) is kept, not dropped
        } else off.y = need; // looking at something far below the floor: raise the eye
      }
      camera.position.copy(tgt).add(off);
      camera.lookAt(tgt);
      lookAt.copy(tgt);
    }
    }
    camera.updateMatrixWorld();

    const away = dest !== 'desk' || pan.some((s) => Math.abs(s.target) > 0.01) || Math.abs(orbit.yaw.target) > 0.02 || Math.abs(orbit.pitch.target) > 0.02 || Math.abs(orbit.dolly.target - 1) > 0.03;
    if (away !== wasAway) { wasAway = away; o.onAway?.(away); }
    const nearest = dest;
    currentLandmark = nearest;

    // pin the live DOM onto both screens (every frame the camera or desk moves)
    const size = renderer.getSize(new Vector2());
    const quad = (pts: Vector3[]) => {
      const c = pts.reduce((acc, q) => acc.add(q), new Vector3()).multiplyScalar(0.25);
      const n = pts[1].clone().sub(pts[0]).cross(pts[3].clone().sub(pts[0]));
      // corners run TL→TR→BR→BL in image space, so (TR−TL)×(BL−TL) points into the screen
      const facing = n.dot(camera.position.clone().sub(c)) < 0;
      const out: [number, number][] = [];
      for (const pt of pts) {
        const e = pt.clone().applyMatrix4(camera.matrixWorldInverse);
        if (e.z > -camera.near) return { quad: null, facing };
        const q = pt.clone().project(camera);
        out.push([(q.x * 0.5 + 0.5) * size.x, (-q.y * 0.5 + 0.5) * size.y]);
      }
      return { quad: out, facing };
    };
    dock.update([quad(screenCorners(laptopScreen)), quad(contactsCorners()), ...(o.infoEl ? [quad(infoCorners())] : [])]);
    // Focus can only move onto the monitor once its real DOM quad is visible. From the
    // close laptop intro it starts behind the eye; notifying before Dock rejected focus.
    if (nearest !== announcedLandmark && (nearest !== 'monitor' || o.contactsEl.dataset.dock === 'screen')) {
      announcedLandmark = nearest; o.onLandmark(nearest);
    }

    const spinning = !o.softwareGL && fanSpeed > 0.05 && !o.reducedMotion && fanInView();
    if (o.softwareGL) {
      // light frames while anything moves; one full-resolution frame once it has settled
      const moving = animating || spinning;
      if (moving) lastMove = now;
      const settled = !moving && now - lastMove >= SW_SETTLE_MS;
      if (settled !== sharp) {
        sharp = settled;
        renderer.setPixelRatio(pixelRatio());
        renderer.setSize(o.stage.clientWidth || innerWidth, o.stage.clientHeight || innerHeight, false);
        dirty = true;
      }
      if (moving) dirty = true;
    } else dirty = true;
    if (dirty) { renderer.render(scene, camera); dirty = false; }
    // adaptive resolution while moving (camera, desk, or the fan's paced 30 fps): each frame's
    // interval minus the pause we asked for is what it really cost. rAF is capped at vsync, so
    // "fast" means keeping up with a 60 Hz display (~16.7 ms); well past that steps down
    if ((animating || spinning) && slept >= 0) {
      frameTimes.push(Math.max(0, dt * 1000 - slept));
      if (frameTimes.length >= 30) {
        const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        frameTimes.length = 0;
        if (!RECORDING && avg > 24 && dprScale > 0.55) { dprScale -= 0.15; applySize(); }
        else if (avg < 18 && dprScale < 1) { dprScale = Math.min(1, dprScale + 0.1); applySize(); }
      }
    }

    let interval = frameInterval({ animating, hidden: hidden(), reducedMotion: o.reducedMotion, idleMs: now - lastInput, spinning });
    // CPU WebGL: a steadier pace leaves the page responsive between frames
    if (o.softwareGL && interval !== null) interval = Math.max(interval, animating ? SW_FRAME_MS : spinning ? SW_SPIN_MS : SW_IDLE_MS);
    slept = interval === 0 ? 0 : interval === SPIN_FRAME_MS ? SPIN_FRAME_MS : -1;
    if (interval === 0) raf = requestAnimationFrame(frame);
    else if (interval !== null) timer = window.setTimeout(() => { timer = 0; raf = requestAnimationFrame(frame); }, interval);
  }

  // the head's resting look direction as posed in Blender: every gaze turn starts from it, so
  // a wrong one twists the head (older builds without it: towards the laptop screen)
  head.parent!.updateWorldMatrix(true, true);
  const lc = screenCorners(laptopScreen);
  const restForward = manifest.headForward
    ? new Vector3(...manifest.headForward).normalize()
    : head.parent!.worldToLocal(lc[0].clone().lerp(lc[2], 0.5)).sub(head.position).normalize();
  const raycaster = new Raycaster();

  // ---------- world API ----------
  const world: SceneWorld = {
    fly(to) {
      const wasIntro = introActive();
      cancelIntro();
      announcedLandmark = null;
      lastInput = performance.now();
      if (to === 'laptop') needViews('laptop');
      else if (to === 'monitor') needViews('monitor', 'contacts');
      if (!wasIntro && to === dest && settled()) { invalidate(); return; } // notify focus on a fresh projected frame
      // start from the camera exactly as it is, then fold the free-look offsets into the flight
      from = currentPose();
      fromUp.copy(camera.up); fromAspect = camera.aspect; orientation.snap(o.reducedMotion ? 1 : 0); orientation.target = 1;
      dest = to;
      orbit.yaw.snap(0); orbit.pitch.snap(0); orbit.dolly.snap(1);
      for (const sp of pan) sp.snap(0);
      flight.snap(0);
      flight.target = 1;
      if (o.reducedMotion) flight.snap(1);
      invalidate();
    },
    setDesk(h) {
      // a typed/clicked preset takes over from a held arrow (and stops its motor hum)
      if (hold?.active) { ledPaddle.set(LED_OFF); o.onHold?.('end', rigDy + manifest.deskBase); }
      hold = null;
      const target = clamp(h, manifest.range[0], manifest.range[1]);
      deskDone?.();
      if (!revealed) { heldPose = null; setDeskHeight(target); rebuildPoses(); invalidate(); return Promise.resolve(); }
      const from = rigDy + manifest.deskBase;
      deskTween = new Tween(from, target, performance.now(), o.reducedMotion ? 0 : 1500);
      invalidate();
      return new Promise<void>((res) => (deskDone = res));
    },
    async setTheme(t) {
      const want = t === 'light' ? 0 : 1;
      const req = ++themeReq;
      await atlas(themeKey(t)).then((tx) => {
        if (disposed) return;
        if (t === 'light') baked.uniforms.uDay.value = shadowMat.uniforms.uDay.value = tx;
        else baked.uniforms.uNight.value = shadowMat.uniforms.uNight.value = tx;
        if (req !== themeReq) return; // a newer toggle owns the crossfade
        if (!revealed) renderer.initTexture(tx);
        // The zero-duration covered update uses the same frame path as live crossfades,
        // including sky/background/floor uniforms. It also covers reduced motion/cancel.
        mixTween = new Tween(mix, want, performance.now(), !revealed || o.reducedMotion ? 0 : 600);
        invalidate();
      }).catch((e) => {
        if (!revealed) { o.onFailure?.(); return; }
        // Once exposed, keep the current lighting if an optional new atlas fails.
        console.warn('3d: lighting atlas unavailable, keeping current lighting', e);
      });
    },
    setRgb(rgb, accent) {
      ringKind = rgb;
      const to = rgbTargets(rgb, accent);
      const screen = to.screen !== rgbNow.screen;
      rgbNow = to;
      const u = (m: { uniforms: Record<string, { value: unknown }> }, name: string) => m.uniforms[name].value as Color;
      const pairs: [Color, Color][] = [
        [u(ringMat, 'uColor'), to.ring], [u(keysMat, 'uTint'), to.keys], [u(catMat, 'uTint'), to.cat],
        [u(legendMat, 'uTint'), to.legend], [srvLeds[0], to.led],
      ];
      if (!revealed) { pairs.forEach(([c, t]) => c.copy(t)); ringTween = null; }
      else ringTween = { pairs: pairs.map(([c, t]) => [c, c.clone(), t]), start: performance.now() };
      if (screen) {
        // the monitor's cat mark and bar underline are the terminal accent: redraw once
        setAnsiAccent(to.screen);
        monitor.invalidate();
      }
      invalidate();
    },
    setFan(s) {
      fanTarget = FAN_SPEED[s];
      fanReadout?.set(FAN_PCT[s]);
      invalidate();
    },
    meow() {
      pulse = 0.6; pulseStart = performance.now();
      flickStart = performance.now();
      tiltStart = performance.now();
      cat = catStep(cat, performance.now(), { activity: true });
      invalidate();
    },
    stare() {
      cat = catStep(cat, performance.now(), { stare: true });
      invalidate();
    },
    activity() {
      lastInput = performance.now();
      cat = catStep(cat, lastInput, { activity: true });
      invalidate();
    },
    landmark: () => currentLandmark,
    setFreeLook(on) {
      lim = on ? LIM.free : LIM.normal;
      orbit.yaw.target = clamp(orbit.yaw.target, -YAW(), YAW());
      orbit.pitch.target = clamp(orbit.pitch.target, -PITCH_DOWN(), PITCH_UP());
      orbit.dolly.target = clamp(orbit.dolly.target, lim.dolly[0], lim.dolly[1]);
      const p = new Vector3(pan[0].target, pan[1].target, pan[2].target);
      if (p.length() > lim.pan) { p.setLength(lim.pan); pan[0].target = p.x; pan[1].target = p.y; pan[2].target = p.z; }
      invalidate();
    },
  };

  // ---------- input ----------
  const detachInput = attachInput({
    canvas: o.stage,
    reducedMotion: o.reducedMotion,
    // the monitor's panes (the terminal scrolls, so a drag there stays a scroll)
    surfaces: [o.contactsEl, ...(o.infoEl ? [o.infoEl] : [])],
    zoom(f, x, y) {
      if (introActive()) {
        cancelIntro(); from = currentPose(); fromUp.copy(camera.up);
        flight.snap(0); // preserve this view while normal springs answer the gesture
      }
      lastInput = performance.now();
      // against a wall the view is nearer than the zoom setting: continue from what is seen
      if (roomK < 1) { orbit.dolly.snap(orbit.dolly.value * roomK); roomK = 1; }
      const nd = clamp(orbit.dolly.target * f, lim.dolly[0], lim.dolly[1]);
      const k = nd / orbit.dolly.target; // the factor actually applied after clamping
      // the point under the cursor: first surface hit, else a point at the orbit distance
      const r = o.stage.getBoundingClientRect();
      raycaster.setFromCamera(new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
      const surf = raycaster.intersectObjects(gltf.scene.children, true).find((h) => h.object.visible && !/^hit_/.test(h.object.name));
      const cur = new Vector3(...basePose().target).add(new Vector3(pan[0].target, pan[1].target, pan[2].target));
      const at = surf?.point ?? raycaster.ray.at(camera.position.distanceTo(cur), new Vector3());
      // moving the pivot by (1 - k) of the way to that point keeps it fixed on screen
      const next = new Vector3(pan[0].target, pan[1].target, pan[2].target).addScaledVector(at.sub(cur), 1 - k);
      if (next.length() > lim.pan) next.setLength(lim.pan);
      pan[0].target = next.x; pan[1].target = next.y; pan[2].target = next.z;
      orbit.dolly.target = nd;
      if (o.reducedMotion) { orbit.dolly.snap(nd); for (const s of pan) s.snap(s.target); }
      if (o.reducedMotion) orbit.dolly.snap(orbit.dolly.target);
      invalidate();
    },
    orbit(dx, dy) {
      if (introActive()) {
        cancelIntro(); from = currentPose(); fromUp.copy(camera.up);
        flight.snap(0); // preserve this view while normal springs answer the gesture
      }
      lastInput = performance.now();
      orbit.yaw.target = clamp(orbit.yaw.target - dx * 0.005, -YAW(), YAW());
      // grab-the-scene: moving the pointer up tilts the view down, like dragging right turns left
      orbit.pitch.target = clamp(orbit.pitch.target - dy * 0.004, -PITCH_DOWN(), PITCH_UP());
      if (o.reducedMotion) { orbit.yaw.snap(orbit.yaw.target); orbit.pitch.snap(orbit.pitch.target); }
      invalidate();
    },
    pointer(x, y) {
      const r = canvas.getBoundingClientRect();
      pointer.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      hasPointer = true;
      raycaster.setFromCamera(pointer, camera);
      const t = resolveTarget((raycaster.intersectObjects(hits, true)[0]?.object ?? null) as unknown as Named | null);
      o.stage.style.cursor = t ? 'pointer' : '';
      world.activity();
    },
    press(x, y) {
      const r = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
      const t = resolveTarget((raycaster.intersectObjects(hits, true)[0]?.object ?? null) as unknown as Named | null);
      if (t?.kind === 'paddle' && (t.key === 'up' || t.key === 'down')) {
        hold = { dir: t.key === 'up' ? 1 : -1, start: performance.now(), active: false };
        invalidate();
      }
    },
    release() {
      const was = hold;
      hold = null;
      if (!was?.active) return false; // a short press stays a tap (a 5 cm nudge)
      ledPaddle.set(LED_OFF);
      o.onHold?.('end', rigDy + manifest.deskBase);
      invalidate();
      return true;
    },
    tap(x, y) {
      const r = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
      const hit = raycaster.intersectObjects(hits, true)[0];
      if (!hit) return;
      const t = resolveTarget(hit.object as unknown as Named);
      if (t?.kind === 'laptop') { world.fly('laptop'); o.termEl.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }); }
      else if (t?.kind === 'monitor') world.fly('monitor');
      else if (t?.kind === 'paddle') o.onPaddle?.(t.key);
    },
  });
  undo.push(detachInput);

  const onResize = () => {
    const before = currentPose();
    heldPose = null;
    const wasSettled = flight.value === 1;
    if (intro === 'flight') { introFrom = { ...before, up: camera.up.toArray() as Vec3, aspect: camera.aspect }; introElapsed = 0; }
    sizeOverlays();
    applySize();
    // a re-fit (keyboard, rotation) glides from the current view instead of jumping
    if (!introActive() && wasSettled && !o.reducedMotion && lookAt.lengthSq() > 0) {
      from = before;
      flight.snap(0);
      flight.target = 1;
      invalidate();
    }
  };
  const onVis = () => { if (!hidden()) { last = performance.now(); invalidate(); } };
  // Restoration can race failure cleanup; ignore any wake after disposal.
  const onRestored = () => { if (disposed) return; monitor.invalidate(); fanReadout?.texture && (fanReadout.texture.needsUpdate = true); invalidate(); };
  addEventListener('resize', onResize);
  addEventListener('scene:refit', onResize);
  document.addEventListener('visibilitychange', onVis);
  canvas.addEventListener('webglcontextrestored', onRestored);
  undo.push(() => {
    removeEventListener('resize', onResize);
    removeEventListener('scene:refit', onResize);
    document.removeEventListener('visibilitychange', onVis);
    canvas.removeEventListener('webglcontextrestored', onRestored);
  });

  if (new URLSearchParams(location.search).has('test')) (window as any).__scene = { scene, camera, renderer, rail, flight, dest: () => dest, orbit, invalidate, world: () => world, hold: () => hold, pan, views: () => [...exact], intro: () => intro, releaseIntro: () => { (window as any).__holdIntro = false; beginIntro(); }, corners: () => screenCorners(laptopScreen).map(p => p.toArray()) };
  sizeOverlays();
  applySize();
  // the monitor's canvas is drawn in the site font (before its first upload below)
  await Promise.all(['400', '700'].map(w => document.fonts.load(`${w} 24px "JetBrains Mono"`, 'a█─')));
  o.signal?.throwIfAborted();
  document.documentElement.dataset.consoleFont = 'ready';
  monitor.update();
  await yieldToMain();
  // shaders: linked in parallel where the driver can (KHR_parallel_shader_compile), then each
  // program's link status and uniforms read in a task of its own. The invisible hit targets
  // are never drawn, so they must not cost a program: they borrow the desk's for the compile.
  const hitMeshes = hits.flatMap(meshesOf), hitMats = hitMeshes.map((m) => m.material);
  hitMeshes.forEach((m) => (m.material = baked));
  // (starts every link synchronously; without the extension there is nothing to poll)
  const compiled = renderer.extensions.has('KHR_parallel_shader_compile') ? renderer.compileAsync(scene, camera) : renderer.compile(scene, camera);
  hitMeshes.forEach((m, i) => (m.material = hitMats[i]));
  await compiled;
  o.signal?.throwIfAborted();

  await yieldToMain();
  const programs = new Set<{ getUniforms(): unknown }>();
  scene.traverse((c) => {
    const m = (c as Mesh).material;
    const p = m && !Array.isArray(m) ? (renderer.properties.get(m) as { currentProgram?: { getUniforms(): unknown } }).currentProgram : undefined;
    if (p) programs.add(p);
  });
  for (const p of programs) {
    p.getUniforms();

    await yieldToMain();
    o.signal?.throwIfAborted();
  }
  // texture uploads, one per task (the atlas, then the 2048×858 monitor canvas)
  const uploads = [firstAtlas, monitor.texture, fanReadout?.texture].filter((t): t is Texture => !!t);
  for (const t of uploads) {
    renderer.initTexture(t);

    await yieldToMain();
    o.signal?.throwIfAborted();
  }
  // Warm-up while the canvas is still off the page: one draw of the whole view clipped to a
  // single pixel, so the GL process builds every pipeline (a CPU renderer compiles them at
  // first draw) and finishes the uploads now. The page waits for none of it: the fence is
  // polled between tasks, and the page's own frames never wait on a canvas it does not show.
  {
    const p0 = basePose();
    camera.position.set(...p0.pos);
    camera.fov = p0.fov;
    camera.aspect = (o.stage.clientWidth || innerWidth) / (o.stage.clientHeight || innerHeight);
    camera.updateProjectionMatrix();
    camera.lookAt(...p0.target);
    camera.updateMatrixWorld();
    renderer.setScissor(0, 0, 1, 1);
    renderer.setScissorTest(true);
    renderer.render(scene, camera);
    renderer.setScissorTest(false);

    await gpuDone(renderer.getContext() as WebGL2RenderingContext, o.signal);
    o.signal?.throwIfAborted();

  }
  // A full covered frame establishes the screen projection before the black surround reveals.
  // Drawn directly, not in a rAF: a
  // covered or background window gets no animation frames, and the desk must still finish
  // loading there (it simply paints once shown)
  document.body.dataset.projecting = '';
  undo.push(() => { delete document.body.dataset.projecting; });
  heldPose = null;
  applySize(); // scene layout establishes the canvas CSS bounds before the authoritative draw
  o.stage.after(canvas); // above the pinned screens (they show through its windows)
  drawing = true;
  frame(performance.now());
  await gpuDone(renderer.getContext() as WebGL2RenderingContext, o.signal);
  o.signal?.throwIfAborted();
  tickClock();

  idleViews();
  // warm the other theme's atlas in idle time so toggling is instant
  const warm = () => {
    if (disposed) return;
    void atlas(o.initial.theme === 'light' ? 'night' : 'day').then((tx) => {
      if (o.initial.theme === 'light') baked.uniforms.uNight.value = tx; else baked.uniforms.uDay.value = tx;
    }).catch(() => {});
  };
  if ('requestIdleCallback' in window) {
    const warmId = requestIdleCallback(warm, { timeout: 3000 });
    undo.push(() => cancelIdleCallback(warmId));
  } else {
    const warmId = setTimeout(warm, 3000);
    undo.push(() => clearTimeout(warmId));
  }

  return {
    world,
    beginIntro,
    async prepare(read) {
      // An input may change preferences during any atlas or fence wait. Commit the
      // reveal in the same synchronous checkpoint that verifies the covered snapshot.
      while (!disposed) {
        const snapshot = read();
        await world.setTheme(snapshot.theme);
        o.signal?.throwIfAborted();
        world.setRgb(snapshot.rgb, snapshot.accent); world.setFan(snapshot.fan);
        await world.setDesk(snapshot.desk);
        o.signal?.throwIfAborted();
        if (disposed) break;
        dirty = true; frame(performance.now());
        await gpuDone(renderer.getContext() as WebGL2RenderingContext, o.signal);
        o.signal?.throwIfAborted();
        if (disposed) break;
        const current = read();
        if (snapshot.theme !== current.theme || snapshot.rgb !== current.rgb || snapshot.accent !== current.accent || snapshot.desk !== current.desk || snapshot.fan !== current.fan) continue;
        revealed = true;
        document.body.dataset.mode = 'scene';
        delete document.body.dataset.projecting;
        return;
      }
      throw new Error('Scene disposed before reveal');
    },

  };
}
