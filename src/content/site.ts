// The only public facts about the owner (decision D3). Everything user-visible reads from here.

export const SITE = {
  url: 'https://alxnko.dev',
  name: 'Alex Neko',
  handle: 'alxnko',
  role: 'tech lead',
  country: 'Kyrgyzstan',
  countryCode: 'KG',
  host: 'nitro',
  os: 'meowOS',
  rank: {
    text: '#1 committer in Kyrgyzstan',
    short: '#1 committer in KG',
    href: 'https://committers.top/kyrgyzstan_private',
  },
} as const;

/**
 * Machine-readable only (decision R71): spellings of the owner's legal name, published in the
 * JSON-LD Person as `alternateName`/`givenName`/`familyName` so name searches can find the site.
 * NEVER render these. The visible page shows only `SITE.name` and `SITE.handle`; e2e asserts
 * that no real-name spelling appears in the visible text (the email address is the one exception).
 * Ordered by how likely a search is to use them.
 */
export const LEGAL_NAME = {
  given: ['Aleksandr', 'Александр'],
  family: ['Nyrko', 'Нырко'],
  variants: [
    'Aleksandr Nyrko',
    'Александр Нырко',
    'Alexander Nyrko',
    'Alexandr Nyrko',
    'Alex Nyrko',
    'Sasha Nyrko',
    'Саша Нырко',
    'Aleksander Nyrko',
    'Алекс Нырко',
  ],
} as const;

export interface Contact {
  id: 'github' | 'telegram' | 'linkedin' | 'instagram' | 'email';
  short: string;
  label: string;
  handle: string;
  href: string;
  display: string;
}

export const CONTACTS: readonly Contact[] = [
  { id: 'github', short: 'gh', label: 'github', handle: 'alxnko', display: 'github.com/alxnko', href: 'https://github.com/alxnko' },
  { id: 'telegram', short: 'tg', label: 'telegram', handle: '@ALXNK0', display: 't.me/ALXNK0', href: 'https://t.me/ALXNK0' },
  { id: 'linkedin', short: 'in', label: 'linkedin', handle: 'alxnko', display: 'linkedin.com/in/alxnko', href: 'https://linkedin.com/in/alxnko' },
  { id: 'instagram', short: 'ig', label: 'instagram', handle: 'alxnko', display: 'instagram.com/alxnko', href: 'https://instagram.com/alxnko' },
  { id: 'email', short: 'mail', label: 'email', handle: 'aleksandrnyrko@gmail.com', display: 'aleksandrnyrko@gmail.com', href: 'mailto:aleksandrnyrko@gmail.com' },
];

/** The only URLs that may ever render as links or be opened by `open`. */
export const LINK_ALLOWLIST: ReadonlySet<string> = new Set([
  ...CONTACTS.map((c) => c.href),
  SITE.rank.href,
]);
