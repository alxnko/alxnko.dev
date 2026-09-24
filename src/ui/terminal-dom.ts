// DOM renderer + keyboard controller for the single terminal (spec §5.1, §5.2).
// It only ever creates text nodes, <span> and allowlisted <a>: never HTML strings.
import type { Color, Line, Span, TermState } from '../term/types';
import { LINK_ALLOWLIST } from '../content/site';

export interface TermDeps {
  store: {
    readonly state: TermState;
    subscribe(fn: (s: TermState) => void): () => void;
    setInput(text: string, cursor?: number): void;
    setQueued(line: string | null): void;
    prompt(): Line;
  };
  run(line: string): Promise<void>;
  interrupt(): void;
  complete(line: string, cursor: number): { replace: [number, number]; candidates: string[]; full?: string[]; insert: string | null };
  /** A key for the running command that owns the keyboard (cmatrix: q). False when none does. */
  key?(k: string): boolean;
  /** Suggestion chips for an empty prompt (what to try next). */
  chips?(): string[];
  /** A tap on a running full-screen toy (phones: point at the ^C key). */
  onToyTap?(): void;
  historySearch?(query: string): string | null;
  /** Ctrl+L. Falls back to running `clear`. */
  clear?(): void;
  onActivity?(): void;
  onFocus?(): void;
}

export interface TermHandle {
  focus(): void;
  /**
   * While a full-screen toy owns the tty, a key pressed anywhere on the page is its: ctrl+c
   * interrupts, a plain key goes to the toy, and the rest is swallowed. Esc, Tab and browser
   * shortcuts are never taken. Returns true when the key was taken.
   */
  toyKey(e: KeyboardEvent): boolean;
  destroy(): void;
}

const COLORS: ReadonlySet<Color> = new Set<Color>([
  'fg', 'muted', 'dim', 'white', 'green', 'amber', 'red', 'blue', 'magenta', 'cyan', 'accent',
]);

function spans(line: Line, into: HTMLElement): HTMLElement {
  const doc = into.ownerDocument;
  for (const s of line) {
    if (s.run && !s.href) {
      into.append(runButton(s, doc));
      continue;
    }
    const link = s.href !== undefined && LINK_ALLOWLIST.has(s.href);
    const el = doc.createElement(link ? 'a' : 'span');
    if (link) {
      el.setAttribute('href', s.href!);
      el.setAttribute('rel', 'noopener noreferrer');
      // web links open a new tab; mailto: hands off to the mail app (a new tab would be left empty)
      if (/^https?:/.test(s.href!)) el.setAttribute('target', '_blank');
    }
    if (s.fg && COLORS.has(s.fg)) el.classList.add(`c-${s.fg}`);
    swatch(el, s);
    if (s.bold) el.classList.add('b');
    if (s.art) el.setAttribute('aria-hidden', 'true');
    el.textContent = s.text;
    into.append(el);
  }
  return into;
}

const HEX6 = /^#[0-9a-f]{6}$/;
/** A span's exact colour (CSSOM, like every inline style here: the CSP allows it), if any. */
function swatch(el: HTMLElement, s: Span) {
  if (s.swatch !== undefined && HEX6.test(s.swatch)) el.style.setProperty('color', s.swatch);
}

/** A command a click runs (or, ending in a space, starts in the prompt): a button in the log. */
function runButton(s: Span, doc: Document): HTMLElement {
  const el = doc.createElement('button');
  el.type = 'button';
  el.className = 'run';
  if (s.fg && COLORS.has(s.fg)) el.classList.add(`c-${s.fg}`);
  swatch(el, s);
  if (s.bold) el.classList.add('b');
  el.tabIndex = -1; // typing is the keyboard way; the log must not become a wall of tab stops
  el.dataset.cmd = s.run!.trimEnd();
  if (s.run!.endsWith(' ')) el.dataset.fill = '';
  el.textContent = s.text;
  return el;
}

/**
 * A full-screen toy frame (cmatrix): one row element per line, each a reused set of spans, so
 * a frame only touches the text and classes that changed (no per-frame node churn).
 */
export class FrameView {
  private rows: HTMLElement[] = [];
  constructor(private readonly el: HTMLElement) {}

