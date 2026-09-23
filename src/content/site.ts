// The only public facts about the owner (decision D3). Everything user-visible reads from here.

export const SITE = {
  url: 'https://alxnko.dev',
  name: 'Alex Neko',
  handle: 'alxnko',
  role: 'tech lead',
  company: 'AIT Solutions',
  country: 'Kyrgyzstan',
  countryCode: 'KG',
  coords: '42.87°N 74.59°E',
  host: 'nitro',
  os: 'meowOS',
  rank: {
    text: '#1 committer in Kyrgyzstan',
    short: '#1 committer in KG',
    href: 'https://committers.top/kyrgyzstan_private',
  },
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
