// Frame-exact capture of the live site, one short scene at a time (bun capture/capture.ts
// [scene…]). Serves the recording build (video/.site), renders each frame on the NVIDIA GPU
// at 4× (1620×2880) on a frozen clock (vt.js), downscales to 1080×1920 and writes
// public/footage/<scene>.mp4 with the site's own sounds, plus <scene>.json: every tap, drag
// and key with its frame, for the edit's touch markers and caption timing.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium, type Page, type CDPSession } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname;
const SITE = join(ROOT, '.site');
const FPS = 30, DT = 1000 / FPS;
// Formats: a phone-shaped CSS viewport, rendered at 4× and downscaled to the output size
// (the site frames its camera for the screen's shape, so each format is captured natively)
const FORMATS = {
  '9x16': { view: { width: 405, height: 720 }, out: [1080, 1920] },
  '4x5': { view: { width: 432, height: 540 }, out: [1080, 1350] },
} as const;
const fmtArg = process.argv.find((a) => a.startsWith('--format='))?.slice(9) ?? '9x16';
if (!(fmtArg in FORMATS)) throw new Error(`--format must be one of ${Object.keys(FORMATS).join(', ')}`);
const FMT = FORMATS[fmtArg as keyof typeof FORMATS];
const VIEW = FMT.view;
const OUT = join(ROOT, 'public/footage', fmtArg);
mkdirSync(OUT, { recursive: true });
const SCALE = FMT.out[0] / VIEW.width;
const DSF = 4; // rendered at 4× the CSS viewport, downscaled to the output (supersampling)
/** Scene coordinates are fractions of the screen, so one script plays in every format. */
const X = (f: number) => f * VIEW.width, Y = (f: number) => f * VIEW.height;
const WARMUP = 24; // frames stepped before recording (the view settles)

