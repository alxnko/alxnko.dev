import { expect, test, type Page } from '@playwright/test';

// Decision R71: the legal name is findable through structured data but never shown.
// The one allowed exception is the published email address, which contains it.
const EMAIL = 'aleksandrnyrko@gmail.com';
const HIDDEN = ['nyrko', 'нырко', 'aleksandr', 'александр', 'alexander', 'alexandr', 'саша'];

async function visibleText(page: Page) {
  const text = (await page.evaluate(() => document.body.innerText)).toLowerCase();
  return text.split(EMAIL).join(' ');
}

async function jsonLd(page: Page) {
  const blocks = await page.$$eval('script[type="application/ld+json"]', (s) => s.map((x) => x.textContent ?? ''));
  expect(blocks).toHaveLength(1);
  return JSON.parse(blocks[0]);
}

test.describe('SEO', () => {
  test('home page: canonical, lang, meta and a valid JSON-LD graph with the name variants', async ({ page }) => {
    await page.goto('/?lite');
    expect(await page.getAttribute('html', 'lang')).toBe('en');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://alxnko.dev/');
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    const head = (await page.title()) + (await page.locator('meta[name="description"]').getAttribute('content'));
    for (const n of HIDDEN) expect(head.toLowerCase()).not.toContain(n);

    const ld = await jsonLd(page);
    const types = ld['@graph'].map((n: { '@type': string }) => n['@type']);
    expect(types).toEqual(['WebSite', 'ProfilePage', 'Person']);
    const person = ld['@graph'][2];
    expect(person.name).toBe('Alex Neko');
    for (const v of ['alxnko', 'Aleksandr Nyrko', 'Alexander Nyrko', 'Александр Нырко', 'Саша Нырко'])
      expect(person.alternateName).toContain(v);
  });

  for (const [view, path] of [['no-3D (?lite)', '/?lite'], ['default', '/']] as const) {
    test(`${view} view never shows the legal name (only inside the email address)`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto(path);
      // settle first: the boot log has finished and, on the default view, the desk is up or the page took over
      await expect(page.locator('#term-lines')).toContainText('alxnko@nitro', { timeout: 60_000 });
      if (path === '/') await page.waitForFunction(() => document.body.dataset.scene === 'ready' || !document.documentElement.dataset.boot, null, { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(1000);
      const raw = (await page.evaluate(() => document.body.innerText)).toLowerCase();
      expect(raw).toContain(EMAIL); // the exception really is the email, and only it
      const text = await visibleText(page);
      for (const n of HIDDEN) expect(text, n).not.toContain(n);
    });
  }

  test('404 and short-link pages are noindex and carry no structured data', async ({ page, request }) => {
    await page.goto('/does-not-exist');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
    for (const p of ['/gh', '/mail']) {
      const html = await (await request.get(p)).text();
      expect(html, p).toMatch(/<meta name="robots" content="noindex"\s*\/?>/);
      expect(html, p).toContain('http-equiv="refresh"');
      expect(html, p).not.toContain('rel="canonical"');
      expect(html, p).not.toContain('ld+json');
    }
  });

  test('robots.txt and sitemap.xml point at the canonical home', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Sitemap: https://alxnko.dev/sitemap.xml');
    expect(robots).not.toMatch(/Disallow:\s*\/\s*$/m);
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('<loc>https://alxnko.dev/</loc>');
  });
});
