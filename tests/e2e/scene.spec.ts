import { chromium, expect, test } from '@playwright/test';
import { expectRain, guard, rainView, run } from './helpers';

test.describe('3D desk', () => {
  test.setTimeout(60_000);

  test('loads the scene, no errors or CSP violations', async ({ page }) => {
    const g = await guard(page);
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    await expect(page.locator('canvas.stage-canvas')).toHaveCount(1);
    await page.waitForTimeout(800);
    g.check();
  });

  test('continuity: the live terminal stays pinned on the laptop at every distance', async ({ page }) => {
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    await run(page, 'echo continuity-check');
    for (const l of ['wide', 'desk', 'laptop']) {
      await page.locator(`#nav [data-landmark="${l}"]`).click();
      await page.waitForTimeout(1500);
      await expect(page.locator('#term')).toHaveAttribute('data-dock', 'screen');
      await expect(page.locator('#term-lines')).toContainText('continuity-check');
      const box = await page.locator('#term').boundingBox();
      expect(box && box.width > 20 && box.height > 10).toBeTruthy();
    }
  });

  test('cmatrix rains on the laptop screen; ctrl+c stops it', async ({ page }) => {
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    await page.locator('#nav [data-landmark="laptop"]').click();
    await page.waitForTimeout(1500);
    await expectRain(page);
  });

  test('cmatrix: esc flies back to the desk and the rain keeps falling; ctrl+c then stops it', async ({ page }) => {
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    await page.locator('#nav [data-landmark="laptop"]').click();
    await page.waitForTimeout(1200);
    await run(page, 'cmatrix');
    await expect(page.locator('#term-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#nav [data-landmark="desk"]')).toHaveAttribute('aria-current', 'true', { timeout: 5000 });
    await page.waitForTimeout(600);
    const a = (await rainView(page)).text;
    await page.waitForTimeout(400);
    expect((await rainView(page)).text).not.toBe(a); // still raining at the desk
    await expect(page.locator('#term-form')).toHaveAttribute('data-busy', 'true');
    // the input lost focus with Esc: keys still reach the toy (type-anywhere)
    await page.keyboard.press('w');
    await expect(page.locator('#nav [data-landmark="desk"]')).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Control+c');
    await expect(page.locator('#term-overlay')).toBeHidden();
    await expect(page.locator('#term-input')).toHaveValue('');
  });

  test('cmatrix --both covers the whole monitor; ctrl+c gives the contacts back', async ({ page }) => {
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    const holes = () => page.evaluate(() => {
      let v: number[] = [];
      (window as any).__scene.scene.getObjectByName('screen_monitor').traverse((o: any) => {
        if (o.material?.uniforms?.uRects) v = o.material.uniforms.uRects.value.map((q: any) => q.x);
      });
      return v;
    });
    const open = await holes();
    expect(open[0]).toBeLessThan(1); // the contacts window is open
    await run(page, 'cmatrix --both');
    await expect(page.locator('body')).toHaveAttribute('data-rain', '');
    await expect.poll(holes).toEqual([2, 2, 2, 2]); // every window closed: the rain is the screen
    await expect(page.locator('#contacts')).toBeHidden();
    await expect(page.locator('#mon-info')).toBeHidden();
    await expect(page.locator('#contacts-rain')).toBeHidden(); // the page's copy stays off in 3D
    await page.locator('#nav [data-landmark="monitor"]').click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: test.info().outputPath('monitor-rain.png') });
    await page.keyboard.press('Control+c');
    await expect(page.locator('body')).not.toHaveAttribute('data-rain', '');
    await expect.poll(holes).toEqual(open);
    await expect(page.locator('#contacts')).toBeVisible();
  });

  test('on a phone, the ^C key stops the rain (no ctrl key there)', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch');
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    await page.locator('#nav [data-landmark="laptop"]').tap();
    await page.waitForTimeout(1200);
    await run(page, 'cmatrix --both');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); // keyboard down
    const intr = page.locator('#intr');
    await expect(intr).toBeVisible();
    // clear of the nav, and a full 44 px target
    const [b, n] = [(await intr.boundingBox())!, (await page.locator('#nav').boundingBox())!];
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.y + b.height).toBeLessThanOrEqual(n.y);
    const t = (await page.locator('#term').boundingBox())!;
    await page.touchscreen.tap(t.x + t.width / 2, t.y + t.height / 2); // a tap on the rain
    await expect(intr).toHaveClass(/nudge/);
    await expect(page.locator('#term-input')).not.toBeFocused();
    await intr.tap();
    await expect(page.locator('#term-overlay')).toBeHidden();
    await expect(page.locator('body')).not.toHaveAttribute('data-rain', '');
  });

  test('esc and the back button return to the desk view', async ({ page }) => {
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    await page.locator('#nav [data-landmark="monitor"]').click();
    await expect(page.locator('#back')).toBeVisible();
    await page.locator('#back').click();
    await expect(page.locator('#nav [data-landmark="desk"]')).toHaveAttribute('aria-current', 'true', { timeout: 5000 });
    await expect(page.locator('#back')).toBeHidden({ timeout: 5000 });
  });

  test('pinned screens are screen-sized at the desk view (not page layout sizes)', async ({ page }) => {
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    await page.locator('#nav [data-landmark="desk"]').click();
    await page.waitForTimeout(1500);
    const vw = page.viewportSize()!.width;
    for (const id of ['#term', '#contacts', '#mon-info']) {
      const box = await page.locator(id).boundingBox();
      expect(box, id).not.toBeNull();
      expect(box!.width, id).toBeLessThan(vw * 0.6);
      expect(box!.width, id).toBeGreaterThan(8);
    }
  });

  test('pinned screens stay below the 3D canvas (real occlusion)', async ({ page }) => {
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    // the canvas must paint above every pinned panel: walk the stacking contexts
    const above = await page.evaluate(() => {
      const canvas = document.querySelector('canvas.stage-canvas')!;
      const ctxZ = (el: Element) => {
        const chain: number[] = [];
        for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
          const cs = getComputedStyle(n);
          const parentDisplay = n.parentElement ? getComputedStyle(n.parentElement).display : '';
          const flexItem = /flex|grid/.test(parentDisplay);
          if (cs.zIndex !== 'auto' && (cs.position !== 'static' || flexItem)) chain.unshift(Number(cs.zIndex));
        }
        return chain;
      };
      const c = ctxZ(canvas);
      return ['#term', '#contacts', '#mon-info'].map((id) => {
        const p = ctxZ(document.querySelector(id)!);
        return { id, canvasFirst: c[0], panelFirst: p[0] };
      });
    });
    for (const a of above) expect(a.panelFirst, a.id).toBeLessThan(a.canvasFirst);
  });

  test('focusing a contact never scrolls the pinned panel', async ({ page }) => {
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    await page.locator('#nav [data-landmark="monitor"]').click();
    await page.waitForTimeout(1500);
    await page.locator('#contacts a[data-contact="email"]').focus();
    for (const id of ['#contacts', '#term', '#mon-info']) {
      const top = await page.locator(id).evaluate((e) => e.scrollTop);
      expect(top, id).toBe(0);
    }
  });

  test('view mode hides the interface and Esc brings it back', async ({ page }) => {
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    await page.locator('#t-view').click();
    await expect(page.locator('#noui-exit')).toBeVisible();
    await expect(page.locator('#nav')).toBeHidden();
    await expect(page.locator('#identity')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#noui-exit')).toBeHidden();
    await expect(page.locator('#nav')).toBeVisible();
    await page.locator('#t-view').click();
    await page.locator('#noui-exit').click();
    await expect(page.locator('#identity')).toBeVisible();
  });

  test('Back peels one layer: view mode, then the desk, then the page', async ({ page }) => {
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    await page.locator('#nav [data-landmark="monitor"]').click();
    await expect(page.locator('#back')).toBeVisible();
    await page.locator('#t-view').click();
    await expect(page.locator('#noui-exit')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#noui-exit')).toBeHidden();
    await expect(page.locator('#back')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#back')).toBeHidden({ timeout: 5000 });
    expect(new URL(page.url()).search).toBe('?3d&test');
    // leaving by the on-screen button leaves no stray entry behind
    await page.locator('#nav [data-landmark="laptop"]').click();
    await expect(page.locator('#back')).toBeVisible();
    await page.locator('#back').click();
    await expect(page.locator('#back')).toBeHidden({ timeout: 5000 });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => history.state?.away ?? null)).toBeNull();
  });

  test('looking around never takes the eye under the desk top or collapses the zoom, at either height', async ({ page }) => {
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    for (const h of [0.74, 1.12]) {
      await page.evaluate((h) => (window as any).__scene.world().setDesk(h), h);
      await page.waitForTimeout(2000);
      // zoom toward the keyboard (pivot at desk level), then orbit the eye down past it
      const kb = await page.evaluate(() => {
        const s = (window as any).__scene;
        const o = s.scene.getObjectByName('desk_rig') ?? s.scene;
        const v = o.getWorldPosition(new (s.camera.position.constructor)());
        return v.toArray();
      });
      await page.evaluate(({ kb }) => {
        const s = (window as any).__scene;
        s.pan[0].target = 0; s.pan[1].target = kb[1] - 0.95; s.pan[2].target = 0;
        s.orbit.dolly.target = 0.5; s.orbit.pitch.target = -0.38; s.invalidate();
      }, { kb });
      await page.waitForTimeout(2000);
      const r = await page.evaluate(() => { const s = (window as any).__scene; return { y: s.camera.position.y, d: s.orbit.dolly.value, ok: s.camera.position.toArray().every(Number.isFinite) }; });
      expect(r.ok).toBe(true);
      expect(r.d).toBeGreaterThan(0.1); // no collapse into the look point
      expect(r.y).toBeGreaterThanOrEqual(h + 0.04 - 1e-3);
      await page.evaluate(() => (window as any).__scene.world().fly('desk'));
      await page.waitForTimeout(2000);
    }
  });

  test('on a phone, a swipe on the monitor screen tilts the view (never zooms, traps or opens links)', async ({ page, isMobile, context }) => {
    test.skip(!isMobile, 'touch gestures');
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    await page.locator('#nav [data-landmark="monitor"]').click();
    await page.waitForTimeout(2200);
    const opened: string[] = [];
    context.on('page', (p) => opened.push(p.url()));
    const cdp = await context.newCDPSession(page);
    const swipe = async (dy: number) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 450 }] });
      for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 450 + (dy * i) / 12 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(1200);
      return page.evaluate(() => { const s = (window as any).__scene; return { y: s.camera.position.y, dolly: s.orbit.dolly.target, pitch: s.orbit.pitch.value }; });
    };
    expect(await page.evaluate(() => document.elementFromPoint(200, 450)?.closest('#contacts') !== null)).toBe(true);
    const up = await swipe(-300);
    expect(up.dolly).toBeCloseTo(1, 3); // the floor tilts the view; it never zooms in
    expect(up.y).toBeGreaterThanOrEqual(0.74 + 0.04 - 1e-3);
    const down = await swipe(250);
    expect(down.pitch).toBeLessThan(up.pitch); // answers at once: no dead zone, no trap
    expect(opened).toEqual([]);
    // a slightly low tap on Back still means back, not the contact link under it
    const back = (await page.locator('#back').boundingBox())!;
    await page.touchscreen.tap(back.x + back.width / 2, back.y + back.height + 10);
    await expect(page.locator('#nav [data-landmark="desk"]')).toHaveAttribute('aria-current', 'true', { timeout: 5000 });
    expect(opened).toEqual([]);
  });

  test('the landmark views are exactly their preset poses, at either desk height', async ({ page }) => {
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    for (const h of [0.74, 1.12]) {
      await page.evaluate((h) => (window as any).__scene.world().setDesk(h), h);
      await page.waitForTimeout(2000);
      for (const l of ['wide', 'desk', 'laptop', 'monitor']) {
        await page.evaluate((l) => (window as any).__scene.world().fly(l), l);
        // wait for the flight to land (not a fixed time: a loaded machine renders slower)
        await expect.poll(() => page.evaluate((l) => {
          const s = (window as any).__scene; const want = s.rail.pose(l).pos;
          return Math.hypot(...s.camera.position.toArray().map((v: number, i: number) => v - want[i]));
        }, l), { message: `${l} at ${h}`, timeout: 10_000 }).toBeLessThan(1e-3);
      }
    }
  });

  test('the skip link stays out of sight until keyboard focus shows it', async ({ page }) => {
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    const skip = page.locator('.skip');
    const box = await skip.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(0);
    await expect(skip).toHaveCSS('opacity', '0');
    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    await expect(skip).toHaveCSS('opacity', '1');
    await expect.poll(async () => (await skip.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  });

  test('cd monitor flies there, docks contacts, updates the nav', async ({ page }) => {
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    await run(page, 'cd monitor');
    await expect(page.locator('#nav [data-landmark="monitor"]')).toHaveAttribute('aria-current', 'true', { timeout: 5000 });
    await expect(page.locator('#contacts')).toHaveAttribute('data-dock', 'screen', { timeout: 5000 });
  });

  test('world commands run without errors', async ({ page }) => {
    // software GL (CI, headless) renders every frame on the CPU while the fan spins
    test.slow();
    const g = await guard(page);
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    // the fan last, then off again: under software GL a spinning fan keeps every frame busy
    for (const c of ['desk 3', 'theme day', 'ring purple', 'meow', 'sudo ls', 'theme night', 'ring off', 'desk 1', 'fan 3', 'fan 0']) {
      await run(page, c);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(2000);
    g.check();
  });
});

test('no WebGL: stays on the page, terminal works', async ({ browserName }) => {
  test.skip(browserName !== 'chromium');
  const browser = await chromium.launch({ args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4329/?3d');
  await page.waitForTimeout(3000);
  expect(await page.locator('body').getAttribute('data-mode')).not.toBe('scene');
  await expect(page.locator('#enter3d')).toBeHidden();
  await run(page, 'whoami');
  await expect(page.locator('#term-lines')).toContainText('alxnko');
  await browser.close();
});
