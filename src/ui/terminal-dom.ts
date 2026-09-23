// DOM renderer + keyboard controller for the single terminal (spec §5.1, §5.2).
// It only ever creates text nodes, <span> and allowlisted <a>: never HTML strings.
import type { Color, Line, TermState } from '../term/types';
import { LINK_ALLOWLIST } from '../content/site';

export interface TermDeps {
  store: {
    readonly state: TermState;
    subscribe(fn: (s: TermState) => void): () => void;
    setInput(text: string, cursor?: number): void;
    prompt(): Line;
  };
  run(line: string): Promise<void>;
  interrupt(): void;
  complete(line: string, cursor: number): { replace: [number, number]; candidates: string[]; insert: string | null };
  historySearch?(query: string): string | null;
  /** Ctrl+L. Falls back to running `clear`. */
  clear?(): void;
  onActivity?(): void;
  onFocus?(): void;
}

export interface TermHandle {
  focus(): void;
  destroy(): void;
}

const COLORS: ReadonlySet<Color> = new Set<Color>([
  'fg', 'muted', 'dim', 'white', 'green', 'amber', 'red', 'blue', 'magenta', 'cyan',
]);

function spans(line: Line, into: HTMLElement): HTMLElement {
  const doc = into.ownerDocument;
  for (const s of line) {
    const link = s.href !== undefined && LINK_ALLOWLIST.has(s.href);
    const el = doc.createElement(link ? 'a' : 'span');
    if (link) {
      el.setAttribute('href', s.href!);
      el.setAttribute('rel', 'noopener noreferrer');
      // web links open a new tab; mailto: hands off to the mail app (a new tab would be left empty)
      if (/^https?:/.test(s.href!)) el.setAttribute('target', '_blank');
    }
    if (s.fg && COLORS.has(s.fg)) el.classList.add(`c-${s.fg}`);
    if (s.bold) el.classList.add('b');
    if (s.art) el.setAttribute('aria-hidden', 'true');
    el.textContent = s.text;
    into.append(el);
  }
  return into;
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
    setMirror(s.input, s.cursor);
  }

  function syncOverlay(s: TermState) {
    if (s.overlay) {
      overlay.hidden = false;
      overlay.replaceChildren(...s.overlay.map((l) => renderLine(l, doc)));
      screen.dataset.overlay = 'true';
    } else if (!overlay.hidden) {
      overlay.hidden = true;
      overlay.replaceChildren();
      delete screen.dataset.overlay;
    }
  }

  function render(s: TermState) {
    if (s.version === lastVersion) return;
    lastVersion = s.version;
    syncLines(s.lines);
    syncOverlay(s);
    form.dataset.busy = s.busy ? 'true' : 'false';
    syncInput(s);
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

  function onKeyDown(e: KeyboardEvent) {
    deps.onActivity?.();
    if (e.isComposing) return;
    const s = store.state;
    const modifierOnly = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key);
    if (s.busy && s.overlay && !modifierOnly) {
      e.preventDefault();
      deps.interrupt();
      return;
    }
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
      case 'Enter': e.preventDefault(); if (!s.busy) submit(text); return;
      case 'Tab': if (!e.shiftKey) tab(e); return;
      case 'ArrowUp': e.preventDefault(); histWalk(-1); return;
      case 'ArrowDown': e.preventDefault(); histWalk(1); return;
      case 'Escape':
        if (s.overlay || s.busy) { e.preventDefault(); deps.interrupt(); return; }
        if (!comp.hidden) { e.preventDefault(); hideComp(); }
        return;
    }
  }

  function onInput() {
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
    if (searching) { endSearch(match || saved, Boolean(match)); return; }
    if (!store.state.busy) submit(store.state.input);
  }
  function onScroll() { stick = atBottom(); }
  function onFocus() { deps.onFocus?.(); }
  function onChip(e: Event) {
    const b = (e.target as Element | null)?.closest?.<HTMLElement>('[data-cmd]');
    if (!b || !root.contains(b) || store.state.busy) return;
    if (searching) endSearch(null);
    submit(b.dataset.cmd ?? '');
  }
  function onPointerUp(e: Event) {
    const t = e.target as Element | null;
    if (!t || t.closest('a,button,input')) return;
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
  ];
  for (const [t, ev, fn] of on) t.addEventListener(ev, fn);
  const unsub = store.subscribe(render);
  render(store.state);

  return {
    focus() {
      input.focus({ preventScroll: true });
    },
    destroy() {
      for (const [t, ev, fn] of on) t.removeEventListener(ev, fn);
      unsub();
    },
  };
}
