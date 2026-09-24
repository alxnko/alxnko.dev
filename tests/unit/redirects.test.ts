import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// The short links are part of the public surface (shared in bios, cards, QR codes).
const rules = readFileSync(new URL('../../public/_redirects', import.meta.url), 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));

describe('_redirects', () => {
  const map = Object.fromEntries(rules.map(([from, to, code]) => [from, [to, code]]));
  it.each([
    ['/gh', 'https://github.com/alxnko'], ['/github', 'https://github.com/alxnko'],
    ['/tg', 'https://t.me/ALXNK0'], ['/telegram', 'https://t.me/ALXNK0'],
    ['/in', 'https://linkedin.com/in/alxnko'], ['/li', 'https://linkedin.com/in/alxnko'], ['/linkedin', 'https://linkedin.com/in/alxnko'],
    ['/ig', 'https://instagram.com/alxnko'], ['/instagram', 'https://instagram.com/alxnko'],
    ['/meow', 'https://meow.alxnko.dev'], ['/chat', 'https://meowsenger.alxnko.dev'], ['/auth', 'https://auth.alxnko.dev'],
  ])('%s → %s (302)', (from, to) => {
    expect(map[from]).toEqual([to, '302']);
  });

  it('has no mailto: rules (Pages ignores them; /mail and /email are static pages)', () => {
    expect(rules.filter(([, to]) => to?.startsWith('mailto:'))).toEqual([]);
    for (const p of ['mail', 'email']) {
      const page = readFileSync(new URL(`../../src/pages/${p}.astro`, import.meta.url), 'utf8');
      expect(page).toContain('target="mailto:aleksandrnyrko@gmail.com"');
    }
  });
});