  show(frame: Line[] | null): void {
    const { el } = this;
    if (!frame) {
      if (!el.hidden) {
        el.hidden = true;
        el.replaceChildren();
        this.rows = [];
      }
      return;
    }
    el.hidden = false;
    const doc = el.ownerDocument;
    while (this.rows.length < frame.length) {
      const r = doc.createElement('div');
      r.className = 'ln';
      el.append(r);
      this.rows.push(r);
    }
    while (this.rows.length > frame.length) this.rows.pop()!.remove();
    frame.forEach((line, i) => {
      const row = this.rows[i];
      line.forEach((s, j) => {
        let sp = row.children[j] as HTMLElement | undefined;
        if (!sp) {
          sp = doc.createElement('span');
          sp.append(doc.createTextNode(''));
          row.append(sp);
        }
        const cls = (s.fg && COLORS.has(s.fg) ? `c-${s.fg}` : '') + (s.bold ? ' b' : '');
        if (sp.className !== cls) sp.className = cls;
        const t = sp.firstChild as Text;
        if (t.data !== s.text) t.data = s.text;
      });
      while (row.childElementCount > line.length) row.lastElementChild!.remove();
    });
  }
}

/** One scrollback row. */
export function renderLine(line: Line, doc: Document = document): HTMLElement {
  const row = doc.createElement('div');
  row.className = 'ln';
  return spans(line, row);
}

const lineKey = (l: Line) => l.map((s) => `${s.fg ?? ''}\u0001${s.text}`).join('\u0002');

