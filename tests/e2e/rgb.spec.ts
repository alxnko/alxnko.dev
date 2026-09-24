import { expect, test, type Page } from '@playwright/test';
import { guard, lines, run } from './helpers';

// `rgb` (R86): one colour for the accent tokens, the terminal and the desk's lights and parts.

/** The autologin's fastfetch has finished: the prompt takes commands. */
async function ready(page: Page) {
  await expect(lines(page)).toContainText('alxnko@');
  await expect(page.locator('#term-chips')).toHaveAttribute('data-busy', 'false');
}

/** What the accent looks like right now: tokens, a UI element, a terminal span. */
const look = (page: Page) =>
  page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    const prompt = document.querySelector('#term-lines .c-accent, #term .c-accent');
    return {
      accent: v('--c-accent'),
      fill: v('--c-accent-fill'),
      on: v('--c-on-accent'),
      focus: v('--c-focus'),
      term: v('--ansi-accent'),
      green: v('--ansi-green'),
      skip: getComputedStyle(document.querySelector('.skip')!).backgroundColor,
      prompt: prompt ? getComputedStyle(prompt).color : null,
      inline: document.documentElement.getAttribute('style') ?? '',
      stored: Object.keys(localStorage).filter((k) => k.startsWith('alxnko:rgb')).sort(),
    };
  });

test.describe('rgb on the page', () => {
  test('recolours the UI and the terminal, persists with no flash, and green restores the default exactly', async ({ page }) => {
    const g = await guard(page);
    await page.goto('/?lite');
    await ready(page);
    const before = await look(page);
    expect(before).toMatchObject({ inline: '', stored: [], green: '#00ff82' });

    await run(page, 'rgb #ff00ff');
    await expect(lines(page)).toContainText('rgb: #ff00ff');
    const pink = await look(page);
    expect(pink.fill).toBe('#ff00ff');
    expect(pink.skip).toBe('rgb(255, 0, 255)');
    expect(pink.prompt).toBe('rgb(255, 0, 255)'); // the prompt's path is the terminal accent
    expect(pink.green).toBe('#00ff82'); // the ANSI green itself is not the accent
    expect(pink.stored).toEqual(['alxnko:rgb', 'alxnko:rgb-accent', 'alxnko:rgb-css']);
    // fastfetch's cat is the accent too
    await run(page, 'fastfetch --compact');
    const cat = page.locator('#term-lines [aria-hidden="true"].c-accent').last();
    await expect(cat).toHaveCSS('color', 'rgb(255, 0, 255)');

    await page.reload();
    await ready(page);
    expect(await look(page)).toEqual(pink);

    await run(page, 'rgb green');
    await expect(lines(page)).toContainText('rgb: green');
    expect(await look(page)).toEqual(before); // exactly the untouched default, nothing stored
    g.check();
  });

  test('no flash: the <head> script alone paints the saved accent before any module runs', async ({ page }) => {
    await page.goto('/?lite');
    await ready(page);
    await run(page, 'rgb #ff00ff');
    await expect(lines(page)).toContainText('rgb: #ff00ff');
    const pink = await look(page);
    // the page's own module is blocked: whatever shows came from the inline <head> script
    await page.route(/\/_astro\/.*\.js$/, (r) => r.abort());
    await page.reload();
    const early = await look(page);
    expect(early.fill).toBe('#ff00ff');
    expect(early.skip).toBe('rgb(255, 0, 255)');
    expect(early.accent).toBe(pink.accent);
    expect(early.inline).toBe(pink.inline);
  });

  test('day theme: every preset and a pale hex stay readable on the paper', async ({ page }) => {
    await page.goto('/?lite');
    await ready(page);
    await run(page, 'theme day');
    await run(page, 'rgb yellow');
    await expect(lines(page)).toContainText('rgb: yellow');
    expect((await look(page)).accent).toBe('#6b5b00');
    await run(page, 'rgb #ffff00');
    await expect(lines(page)).toContainText('rgb: #ffff00');
    const l = await look(page);
    expect(l.fill).toBe('#ffff00');
    expect(l.accent).not.toBe('#ffff00'); // darkened for the paper (unit tests check >= 4.5:1)
  });

  test('rejects bad input with a clear message and changes nothing', async ({ page }) => {
    const g = await guard(page);
    await page.goto('/?lite');
    await ready(page);
    await run(page, 'rgb javascript:');
    await expect(lines(page)).toContainText("rgb: unknown color 'javascript:'");
    await run(page, 'rgb #12');
    await expect(lines(page)).toContainText("rgb: invalid hex color '#12' (use #rgb or #rrggbb, like #ff8800)");
    await run(page, `rgb #${'f'.repeat(200)}`);
    await expect(lines(page)).toContainText("rgb: invalid hex color '#fffffffffffffff…'");
    await run(page, "rgb 'red; background:url(x)'");
    await expect(lines(page)).toContainText("rgb: unknown color 'red; background:…'");
    expect(await look(page)).toMatchObject({ inline: '', stored: [] });
    g.check();
  });

  test('a forged palette in storage never reaches the page', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('alxnko:rgb-css', '#fff;background:url(//x),#000000,#000000,#000000');
      localStorage.setItem('alxnko:rgb', 'javascript:alert(1)');
    });
    const g = await guard(page);
    await page.goto('/?lite');
    await ready(page);
    expect(await look(page)).toMatchObject({ inline: '', stored: [] });
    g.check();
  });

  test('bare `rgb` shows the colour and the presets as chips that run', async ({ page }) => {
    await page.goto('/?lite');
    await ready(page);
    await run(page, 'rgb');
    await expect(lines(page)).toContainText('presets: green purple red orange amber yellow cyan blue pink white');
    await page.locator('#term-lines button.run', { hasText: /^cyan$/ }).last().click();
    await expect(lines(page)).toContainText('rgb: cyan');
    expect((await look(page)).fill).toBe('#22e5ff');
  });
});

