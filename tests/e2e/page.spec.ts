import { expect, test } from '@playwright/test';
import { guard, lines, run } from './helpers';

test.describe('page (no 3D)', () => {
  test('renders identity, contacts, terminal with zero errors and no CSP violations', async ({ page }) => {
    const g = await guard(page);
    await page.goto('/?lite');
    await expect(page.locator('h1')).toContainText('alxnko');
    await expect(page.locator('#identity')).toContainText('tech lead');
    expect((await page.locator('body').innerText()).toLowerCase()).not.toContain('ait solutions');
    await expect(page.locator('#identity')).toContainText('kyrgyzstan');
    await expect(page.locator('#contacts a')).toHaveCount(5);
    for (const href of ['https://github.com/alxnko', 'https://t.me/ALXNK0', 'https://linkedin.com/in/alxnko', 'https://instagram.com/alxnko', 'mailto:aleksandrnyrko@gmail.com'])
      await expect(page.locator(`#contacts a[href="${href}"]`)).toHaveCount(1);
    await expect(lines(page)).toContainText('alxnko@nitro', { timeout: 5000 });
    await page.waitForTimeout(500);
    g.check();
  });

  test('no placeholder or unfinished text, and the distro is never named', async ({ page }) => {
    await page.goto('/?lite');
    await page.waitForTimeout(1500);
    const text = (await page.locator('body').innerText()).toLowerCase();
    for (const bad of ['todo', 'lorem', 'coming soon', 'placeholder', 'tbd', 'arch linux', 'archlinux']) expect(text).not.toContain(bad);
  });

  test('strict security headers are served', async ({ request }) => {
    const r = await request.get('/');
    const csp = r.headers()['content-security-policy'];
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toMatch(/https?:\/\//);
    expect(r.headers()['x-content-type-options']).toBe('nosniff');
    expect(r.headers()['permissions-policy']).toContain('camera=()');
  });

  test('no horizontal scroll', async ({ page }) => {
    await page.goto('/?lite');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(over).toBeLessThanOrEqual(0);
  });

  test('theme toggle switches and persists', async ({ page }) => {
    await page.goto('/?lite');
    const before = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.locator('#t-theme').click();
    const after = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(after).not.toBe(before);
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(after);
    await run(page, 'theme night');
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  });

  test('404 page shows the path as text', async ({ page }) => {
    const g = await guard(page, { allow404: /does-not-exist/ });
    const res = await page.goto('/does-not-exist/<b>x</b>');
    expect(res?.status()).toBe(404);
    await expect(page.locator('.nf-path').first()).toContainText('/does-not-exist/<b>x</b>');
    expect(await page.locator('b', { hasText: 'x' }).count()).toBe(0);
    g.check();
  });
});

test('external links open in a new tab, safely; mail opens the mail app', async ({ page }) => {
  await page.goto('/?lite');
  await expect(page.locator('#term-lines')).toContainText('alxnko@nitro', { timeout: 5000 });
  const links = await page.$$eval('a[href^="http"]', (as) => as.map((a) => [a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel')]));
  expect(links.length).toBeGreaterThan(4);
  for (const [href, target, rel] of links) {
    expect(target, href ?? '').toBe('_blank');
    expect(rel ?? '', href ?? '').toContain('noopener');
  }
  const mail = await page.$$eval('a[href^="mailto:"]', (as) => as.map((a) => a.getAttribute('target')));
  for (const t of mail) expect(t).not.toBe('_blank');
});
