import { describe, expect, it } from 'vitest';
import { CONTACTS, LEGAL_NAME, SITE } from '../../src/content/site';
import { structuredData } from '../../src/lib/structured-data';

// Decision R71: the legal-name spellings live only in machine-readable JSON-LD.
const raw = structuredData('https://alxnko.dev/', 'alex neko (alxnko) · tech lead');
const doc = JSON.parse(raw);
const node = (type: string) => doc['@graph'].find((n: { '@type': string }) => n['@type'] === type);

describe('JSON-LD structured data', () => {
  it('is valid JSON with a schema.org graph of WebSite, ProfilePage and Person', () => {
    expect(doc['@context']).toBe('https://schema.org');
    expect(doc['@graph'].map((n: { '@type': string }) => n['@type'])).toEqual(['WebSite', 'ProfilePage', 'Person']);
    for (const n of doc['@graph']) expect(n['@id']).toMatch(/^https:\/\/alxnko\.dev\/#/);
  });

  it('links the entities by @id', () => {
    const person = node('Person')['@id'];
    const site = node('WebSite')['@id'];
    expect(node('WebSite').publisher).toEqual({ '@id': person });
    expect(node('ProfilePage').mainEntity).toEqual({ '@id': person });
    expect(node('ProfilePage').isPartOf).toEqual({ '@id': site });
    expect(node('WebSite').url).toBe('https://alxnko.dev/');
    expect(node('ProfilePage').url).toBe('https://alxnko.dev/');
  });

  it('keeps the display name and adds the legal-name spellings as alternate names', () => {
    const p = node('Person');
    expect(p.name).toBe('Alex Neko');
    expect(p.alternateName[0]).toBe('alxnko');
    for (const v of ['Aleksandr Nyrko', 'Alexander Nyrko', 'Alexandr Nyrko', 'Aleksander Nyrko', 'Alex Nyrko', 'Sasha Nyrko', 'Александр Нырко', 'Саша Нырко', 'Алекс Нырко'])
      expect(p.alternateName).toContain(v);
    expect(new Set(p.alternateName).size).toBe(p.alternateName.length);
    expect(p.alternateName.length).toBeGreaterThanOrEqual(8);
    expect(p.alternateName.length).toBeLessThanOrEqual(12);
    expect(p.givenName).toEqual(['Aleksandr', 'Александр']);
    expect(p.familyName).toEqual(['Nyrko', 'Нырко']);
    for (const v of LEGAL_NAME.variants) expect(v).toMatch(/^[\p{L} ]+$/u);
  });

  it('carries only the public facts (R3, R24): no company, no coordinates', () => {
    const p = node('Person');
    expect(p.jobTitle).toBe('Tech Lead');
    expect(p.address).toEqual({ '@type': 'PostalAddress', addressCountry: 'KG' });
    expect(p.email).toBe('mailto:aleksandrnyrko@gmail.com');
    expect(p.sameAs).toEqual(CONTACTS.filter((c) => c.href.startsWith('https:')).map((c) => c.href));
    expect(p.sameAs).toHaveLength(4);
    expect(raw).not.toMatch(/worksFor|affiliation|geo|latitude|longitude|ait solutions/i);
    expect(p.description).toContain(SITE.rank.text);
  });

  it('can never close its <script>, and keeps Cyrillic as UTF-8', () => {
    expect(raw).not.toContain('<');
    expect(JSON.parse(structuredData('https://alxnko.dev/</script><x>', 't')))
      .toBeTruthy();
    expect(structuredData('https://alxnko.dev/</script>', 't')).not.toContain('</script');
    expect(raw).toContain('Александр Нырко');
  });
});
