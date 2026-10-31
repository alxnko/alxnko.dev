import { expect, test } from '@playwright/test';
import { guard } from './helpers';

// The ad slots ship behind a build flag that is OFF by default (src/lib/ads.ts): the
// production build carries no ad markup, reserves no space, and ?adpreview=1 does nothing.
test.describe('ad slots (flag off)', () => {
  for (const q of ['?lite', '?lite&adpreview=1', '?3d&test&adpreview=1']) {
    test(`no ad DOM, CSS or request: ${q}`, async ({ page }) => {
      const g = await guard(page);
      const foreign: string[] = [];
      page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1:4329')) foreign.push(r.url()); });
      await page.goto('/' + q);
      if (q.includes('3d')) await expect(page.locator('body')).toHaveAttribute('data-mode', 'scene', { timeout: 30_000 });
      else await expect(page.locator('#term-lines')).toContainText('alxnko@', { timeout: 15_000 });
      await expect(page.locator('aside.ad, ins.adsbygoogle, .ad-sample')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.dataset.ads)).toBeUndefined();
      expect(await page.content()).not.toMatch(/adsbygoogle|adpreview|\.ad-frame/);
      expect(foreign).toEqual([]);
      g.check();
    });
  }
});
