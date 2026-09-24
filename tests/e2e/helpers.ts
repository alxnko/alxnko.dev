import { expect, type Page } from '@playwright/test';

/** Collects console errors, page errors and CSP violations; call check() at the end. */
export async function guard(page: Page, opts: { allow404?: RegExp } = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (opts.allow404 && /404/.test(t)) return;
    errors.push(`console: ${t}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !(opts.allow404 && opts.allow404.test(r.url()))) errors.push(`http ${r.status()}: ${r.url()}`);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  return { check: () => expect(errors).toEqual([]) };
}

export const lines = (page: Page) => page.locator('#term-lines');

export async function run(page: Page, cmd: string) {
  const input = page.locator('#term-input');
  await input.focus();
  await input.fill(cmd);
  await input.press('Enter');
}

/** What the eye sees of the cmatrix overlay: its glyphs, and whether it covers the visible screen. */
export const rainView = (page: Page) =>
  page.evaluate(() => {
    const o = document.getElementById('term-overlay')!;
    const s = document.getElementById('term-screen')!.getBoundingClientRect();
    const r = o.getBoundingClientRect();
    return {
      shown: !o.hidden && r.width > 0 && r.height > 0,
      // the overlay sits on the screen's visible box, whatever the scrollback's scroll position
      covers: Math.abs(r.top - s.top) < 2 && Math.abs(r.left - s.left) < 2 && Math.abs(r.bottom - s.bottom) < 2 && Math.abs(r.right - s.right) < 2,
      text: o.textContent ?? '',
    };
  });

/** cmatrix over a scrolled scrollback: visible, changing rain; other keys don't stop it, ctrl+c does. */
export async function expectRain(page: Page, cmd = 'cmatrix') {
  // fill the scrollback past one screen so the log is scrolled (the live-site case)
  await run(page, 'fastfetch');
  await run(page, 'help');
  await expect.poll(() => page.evaluate(() => document.getElementById('term-screen')!.scrollTop)).toBeGreaterThan(0);
  await run(page, cmd);
  const seen = new Set<string>();
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(250);
    const v = await rainView(page);
    expect(v.shown, `frame ${i} shown`).toBe(true);
    expect(v.covers, `frame ${i} covers the screen`).toBe(true);
    seen.add(v.text);
  }
  expect(seen.size).toBeGreaterThanOrEqual(5); // it animates
  // and it rains (it starts above the screen: a slow software-GL runner needs a few more frames)
  await expect.poll(async () => (await rainView(page)).text.replace(/\s/g, '').length, { timeout: 10_000 }).toBeGreaterThan(100);
  await expect(page.locator('#term-form')).toHaveAttribute('data-busy', 'true');
  // the toy owns the tty: typing is swallowed and does not stop it
  await page.keyboard.type('xyz');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await expect(page.locator('#term-overlay')).toBeVisible();
  await page.keyboard.press('Control+c');
  await expect(page.locator('#term-overlay')).toBeHidden();
  await expect(page.locator('#term-form')).toHaveAttribute('data-busy', 'false');
  await expect(page.locator('#term-input')).toHaveValue(''); // nothing typed during the rain landed
}