// ---- the recording build, served as-is ----
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
if (!existsSync(join(SITE, 'index.html'))) throw new Error('no recording build: run `bun run site` first');
const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch(req: Request) {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = join(SITE, p);
    if (!f.startsWith(SITE + '/') || !existsSync(f) || statSync(f).isDirectory()) return new Response('not found', { status: 404 });
    return new Response(Bun.file(f), { headers: { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' } });
  },
});
const BASE = `http://127.0.0.1:${server.port}`;

// ---- a scene: a page, a frozen clock, a frame sink and an event log ----
type Log = { fps: number; frames: number; taps: { f: number; x: number; y: number }[]; drags: { f0: number; f1: number; pts: [number, number, number][] }[]; pinches?: { f0: number; f1: number; pts: [number, number, number, number, number][] }[]; keys: { f: number; key: string }[]; marks: Record<string, number> };

class Take {
  f = 0;
  log: Log = { fps: FPS, frames: 0, taps: [], drags: [], keys: [], marks: {} };
  private ff;
  /** `pre`: frames stepped (unrecorded) since the clock froze, where the audio starts. */
  constructor(readonly name: string, readonly page: Page, readonly cdp: CDPSession, readonly pre: number) {
    this.ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-vf', `scale=${FMT.out[0]}:${FMT.out[1]}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', '-r', String(FPS), join(OUT, `${name}.video.mp4`)], { stdio: ['pipe', 'inherit', 'inherit'] });
  }

  /** Advance one frame and record it. */
  async frame() {
    await this.page.evaluate((dt) => (window as any).__vt.step(dt), DT);
    // clip.scale = the device scale: without it CDP returns CSS pixels (405×720), not the 4×
    // frame the GPU rendered, and the video ends up an upscale
    const { data } = await this.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 96, clip: { x: 0, y: 0, width: VIEW.width, height: VIEW.height, scale: DSF } });
    const buf = Buffer.from(data, 'base64');
    if (!this.ff.stdin!.write(buf)) await new Promise((r) => this.ff.stdin!.once('drain', r));
    this.f++;
  }
  async hold(seconds: number) { for (let i = Math.round(seconds * FPS); i > 0; i--) await this.frame(); }
  mark(name: string) { this.log.marks[name] = this.f; }

  private touch(type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) {
    return this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y: y! }] });
  }
  /** A finger tap (the browser sees a quick tap; the edit shows the finger over a few frames). */
  async tap(x: number, y: number) {
    this.log.taps.push({ f: this.f, x: x * SCALE, y: y * SCALE });
    await this.touch('touchStart', x, y);
    await this.touch('touchEnd');
    await this.frame();
  }
  /** A finger drag along a straight line, eased, over `seconds`. */
  async drag(x0: number, y0: number, x1: number, y1: number, seconds: number) {
    const n = Math.max(2, Math.round(seconds * FPS)), pts: [number, number, number][] = [];
    const f0 = this.f;
    await this.touch('touchStart', x0, y0);
    for (let i = 1; i <= n; i++) {
      const t = i / n, e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      const x = x0 + (x1 - x0) * e, y = y0 + (y1 - y0) * e;
      pts.push([this.f, x * SCALE, y * SCALE]);
      await this.touch('touchMove', x, y);
      await this.frame();
    }
    await this.touch('touchEnd');
    this.log.drags.push({ f0, f1: this.f, pts });
  }
  /** A two-finger pinch around (cx, cy): the gap between fingers goes from d0 to d1 px. */
  async pinch(cx: number, cy: number, d0: number, d1: number, seconds: number) {
    const n = Math.max(2, Math.round(seconds * FPS));
    const at = (d: number) => [{ x: cx - d / 2, y: cy, id: 1 }, { x: cx + d / 2, y: cy, id: 2 }];
    this.log.pinches ??= [];
    const pts: [number, number, number, number, number][] = [];
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(d0) });
    for (let i = 1; i <= n; i++) {
      const t = i / n, e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2, d = d0 + (d1 - d0) * e;
      pts.push([this.f, (cx - d / 2) * SCALE, cy * SCALE, (cx + d / 2) * SCALE, cy * SCALE]);
      await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(d) });
      await this.frame();
    }
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    this.log.pinches.push({ f0: pts[0][0], f1: this.f, pts });
  }
  /** Type like a person: a key every `every` frames, Enter at the end if asked. */
  async type(text: string, enter = true, every = 3) {
    for (const ch of text) {
      this.log.keys.push({ f: this.f, key: ch });
      await this.page.keyboard.press(ch);
      for (let i = 0; i < every; i++) await this.frame();
    }
    if (enter) {
      for (let i = 0; i < 4; i++) await this.frame();
      this.log.keys.push({ f: this.f, key: 'Enter' });
      await this.page.keyboard.press('Enter');
      await this.frame();
    }
  }
  /** Centre of an element, in CSS px. */
  async centre(sel: string) {
    const r = await this.page.locator(sel).first().boundingBox();
    if (!r) throw new Error(`${sel} not on screen`);
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }
  /** Where a 3D node appears on screen, in CSS px. */
  project(node: string) {
    return this.page.evaluate((node) => {
      const s = (window as any).__scene;
      const o = s.scene.getObjectByName(node);
      const v = o.getWorldPosition(new s.camera.position.constructor()).project(s.camera);
      return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
    }, node);
  }

  async finish() {
    this.ff.stdin!.end();
    await new Promise<void>((res, rej) => this.ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg ${c}`)))));
    this.log.frames = this.f;
    const seconds = (this.pre + 1 + this.f) * DT / 1000; // frame n shows time (pre + n + 1)·DT
    const b64 = await this.page.evaluate((s) => (window as any).__vt.audio(s), seconds + 0.5);
    const video = join(OUT, `${this.name}.video.mp4`), out = join(OUT, `${this.name}.mp4`);
    if (b64) {
      const wav = join(OUT, `${this.name}.wav`);
      writeFileSync(wav, Buffer.from(b64, 'base64'));
      // the audio timeline starts at the clock freeze; the picture after the warmup frames
      await run('ffmpeg', ['-v', 'error', '-y', '-i', video, '-ss', String((this.pre + 1) * DT / 1000), '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'pcm_s16le', '-shortest', out.replace(/\.mp4$/, '.mov')]);
    } else {
      await run('ffmpeg', ['-v', 'error', '-y', '-i', video, '-c', 'copy', out.replace(/\.mp4$/, '.mov')]);
    }
    await run('ffmpeg', ['-v', 'error', '-y', '-i', out.replace(/\.mp4$/, '.mov'), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', out]);
    writeFileSync(join(OUT, `${this.name}.json`), JSON.stringify(this.log, null, 1));
    console.log(`✓ ${this.name}: ${this.f} frames (${(this.f / FPS).toFixed(2)} s)${b64 ? ' + audio' : ''}`);
  }
}

const run = (cmd: string, args: string[]) => new Promise<void>((res, rej) => spawn(cmd, args, { stdio: 'inherit' }).on('close', (c) => (c === 0 ? res() : rej(new Error(`${cmd} ${c}`)))));

// ---- scenes: each short, one idea, starting from a known state ----
type Setup = { theme: 'dark' | 'light'; at?: 'desk' | 'laptop' };
const SCENES: Record<string, { setup: Setup; play(t: Take): Promise<void> }> = {
  // "…and you can walk around it": a slow drag one way, then the other
  desk: {
    setup: { theme: 'dark' },
    async play(t) {
      await t.hold(0.4);
      t.mark('drag1');
      await t.drag(X(0.741), Y(0.597), X(0.296), Y(0.556), 1.7);
      await t.hold(0.25);
      t.mark('drag2');
      await t.drag(X(0.321), Y(0.556), X(0.815), Y(0.625), 1.9);
      await t.hold(0.9);
    },
  },
  // "a real terminal": tap the laptop, type help
  laptop: {
    setup: { theme: 'dark' },
    async play(t) {
      await t.hold(0.4);
      const p = await t.centre('#term');
      t.mark('tap');
      await t.tap(p.x, p.y);
      await t.hold(1.3);
      t.mark('type');
      await t.type('help');
      t.mark('output');
      await t.hold(2.3);
    },
  },
  // "tap a screen to get closer": tap the monitor, the contacts come up
  monitor: {
    setup: { theme: 'dark' },
    async play(t) {
      await t.hold(0.4);
      const p = await t.centre('#contacts');
      t.mark('tap');
      await t.tap(p.x, p.y);
      await t.hold(2.8);
    },
  },
  // "day or night" then "the desk moves": theme toggle, then the paddle's preset 3
  daynight: {
    setup: { theme: 'dark' },
    async play(t) {
      await t.hold(0.4);
      const th = await t.centre('#t-theme');
      t.mark('theme');
      await t.tap(th.x, th.y);
      await t.hold(1.5);
      // out to the wide view (nav), so the desk rises in a still room
      const wide = await t.centre('#nav [data-landmark="wide"]');
      t.mark('wide');
      await t.tap(wide.x, wide.y);
      await t.hold(1.4);
      const pd = await t.project('hit_paddle_3');
      t.mark('desk');
      await t.tap(pd.x, pd.y);
      await t.hold(2.3);
    },
  },
  // "type meow." (the reply, readable up close) → "the cat answers." (glide back, pinch in on
  // the cat, a second word: the cat reacts)
  cat: {
    setup: { theme: 'light', at: 'laptop' },
    async play(t) {
      await t.hold(0.3);
      t.mark('type');
      await t.type('meow');
      t.mark('meow');
      await t.hold(1.0);
      // back to the desk (focus stays in the terminal, so typing won't fly to the laptop)
      t.mark('out');
      await t.page.evaluate(() => (window as any).__scene.world().fly('desk'));
      await t.hold(1.3);
      const c = await t.project('cat_head');
      t.mark('pinch');
      await t.pinch(c.x, c.y + Y(0.03), X(0.12), X(0.45), 1.0);
      await t.hold(0.2);
      t.mark('nya');
      await t.type('nya');
      t.mark('react');
      await t.hold(1.5);
    },
  },
};

// ---- run ----
const NV = { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json', __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia' };
// the compositor finishes every stage (full-resolution raster included) before a frame is
// drawn: without this, a frame grabbed right after a clock step shows the low-res tiles
// Chrome paints first, and scaled text (the pinned screens) comes out soft
const DETERMINISTIC = ['--run-all-compositor-stages-before-draw', '--disable-low-res-tiling', '--disable-checker-imaging', '--disable-new-content-rendering-timeout', '--disable-threaded-animation', '--disable-threaded-scrolling', '--enable-gpu-rasterization'];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', ...DETERMINISTIC], env: { ...process.env, ...NV } as Record<string, string> });
const vt = readFileSync(join(ROOT, 'capture/vt.js'), 'utf8');
const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
try {
  for (const [name, scene] of Object.entries(SCENES)) {
    if (want.length && !want.includes(name)) continue;
    const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DSF, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error(`[${name}] pageerror`, e.message));
    await page.addInitScript(vt);
    await page.addInitScript((theme) => {
      localStorage.setItem('alxnko:theme', theme);
      localStorage.setItem('alxnko:sound', 'on');
      localStorage.setItem('alxnko:ring', 'green');
    }, scene.setup.theme);
    await page.goto(`${BASE}/?3d&test`);
    await page.waitForFunction(() => document.body.dataset.scene === 'ready', null, { timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: '#hint{display:none!important}' }); // the edit's captions replace it
    const renderer = await page.evaluate(() => { const gl = (window as any).__scene.renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : gl.RENDERER); });
    if (!/nvidia/i.test(String(renderer))) console.warn(`[${name}] not on the NVIDIA GPU: ${renderer}`);
    await page.evaluate(() => (window as any).__vt.start());
    const cdp = await ctx.newCDPSession(page);
    // a first gesture turns the (saved "on") sound on, as a visitor's first touch would
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    if (scene.setup.at === 'laptop') {
      await page.evaluate(() => { const s = (window as any).__scene; s.world().fly('laptop'); });
      await page.evaluate(() => (document.getElementById('term-input') as HTMLInputElement).focus({ preventScroll: true }));
    }
    const pre = WARMUP + (scene.setup.at ? 60 : 0); // (+2 s to arrive at a starting landmark)
    for (let i = 0; i < pre; i++) await page.evaluate((dt) => (window as any).__vt.step(dt), DT);
    const take = new Take(name, page, cdp, pre);
    await scene.play(take);
    await take.finish();
    await ctx.close();
  }
} finally {
  await browser.close();
  server.stop(true);
}
