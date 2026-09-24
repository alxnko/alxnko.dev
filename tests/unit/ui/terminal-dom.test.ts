// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Line, TermState } from '../../../src/term/types';
import { mountTerminal, type TermDeps } from '../../../src/ui/terminal-dom';

/** Minimal fixture matching src/components/Terminal.astro (built without HTML parsing). */
function fixture(): HTMLElement {
  const el = (tag: string, id?: string, attrs: Record<string, string> = {}) => {
    const n = document.createElement(tag);
    if (id) n.id = id;
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const root = el('section', 'term');
  const screen = el('div', 'term-screen', { role: 'log', 'aria-live': 'polite' });
  const ssr = el('div');
  ssr.className = 'ln';
  ssr.textContent = 'static transcript';
  const lines = el('div', 'term-lines');
  lines.append(ssr);
  screen.append(lines, el('div', 'term-comp', { hidden: '' }));
  // the overlay is the scroller's sibling, not its child (R72)
  const view = el('div');
  view.append(screen, el('div', 'term-overlay', { hidden: '' }));
  const chips = el('div', 'term-chips');
  for (const c of ['help', 'whoami', 'ls monitor']) {
    const b = el('button', undefined, { type: 'button', 'data-cmd': c });
    b.textContent = c;
    chips.append(b);
  }
  const form = el('form', 'term-form');
  const field = el('div');
  field.append(el('div', 'term-mirror'), el('input', 'term-input'));
  form.append(el('span', 'term-prompt'), field);
  root.append(view, chips, form);
  document.body.append(root);
  return root;
}

function fakeDeps(init: Partial<TermState> = {}) {
  const subs = new Set<(s: TermState) => void>();
  let state: TermState = {
    lines: [], input: '', cursor: 0, cwd: '/home/alxnko', busy: false,
    history: [], overlay: null, version: 1, ...init,
  };
  const emit = () => subs.forEach((f) => f(state));
  const update = (p: Partial<TermState>) => {
    state = { ...state, ...p, version: state.version + 1 };
    emit();
  };
  const store = {
    get state() { return state; },
    subscribe(fn: (s: TermState) => void) { subs.add(fn); return () => subs.delete(fn); },
    setInput: vi.fn((text: string, cursor = text.length) => update({ input: text, cursor })),
    prompt: (): Line => [{ text: '[alxnko@nitro ', fg: 'green' }, { text: '~' }, { text: ']$ ' }],
  };
  const deps = {
    store,
    run: vi.fn(async (_line: string) => {}),
    interrupt: vi.fn(),
    complete: vi.fn((_l: string, _c: number) => ({ replace: [0, 0] as [number, number], candidates: [] as string[], insert: null as string | null })),
    clear: vi.fn(),
  } satisfies TermDeps;
  return { deps, update, push: (...ls: Line[]) => update({ lines: [...state.lines, ...ls] }), get state() { return state; } };
}

const key = (target: Element, k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};

function type(input: HTMLInputElement, value: string) {
  input.value = value;
  input.setSelectionRange(value.length, value.length);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

let root: HTMLElement;
let input: HTMLInputElement;
let handle: { focus(): void; destroy(): void } | null = null;

beforeEach(() => {
  document.body.replaceChildren();
  root = fixture();
  input = root.querySelector('#term-input') as HTMLInputElement;
});
afterEach(() => {
  handle?.destroy();
  handle = null;
  vi.restoreAllMocks();
});

describe('terminal-dom rendering', () => {
  it('renders spans with color/bold classes and allowlisted links only', () => {
    const f = fakeDeps({
      lines: [[
        { text: 'ok', fg: 'green', bold: true },
        { text: 'github', href: 'https://github.com/alxnko' },
        { text: 'evil', href: 'javascript:alert(1)' },
      ]],
    });
    handle = mountTerminal(root, f.deps);
    const ln = root.querySelectorAll('#term-lines > .ln');
    expect(ln).toHaveLength(1); // SSR transcript replaced
    const [a, b, c] = Array.from(ln[0].childNodes) as HTMLElement[];
    expect(a.tagName).toBe('SPAN');
    expect(a.classList.contains('c-green')).toBe(true);
    expect(a.classList.contains('b')).toBe(true);
    expect(a.textContent).toBe('ok');
    expect(b.tagName).toBe('A');
    expect(b.getAttribute('href')).toBe('https://github.com/alxnko');
    expect(b.getAttribute('rel')).toBe('noopener noreferrer');
    expect(b.getAttribute('target')).toBe('_blank');
    expect(c.tagName).toBe('SPAN');
    expect(c.hasAttribute('href')).toBe(false);
  });

  it('treats markup in output as plain text and never uses innerHTML', () => {
    const owner = (() => {
      let p: object | null = HTMLElement.prototype;
      while (p && !Object.getOwnPropertyDescriptor(p, 'innerHTML')) p = Object.getPrototypeOf(p);
      return p as Element;
    })();
    const spy = vi.spyOn(owner, 'innerHTML', 'set');
    const adj = vi.spyOn(Element.prototype, 'insertAdjacentHTML');
    const f = fakeDeps();
    handle = mountTerminal(root, f.deps);
    f.push([{ text: '<img src=x onerror=alert(1)>' }]);
    expect(root.querySelector('#term-lines img')).toBeNull();
    expect(root.querySelector('#term-lines')!.textContent).toContain('<img src=x');
    expect(spy).not.toHaveBeenCalled();
    expect(adj).not.toHaveBeenCalled();
  });

  it('renders the prompt from store.prompt()', () => {
    const f = fakeDeps();
    handle = mountTerminal(root, f.deps);
    expect(root.querySelector('#term-prompt')!.textContent).toBe('[alxnko@nitro ~]$ ');
    expect(root.querySelector('#term-prompt .c-green')).not.toBeNull();
  });

  it('mirrors input with a block caret at the cursor', () => {
    const f = fakeDeps();
    handle = mountTerminal(root, f.deps);
    f.deps.store.setInput('help', 2);
    const mirror = root.querySelector('#term-mirror')!;
    expect(mirror.textContent!.replace(' ', '')).toBe('help');
    expect(mirror.querySelector('.caret')!.textContent).toBe('l');
  });

  it('incremental render appends new lines and keeps existing nodes; clear rebuilds', () => {
    const f = fakeDeps({ lines: [[{ text: 'one' }]] });
    handle = mountTerminal(root, f.deps);
    const first = root.querySelector('#term-lines > .ln');
    f.push([{ text: 'two' }], [{ text: 'three' }]);
    const nodes = root.querySelectorAll('#term-lines > .ln');
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toBe(first);
    expect(nodes[2].textContent).toBe('three');
    f.update({ lines: [] });
    expect(root.querySelectorAll('#term-lines > .ln')).toHaveLength(0);
    f.push([{ text: 'fresh' }]);
    expect(root.querySelector('#term-lines')!.textContent).toBe('fresh');
  });

  it('handles scrollback trimming from the front without rebuilding the rest', () => {
    const l1: Line = [{ text: '1' }], l2: Line = [{ text: '2' }], l3: Line = [{ text: '3' }];
    const f = fakeDeps({ lines: [l1, l2, l3] });
    handle = mountTerminal(root, f.deps);
    const n2 = root.querySelectorAll('#term-lines > .ln')[1];
    f.update({ lines: [l2, l3, [{ text: '4' }]] });
    const nodes = root.querySelectorAll('#term-lines > .ln');
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toBe(n2);
    expect(root.querySelector('#term-lines')!.textContent).toBe('234');
  });

  it('shows the toy overlay while set', () => {
    const f = fakeDeps();
    handle = mountTerminal(root, f.deps);
    const ov = root.querySelector('#term-overlay') as HTMLElement;
    expect(ov.hidden).toBe(true);
    f.update({ overlay: [[{ text: 'rain', fg: 'green' }]], busy: true });
    expect(ov.hidden).toBe(false);
    expect(ov.textContent).toBe('rain');
    f.update({ overlay: null, busy: false });
    expect(ov.hidden).toBe(true);
  });

  it('a tap on the rain focuses the prompt (so a phone keyboard can stop it)', () => {
    const f = fakeDeps({ busy: true, overlay: [[{ text: 'rain' }]] });
    handle = mountTerminal(root, f.deps);
    const ov = root.querySelector('#term-overlay') as HTMLElement;
    expect(ov.closest('#term-screen')).toBeNull(); // never inside the scrolling log
    (document.activeElement as HTMLElement | null)?.blur();
    ov.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(document.activeElement).toBe(root.querySelector('#term-input'));
  });

  it('marks the form busy while a command runs', () => {
    const f = fakeDeps();
    handle = mountTerminal(root, f.deps);
    f.update({ busy: true });
    expect(root.querySelector('#term-form')!.getAttribute('data-busy')).toBe('true');
  });
});

describe('terminal-dom scrolling', () => {
  it('auto-scrolls to the bottom unless the user scrolled up', () => {
    const f = fakeDeps();
    handle = mountTerminal(root, f.deps);
    const screen = root.querySelector('#term-screen') as HTMLElement;
    let sh = 1000;
    Object.defineProperty(screen, 'scrollHeight', { configurable: true, get: () => sh });
    Object.defineProperty(screen, 'clientHeight', { configurable: true, get: () => 100 });
    screen.scrollTop = 900;
    screen.dispatchEvent(new Event('scroll'));
    sh = 1200;
    f.push([{ text: 'a' }]);
    expect(screen.scrollTop).toBe(1200);
    screen.scrollTop = 300;
    screen.dispatchEvent(new Event('scroll'));
    sh = 1400;
    f.push([{ text: 'b' }]);
    expect(screen.scrollTop).toBe(300);
  });
});

describe('terminal-dom keyboard', () => {
  it('Enter runs the input line and clears it', () => {
    const f = fakeDeps();
    handle = mountTerminal(root, f.deps);
    type(input, 'whoami');
    expect(f.state.input).toBe('whoami');
    const e = key(input, 'Enter');
    expect(e.defaultPrevented).toBe(true);
    expect(f.deps.run).toHaveBeenCalledWith('whoami');
    expect(f.state.input).toBe('');
  });

  it('form submit (mobile send key) runs once', () => {
    const f = fakeDeps();
    handle = mountTerminal(root, f.deps);
    type(input, 'help');
    root.querySelector('#term-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(f.deps.run).toHaveBeenCalledTimes(1);
    expect(f.deps.run).toHaveBeenCalledWith('help');
  });

  it('ArrowUp/ArrowDown walk history and restore the draft', () => {
    const f = fakeDeps({ history: ['ls', 'help'] });
    handle = mountTerminal(root, f.deps);
    type(input, 'dr');
    key(input, 'ArrowUp');
    expect(f.state.input).toBe('help');
    key(input, 'ArrowUp');
    expect(f.state.input).toBe('ls');
    key(input, 'ArrowUp');
    expect(f.state.input).toBe('ls');
    key(input, 'ArrowDown');
    expect(f.state.input).toBe('help');
    key(input, 'ArrowDown');
    expect(f.state.input).toBe('dr');
    expect(input.value).toBe('dr');
  });

  it('Tab completes a single candidate', () => {
    const f = fakeDeps();
    f.deps.complete.mockReturnValue({ replace: [0, 2], candidates: ['help'], insert: 'help ' });
    handle = mountTerminal(root, f.deps);
    type(input, 'he');
    const e = key(input, 'Tab');
    expect(e.defaultPrevented).toBe(true);
    expect(f.deps.complete).toHaveBeenCalledWith('he', 2);
    expect(f.state.input).toBe('help ');
    expect(f.state.cursor).toBe(5);
    expect((root.querySelector('#term-comp') as HTMLElement).hidden).toBe(true);
  });

  it('Tab lists multiple candidates', () => {
    const f = fakeDeps();
    f.deps.complete.mockReturnValue({ replace: [0, 1], candidates: ['cat', 'cd', 'clear'], insert: 'c' });
    handle = mountTerminal(root, f.deps);
    type(input, 'c');
    key(input, 'Tab');
    const comp = root.querySelector('#term-comp') as HTMLElement;
    expect(comp.hidden).toBe(false);
    expect(comp.textContent).toContain('cat');
    expect(comp.textContent).toContain('clear');
    type(input, 'ca');
    expect(comp.hidden).toBe(true);
  });

  it('Tab on an empty line leaves focus navigation alone (no keyboard trap)', () => {
    const f = fakeDeps();
    handle = mountTerminal(root, f.deps);
    const e = key(input, 'Tab');
    expect(e.defaultPrevented).toBe(false);
    expect(f.deps.complete).not.toHaveBeenCalled();
  });

  it('Ctrl+L clears (via deps.clear, else runs clear)', () => {
    const f = fakeDeps();
    handle = mountTerminal(root, f.deps);
    key(input, 'l', { ctrlKey: true });
    expect(f.deps.clear).toHaveBeenCalled();
    handle.destroy();
    const g = fakeDeps();
    const { clear: _drop, ...noClear } = g.deps;
    handle = mountTerminal(root, noClear);
    key(input, 'l', { ctrlKey: true });
    expect(g.deps.run).toHaveBeenCalledWith('clear');
  });

  it('Ctrl+C interrupts, but leaves copying a selection alone', () => {
    const f = fakeDeps();
    handle = mountTerminal(root, f.deps);
    const e = key(input, 'c', { ctrlKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(f.deps.interrupt).toHaveBeenCalledTimes(1);
    type(input, 'hello');
    input.setSelectionRange(0, 3);
    const e2 = key(input, 'c', { ctrlKey: true });
    expect(e2.defaultPrevented).toBe(false);
    expect(f.deps.interrupt).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+U kills to line start, Ctrl+W kills a word, Ctrl+A/E move', () => {
    const f = fakeDeps();
    handle = mountTerminal(root, f.deps);
    type(input, 'ls foo bar');
    key(input, 'w', { ctrlKey: true });
    expect(f.state.input).toBe('ls foo ');
    expect(f.state.cursor).toBe(7);
    key(input, 'a', { ctrlKey: true });
    expect(f.state.cursor).toBe(0);
    key(input, 'e', { ctrlKey: true });
    expect(f.state.cursor).toBe(7);
    f.deps.store.setInput('hello world', 5);
    key(input, 'u', { ctrlKey: true });
    expect(f.state.input).toBe(' world');
    expect(f.state.cursor).toBe(0);
  });

  it('Ctrl+R reverse-searches history; Ctrl+R again goes older; Enter runs', () => {
    const f = fakeDeps({ history: ['ls', 'help', 'whoami', 'cat about.md'] });
    handle = mountTerminal(root, f.deps);
    key(input, 'r', { ctrlKey: true });
    const prompt = root.querySelector('#term-prompt')!;
    expect(prompt.textContent).toContain('reverse-i-search');
    type(input, 'h');
    expect(root.querySelector('#term-mirror')!.textContent).toContain('whoami');
    key(input, 'r', { ctrlKey: true });
    expect(root.querySelector('#term-mirror')!.textContent).toContain('help');
    key(input, 'Enter');
    expect(f.deps.run).toHaveBeenCalledWith('help');
    expect(prompt.textContent).toBe('[alxnko@nitro ~]$ ');
  });

  it('Ctrl+R: Escape accepts into the line, Ctrl+G cancels', () => {
    const f = fakeDeps({ history: ['fastfetch'] });
    handle = mountTerminal(root, f.deps);
    type(input, 'draft');
    key(input, 'r', { ctrlKey: true });
    type(input, 'fast');
    key(input, 'Escape');
    expect(f.state.input).toBe('fastfetch');
    expect(f.deps.run).not.toHaveBeenCalled();
    key(input, 'r', { ctrlKey: true });
    type(input, 'zzz');
    expect(root.querySelector('#term-prompt')!.textContent).toContain('failed');
    key(input, 'g', { ctrlKey: true });
    expect(f.state.input).toBe('fastfetch');
  });

  it('Ctrl+R prefers deps.historySearch when provided', () => {
    const f = fakeDeps({ history: ['a'] });
    const historySearch = vi.fn(() => 'from-store');
    handle = mountTerminal(root, { ...f.deps, historySearch });
    key(input, 'r', { ctrlKey: true });
    type(input, 'fr');
    expect(historySearch).toHaveBeenCalledWith('fr');
    expect(root.querySelector('#term-mirror')!.textContent).toContain('from-store');
  });

  it('any key interrupts a running full-screen toy', () => {
    const f = fakeDeps({ busy: true, overlay: [[{ text: 'x' }]] });
    handle = mountTerminal(root, f.deps);
    key(input, 'q');
    expect(f.deps.interrupt).toHaveBeenCalled();
  });

  it('reports activity and focus', () => {
    const f = fakeDeps();
    const onActivity = vi.fn();
    const onFocus = vi.fn();
    handle = mountTerminal(root, { ...f.deps, onActivity, onFocus });
    handle.focus();
    expect(document.activeElement).toBe(input);
    expect(onFocus).toHaveBeenCalled();
    key(input, 'a');
    expect(onActivity).toHaveBeenCalled();
  });
});

describe('terminal-dom chips', () => {
  it('a chip click runs its command', () => {
    const f = fakeDeps();
    handle = mountTerminal(root, f.deps);
    (root.querySelector('[data-cmd="ls monitor"]') as HTMLButtonElement).click();
    expect(f.deps.run).toHaveBeenCalledWith('ls monitor');
  });

  it('destroy detaches listeners and the store subscription', () => {
    const f = fakeDeps();
    handle = mountTerminal(root, f.deps);
    handle.destroy();
    handle = null;
    (root.querySelector('[data-cmd="help"]') as HTMLButtonElement).click();
    f.push([{ text: 'late' }]);
    expect(f.deps.run).not.toHaveBeenCalled();
    expect(root.querySelector('#term-lines')!.textContent).not.toContain('late');
  });
});