export function mountTerminal(root: HTMLElement, deps: TermDeps): TermHandle {
  const need = <T extends Element>(sel: string): T => {
    const n = root.querySelector<T>(sel);
    if (!n) throw new Error(`terminal: missing ${sel}`);
    return n;
  };
  const screen = need<HTMLElement>('#term-screen');
  const linesEl = need<HTMLElement>('#term-lines');
  const comp = need<HTMLElement>('#term-comp');
  const overlay = need<HTMLElement>('#term-overlay');
  const form = need<HTMLFormElement>('#term-form');
  const promptEl = need<HTMLElement>('#term-prompt');
  const mirror = need<HTMLElement>('#term-mirror');
  const input = need<HTMLInputElement>('#term-input');
  const chipsEl = root.querySelector<HTMLElement>('#term-chips');
  const frames = new FrameView(overlay);
  const doc = root.ownerDocument;
  const { store } = deps;

  // Mirror = text before caret, caret block, text after.
  const mBefore = doc.createTextNode('');
  const mCaret = doc.createElement('span');
  mCaret.className = 'caret';
  const mAfter = doc.createTextNode('');
  mirror.replaceChildren(mBefore, mCaret, mAfter);

  let rendered: Line[] = [];
  let firstRender = true;
  let stick = true;
  let promptKey = '';
  let lastVersion = -1;

  // History walk.
  let histIdx = -1;
  let draft = '';

  // Reverse search.
  let searching = false;
  let query = '';
  let matchIdx = -1;
  let match = '';
  let saved = '';

  const atBottom = () => screen.scrollTop + screen.clientHeight >= screen.scrollHeight - 8;

  function syncLines(next: Line[]) {
    if (firstRender) {
      linesEl.replaceChildren(); // drop the no-JS transcript
      firstRender = false;
    }
    if (next === rendered) return;
    // Lines dropped from the front (scrollback cap) = offset of the new first line.
    let d = next.length && rendered.length ? rendered.indexOf(next[0]) : rendered.length;
    if (d < 0) d = rendered.length;
    for (let i = 0; i < d; i++) linesEl.firstElementChild?.remove();
    const kept = rendered.slice(d);
    let p = 0;
    while (p < kept.length && p < next.length && kept[p] === next[p]) p++;
    while (linesEl.childElementCount > p) linesEl.lastElementChild!.remove();
    if (p < next.length) {
      const frag = doc.createDocumentFragment();
      for (let i = p; i < next.length; i++) frag.append(renderLine(next[i], doc));
      linesEl.append(frag);
    }
    rendered = next;
  }

  function setPrompt(line: Line) {
    const k = lineKey(line);
    if (k === promptKey) return;
    promptKey = k;
    promptEl.replaceChildren();
    spans(line, promptEl);
  }

  function setMirror(text: string, cursor: number) {
    const c = Math.max(0, Math.min(cursor, text.length));
    mBefore.data = text.slice(0, c);
    mCaret.textContent = text.charAt(c) || ' ';
    mAfter.data = text.slice(c + 1);
    mirror.scrollLeft = input.scrollLeft;
  }

  function syncInput(s: TermState) {
    if (searching) return renderSearch();
    if (input.value !== s.input) input.value = s.input;
    if (doc.activeElement === input && input.selectionStart === input.selectionEnd && input.selectionStart !== s.cursor) {
      input.setSelectionRange(s.cursor, s.cursor);
    }
    setPrompt(store.prompt());
    // a queued line (Enter pressed while busy) shows muted, with a hint, until it's replaced,
    // dropped (^C) or run; typing a fresh draft over it shows normally, same as any other input
    const showQueued = s.queued !== null && !s.input;
    mirror.classList.toggle('queued', showQueued);
    if (showQueued) setMirror(s.queued!, s.queued!.length);
    else setMirror(s.input, s.cursor);
  }

  function syncOverlay(s: TermState) {
    frames.show(s.overlay);
    if (s.overlay) screen.dataset.overlay = 'true';
    else delete screen.dataset.overlay;
  }

  // ---- chips: completions while typing (tap = Tab), else what to try next ---------------
  let chipsKey = '';
  function syncChips(s: TermState) {
    if (!chipsEl || !deps.chips) return;
    chipsEl.dataset.busy = s.busy ? 'true' : 'false';
    if (s.busy || searching) return; // keep the row as it is (no jumps) until the prompt is back
    let items: { label: string; cmd: string; fill: boolean }[] = [];
    if (s.input.trim()) {
      const r = deps.complete(s.input, s.cursor);
      const [a, b] = r.replace;
      const full = r.full ?? [];
      items = full.slice(0, 6).map((f, i) => {
        const text = s.input.slice(0, a) + f + (f.endsWith('/') ? '' : ' ') + s.input.slice(b);
        return { label: r.candidates[i] ?? f, cmd: text, fill: true };
      }).filter((it) => it.cmd.trimEnd() !== s.input.trimEnd()); // no chip that changes nothing
    } else items = deps.chips().map((c) => ({ label: c, cmd: c, fill: false }));
    const key = items.map((i) => `${i.fill ? '+' : ''}${i.label}\u0001${i.cmd}`).join('\u0002');
    if (key === chipsKey) return;
    chipsKey = key;
    chipsEl.dataset.kind = s.input.trim() ? 'complete' : 'next';
    chipsEl.replaceChildren(...items.map((it) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.cmd = it.cmd;
      if (it.fill) b.dataset.fill = '';
      b.textContent = it.label;
      return b;
    }));
  }

  function render(s: TermState) {
    if (s.version === lastVersion) return;
    lastVersion = s.version;
    syncLines(s.lines);
    syncOverlay(s);
    form.dataset.busy = s.busy ? 'true' : 'false';
    syncInput(s);
    syncChips(s);
    if (stick) screen.scrollTop = screen.scrollHeight;
  }

  // ---- completion list -------------------------------------------------------------
  function showComp(cands: string[]) {
    comp.replaceChildren(...cands.map((c) => {
      const s = doc.createElement('span');
      s.textContent = c;
      return s;
    }));
    comp.hidden = false;
    if (stick) screen.scrollTop = screen.scrollHeight;
  }
  function hideComp() {
    if (comp.hidden) return;
    comp.hidden = true;
    comp.replaceChildren();
  }

  // ---- reverse search ---------------------------------------------------------------
  function findOlder(q: string, before: number): number {
    const h = store.state.history;
    if (!q) return -1;
    for (let i = Math.min(before, h.length) - 1; i >= 0; i--) if (h[i].includes(q)) return i;
    return -1;
  }
  function renderSearch() {
    const failed = query !== '' && match === '';
    setPrompt([{ text: `(${failed ? 'failed ' : ''}reverse-i-search)\``, fg: 'muted' }, { text: query }, { text: "': ", fg: 'muted' }]);
    const at = match ? Math.max(0, match.indexOf(query)) : 0;
    setMirror(match, at);
  }
  function startSearch() {
    searching = true;
    saved = store.state.input;
    query = '';
    match = '';
    matchIdx = store.state.history.length;
    input.value = '';
    hideComp();
    renderSearch();
  }
  function searchFor(q: string) {
    query = q;
    const h = store.state.history;
    if (deps.historySearch) {
      const m = q ? deps.historySearch(q) : null;
      match = m ?? '';
      matchIdx = m === null ? h.length : Math.max(0, h.lastIndexOf(m));
    } else {
      const i = findOlder(q, h.length);
      match = i >= 0 ? h[i] : '';
      matchIdx = i >= 0 ? i : h.length;
    }
    renderSearch();
  }
  function searchOlder() {
    const i = findOlder(query, matchIdx);
    if (i >= 0) {
      matchIdx = i;
      match = store.state.history[i];
    }
    renderSearch();
  }
  function endSearch(line: string | null, run = false) {
    searching = false;
    promptKey = '';
    const text = line ?? saved;
    input.value = text;
    lastVersion = -1;
    if (run) submit(text);
    else store.setInput(text, text.length);
    render(store.state);
  }
  function searchKey(e: KeyboardEvent) {
    const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === 'r') { e.preventDefault(); searchOlder(); return; }
    if (ctrl && (k === 'g' || k === 'c')) { e.preventDefault(); endSearch(null); return; }
    switch (e.key) {
      case 'Enter': e.preventDefault(); endSearch(match || saved, Boolean(match)); return;
      case 'Escape': case 'Tab': case 'ArrowLeft': case 'ArrowRight': case 'Home': case 'End':
        e.preventDefault(); endSearch(match || saved); return;
      case 'ArrowUp': case 'ArrowDown': e.preventDefault(); endSearch(match || saved); return;
    }
  }

  // ---- editing ----------------------------------------------------------------------
  function edit(text: string, cursor: number) {
    store.setInput(text, cursor);
    input.value = text;
    input.setSelectionRange(cursor, cursor);
  }
  function submit(line: string) {
    histIdx = -1;
    hideComp();
    stick = true;
    edit('', 0);
    void deps.run(line);
  }
  /** Enter while busy: at most one pending line (a later Enter replaces it); ^C drops it. */
  function queueEnter(line: string) {
    histIdx = -1;
    hideComp();
    edit('', 0);
    store.setQueued(line);
  }
  function histWalk(dir: -1 | 1) {
    const h = store.state.history;
    if (!h.length) return;
    if (dir === -1) {
      if (histIdx === -1) { draft = store.state.input; histIdx = h.length; }
      histIdx = Math.max(0, histIdx - 1);
      const t = h[histIdx];
      edit(t, t.length);
    } else {
      if (histIdx === -1) return;
      histIdx++;
      const t = histIdx >= h.length ? draft : h[histIdx];
      if (histIdx >= h.length) histIdx = -1;
      edit(t, t.length);
    }
  }
  function tab(e: KeyboardEvent) {
    const { input: text, cursor } = store.state;
    if (!text.trim()) return; // let Tab move focus: never a keyboard trap
    e.preventDefault();
    const r = deps.complete(text, cursor);
    if (r.insert !== null) {
      const [a, b] = r.replace;
      edit(text.slice(0, a) + r.insert + text.slice(b), a + r.insert.length);
    }
    if (r.candidates.length > 1) showComp(r.candidates);
    else hideComp();
  }
  const hasSelection = () =>
    (input.selectionStart ?? 0) !== (input.selectionEnd ?? 0) ||
    (doc.getSelection?.()?.toString() ?? '') !== '';

  const toyMode = () => store.state.busy && store.state.overlay !== null;
  function toyKey(e: KeyboardEvent): boolean {
    if (!toyMode() || e.isComposing) return false;
    // Esc is the page's (back to the desk, out of view mode); Tab never traps focus; F-keys
    // (reload, fullscreen) are the browser's
    if (['Escape', 'Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key) || /^F\d+$/.test(e.key)) return false;
    const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'c') {
      if (hasSelection()) return false; // copy wins
      e.preventDefault();
      deps.interrupt();
      return true;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false; // browser shortcuts stay the browser's
    // from the page (prompt not focused) only typing keys are the toy's: space, arrows,
    // PageUp/Down, Home/End and / keep scrolling and finding
    if (doc.activeElement !== input && !((e.key.length === 1 && e.key !== ' ' && e.key !== '/') || e.key === 'Enter' || e.key === 'Backspace')) return false;
    e.preventDefault(); // the toy owns the tty: nothing reaches the prompt
    deps.key?.(e.key);
    return true;
  }

  function onKeyDown(e: KeyboardEvent) {
    deps.onActivity?.();
    if (e.isComposing) return;
    const s = store.state;
    if (toyMode()) return void toyKey(e); // whatever it doesn't take is the page's or the browser's
    if (searching) return searchKey(e);
    const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
    const { input: text, cursor } = s;
    if (ctrl) {
      switch (e.key.toLowerCase()) {
        case 'c':
          if (hasSelection()) return; // copy wins
          e.preventDefault(); hideComp(); histIdx = -1; deps.interrupt(); return;
        case 'l':
          e.preventDefault(); hideComp();
          if (deps.clear) deps.clear(); else void deps.run('clear');
          return;
        case 'u': e.preventDefault(); edit(text.slice(cursor), 0); return;
        case 'w': {
          e.preventDefault();
          const head = text.slice(0, cursor).replace(/\S+\s*$/, '');
          edit(head + text.slice(cursor), head.length);
          return;
        }
        case 'a': e.preventDefault(); edit(text, 0); return;
        case 'e': e.preventDefault(); edit(text, text.length); return;
        case 'r': e.preventDefault(); startSearch(); return;
      }
      return;
    }
    switch (e.key) {
      case 'Enter': e.preventDefault(); if (s.busy) queueEnter(text); else submit(text); return;
      case 'Tab': if (!e.shiftKey) tab(e); return;
      case 'ArrowUp': e.preventDefault(); histWalk(-1); return;
      case 'ArrowDown': e.preventDefault(); histWalk(1); return;
      case 'Escape':
        // Esc never interrupts (ctrl+c does, as in a real terminal): unclaimed, it is the
        // page's, which flies back to the desk
        if (!comp.hidden) { e.preventDefault(); hideComp(); }
        return;
    }
  }

  function onInput() {
    if (toyMode()) {
      // phone keyboards send no key events: take the typed text as keys, keep the prompt
      const typed = input.value, was = store.state.input;
      let p = 0;
      while (p < typed.length && p < was.length && typed[p] === was[p]) p++;
      let q = 0;
      while (q < typed.length - p && q < was.length - p && typed[typed.length - 1 - q] === was[was.length - 1 - q]) q++;
      const ins = typed.slice(p, typed.length - q);
      input.value = was;
      for (const ch of ins) deps.key?.(ch);
      return;
    }
    if (searching) { searchFor(input.value); return; }
    histIdx = -1;
    hideComp();
    store.setInput(input.value, input.selectionStart ?? input.value.length);
  }
  function syncCaret() {
    if (searching || doc.activeElement !== input) return;
    const c = input.selectionStart ?? 0;
    if (c !== store.state.cursor || input.value !== store.state.input) store.setInput(input.value, c);
    else setMirror(input.value, c);
  }
  function onSubmit(e: Event) {
    e.preventDefault();
    if (toyMode()) return; // the toy owns the tty; a virtual "send" key is not a queued line
    if (searching) { endSearch(match || saved, Boolean(match)); return; }
    const s = store.state;
    if (s.busy) queueEnter(s.input); else submit(s.input);
  }
  function onScroll() { stick = atBottom(); }
  function onFocus() { deps.onFocus?.(); }
  function onChip(e: Event) {
    const b = (e.target as Element | null)?.closest?.<HTMLElement>('[data-cmd]');
    if (!b || !root.contains(b) || store.state.busy) return;
    if (searching) endSearch(null);
    const cmd = b.dataset.cmd ?? '';
    if (b.dataset.fill !== undefined) {
      // a completion, or a command that needs an argument: into the prompt, not run
      const text = b.classList.contains('run') ? cmd + ' ' : cmd;
      histIdx = -1;
      hideComp();
      edit(text, text.length);
      input.focus({ preventScroll: true });
      return;
    }
    submit(cmd);
  }
  function onPointerUp(e: Event) {
    const t = e.target as Element | null;
    if (!t || t.closest('a,button,input')) return;
    if (toyMode()) { deps.onToyTap?.(); return; } // the toy owns the screen: no keyboard pop-up
    if ((doc.getSelection?.()?.toString() ?? '') !== '') return; // user is selecting text
    input.focus({ preventScroll: true });
  }

  const on: [EventTarget, string, EventListener][] = [
    [input, 'keydown', onKeyDown as EventListener],
    [input, 'input', onInput],
    [input, 'keyup', syncCaret],
    [input, 'select', syncCaret],
    [input, 'click', syncCaret],
    [input, 'focus', onFocus],
    [doc, 'selectionchange', syncCaret],
    [form, 'submit', onSubmit],
    [screen, 'scroll', onScroll],
    [root, 'click', onChip],
    [screen, 'mouseup', onPointerUp],
    [overlay, 'mouseup', onPointerUp],
  ];
  for (const [t, ev, fn] of on) t.addEventListener(ev, fn);
  const unsub = store.subscribe(render);
  render(store.state);

  return {
    focus() {
      input.focus({ preventScroll: true });
    },
    toyKey,
    destroy() {
      for (const [t, ev, fn] of on) t.removeEventListener(ev, fn);
      unsub();
    },
  };
}
