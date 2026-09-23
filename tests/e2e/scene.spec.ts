import { chromium, expect, test } from '@playwright/test';
import { guard, run } from './helpers';

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
