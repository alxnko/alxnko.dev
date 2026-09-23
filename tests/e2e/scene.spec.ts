import { chromium, expect, test } from '@playwright/test';
import { guard, run } from './helpers';

const mirror = (page: import('@playwright/test').Page) =>
  page.evaluate(() => ((window as any).__mirrorText?.() as string | undefined) ?? '');

test.describe('3D desk', () => {
  test.setTimeout(60_000);

  test('loads the scene, no errors or CSP violations', async ({ page }) => {
    const g = await guard(page);
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    await expect(page.locator('#stage canvas')).toHaveCount(1);
    await page.waitForTimeout(800);
    g.check();
  });

  test('continuity: what you type is on the laptop screen from afar', async ({ page }) => {
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    await page.locator('#nav [data-landmark="wide"]').click();
    await run(page, 'echo continuity-check');
    await page.locator('#nav [data-landmark="wide"]').click();
    await page.waitForTimeout(1200);
    await expect.poll(() => mirror(page)).toContain('continuity-check');
    await expect(page.locator('#term')).toHaveAttribute('data-dock', 'off');
  });

  test('cd monitor flies there, docks contacts, updates the nav', async ({ page }) => {
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    await run(page, 'cd monitor');
    await expect(page.locator('#nav [data-landmark="monitor"]')).toHaveAttribute('aria-current', 'true', { timeout: 5000 });
    await expect(page.locator('#contacts')).toHaveAttribute('data-dock', 'screen', { timeout: 5000 });
  });

  test('world commands run without errors', async ({ page }) => {
    const g = await guard(page);
    await page.goto('/?3d&test');
    await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
    for (const c of ['desk 3', 'theme day', 'ring purple', 'fan 3', 'meow', 'sudo ls', 'theme night', 'ring off', 'desk 1']) {
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
