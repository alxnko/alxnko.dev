// The ultrawide around the live contacts panel (the DOM panel is pinned on the middle of
// the curve, see CONTACTS_UV in index.ts): a tiling-WM bar across the top, the cat mark on
// the left pane and a short status column on the right. Redrawn only on the minute tick.
import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';
import { SITE } from '../content/site';
import { CAT_MARK } from '../content/mark';
import { ansi, TERM_BG, TOKENS } from '../lib/tokens';

const W = 2048, H = 858; // 21:9
/** Must match CONTACTS_UV in index.ts: the middle stays empty for the DOM panel. */
const LEFT = 0.24 * W, RIGHT = 0.76 * W, TOP = 0.12 * H;

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

  /** Forces a redraw on the next update (e.g. after GPU context restore). */
  invalidate() {
    this.minute = -1;
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

    // bar across the whole panel
    ctx.fillStyle = g['900'];
    ctx.fillRect(0, 0, W, TOP * 0.62);
    const by = TOP * 0.31;
    ctx.font = mono(500, 24);
    ['1', '2', '3'].forEach((n, i) => {
      const x = 44 + i * 40;
      ctx.fillStyle = i === 1 ? ansi('white') : ansi('dim');
      ctx.fillText(n, x, by);
      if (i === 1) { ctx.fillStyle = ansi('green'); ctx.fillRect(x - 3, TOP * 0.62 - 4, 20, 4); }
    });
    ctx.fillStyle = ansi('muted');
    ctx.textAlign = 'center';
    ctx.fillText('~/monitor', W / 2, by);
    ctx.textAlign = 'right';
    // Kyrgyzstan time (UTC+6, no DST), like the page clock and `date`
    const kg = new Date(d.getTime() + 6 * 3600_000);
    const hh = String(kg.getUTCHours()).padStart(2, '0'), mm = String(kg.getUTCMinutes()).padStart(2, '0');
    ctx.fillText(`kg  ${hh}:${mm}`, W - 44, by);
    ctx.textAlign = 'left';

    // pane rules
    ctx.fillStyle = g['800'];
    ctx.fillRect(LEFT - 2, TOP, 2, H - TOP - 40);
    ctx.fillRect(RIGHT, TOP, 2, H - TOP - 40);

    // left pane: the mark, drawn as the half-block cells it is made of (18×38 px, a 30 px mono
    // cell) rather than as text, so it is exact whatever fonts the device has or has loaded
    ctx.fillStyle = ansi('green');
    const CW = 18, CH = 38, x0 = (LEFT - CAT_MARK[0].length * CW) / 2, y0 = TOP + 150 - 30;
    CAT_MARK.forEach((l, row) => [...l].forEach((ch, col) => {
      const x = x0 + col * CW, y = y0 + row * CH;
      if (ch === '█') ctx.fillRect(x, y, CW, CH);
      else if (ch === '▀') ctx.fillRect(x, y, CW, CH / 2);
      else if (ch === '▄') ctx.fillRect(x, y + CH / 2, CW, CH / 2);
    }));
    ctx.fillStyle = ansi('white');
    ctx.font = mono(700, 28);
    ctx.textAlign = 'center';
    ctx.fillText(`${SITE.handle}@${SITE.host}`, LEFT / 2, TOP + 150 + CAT_MARK.length * 38 + 50);
    ctx.textAlign = 'left';

    // the right pane is the live #mon-info panel (pinned DOM, with the rank link)
  }

  dispose() {
    this.texture.dispose();
  }
}

/** The desk fan's little speed readout (a seven-segment look in the mark green). */
export class FanDisplay {
  readonly texture: CanvasTexture;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    this.ctx = c.getContext('2d', { alpha: false })!;
    this.texture = new CanvasTexture(c);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
  }

  set(text: string) {
    const { ctx } = this;
    ctx.fillStyle = '#050506';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = ansi('white');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 84px "JetBrains Mono", monospace';
    ctx.fillText(text, 128, 68);
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}
