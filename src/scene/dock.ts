// Glues the live DOM onto the 3D screens (spec §3.3, §6.4). Desktop: the terminal is
// mapped onto the laptop screen with a projective matrix3d, so docked DOM text lands
// where the canvas mirror drew it. Phones: the terminal becomes a bottom sheet.
import { homography, toMatrix3d, type Pt } from './homography';

const DOCK_IN = 0.08;
const DOCK_OUT = 0.15;
/** Logical size of the contacts panel when docked on the 21:9 monitor. */
export const CONTACTS_DOCK = { w: 1024, h: 429 } as const;

export interface DockInput {
  termErr: number;
  contactsErr: number;
  sheet: boolean;
  termQuad: Pt[];
  contactsQuad: Pt[];
}

export class Dock {
  private term = false;
  private contacts = false;
  private lastTerm = '';
  private lastContacts = '';

  constructor(private o: { termEl: HTMLElement; contactsEl: HTMLElement; mirrorSize: [number, number] }) {}

  update(i: DockInput): { term: boolean; contacts: boolean } {
    this.term = this.term ? i.termErr < DOCK_OUT : i.termErr < DOCK_IN;
    this.contacts = this.contacts ? i.contactsErr < DOCK_OUT : i.contactsErr < DOCK_IN;
    const { termEl, contactsEl, mirrorSize } = this.o;

    const termMode = !this.term ? 'off' : i.sheet ? 'sheet' : 'screen';
    if (termEl.dataset.dock !== termMode) termEl.dataset.dock = termMode;
    if (termMode === 'screen') {
      const [w, h] = mirrorSize;
      const t = safeMatrix([[0, 0], [w, 0], [w, h], [0, h]], i.termQuad);
      if (t && t !== this.lastTerm) { termEl.style.transform = t; this.lastTerm = t; }
    } else if (this.lastTerm) { termEl.style.removeProperty('transform'); this.lastTerm = ''; }

    const cMode = this.contacts ? 'screen' : 'off';
    if (contactsEl.dataset.dock !== cMode) contactsEl.dataset.dock = cMode;
    if (cMode === 'screen') {
      const { w, h } = CONTACTS_DOCK;
      const t = safeMatrix([[0, 0], [w, 0], [w, h], [0, h]], i.contactsQuad);
      if (t && t !== this.lastContacts) { contactsEl.style.transform = t; this.lastContacts = t; }
    } else if (this.lastContacts) { contactsEl.style.removeProperty('transform'); this.lastContacts = ''; }

    return { term: this.term, contacts: this.contacts };
  }

  destroy() {
    for (const el of [this.o.termEl, this.o.contactsEl]) {
      delete el.dataset.dock;
      el.style.removeProperty('transform');
    }
  }
}

function safeMatrix(src: Pt[], dst: Pt[]): string | null {
  if (dst.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return null;
  try {
    return toMatrix3d(homography(src, dst));
  } catch {
    return null;
  }
}