test.describe('rgb on the 3D desk', () => {
  test.setTimeout(60_000);

  /** The scene's rgb-driven colours, as hex (sRGB). */
  const sceneColours = (page: Page) =>
    page.evaluate(() => {
      const s = (window as any).__scene;
      const mat = (name: string) => {
        let m: any = null;
        s.scene.getObjectByName(name)?.traverse((o: any) => { if (o.isMesh && !m) m = o.material; });
        return m;
      };
      const hex = (c: any) => '#' + c.getHexString();
      const tint = (c: any) => [c.r, c.g, c.b].map((x: number) => +x.toFixed(3));
      return {
        ring: hex(mat('ring').uniforms.uColor.value),
        fanRing: hex(mat('fan_ring').uniforms.uColor.value),
        led: hex(mat('led_srv_0').uniforms.uColor.value),
        keys: tint(mat('kbd_accent').uniforms.uTint.value),
        cat: tint(mat('cat_head').uniforms.uTint.value),
        legend: tint(mat('paddle_glyphs').uniforms.uTint.value),
        same: mat('cat_body') === mat('cat_head') && mat('cat_head') === mat('cat_tail'),
      };
    });

  test('rgb recolours the lights and the tinted parts; off gives the parts their own colours', async ({ page }) => {
    const g = await guard(page);
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    await ready(page);
    const green = await sceneColours(page);
    expect(green).toMatchObject({ ring: '#00ff82', fanRing: '#00ff82', led: '#00ff82', same: true });

    await run(page, 'rgb #ff00ff');
    await expect.poll(async () => (await sceneColours(page)).ring).toBe('#ff00ff');
    const pink = await sceneColours(page);
    expect(pink.led).toBe('#ff00ff');
    expect(pink.keys).not.toEqual(green.keys);
    expect(pink.keys[1]).toBeLessThan(pink.keys[0]); // magenta: no green in the tint
    expect(pink.legend[1]).toBeLessThan(0.01);

    await run(page, 'rgb off');
    await expect.poll(async () => (await sceneColours(page)).ring).toBe('#161618');
    const off = await sceneColours(page);
    expect(off.led).toBe('#ff00ff'); // the status LED keeps the accent
    expect(off.keys).not.toEqual(pink.keys); // the lime caps are back
    expect(off.keys[1]).toBeGreaterThan(off.keys[2]);

    await run(page, 'rgb green');
    await expect.poll(async () => (await sceneColours(page)).ring).toBe('#00ff82');
    expect(await sceneColours(page)).toEqual(green);
    g.check();
  });

  test('a saved colour is on the desk from its first frame', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('alxnko:rgb', 'cyan');
    });
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    expect((await sceneColours(page)).ring).toBe('#22e5ff');
  });
});
