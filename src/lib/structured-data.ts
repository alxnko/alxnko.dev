// Structured data (schema.org JSON-LD) for indexable pages: one graph of the site, the profile
// page and its person. The Person's alternateName/givenName/familyName carry the legal-name
// spellings (LEGAL_NAME, decision R71) so name searches can find the site. They are
// machine-readable metadata only and are never rendered on the page.
import { CONTACTS, LEGAL_NAME, SITE } from '../content/site';

const HOME = `${SITE.url}/`;
export const IDS = { website: `${HOME}#website`, person: `${HOME}#person` } as const;

export function structuredGraph(url: string, title: string) {
  const email = CONTACTS.find((c) => c.id === 'email');
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': IDS.website,
        url: HOME,
        name: 'alxnko.dev',
        alternateName: SITE.handle,
        inLanguage: 'en',
        publisher: { '@id': IDS.person },
      },
      {
        '@type': 'ProfilePage',
        '@id': `${url}#profile`,
        url,
        name: title,
        inLanguage: 'en',
        isPartOf: { '@id': IDS.website },
        mainEntity: { '@id': IDS.person },
      },
      {
        '@type': 'Person',
        '@id': IDS.person,
        name: SITE.name,
        alternateName: [SITE.handle, ...LEGAL_NAME.variants],
        givenName: [...LEGAL_NAME.given],
        familyName: [...LEGAL_NAME.family],
        jobTitle: 'Tech Lead',
        description: `${SITE.role} in ${SITE.country}, ${SITE.rank.text}`,
        address: { '@type': 'PostalAddress', addressCountry: SITE.countryCode },
        url: HOME,
        ...(email ? { email: email.href } : {}),
        sameAs: CONTACTS.filter((c) => c.href.startsWith('https:')).map((c) => c.href),
      },
    ],
  };
}

/**
 * The graph serialized for `<script type="application/ld+json">`: `<` is escaped so the data
 * can never close its script element; non-ASCII (Cyrillic) stays as UTF-8 (the page is UTF-8).
 */
export const structuredData = (url: string, title: string) =>
  JSON.stringify(structuredGraph(url, title)).replace(/</g, '\\u003c');
