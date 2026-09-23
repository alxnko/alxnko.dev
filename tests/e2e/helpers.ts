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
