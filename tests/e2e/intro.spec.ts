import { expect, test } from '@playwright/test';
import { guard, promptReady, run } from './helpers';

test('zero initial viewport keeps lite usable until an explicit valid retry', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    (window as any).__holdIntro = true;
    const width = Object.getOwnPropertyDescriptor(window, 'innerWidth')!;
    const height = Object.getOwnPropertyDescriptor(window, 'innerHeight')!;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 0 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 0 });
    (window as any).__restoreViewport = () => {
      Object.defineProperty(window, 'innerWidth', width);
      Object.defineProperty(window, 'innerHeight', height);
      dispatchEvent(new Event('resize'));
    };
  });
  let release!: () => void;
  const held = new Promise<void>(r => release = r);
  let requested = 0;
  await page.route('**/scene/manifest.json', async route => { requested++; await held; await route.continue(); });
  await page.goto('/?3d&test');
  await expect(page.locator('html')).toHaveAttribute('data-boot', 'failed');
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'page');
  await expect(page.locator('#term')).toBeVisible();
  await expect(page.locator('#contacts')).toBeVisible();
  await run(page, 'echo viewport-fallback');
  await expect(page.locator('#term-lines')).toContainText('viewport-fallback');
  await page.evaluate(() => { (window as any).__initialTerm = document.getElementById('term'); });
  const button = page.locator('#enter3d');
  await expect(button).toBeVisible();
  await button.click();
  await expect(button).toBeEnabled();
  await expect(button).toHaveText('enter 3d');
  await expect(page.locator('html')).toHaveAttribute('data-boot', 'failed');
  await expect(page.locator('canvas.stage-canvas')).toHaveCount(0);
  expect(requested).toBe(0);
  await page.evaluate(async () => {
    (window as any).__restoreViewport();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await expect(page.locator('html')).toHaveAttribute('data-boot', 'failed');
  await expect(button).toBeEnabled();
  expect(requested).toBe(0);
  await button.click();
  await expect(page.locator('html')).toHaveAttribute('data-console-font', 'ready');
  const retry = await page.locator('#term').evaluate(el => {
    const term = el as HTMLElement;
    return { same: el === (window as any).__initialTerm, width: term.offsetWidth, effectiveFont: parseFloat(getComputedStyle(el).fontSize) * el.getBoundingClientRect().width / term.offsetWidth };
  });
  expect(retry.same).toBe(true);
  expect(retry.width).toBeGreaterThan(2);
  expect(retry.effectiveFont).toBeGreaterThanOrEqual(12 - .01);
  release();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'ready');
  expect(await page.locator('#term').evaluate(el => el === (window as any).__initialTerm)).toBe(true);
  await expect(page.locator('#term-lines')).toContainText('viewport-fallback');
});

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
  // setViewportSize updates the viewport before its asynchronous resize event.
  await expect.poll(async () => {
    const box = await page.locator('#term').boundingBox();
    return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 844 && box.y + box.height <= 390;
  }).toBe(true);
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

