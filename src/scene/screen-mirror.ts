// The laptop screen: a canvas view of the same TermStore the DOM terminal renders
// (spec §5.1, the continuity guarantee). The DOM terminal, when docked, uses the same
// MIRROR metrics, so docking and undocking do not visibly jump.
import { CanvasTexture, SRGBColorSpace, LinearFilter } from 'three';
import type { Line, TermState } from '../term/types';
import { ansi, TERM_BG, TOKENS } from '../lib/tokens';

/** Logical layout, in CSS px of the docked DOM terminal. */
export const MIRROR = { w: 1280, h: 800, pad: 28, font: 24, lh: 30, bar: 40 } as const;
export const MIRROR_ADV = MIRROR.font * 0.6; // JetBrains Mono advance is 600/1000 em
export const MIRROR_COLS = Math.floor((MIRROR.w - MIRROR.pad * 2) / MIRROR_ADV);
export const MIRROR_ROWS = Math.floor((MIRROR.h - MIRROR.bar - MIRROR.pad) / MIRROR.lh);

export interface MirrorStore {
  readonly state: TermState;
  subscribe(fn: (s: TermState) => void): () => void;
  prompt(): Line;
}

interface Cell { ch: string; color: string; bold: boolean }

/** Wrap styled lines into rows of at most `cols` cells (char-wrap, like a tty). */
export function layoutRows(lines: Line[], cols: number): Cell[][] {
  const rows: Cell[][] = [];
  for (const line of lines) {
    let row: Cell[] = [];
    for (const span of line) {
      const color = ansi(span.fg);
      for (const ch of span.text) {
        if (ch === '\n') { rows.push(row); row = []; continue; }
        if (row.length === cols) { rows.push(row); row = []; }
        row.push({ ch, color, bold: !!span.bold });
      }
    }
    rows.push(row);
  }
  return rows;
}

export class ScreenMirror {
  readonly texture: CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private scale: number;
  private unsub: () => void;
  private blinkOn = true;
  private dirty = true;
  active = true;

  constructor(private store: MirrorStore, opts: { mobile: boolean; onDirty(): void }) {
    const canvas = document.createElement('canvas');
    this.scale = opts.mobile ? 0.8 : 1;
    canvas.width = MIRROR.w * this.scale;
    canvas.height = MIRROR.h * this.scale;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.anisotropy = 4;
    this.unsub = store.subscribe(() => { this.dirty = true; opts.onDirty(); });
    // read-only test hook for e2e continuity checks (harmless if found in production)
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || new URLSearchParams(location.search).has('test')) {
      (window as any).__mirrorText = () => this.text();
    }
  }

  /** Called by the render loop; returns true if the texture changed. */
  update(now: number, reducedMotion: boolean): boolean {
    const blink = reducedMotion ? true : Math.floor(now / 500) % 2 === 0;
    if (blink !== this.blinkOn) { this.blinkOn = blink; this.dirty = true; }
    if (!this.dirty || !this.active) return false;
    this.draw();
    this.dirty = false;
    this.texture.needsUpdate = true;
    return true;
  }

  invalidate() { this.dirty = true; }

  private visibleRows(): Cell[][] {
    const s = this.store.state;
    if (s.overlay) return layoutRows(s.overlay, MIRROR_COLS).slice(0, MIRROR_ROWS);
    const inputLine: Line = [...this.store.prompt(), { text: s.input }];
    const rows = layoutRows([...s.lines, inputLine], MIRROR_COLS);
    return rows.slice(-MIRROR_ROWS);
  }

  /** Plain text of what is on screen (tests/e2e). */
  text(): string {
    return this.visibleRows().map((r) => r.map((c) => c.ch).join('')).join('\n');
  }

  private draw() {
    const { ctx } = this;
    const s = this.store.state;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.fillStyle = TERM_BG;
    ctx.fillRect(0, 0, MIRROR.w, MIRROR.h);
    ctx.textBaseline = 'middle';

    // status bar: workspaces · title · clock (a tiling WM, as on the real laptop)
    const g = TOKENS.primitive.graphite;
    ctx.fillStyle = g['900'];
    ctx.fillRect(0, 0, MIRROR.w, MIRROR.bar);
    ctx.font = `500 18px "JetBrains Mono", monospace`;
    ['1', '2', '3'].forEach((n, i) => {
      const x = MIRROR.pad + i * 30;
      ctx.fillStyle = i === 0 ? ansi('white') : ansi('dim');
      ctx.fillText(n, x, MIRROR.bar / 2);
      if (i === 0) { ctx.fillStyle = ansi('green'); ctx.fillRect(x - 2, MIRROR.bar - 3, 15, 3); }
    });
    ctx.fillStyle = ansi('muted');
    const title = s.busy ? 'alxnko@nitro — running' : 'alxnko@nitro';
    ctx.textAlign = 'center';
    ctx.fillText(title, MIRROR.w / 2, MIRROR.bar / 2);
    ctx.textAlign = 'right';
    const d = new Date();
    ctx.fillText(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, MIRROR.w - MIRROR.pad, MIRROR.bar / 2);
    ctx.textAlign = 'left';

    // terminal body
    const rows = this.visibleRows();
    const top = MIRROR.bar + MIRROR.pad / 2;
    let cursorRow = -1, cursorCol = -1;
    if (!s.overlay) {
      // cursor sits at prompt + cursor offset, counted from the end
      const promptLen = this.store.prompt().reduce((n, sp) => n + sp.text.length, 0);
      const inputRows = layoutRows([[...this.store.prompt(), { text: s.input }]], MIRROR_COLS);
      const abs = promptLen + s.cursor;
      const rowInInput = Math.floor(abs / MIRROR_COLS);
      cursorRow = rows.length - inputRows.length + Math.min(rowInInput, inputRows.length);
      cursorCol = abs % MIRROR_COLS;
      if (rowInInput >= inputRows.length) cursorRow = rows.length; // cursor wrapped past end
    }
    for (let r = 0; r < rows.length; r++) {
      const y = top + r * MIRROR.lh + MIRROR.lh / 2;
      let bold = false;
      ctx.font = `400 ${MIRROR.font}px "JetBrains Mono", monospace`;
      rows[r].forEach((c, i) => {
        if (c.bold !== bold) { bold = c.bold; ctx.font = `${bold ? 700 : 400} ${MIRROR.font}px "JetBrains Mono", monospace`; }
        ctx.fillStyle = c.color;
        ctx.fillText(c.ch, MIRROR.pad + i * MIRROR_ADV, y);
      });
    }
    if (cursorRow >= 0 && cursorRow < MIRROR_ROWS && this.blinkOn && !s.busy) {
      const y = top + cursorRow * MIRROR.lh;
      ctx.fillStyle = ansi('green');
      ctx.fillRect(MIRROR.pad + cursorCol * MIRROR_ADV, y + 3, MIRROR_ADV, MIRROR.lh - 6);
    }
  }

  dispose() {
    this.unsub();
    this.texture.dispose();
  }
}
