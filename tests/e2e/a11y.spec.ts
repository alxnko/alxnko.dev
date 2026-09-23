import { expect, test } from '@playwright/test';

test.describe('accessibility', () => {
  test('skip link, labels, names, alt text', async ({ page }) => {
    await page.goto('/?lite');
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => document.activeElement?.textContent?.trim().toLowerCase());
    expect(first).toContain('skip');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('term-input');
    const unnamed = await page.$$eval('button, a[href], input', (els) =>
      els.filter((e) => {
        const name = (e.getAttribute('aria-label') || (e as HTMLElement).innerText || (e as HTMLInputElement).labels?.[0]?.innerText || e.getAttribute('title') || '').trim();
        return !name && (e as HTMLElement).offsetParent !== null;
      }).map((e) => e.outerHTML.slice(0, 80)),
    );
    expect(unnamed).toEqual([]);
    const noAlt = await page.$$eval('img', (els) => els.filter((i) => !i.hasAttribute('alt')).length);
    expect(noAlt).toBe(0);
    expect(await page.locator('h1').count()).toBe(1);
  });

  test('touch targets are at least 44x44 (hit area)', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch sizing applies to touch devices');
    await page.goto('/?lite');
    const small = await page.$$eval('button:not([hidden]), #contacts a', (els) =>
      els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e, '::after');
        const inset = cs.content !== 'none' ? parseFloat(cs.top) || 0 : 0;
        return { h: r.height - 2 * inset, w: r.width - 2 * (cs.content !== 'none' ? parseFloat(cs.left) || 0 : 0), html: e.outerHTML.slice(0, 60) };
      }).filter((s) => s.h < 44 || s.w < 44),
    );
    expect(small).toEqual([]);
  });

  test('mobile input font is >= 16px (no iOS zoom)', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only');
    await page.goto('/?lite');
    const fs = await page.locator('#term-input').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(fs).toBeGreaterThanOrEqual(16);
  });

  test('reduced motion: no boot log, terminal ready at once', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/?lite');
    await expect(page.locator('#term-lines')).toContainText('alxnko@nitro', { timeout: 3000 });
    expect(await page.locator('#term-lines').innerText()).not.toContain('[  OK  ]');
    await ctx.close();
  });
});
