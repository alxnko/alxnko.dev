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
    const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    ctx.fillText(`kg  ${hh}:${mm}`, W - 44, by);
    ctx.textAlign = 'left';

    // pane rules
    ctx.fillStyle = g['800'];
    ctx.fillRect(LEFT - 2, TOP, 2, H - TOP - 40);
    ctx.fillRect(RIGHT, TOP, 2, H - TOP - 40);

    // left pane: the mark
    ctx.fillStyle = ansi('green');
    ctx.font = mono(400, 30);
    const markW = ctx.measureText(CAT_MARK[0]).width;
    CAT_MARK.forEach((l, i) => ctx.fillText(l, (LEFT - markW) / 2, TOP + 150 + i * 38));
    ctx.fillStyle = ansi('white');
    ctx.font = mono(700, 28);
    ctx.textAlign = 'center';
    ctx.fillText(`${SITE.handle}@${SITE.host}`, LEFT / 2, TOP + 150 + CAT_MARK.length * 38 + 50);
    ctx.textAlign = 'left';

    // right pane: status
    const rx = RIGHT + 48;
    const rows: [string, string][] = [
      ['role', SITE.role],
      ['at', SITE.company],
      ['loc', SITE.country],
      ['rank', SITE.rank.short],
    ];
    rows.forEach(([k, v], i) => {
      const y = TOP + 120 + i * 96;
      ctx.fillStyle = ansi('dim');
      ctx.font = mono(400, 24);
      ctx.fillText(k, rx, y);
      ctx.fillStyle = k === 'rank' ? ansi('amber') : ansi('fg');
      ctx.font = mono(400, 28);
      ctx.fillText(v, rx, y + 36);
    });
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
