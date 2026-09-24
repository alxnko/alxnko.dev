import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { CONTACTS } from '../../src/content/site';

// Every short link (shared in bios, cards, QR codes) lands on the right contact. The server
// applies dist/_redirects like Cloudflare Pages (mailto: rules ignored), so the mail links
// must be static pages with a meta refresh.
const byId = Object.fromEntries(CONTACTS.map((c) => [c.id, c.href]));
const SHORT: [string, string][] = [
  ['/gh', byId.github], ['/github', byId.github],
  ['/tg', byId.telegram], ['/telegram', byId.telegram],
  ['/in', byId.linkedin], ['/li', byId.linkedin], ['/linkedin', byId.linkedin],
  ['/ig', byId.instagram], ['/instagram', byId.instagram],
];

test.describe('short links', () => {
  test.skip(({ isMobile }) => isMobile, 'server-side only: once is enough');

  for (const [path, href] of SHORT) {
    test(`${path} → ${href}`, async ({ request }) => {
      const r = await request.get(path, { maxRedirects: 0 });
      expect(r.status()).toBe(302);
      expect(r.headers()['location']).toBe(href);
    });
  }

  for (const path of ['/mail', '/email', '/mail/', '/email/']) {
    test(`${path} → the mail app (static page)`, async ({ request }) => {
      const r = await request.get(path, { maxRedirects: 0 });
      expect(r.status()).toBe(200);
      const html = await r.text();
      expect(html).toContain(`content="0; url=${byId.email}"`);
      expect(html).toMatch(/<meta name="robots" content="noindex"\s*\/?>/);
    });
  }

  test('every contact has its short links, and _redirects has only those plus the rest', () => {
    const rules = readFileSync(new URL('../../public/_redirects', import.meta.url), 'utf8')
      .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
    for (const c of CONTACTS.filter((c) => c.id !== 'email')) {
      for (const p of [`/${c.short}`, `/${c.id}`]) expect(rules.find(([f]) => f === p)?.[1], p).toBe(c.href);
    }
    expect(rules.some(([, to]) => to.startsWith('mailto:'))).toBe(false);
  });
});

// Cloudflare's email obfuscation would rewrite the address into a span decoded by a script
// that writes innerHTML (refused under Trusted Types): every address in a page body sits inside
// <!--email_off--> … <!--/email_off-->, which Cloudflare leaves alone (R79).
test('every email address in a page body is marked email_off', async ({ request }) => {
  for (const path of ['/', '/email', '/mail']) {
    const html = await (await request.get(path)).text();
    const body = html.slice(html.indexOf('<body')).replace(/<script\b[\s\S]*?<\/script>/g, '');
    const outside = body.replace(/<!--email_off-->[\s\S]*?<!--\/email_off-->/g, '');
    expect(body, path).toMatch(/@gmail\.com/);
    expect(outside, path).not.toMatch(/@gmail\.com/);
  }
});
