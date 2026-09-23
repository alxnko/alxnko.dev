// Lazy 3D desk (spec §6). Loaded via dynamic import only when decide3D() allows.
// Renders on demand; every surface is unlit (baked), so it stays cheap on phones.
import {
  Color, LinearFilter, Mesh, type Object3D, PerspectiveCamera, Quaternion, Raycaster,
  Scene, SRGBColorSpace, type Texture, TextureLoader, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { FanSpeed, Landmark, Ring, Theme, WorldState } from '../term/types';
import { parseManifest, type Manifest } from './manifest';
import { bakedMaterial, emissiveMaterial, glowMaterial, screenMaterial, skyMaterial } from './materials';
import { LANDMARKS, landmarkT, Rail, Spring, type Pose, type Vec3 } from './rail';
import { ScreenMirror, MIRROR, type MirrorStore } from './screen-mirror';
import { MonitorScreen } from './monitor-screen';
import { catStep, clamp, easeOut, frameInterval, nextFlickIn, Tween, type CatState } from './anim';
import { attachInput } from './input';
import { Dock } from './dock';

export interface SceneOptions {
  stage: HTMLElement;
  store: MirrorStore;
  initial: WorldState;
  reducedMotion: boolean;
  mobile: boolean;
  termEl: HTMLElement;
  contactsEl: HTMLElement;
  onLandmark(l: Landmark): void;
  onFallback(reason: string): void;
}

export interface SceneWorld {
  fly(to: Landmark): void;
  setDesk(h: number): Promise<void>;
  setTheme(t: Theme): void;
  setRing(r: Ring): void;
  setFan(s: FanSpeed): void;
  meow(): void;
  stare(): void;
  activity(): void;
  landmark(): Landmark;
}

export interface SceneHandle { world: SceneWorld; destroy(): void }

const RING: Record<Ring, string> = { green: '#00ff82', purple: '#b061ff', off: '#161618' };
const FAN_SPEED = [0, 7, 13, 20]; // rad/s
const DEG = Math.PI / 180;

export async function mount(o: SceneOptions): Promise<SceneHandle> {
  const base = '/scene/';
  const manifest: Manifest = parseManifest(await (await fetch(base + 'manifest.json', { cache: 'no-cache' })).json());

  // ---------- renderer ----------
  const canvas = document.createElement('canvas');
  canvas.className = 'stage-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const dprCap = o.mobile ? 1.5 : 2;
  const renderer = new WebGLRenderer({
    canvas,
    antialias: devicePixelRatio < 2,
    alpha: false,
    powerPreference: o.mobile ? 'default' : 'high-performance',
  });
  renderer.outputColorSpace = SRGBColorSpace;
  let dprScale = 1;
  const applySize = () => {
    const w = o.stage.clientWidth || innerWidth, h = o.stage.clientHeight || innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap) * dprScale);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    rebuildPoses();
    invalidate();
  };

  // ---------- assets ----------
  const big = !o.mobile && Math.min(devicePixelRatio, 2) * innerWidth >= 1400 && ((navigator as any).deviceMemory ?? 8) >= 8;
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
  const themeKey = (t: Theme) => (t === 'light' ? 'day' : 'night');

  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  const [gltf, firstAtlas] = await Promise.all([gltfLoader.loadAsync(base + manifest.files.glb), atlas(themeKey(o.initial.theme))]);

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

  let mix = o.initial.theme === 'light' ? 0 : 1;
  const baked = bakedMaterial(firstAtlas, firstAtlas, mix);
  for (const n of ['static', 'desk_baked', 'cat_body', 'cat_head', 'cat_tail', 'fan_blades']) meshesOf(node(n)).forEach((m) => (m.material = baked));

  const mirror = new ScreenMirror(o.store, { mobile: o.mobile, onDirty: () => invalidate() });
  mirror.texture.flipY = false;
  const monitor = new MonitorScreen(o.mobile);
  monitor.texture.flipY = false;
  const laptopScreen = node('screen_laptop'), monitorScreen = node('screen_monitor');
  const laptopMat = screenMaterial(mirror.texture), monitorMat = screenMaterial(monitor.texture);
  meshesOf(laptopScreen).forEach((m) => (m.material = laptopMat));
  meshesOf(monitorScreen).forEach((m) => (m.material = monitorMat));

  const ringMat = emissiveMaterial(RING[o.initial.ring]);
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
  const srvLeds = [0, 1, 2, 3, 4, 5].map((i) => led(`led_srv_${i}`, i === 0 ? '#00ff82' : LED_OFF));
  const hits = [node('hit_laptop'), node('hit_monitor')];
  hits.forEach((h) => (h.visible = false));

  const rig = node('desk_rig');
  const rigBaseY = rig.position.y;
  const cable = node('cable_drop');
  const cableLen0 = Math.max(0.05, rig.getWorldPosition(new Vector3()).y - cable.getWorldPosition(new Vector3()).y);
  const fan = node('fan_blades');
  const fanQ0 = fan.quaternion.clone();
  const fanAxis = new Vector3(...manifest.fanAxis).normalize();
  const head = node('cat_head'), tail = node('cat_tail');
  const headQ0 = head.quaternion.clone(), tailQ0 = tail.quaternion.clone();

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

  /** Screen corners in world space: TL, TR, BR, BL (image orientation via UVs). */
  const cornerIdx = new Map<Object3D, { mesh: Mesh; idx: number[] }>();
  const screenCorners = (obj: Object3D): Vector3[] => {
    let entry = cornerIdx.get(obj);
    if (!entry) {
      const mesh = meshesOf(obj)[0];
      const uv = mesh.geometry.getAttribute('uv');
      const idx = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => {
        let best = 0, bd = Infinity;
        for (let i = 0; i < uv.count; i++) {
          const d = (uv.getX(i) - u) ** 2 + (uv.getY(i) - v) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
        return best;
      });
      cornerIdx.set(obj, (entry = { mesh, idx }));
    }
    const { mesh, idx } = entry;
    const pos = mesh.geometry.getAttribute('position');
    mesh.updateWorldMatrix(true, false);
    return idx.map((i) => new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld));
  };

  const adaptFov = (vfov: number, refAspect: number) => {
    const hfov = 2 * Math.atan(Math.tan((vfov * DEG) / 2) * refAspect);
    const need = (2 * Math.atan(Math.tan(hfov / 2) / camera.aspect)) / DEG;
    return Math.min(Math.max(vfov, need), 85);
  };
  const withRig = (p: Pose, dy: number): Pose => ({ pos: [p.pos[0], p.pos[1] + dy, p.pos[2]], target: [p.target[0], p.target[1] + dy, p.target[2]], fov: p.fov });

  const fitScreen = (corners: Vector3[], margin: number, fov: number, sheet: boolean): Pose => {
    const [tl, tr, br, bl] = corners;
    const c = tl.clone().add(tr).add(br).add(bl).multiplyScalar(0.25);
    const w = tl.distanceTo(tr), h = tl.distanceTo(bl);
    const n = tr.clone().sub(tl).cross(bl.clone().sub(tl)).normalize().negate();
    // face the side the seated viewer (cam_desk) is on
    if (n.dot(new Vector3(...deskRef.pose.pos).sub(c)) < 0) n.negate();
    const t = Math.tan((fov * DEG) / 2);
    // sheet mode (phones): the DOM sheet covers the lower ~50%; frame the screen above it
    const visH = sheet ? 0.46 : 1;
    const d = Math.max(h / (margin * visH), w / (margin * camera.aspect)) / (2 * t);
    const target = sheet ? c.clone().add(new Vector3(0, -h * 0.6, 0)) : c;
    const pos = c.clone().add(n.multiplyScalar(d));
    if (sheet) pos.add(target.clone().sub(c)); // shift camera with target: stays fronto-parallel
    return { pos: pos.toArray() as Vec3, target: target.toArray() as Vec3, fov };
  };

  const sheetMode = () => o.mobile || innerWidth < 720;
  let rigDy = 0;
  const rail = new Rail({ wide: wideRef.pose, desk: deskRef.pose, laptop: deskRef.pose, monitor: deskRef.pose });
  function rebuildPoses() {
    rig.updateWorldMatrix(true, true);
    const wide = { ...wideRef.pose, fov: adaptFov(wideRef.pose.fov, wideRef.refAspect) };
    wide.target = [wide.target[0], wide.target[1] + rigDy, wide.target[2]];
    const desk = withRig({ ...deskRef.pose, fov: adaptFov(deskRef.pose.fov, deskRef.refAspect) }, rigDy);
    const laptop = fitScreen(screenCorners(laptopScreen), 0.9, 34, sheetMode());
    const mon = fitScreen(screenCorners(monitorScreen), 0.92, 34, false);
    rail.setPoses({ wide, desk, laptop, monitor: mon });
  }

  // ---------- state ----------
  const spring = new Spring(90);
  spring.snap(landmarkT(o.initial.landmark === 'laptop' || o.initial.landmark === 'monitor' ? 'desk' : o.initial.landmark));
  const orbit = { yaw: new Spring(140), pitch: new Spring(140) };
  let deskTween: Tween | null = null, deskDone: (() => void) | null = null;
  let mixTween: Tween | null = null;
  let ringTween: { from: Color; to: Color; start: number } | null = null;
  let ringKind: Ring = o.initial.ring;
  let fanSpeed = FAN_SPEED[o.initial.fan], fanTarget = fanSpeed, fanAngle = 0;
  let pulse = 0, pulseStart = 0;
  let cat: CatState = { mode: 'idle', since: 0, lastActivity: 0 };
  let flickAt = performance.now() + nextFlickIn() * 1000, flickStart = -1e9;
  let tiltStart = -1e9;
  let lastInput = performance.now();
  let srvNext = 0;
  let currentLandmark: Landmark = o.initial.landmark;
  const pointer = new Vector2(0, 0);
  let hasPointer = false;
  let disposed = false;

  const setDeskHeight = (h: number) => {
    rigDy = h - manifest.deskBase;
    rig.position.y = rigBaseY + rigDy;
    const total = cableLen0 + rigDy;
    cable.scale.y = Math.max(0.2, total / cableLen0);
  };
  setDeskHeight(clamp(o.initial.desk, manifest.range[0], manifest.range[1]));

  // ---------- render loop ----------
  let raf = 0, timer = 0, last = performance.now();
  const frameTimes: number[] = [];
  const hidden = () => document.visibilityState === 'hidden';
  function invalidate() {
    if (disposed || raf) return;
    clearTimeout(timer);
    timer = 0;
    raf = requestAnimationFrame(frame);
  }

  const dock = new Dock({ termEl: o.termEl, contactsEl: o.contactsEl, mirrorSize: [MIRROR.w, MIRROR.h] });
  const q = new Quaternion(), q2 = new Quaternion(), v = new Vector3(), v2 = new Vector3();
  const upWorld = new Vector3(0, 1, 0);

  function frame(now: number) {
    raf = 0;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    let animating = false;

    // camera
    animating = spring.step(dt) || animating;
    animating = orbit.yaw.step(dt) || animating;
    animating = orbit.pitch.step(dt) || animating;

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
      sky.uniforms.uMix.value = mix;
      scene.background = (scene.background as Color).set('#e9e8e4').lerp(new Color('#0a0a0b'), mix);
      animating = true;
      if (mixTween.done(now)) mixTween = null;
    }
    // ring colour + breathe + meow pulse
    const ringCol = ringMat.uniforms.uColor.value as Color;
    if (ringTween) {
      const t = clamp((now - ringTween.start) / 300, 0, 1);
      ringCol.copy(ringTween.from).lerp(ringTween.to, easeOut(t));
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

    // fan
    fanSpeed += (fanTarget - fanSpeed) * Math.min(1, dt * 1.5);
    if (Math.abs(fanTarget - fanSpeed) > 0.05) animating = true;
    if (!o.reducedMotion || fanTarget !== fanSpeed) {
      const drift = o.reducedMotion ? 1 : 1 + 0.04 * Math.sin(now / 3100);
      fanAngle = (fanAngle + fanSpeed * drift * dt) % (Math.PI * 2);
      fan.quaternion.copy(fanQ0).multiply(q.setFromAxisAngle(fanAxis, fanAngle));
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
    const restQ = headQ0.clone();
    if (tiltStart > 0 && now - tiltStart < 900) {
      const k = Math.sin(((now - tiltStart) / 900) * Math.PI);
      restQ.multiply(q2.setFromAxisAngle(new Vector3(1, 0, 0), 14 * DEG * k));
      animating = true;
    }
    if (look) {
      const headPos = head.getWorldPosition(v);
      const restDir = restForward.clone();
      const wantDir = head.parent!.worldToLocal(look.clone()).sub(head.position).normalize();
      const delta = q.setFromUnitVectors(restDir, wantDir);
      const ang = 2 * Math.acos(clamp(delta.w, -1, 1));
      const maxA = 55 * DEG;
      if (ang > maxA) delta.slerp(new Quaternion(), 1 - maxA / ang);
      void headPos;
      head.quaternion.slerp(delta.multiply(restQ), Math.min(1, dt * (cat.mode === 'stare' ? 2.2 : 6)));
      animating = true;
    } else {
      head.quaternion.slerp(restQ, Math.min(1, dt * 3));
      if (head.quaternion.angleTo(restQ) > 0.002) animating = true;
    }
    // tail flicks every 15–40 s, and on meow
    if (!o.reducedMotion && now >= flickAt) { flickStart = now; flickAt = now + nextFlickIn() * 1000; }
    const ft = (now - flickStart) / 700;
    if (ft >= 0 && ft < 1) {
      const upLocal = tail.parent!.worldToLocal(tail.getWorldPosition(v).add(upWorld)).sub(tail.position).normalize();
      tail.quaternion.copy(q.setFromAxisAngle(upLocal, Math.sin(ft * Math.PI * 3) * (1 - ft) * 28 * DEG)).multiply(tailQ0);
      animating = true;
    } else tail.quaternion.copy(tailQ0);

    // screens
    const mirrorChanged = mirror.update(Date.now(), o.reducedMotion);
    const monChanged = monitor.update();
    void mirrorChanged; void monChanged;

    // apply camera
    const p = rail.sample(spring.value);
    camera.position.set(...p.pos);
    camera.fov = p.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(...p.target);
    if (orbit.yaw.value || orbit.pitch.value) {
      // orbit around the target point, small and springy
      const tgt = v.set(...p.target);
      const off = camera.position.clone().sub(tgt);
      off.applyAxisAngle(upWorld, orbit.yaw.value);
      const right = new Vector3().crossVectors(off, upWorld).normalize();
      off.applyAxisAngle(right, orbit.pitch.value);
      camera.position.copy(tgt).add(off);
      camera.lookAt(tgt);
    }
    camera.updateMatrixWorld();

    const nearest = rail.nearest(spring.value);
    if (nearest !== currentLandmark) { currentLandmark = nearest; o.onLandmark(nearest); }

    // docking (spec §6.4)
    const err = (l: Landmark) => Math.abs(spring.value - landmarkT(l)) + Math.abs(orbit.yaw.value) + Math.abs(orbit.pitch.value);
    const size = renderer.getSize(new Vector2());
    const project = (pts: Vector3[]) => pts.map((pt) => {
      const n = pt.clone().project(camera);
      return [(n.x * 0.5 + 0.5) * size.x, (-n.y * 0.5 + 0.5) * size.y] as [number, number];
    });
    const docked = dock.update({
      termErr: err('laptop'), contactsErr: err('monitor'), sheet: sheetMode(),
      termQuad: project(screenCorners(laptopScreen)), contactsQuad: project(screenCorners(monitorScreen)),
    });
    mirror.active = !docked.term || sheetMode();

    const t0 = performance.now();
    renderer.render(scene, camera);
    // adaptive resolution while continuously animating
    if (animating) {
      frameTimes.push(dt * 1000);
      if (frameTimes.length >= 30) {
        const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        frameTimes.length = 0;
        if (avg > 22 && dprScale > 0.55) { dprScale -= 0.15; applySize(); }
        else if (avg < 12 && dprScale < 1) { dprScale = Math.min(1, dprScale + 0.1); applySize(); }
      }
    }
    void t0;

    const interval = frameInterval({ animating, hidden: hidden(), reducedMotion: o.reducedMotion, idleMs: now - lastInput });
    if (interval === 0) raf = requestAnimationFrame(frame);
    else if (interval !== null) timer = window.setTimeout(() => { timer = 0; raf = requestAnimationFrame(frame); }, interval);
  }

  // head's resting look direction = towards the laptop screen (how it is posed in Blender)
  head.parent!.updateWorldMatrix(true, true);
  const lc = screenCorners(laptopScreen);
  const restForward = head.parent!.worldToLocal(lc[0].clone().lerp(lc[2], 0.5)).sub(head.position).normalize();
  const raycaster = new Raycaster();

  // ---------- world API ----------
  const world: SceneWorld = {
    fly(to) {
      lastInput = performance.now();
      orbit.yaw.target = orbit.pitch.target = 0;
      if (o.reducedMotion) spring.snap(landmarkT(to));
      else spring.target = landmarkT(to);
      invalidate();
    },
    setDesk(h) {
      const target = clamp(h, manifest.range[0], manifest.range[1]);
      deskDone?.();
      const from = rigDy + manifest.deskBase;
      deskTween = new Tween(from, target, performance.now(), o.reducedMotion ? 0 : 1500);
      invalidate();
      return new Promise<void>((res) => (deskDone = res));
    },
    setTheme(t) {
      const want = t === 'light' ? 0 : 1;
      atlas(themeKey(t)).then((tx) => {
        if (disposed) return;
        if (t === 'light') baked.uniforms.uDay.value = tx; else baked.uniforms.uNight.value = tx;
        mixTween = new Tween(mix, want, performance.now(), o.reducedMotion ? 0 : 600);
        (laptopMat.uniforms.uRefl.value as Color).set(t === 'light' ? '#e9e8e4' : '#9aa3b5');
        (monitorMat.uniforms.uRefl.value as Color).set(t === 'light' ? '#e9e8e4' : '#9aa3b5');
        laptopMat.uniforms.uReflAmt.value = monitorMat.uniforms.uReflAmt.value = t === 'light' ? 0.16 : 0.1;
        invalidate();
      }).catch(() => o.onFallback('atlas'));
    },
    setRing(r) {
      ringKind = r;
      ringTween = { from: (ringMat.uniforms.uColor.value as Color).clone(), to: new Color(RING[r]), start: performance.now() };
      invalidate();
    },
    setFan(s) {
      fanTarget = FAN_SPEED[s];
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
  };

  // ---------- input ----------
  const detachInput = attachInput({
    canvas,
    reducedMotion: o.reducedMotion,
    scrub(dt) { lastInput = performance.now(); spring.target = clamp(spring.target + dt, 0, LANDMARKS.length - 1); if (o.reducedMotion) spring.snap(spring.target); invalidate(); },
    orbit(dx, dy) { orbit.yaw.target = clamp(-dx * 0.004, -12 * DEG, 12 * DEG); orbit.pitch.target = clamp(dy * 0.003, -6 * DEG, 6 * DEG); invalidate(); },
    release() { orbit.yaw.target = orbit.pitch.target = 0; invalidate(); },
    pointer(x, y) {
      const r = canvas.getBoundingClientRect();
      pointer.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      hasPointer = true;
      world.activity();
    },
    tap(x, y) {
      const r = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
      const hit = raycaster.intersectObjects(hits, true)[0];
      if (!hit) return;
      let n: Object3D | null = hit.object;
      while (n && !n.name.startsWith('hit_')) n = n.parent;
      if (n?.name === 'hit_laptop') { world.fly('laptop'); o.termEl.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }); }
      else if (n?.name === 'hit_monitor') world.fly('monitor');
    },
  });

  const onResize = () => applySize();
  const onVis = () => { if (!hidden()) { last = performance.now(); invalidate(); } };
  const onLost = (e: Event) => { e.preventDefault(); o.onFallback('context-lost'); };
  addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVis);
  canvas.addEventListener('webglcontextlost', onLost);

  o.stage.append(canvas);
  applySize();
  // first frame, then reveal (the app fades the poster out)
  await new Promise<void>((res) => requestAnimationFrame(() => { frame(performance.now()); res(); }));
  // warm the other theme's atlas in idle time so toggling is instant
  ('requestIdleCallback' in window ? (window as any).requestIdleCallback : setTimeout)(() => {
    atlas(o.initial.theme === 'light' ? 'night' : 'day').then((tx) => {
      if (o.initial.theme === 'light') baked.uniforms.uNight.value = tx; else baked.uniforms.uDay.value = tx;
    }).catch(() => {});
  }, 3000);

  return {
    world,
    destroy() {
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      detachInput();
      dock.destroy();
      removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('webglcontextlost', onLost);
      mirror.dispose();
      monitor.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
