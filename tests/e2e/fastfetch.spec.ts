import { expect, test } from '@playwright/test';
import { promptReady, run } from './helpers';

for (const [width, height] of [[320, 780], [360, 780], [390, 844], [844, 390]]) {
  for (const cached of [false, true]) {
    test(`autologin mark stays whole ${width}×${height} ${cached ? 'cached' : 'first'} boot`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await page.addInitScript((cached) => {
        (window as any).__holdIntro = true;
        if (cached) localStorage.setItem('alxnko:booted', '1');
      }, cached);
      // Keep the initial loading view stable while measuring the production terminal.
      await page.route('**/scene/manifest.json', () => new Promise(() => {}));
      await page.goto('/?3d&test');
      await expect(page.locator('html')).toHaveAttribute('data-console-font', 'ready');
      await promptReady(page);
      await page.evaluate(() => document.fonts.ready);
      const geometry = await page.evaluate(() => {
        const term = document.getElementById('term')!;
        const screen = document.getElementById('term-screen')!;
        const visible = screen.getBoundingClientRect();
        const art = [...document.querySelectorAll<HTMLElement>('#term-lines [aria-hidden="true"]')]
          .filter(el => /[█▀▄]/.test(el.textContent ?? ''));
        const rows = [...document.querySelectorAll<HTMLElement>('#term-lines .ln')].filter(el => el.querySelector('[aria-hidden="true"]'));
        const scale = term.getBoundingClientRect().width / term.clientWidth;
        return {
          font: getComputedStyle(term).fontSize, lineHeight: getComputedStyle(term).lineHeight,
          art: art.map(el => el.textContent), heights: rows.map(el => el.offsetHeight),
          visible: art.every(el => { const r = el.getBoundingClientRect(); return r.top >= visible.top - 1 && r.bottom <= visible.bottom + 1; }),
          effectiveFont: parseFloat(getComputedStyle(term).fontSize) * scale,
        };
      });
      await testInfo.attach('geometry', { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
      await page.screenshot({ path: testInfo.outputPath('initial.png') });
      expect(geometry.font).toBe('24px');
      expect(geometry.lineHeight).toBe('30px');
      expect(geometry.effectiveFont).toBeGreaterThanOrEqual(12 - .01);
      // First wide boot intentionally uses full fastfetch; cached boots use compact.
      const compact = cached || width < 600;
      expect(geometry.heights).toEqual(Array(compact ? 10 : 18).fill(30));
      expect(geometry.art).toHaveLength(compact ? 7 : 12);
      expect(geometry.visible).toBe(true);
      await expect(page.locator('#term-lines a[href="https://committers.top/kyrgyzstan_private"]')).toHaveText(compact ? '#1 in KG' : '#1 committer in KG');
      // Ordinary user output must still wrap.
      await run(page, `echo ${'word '.repeat(50)}`);
      await expect.poll(() => page.locator('#term-lines .ln').last().evaluate(el => (el as HTMLElement).offsetHeight)).toBeGreaterThan(30);
    });
  }
}
