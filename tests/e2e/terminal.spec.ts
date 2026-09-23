import { expect, test } from '@playwright/test';
import { lines, run } from './helpers';

test.describe('terminal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lite');
    await expect(lines(page)).toContainText('alxnko@nitro', { timeout: 5000 });
  });

  test('type anywhere lands in the prompt', async ({ page }) => {
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.type('whoami');
    await expect(page.locator('#term-input')).toHaveValue('whoami');
    await page.keyboard.press('Enter');
    await expect(lines(page)).toContainText('[alxnko@nitro ~]$ whoami');
  });

  test('filesystem, pipes and did-you-mean', async ({ page }) => {
    await run(page, 'ls ~/monitor | grep git');
    await expect(lines(page)).toContainText('github.lnk');
    await run(page, 'claer');
    await expect(lines(page)).toContainText("did you mean 'clear'?");
  });

  test('history, tab completion, ctrl+l', async ({ page }) => {
    const input = page.locator('#term-input');
    await run(page, 'echo one');
    await input.press('ArrowUp');
    await expect(input).toHaveValue('echo one');
    await input.fill('fastf');
    await input.press('Tab');
    await expect(input).toHaveValue('fastfetch ');
    await input.fill('');
    await input.press('Control+l');
    await expect(lines(page)).not.toContainText('echo one');
  });

  test('links are allowlisted and safe', async ({ page }) => {
    await run(page, 'ls monitor');
    await run(page, 'fastfetch');
    const hrefs = await page.locator('#term-lines a').evaluateAll((as) => as.map((a) => [a.getAttribute('href'), a.getAttribute('rel')]));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const [href, rel] of hrefs) {
      expect(href).toMatch(/^(https:\/\/(github\.com|t\.me|linkedin\.com|instagram\.com|committers\.top)\/|mailto:aleksandrnyrko@gmail\.com$)/);
      expect(rel).toContain('noopener');
    }
  });

  test('output never renders markup', async ({ page }) => {
    await run(page, 'echo <img src=x onerror=alert(1)>');
    await expect(lines(page)).toContainText('<img src=x onerror=alert(1)>');
    expect(await page.locator('#term-lines img').count()).toBe(0);
  });

  test('ctrl+c interrupts a running command', async ({ page }) => {
    const input = page.locator('#term-input');
    await input.fill('pacman -Syu');
    await input.press('Enter');
    await input.press('Control+c');
    await expect(lines(page)).toContainText('^C');
  });
});