for (const [from, to] of [
  [[1440, 900], [320, 568]],
  [[320, 568], [1440, 900]],
] as const) test(`context-loss retry contains the new grid and preserves its handoff ${from[0]}→${to[0]}`, async ({ page }) => {
  await page.setViewportSize({ width: from[0], height: from[1] });
  await page.addInitScript(() => { (window as any).__holdIntro = true; localStorage.setItem('alxnko:booted', '1'); });
  await page.goto('/?3d&test');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'ready');
  await promptReady(page);
  await page.evaluate(() => (window as any).__scene.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'page');
  await page.setViewportSize({ width: to[0], height: to[1] });
  // Preserve terminal content/input without requesting a laptop flight: that intentional
  // focus path is covered separately, while this test holds the analytic handoff camera.
  await page.evaluate(() => {
    const input = document.getElementById('term-input') as HTMLInputElement;
    input.value = 'echo retry-keeps-output-and-wrapping-abcdefghijklmnopqrstuvwxyz';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    (document.getElementById('term-form') as HTMLFormElement).requestSubmit();
  });
  await expect(page.locator('#term-form')).toHaveAttribute('data-busy', 'false');
  await page.evaluate(() => {
    const input = document.getElementById('term-input') as HTMLInputElement;
    input.value = 'unfinished retry input'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  let release!: () => void;
  const held = new Promise<void>(r => release = r);
  await page.route('**/scene/manifest.json', async route => { await held; await route.continue(); });
  await page.locator('#enter3d').click();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'loading');
  await page.waitForTimeout(100);
  const before = await page.evaluate(() => {
    const term = document.getElementById('term')!, line = document.querySelector<HTMLElement>('#term-lines .ln:last-child')!;
    (window as any).__retryNodes = [term, line, document.getElementById('term-input')];
    const box = (e: Element) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
    document.getElementById('term-screen')!.scrollTop = 0;
    return { term: box(term), line: box(line), logical: [term.offsetWidth, term.offsetHeight], wrap: line.offsetHeight, input: (document.getElementById('term-input') as HTMLInputElement).value };
  });
  const [x, y, w, h] = before.term;
  expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0);
  expect(x + w).toBeLessThanOrEqual(to[0]); expect(y + h).toBeLessThanOrEqual(to[1]);
  release();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'ready');
  const after = await page.evaluate(() => {
    const term = document.getElementById('term')!, line = document.querySelector<HTMLElement>('#term-lines .ln:last-child')!, input = document.getElementById('term-input') as HTMLInputElement;
    const box = (e: Element) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
    const sc = (window as any).__scene, bounds = sc.renderer.domElement.getBoundingClientRect();
    return { term: box(term), line: box(line), logical: [term.offsetWidth, term.offsetHeight], wrap: line.offsetHeight, input: input.value, scroll: document.getElementById('term-screen')!.scrollTop,
      identity: [term, line, input].every((e, i) => e === (window as any).__retryNodes[i]), intro: sc.intro(),
      projected: sc.corners().map((p: number[]) => { const q = sc.camera.position.clone().set(...p).project(sc.camera); return [bounds.x + (q.x + 1) * bounds.width / 2, bounds.y + (1 - q.y) * bounds.height / 2]; }) };
  });
  expect(after.identity).toBe(true); expect(after.intro).toBe('held');
  expect(after.logical).toEqual(before.logical); expect(after.wrap).toBe(before.wrap);
  expect(after.input).toBe(before.input); expect(after.scroll).toBe(0);
  for (const key of ['term', 'line'] as const) after[key].forEach((v, i) => expect(Math.abs(v - before[key][i])).toBeLessThanOrEqual(1));
  const quad = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  after.projected.forEach((p: number[], i: number) => p.forEach((v, j) => expect(Math.abs(v - quad[i][j])).toBeLessThanOrEqual(1)));
  await expect(page.locator('#term-lines')).toContainText('retry-keeps-output-and-wrapping-abcdefghijklmnopqrstuvwxyz');
});

test('scene disposal restores prior overlay dimensions and CSS priorities', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(r => release = r);
  await page.route('**/scene/manifest.json', async route => { await held; await route.continue(); });
  await page.goto('/?3d&test');
  await page.evaluate(() => {
    document.getElementById('term')!.style.setProperty('--screen-w', '700px', 'important');
    document.getElementById('contacts')!.style.setProperty('--contacts-h', '500px');
    document.getElementById('mon-info')!.style.setProperty('--info-w', '400px', 'important');
  });
  release();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'ready');
  await page.evaluate(() => (window as any).__scene.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'page');
  const styles = () => page.evaluate(() => ['term', 'contacts', 'mon-info'].map((id, i) => {
    const style = document.getElementById(id)!.style, prefix = ['screen', 'contacts', 'info'][i];
    return ['w', 'h'].map(axis => [style.getPropertyValue(`--${prefix}-${axis}`), style.getPropertyPriority(`--${prefix}-${axis}`)]);
  }));
  const expected = [[['700px', 'important'], ['', '']], [['', ''], ['500px', '']], [['400px', 'important'], ['', '']]];
  expect(await styles()).toEqual(expected);
  await page.evaluate(() => { dispatchEvent(new Event('pagehide')); dispatchEvent(new Event('pagehide')); });
  expect(await styles()).toEqual(expected);
});

