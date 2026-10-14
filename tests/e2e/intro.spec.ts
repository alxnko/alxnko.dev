import { expect, test } from '@playwright/test';
import { guard, run } from './helpers';

test('delayed scene keeps the real readable terminal on black', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(r => release = r);
  await page.route('**/scene/manifest.json', async route => { await held; await route.continue(); });
  await page.goto('/?3d&test');
  await expect(page.locator('#term')).toBeVisible();
  await expect(page.locator('#loader')).toHaveCount(0);
  await expect(page.locator('.poster')).toBeHidden();
  expect(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(0, 0, 0)');
  release();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'ready', { timeout: 30000 });
});

for (const [width, height] of [[320, 568], [390, 844], [844, 390], [768, 1024], [1440, 900]]) {
  test(`held handoff preserves nodes, text and real screen projection ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => { (window as any).__holdIntro = true; localStorage.setItem('alxnko:booted', '1'); localStorage.setItem('alxnko:theme', 'light'); localStorage.setItem('alxnko:rgb', 'purple'); });
    let release!: () => void;
    const held = new Promise<void>(r => release = r);
    await page.route('**/scene/manifest.json', async route => { await held; await route.continue(); });
    await page.goto('/?3d&test');
    await page.waitForFunction(() => document.documentElement.dataset.consoleFont === 'ready' && !!document.querySelector('#term-lines .ln'));
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => {
      const el = document.getElementById('term')!;
      const line = document.querySelector<HTMLElement>('#term-lines .ln')!;
      (window as any).__initialTerm = el;
      (window as any).__initialLine = line;
      const box = (e: Element) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
      const screen = document.getElementById('term-screen')!;
      screen.scrollTop = 0;
      return { term: box(el), line: box(line), height: line.offsetHeight, scroll: screen.scrollTop, font: getComputedStyle(el).fontSize, accent: getComputedStyle(document.documentElement).getPropertyValue('--ansi-accent') };
    });
    expect(parseFloat(before.font) * before.term[2] / await page.locator('#term').evaluate(e => (e as HTMLElement).offsetWidth)).toBeGreaterThanOrEqual(12 - .01);
    release();
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'ready', { timeout: 30000 });
    const after = await page.evaluate(() => {
      const el = document.getElementById('term')!, line = document.querySelector<HTMLElement>('#term-lines .ln')!;
      const box = (e: Element) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
      const sc = (window as any).__scene, camera = sc.camera, r = sc.renderer.getSize({ set(x: number, y: number) { this.x = x; this.y = y; return this; } });
      const projected = sc.corners().map((p: number[]) => {
        const q = camera.position.clone().set(...p).project(camera);
        return [(q.x * .5 + .5) * r.x, (-q.y * .5 + .5) * r.y];
      });
      return { term: box(el), line: box(line), height: line.offsetHeight, scroll: document.getElementById('term-screen')!.scrollTop, identity: el === (window as any).__initialTerm && line === (window as any).__initialLine, intro: sc.intro(), viewport: [innerWidth, innerHeight, document.documentElement.clientWidth, document.documentElement.clientHeight, visualViewport?.width, visualViewport?.height, document.getElementById('stage')!.clientWidth, document.getElementById('stage')!.clientHeight], projected };
    });
    expect(after.identity).toBe(true);
    expect(after.intro).toBe('held');
    expect(after.height).toBe(before.height); expect(after.scroll).toBe(before.scroll);
    for (const key of ['term', 'line'] as const) after[key].forEach((v, i) => expect(Math.abs(v - before[key][i]), JSON.stringify({ before, after, key, i })).toBeLessThanOrEqual(1));
    const [x, y, w, h] = before.term;
    const quad = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    after.projected.forEach((p: number[], i: number) => p.forEach((v, j) => expect(Math.abs(v - quad[i][j])).toBeLessThanOrEqual(1)));
    await page.evaluate(() => (window as any).__scene.releaseIntro());
    await expect.poll(() => page.evaluate(() => (window as any).__scene.intro())).toBe('done');
  });
}

test('cold font requests keep glyphs covered until the used faces load', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(r => release = r);
  await page.route('**/*jetbrains*.woff2', async route => { await held; await route.continue(); });
  await page.goto('/?3d&test', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#term')).toBeVisible();
  expect(await page.locator('.term-head').evaluate(e => getComputedStyle(e).opacity)).toBe('0');
  expect(await page.locator('html').getAttribute('data-console-font')).toBeNull();
  release();
  await expect(page.locator('html')).toHaveAttribute('data-console-font', 'ready');
  await expect(page.locator('.term-head')).toHaveCSS('opacity', '1');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'ready');
});

test('early real keyboard input owns the camera and survives scene mounting', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(r => release = r);
  await page.route('**/scene/manifest.json', async route => { await held; await route.continue(); });
  await page.goto('/?3d&test');
  await page.keyboard.type('echo early-owner');
  await page.keyboard.press('Enter');
  await expect(page.locator('#term-lines')).toContainText('early-owner');
  release();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'ready');
  await page.waitForTimeout(1600);
  expect(await page.evaluate(() => (window as any).__scene.dest())).toBe('laptop');
  expect(await page.evaluate(() => (window as any).__scene.intro())).toBe('cancelled');
  await expect(page.locator('#term-input')).toBeFocused();
  await expect(page.locator('#term-lines')).toContainText('early-owner');
});

test('explicit navigation and a real drag cancel the automatic flight', async ({ page, isMobile }) => {
  await page.goto('/?3d&test');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'ready');
  await page.locator('#nav [data-landmark="monitor"]').click();
  await page.waitForTimeout(1400);
  expect(await page.evaluate(() => (window as any).__scene.dest())).toBe('monitor');
  expect(await page.evaluate(() => (window as any).__scene.intro())).toBe('cancelled');
  await page.locator('#nav [data-landmark="desk"]').click();
  await page.waitForTimeout(1200);
  if (!isMobile) {
    const { width, height } = page.viewportSize()!;
    await page.mouse.move(width * .8, height * .7);
    await page.mouse.down(); await page.mouse.move(width * .65, height * .7, { steps: 5 }); await page.mouse.up();
    expect(await page.evaluate(() => Math.abs((window as any).__scene.orbit.yaw.target))).toBeGreaterThan(.05);
  }
  expect(await page.evaluate(() => Math.abs((window as any).__scene.camera.aspect - innerWidth / innerHeight))).toBeLessThan(.001);
});

test('resize during loading and flight keeps the same intrinsic terminal grid', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__holdIntro = true; localStorage.setItem('alxnko:booted', '1'); });
  let release!: () => void;
  const held = new Promise<void>(r => release = r);
  await page.route('**/scene/manifest.json', async route => { await held; await route.continue(); });
  await page.goto('/?3d&test');
  const metrics = () => page.locator('#term').evaluate(e => [getComputedStyle(e).width, getComputedStyle(e).height, getComputedStyle(e).fontSize, document.querySelector<HTMLElement>('#term-lines .ln')?.offsetHeight]);
  const before = await metrics();
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await metrics()).toEqual(before);
  const box = (await page.locator('#term').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(844);
  release();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'ready');
  await page.evaluate(() => (window as any).__scene.releaseIntro());
  await expect.poll(() => page.evaluate(() => (window as any).__scene.intro())).toBe('flight');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await metrics()).toEqual(before);
  await expect.poll(() => page.evaluate(() => (window as any).__scene.intro())).toBe('done');
  expect(await page.evaluate(() => (window as any).__scene.camera.aspect)).toBeCloseTo(390 / 844, 6);
});

test('reduced motion reveals the normal desk without reveal or flight time', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?3d&test');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'ready');
  expect(await page.evaluate(() => (window as any).__scene.intro())).toBe('done');
  expect(parseFloat(await page.locator('.stage-canvas').evaluate(e => getComputedStyle(e).transitionDuration))).toBeLessThanOrEqual(.00001);
  expect(await page.evaluate(() => (window as any).__scene.camera.up.toArray())).toEqual([0, 1, 0]);
});

test('a failed scene returns the working lite terminal and contacts', async ({ page }) => {
  await page.route('**/scene/manifest.json', route => route.abort());
  await page.goto('/?3d');
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'page');
  await expect(page.locator('html')).not.toHaveAttribute('data-boot', '3d');
  await expect(page.locator('#term')).toBeVisible();
  await expect(page.locator('#contacts')).toBeVisible();
  await run(page, 'echo fallback-works');
  await expect(page.locator('#term-lines')).toContainText('fallback-works');
  await expect(page.locator('canvas.stage-canvas')).toHaveCount(0);
});

test('context loss disposes the scene and preserves a usable lite terminal', async ({ page }) => {
  await page.goto('/?3d&test');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'ready');
  await page.evaluate(() => (window as any).__scene.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'page');
  await expect(page.locator('canvas.stage-canvas')).toHaveCount(0);
  await run(page, 'echo context-fallback');
  await expect(page.locator('#term-lines')).toContainText('context-fallback');
});

test('the visible-time watchdog releases a stalled late mount', async ({ page }) => {
  test.setTimeout(45000);
  let release!: () => void;
  const held = new Promise<void>(r => release = r);
  await page.route('**/scene/manifest.json', async route => { await held; await route.continue(); });
  await page.goto('/?3d&test');
  await expect(page.locator('html')).toHaveAttribute('data-boot', '3d');
  await expect(page.locator('html')).not.toHaveAttribute('data-boot', '3d', { timeout: 17000 });
  await expect(page.locator('#contacts')).toBeVisible();
  release();
  await page.waitForTimeout(1200);
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'page');
  await expect(page.locator('canvas.stage-canvas')).toHaveCount(0);
  await run(page, 'echo late-fallback');
  await expect(page.locator('#term-lines')).toContainText('late-fallback');
});

test('no JavaScript keeps the accessible lite baseline', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/?3d');
  await expect(page.locator('#term')).toBeVisible();
  await expect(page.locator('#contacts')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-boot', '3d');
  await expect(page.locator('#term-input')).toBeHidden();
  await context.close();
});

test('production CSP remains clean through intro and normal flights', async ({ page }) => {
  const g = await guard(page);
  await page.goto('/?3d&test');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'ready');
  await page.waitForTimeout(1000);
  await page.locator('#nav [data-landmark="laptop"]').click();
  await page.waitForTimeout(1200);
  g.check();
});

test('blocked first-paint bootstrap preserves the usable lite baseline', async ({ page }) => {
  await page.route('**/?3d&test', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '');
    await route.fulfill({ response, body });
  });
  await page.goto('/?3d&test');
  await page.waitForTimeout(2400);
  await expect(page.locator('html')).not.toHaveAttribute('data-boot', '3d');
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'page');
  await expect(page.locator('#term')).toBeVisible();
  await expect(page.locator('#contacts')).toBeVisible();
  await run(page, 'echo blocked-bootstrap');
  await expect(page.locator('#term-lines')).toContainText('blocked-bootstrap');
});

test('an entry module arriving after fallback cannot take over the lite page', async ({ page }) => {
  test.setTimeout(45000);
  let release!: () => void;
  const held = new Promise<void>(r => release = r);
  await page.route('**/_astro/Base*.js', async route => { await held; await route.continue(); });
  await page.goto('/?3d&test', { waitUntil: 'commit' });
  await expect(page.locator('html')).toHaveAttribute('data-boot', '3d');
  await expect(page.locator('html')).not.toHaveAttribute('data-boot', '3d', { timeout: 17000 });
  await expect(page.locator('#contacts')).toBeVisible();
  release();
  await page.waitForLoadState('load');
  await page.waitForTimeout(2000);
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'page');
  await expect(page.locator('canvas.stage-canvas')).toHaveCount(0);
  await run(page, 'echo late-entry');
  await expect(page.locator('#term-lines')).toContainText('late-entry');
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) test(`settings changed during loading reach every lighting uniform before ${reducedMotion} reveal`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion, colorScheme: 'dark' });
  let release!: () => void;
  const held = new Promise<void>(r => release = r);
  await page.route('**/scene/manifest.json', async route => { await held; await route.continue(); });
  await page.goto('/?3d&test');
  await run(page, 'theme light'); await run(page, 'rgb off');
  release();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'ready');
  const mixes = await page.evaluate(() => {
    const values: number[] = [];
    (window as any).__scene.scene.traverse((node: any) => {
      const mat = node.material;
      if (mat?.uniforms?.uMix) values.push(mat.uniforms.uMix.value);
    });
    return values;
  });
  const glow = await page.evaluate(() => {
    const values: number[] = [];
    (window as any).__scene.scene.traverse((node: any) => {
      if (/^(ring_glow|kbd_glow|laptop_kbd_glow)/.test(node.name) && node.material?.uniforms?.uIntensity) values.push(node.material.uniforms.uIntensity.value);
    });
    return values;
  });
  expect(glow.length).toBeGreaterThan(0);
  expect(glow.every(v => v === 0)).toBe(true);
  expect(mixes.length).toBeGreaterThan(2);
  expect(mixes.every(v => v === 0)).toBe(true);
});


test('preferences changed during the final GPU wait remain covered until the current atlas renders', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('alxnko:booted', '1'); localStorage.setItem('alxnko:theme', 'dark');
    const state = (window as any).__finalFence = { count: 0, release: false };
    const proto = WebGL2RenderingContext.prototype;
    const fence = proto.fenceSync, status = proto.getSyncParameter;
    let held: WebGLSync | null = null;
    proto.fenceSync = function(condition, flags) {
      const sync = fence.call(this, condition, flags);
      if (++state.count === 3) held = sync;
      return sync;
    };
    proto.getSyncParameter = function(sync, parameter) {
      if (sync === held && parameter === this.SYNC_STATUS && !state.release) return this.UNSIGNALED;
      return status.call(this, sync, parameter);
    };
  });
  let release!: () => void;
  const held = new Promise<void>(r => release = r);
  await page.route('**/scene/atlas-day-*.webp', async route => { await held; await route.continue(); });
  await page.goto('/?3d&test');
  await page.waitForFunction(() => (window as any).__finalFence.count === 3);
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'page');
  await run(page, 'theme light'); await run(page, 'rgb off');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.evaluate(() => { (window as any).__finalFence.release = true; });
  // The first final fence completes, but the selected day atlas is still unavailable.
  await page.waitForTimeout(250);
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'page');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'loading');
  release();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'ready');
  const result = await page.evaluate(() => {
    const mixes: number[] = [], glow: number[] = [];
    (window as any).__scene.scene.traverse((node: any) => {
      if (node.material?.uniforms?.uMix) mixes.push(node.material.uniforms.uMix.value);
      if (/^(ring_glow|kbd_glow|laptop_kbd_glow)/.test(node.name) && node.material?.uniforms?.uIntensity) glow.push(node.material.uniforms.uIntensity.value);
    });
    return { count: (window as any).__finalFence.count, mixes, glow };
  });
  expect(result.count).toBeGreaterThanOrEqual(4);
  expect(result.mixes.length).toBeGreaterThan(2); expect(result.mixes.every(v => v === 0)).toBe(true);
  expect(result.glow.length).toBeGreaterThan(0); expect(result.glow.every(v => v === 0)).toBe(true);
});

for (const failure of ['missing', 'unsignaled'] as const) test(`a ${failure} GPU fence keeps the working lite fallback`, async ({ page }) => {
  await page.addInitScript(failure => {
    const proto = WebGL2RenderingContext.prototype;
    if (failure === 'missing') proto.fenceSync = () => null;
    else {
      const status = proto.getSyncParameter;
      proto.getSyncParameter = function(sync, parameter) {
        return parameter === this.SYNC_STATUS ? this.UNSIGNALED : status.call(this, sync, parameter);
      };
    }
  }, failure);
  await page.goto('/?3d&test');
  await expect(page.locator('html')).not.toHaveAttribute('data-boot', '3d', { timeout: 10000 });
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'page');
  await expect(page.locator('canvas.stage-canvas')).toHaveCount(0);
  await expect(page.locator('#contacts')).toBeVisible();
  await run(page, 'echo gpu-fallback');
  await expect(page.locator('#term-lines')).toContainText('gpu-fallback');
});
