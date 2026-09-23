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

  test('decorative art and the matrix overlay stay out of the screen reader log', async ({ page }) => {
    await run(page, 'fastfetch');
    await expect(lines(page)).toContainText('tech lead');
    // the cat mark's block art is aria-hidden; the facts beside it are not
    expect(await page.locator('#term-lines [aria-hidden="true"]').count()).toBeGreaterThan(5);
    await expect(page.locator('#term-lines').getByText('tech lead').last()).not.toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#term-overlay')).toHaveAttribute('aria-hidden', 'true');
  });

  test('block-art lines stay on the monospace grid (our font draws the blocks)', async ({ page }) => {
    await run(page, 'fastfetch');
    await expect(lines(page)).toContainText('tech lead');
    await page.evaluate(() => document.fonts.ready);
    // the block characters come from our JetBrains Mono subset, not a system fallback
    const art = page.locator('#term-lines [aria-hidden="true"]', { hasText: '█' }).first();
    const cdp = await page.context().newCDPSession(page);
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#term-lines [aria-hidden="true"]' });
    await cdp.send('CSS.enable');
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    expect(fonts.map((f: { familyName: string }) => f.familyName)).toEqual(['JetBrains Mono']);
    // and every art span is exactly one cell per character
    const off = await page.evaluate(() => {
      const probe = document.createElement('span'); probe.textContent = 'x'.repeat(20);
      document.getElementById('term-lines')!.append(probe);
      const cell = probe.getBoundingClientRect().width / 20; probe.remove();
      return [...document.querySelectorAll('#term-lines [aria-hidden="true"]')]
        .map((e) => Math.abs(e.getBoundingClientRect().width - cell * (e.textContent ?? '').length))
        .reduce((m, d) => Math.max(m, d), 0);
    });
    expect(off).toBeLessThan(0.5);
    await expect(art).toBeVisible();
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