test('context loss completes a moving typed desk command and releases queued input', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('alxnko:booted', '1'));
  await page.goto('/?3d&test');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'ready');
  await promptReady(page);
  const height = () => page.evaluate(() => (window as any).__scene.scene.getObjectByName('desk_rig').position.y as number);
  const base = await height();
  await run(page, 'desk 3');
  await expect(page.locator('#term-form')).toHaveAttribute('data-busy', 'true');
  await page.waitForFunction(base => {
    const scene = (window as any).__scene, h = scene.scene.getObjectByName('desk_rig').position.y;
    if (h <= base + .001) return false;
    if (document.getElementById('term-form')!.dataset.busy !== 'true' || h >= base + 1.12 - .74) throw new Error('desk must still be moving when context is lost');
    scene.renderer.getContext().getExtension('WEBGL_lose_context').loseContext();
    return true;
  }, base);
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'page');
  await run(page, 'echo fallback-queue');
  await expect(page.locator('#term-form')).toHaveAttribute('data-busy', 'false');
  await expect(page.locator('#term-lines .ln').filter({ hasText: /^fallback-queue$/ })).toHaveCount(1);
  await expect(page.locator('#term-lines .ln').filter({ hasText: /^desk: 112 cm$/ })).toHaveCount(1);
  const stopped = await height();
  await page.waitForTimeout(1700);
  expect(await height()).toBe(stopped);
  await page.evaluate(() => { dispatchEvent(new Event('pagehide')); dispatchEvent(new Event('pagehide')); });
  await expect(page.locator('#term-lines .ln').filter({ hasText: /^desk: 112 cm$/ })).toHaveCount(1);
  await page.locator('#enter3d').click();
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'ready');
  expect(await height()).toBeCloseTo(base + 1.12 - .74, 4);
  await run(page, 'desk 1');
  await expect(page.locator('#term-form')).toHaveAttribute('data-busy', 'false');
  expect(await height()).toBeCloseTo(base, 4);
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

test('manual retry after a blocked intro bootstrap and late entry keeps the working lite interface', async ({ page }) => {
  test.setTimeout(45000);
  let requested = 0;
  await page.route('**/scene/manifest.json', async route => { requested++; await route.continue(); });
  let release!: () => void;
  const held = new Promise<void>(r => release = r);
  await page.route('**/_astro/Base*.js', async route => { await held; await route.continue(); });
  await page.route('**/?3d&test', async route => {
    const response = await route.fetch();
    // Keep the real capability gate and its visible-time deadline; only the console
    // activator fails to arrive. Late entry sees the expired boot and offers a retry.
    const body = (await response.text()).replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, script => script.includes('__consoleIntro') ? '' : script);
    await route.fulfill({ response, body });
  });
  await page.goto('/?3d&test', { waitUntil: 'commit' });
  await expect(page.locator('html')).toHaveAttribute('data-boot', '3d');
  expect(await page.evaluate(() => typeof (window as any).__sceneDeadline)).toBe('function');
  await expect(page.locator('html')).toHaveAttribute('data-boot', 'failed', { timeout: 17000 });
  await expect(page.locator('#contacts')).toBeVisible();
  release();
  await page.waitForLoadState('load');
  await promptReady(page);
  const button = page.locator('#enter3d');
  await expect(button).toBeVisible();
  expect(await page.evaluate(() => typeof (window as any).__consoleIntro)).toBe('undefined');
  await button.click();
  await expect(page.locator('html')).not.toHaveAttribute('data-boot', '3d');
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'page');
  await expect(page.locator('#term')).toBeVisible();
  await expect(page.locator('#contacts')).toBeVisible();
  await expect(page.locator('canvas.stage-canvas')).toHaveCount(0);
  await expect(button).toBeEnabled(); await expect(button).toHaveText('enter 3d');
  await run(page, 'echo manual-blocked-bootstrap');
  await expect(page.locator('#term-lines .ln').filter({ hasText: /^manual-blocked-bootstrap$/ })).toHaveCount(1);
  expect(requested).toBe(0);
});

test('an offered manual entry remains lite if its bootstrap becomes unavailable', async ({ page }) => {
  await page.goto('/?lite&test');
  await promptReady(page);
  const button = page.locator('#enter3d');
  await expect(button).toBeVisible();
  await page.evaluate(() => { delete (window as any).__consoleIntro; delete (window as any).__sceneDeadline; });
  await button.click();
  await expect(page.locator('html')).not.toHaveAttribute('data-boot', '3d');
  await expect(page.locator('#contacts')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'page');
  await expect(page.locator('canvas.stage-canvas')).toHaveCount(0);
  await expect(button).toBeEnabled();
  await run(page, 'echo missing-offer-bootstrap');
  await expect(page.locator('#term-lines .ln').filter({ hasText: /^missing-offer-bootstrap$/ })).toHaveCount(1);
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
