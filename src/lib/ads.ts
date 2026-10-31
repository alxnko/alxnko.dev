// Ad slots (design: meowverse-design/2026-10-31-ads-ga-consent-redesign.md §4.1 and its final
// section, "ads must look good and feel native"). Build-time flag, OFF by default:
//
//   (unset) / anything else   no ad markup, no ad CSS, no ad script: the build is unchanged
//   AD_SLOTS=preview          the slots are built, collapsed (the "no fill" empty state); a
//                             visit with ?adpreview=1 shows a labelled sample creative in each
//
// No mode loads Google's script. The live path (a later PR, after consent ships) pushes from the
// bundled entry module, never from an inline script, so the hash-based CSP and Trusted Types
// keep holding: `(window.adsbygoogle ||= []).push({})` once per visible, consented slot.

export type AdMode = 'off' | 'preview';

/** The flag's only accepted spelling is exact; a typo or empty value means off. */
export function adMode(v: string | undefined): AdMode {
  return v === 'preview' ? 'preview' : 'off';
}

export const AD_CLIENT = 'ca-pub-6264955766359992';

export interface AdUnit {
  name: string;
  w: number;
  h: number;
  /** AdSense ad-unit id; null until the owner creates the unit. */
  slot: string | null;
}

/** Fixed-size units only (no responsive/auto sizes): the reserved box is exactly the creative. */
export const AD_UNITS = {
  rect: { name: 'meow-rect', w: 300, h: 250, slot: '5740008220' },
  leader: { name: 'meow-leader', w: 728, h: 90, slot: '8242435529' },
  // owner action: create a 320×100 display unit for the phone desk view and fill in its id
  banner: { name: 'meow-mobile-banner', w: 320, h: 100, slot: null },
} as const satisfies Record<string, AdUnit>;

export type AdUnitKey = keyof typeof AD_UNITS;

/** The ?adpreview=1 test, shared by the <head> script (stringified) and the unit tests. */
export function wantsPreview(search: string): boolean {
  return /[?&]adpreview=1(&|$)/.test(search);
}
