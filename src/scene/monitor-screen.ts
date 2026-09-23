// The ultrawide: a quiet tiling-WM desktop with contacts (spec §6.5). Drawn once, then
// again only on the minute tick (clock) and on ring colour changes.
import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';
import { CONTACTS, SITE } from '../content/site';
import { CAT_MARK } from '../content/mark';
import { ansi, TERM_BG, TOKENS } from '../lib/tokens';

const W = 2048, H = 858; // 21:9
const CAT = CAT_MARK;

export class MonitorScreen {
  readonly texture: CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private minute = -1;

  constructor(mobile: boolean) {
    const c = document.createElement('canvas');
    const s = mobile ? 0.5 : 1;
    c.width = W * s;
    c.height = H * s;
    this.ctx = c.getContext('2d', { alpha: false })!;
    this.ctx.setTransform(s, 0, 0, s, 0, 0);
    this.texture = new CanvasTexture(c);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.anisotropy = 4;
  }

  /** Returns true when redrawn. */
  update(now = Date.now()): boolean {
    const m = Math.floor(now / 60000);
    if (m === this.minute) return false;
    this.minute = m;
    this.draw(new Date(now));
    this.texture.needsUpdate = true;
    return true;
  }

  private draw(d: Date) {
    const { ctx } = this;
    const g = TOKENS.primitive.graphite;
    const mono = (w: number, px: number) => `${w} ${px}px "JetBrains Mono", monospace`;
    ctx.fillStyle = TERM_BG;
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'middle';

    // bar
    ctx.fillStyle = g['900'];
    ctx.fillRect(0, 0, W, 52);
    ctx.font = mono(500, 22);
    ['1', '2', '3'].forEach((n, i) => {
      const x = 40 + i * 38;
      ctx.fillStyle = i === 1 ? ansi('white') : ansi('dim');
      ctx.fillText(n, x, 26);
      if (i === 1) { ctx.fillStyle = ansi('green'); ctx.fillRect(x - 3, 48, 19, 4); }
    });
    ctx.fillStyle = ansi('muted');
    ctx.textAlign = 'center';
    ctx.fillText('contacts', W / 2, 26);
    ctx.textAlign = 'right';
    const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    ctx.fillText(`kg  ${hh}:${mm}`, W - 40, 26);
    ctx.textAlign = 'left';

    // left pane: contacts
    const px = 72, py = 150;
    ctx.fillStyle = ansi('dim');
    ctx.font = mono(400, 24);
    ctx.fillText('~/monitor', px, py - 50);
    CONTACTS.forEach((c, i) => {
      const y = py + i * 92;
      ctx.fillStyle = ansi('green');
      ctx.font = mono(700, 34);
      ctx.fillText(c.short.padEnd(5, ' '), px, y);
      ctx.fillStyle = ansi('white');
      ctx.font = mono(400, 34);
      ctx.fillText(c.display, px + 130, y);
      ctx.fillStyle = g['750'];
      ctx.fillRect(px, y + 40, 900, 2);
    });

    // divider
    ctx.fillStyle = g['800'];
    ctx.fillRect(1140, 90, 2, H - 150);

    // right pane: identity card
    const rx = 1220;
    ctx.fillStyle = ansi('green');
    ctx.font = mono(400, 30);
    CAT.forEach((l, i) => ctx.fillText(l, rx, 170 + i * 36));
    const facts: [string, string][] = [
      ['', `${SITE.handle}@${SITE.host}`],
      ['role', `${SITE.role} @ ${SITE.company}`],
      ['loc', SITE.country],
      ['rank', SITE.rank.short],
    ];
    ctx.font = mono(400, 28);
    facts.forEach(([k, v], i) => {
      const y = 520 + i * 52;
      ctx.fillStyle = ansi('dim');
      ctx.fillText(k, rx, y);
      ctx.fillStyle = i === 0 ? ansi('white') : ansi('fg');
      ctx.fillText(v, rx + (k ? 110 : 0), y);
    });
  }

  dispose() {
    this.texture.dispose();
  }
}
