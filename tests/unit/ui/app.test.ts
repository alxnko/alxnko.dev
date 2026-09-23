// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TermState } from '../../../src/term/types';
import { fillNotFound, start, type App } from '../../../src/ui/app';

function page() {
  document.documentElement.dataset.theme = 'dark';
  const mk = (tag: string, id: string, attrs: Record<string, string> = {}) => {
    const n = document.createElement(tag);
    n.id = id;
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const term = mk('section', 'term');
  const screen = mk('div', 'term-screen');
  screen.append(mk('div', 'term-lines'), mk('div', 'term-comp'), mk('div', 'term-overlay'));
  const form = mk('form', 'term-form');
  form.append(mk('span', 'term-prompt'), mk('div', 'term-mirror'), mk('input', 'term-input'));
  term.append(screen, form);
  document.body.replaceChildren(
    mk('button', 't-theme', { 'aria-pressed': 'false' }),
    mk('button', 't-sound', { 'aria-pressed': 'false' }),
    mk('a', 'link', { href: '/x' }),
    term,
  );
}

function fakeTerm() {
  let state: TermState = { lines: [], input: '', cursor: 0, cwd: '/', busy: false, history: [], overlay: null, version: 0 };
  const subs = new Set<(s: TermState) => void>();
  return {
    store: {
      get state() { return state; },
      subscribe(f: (s: TermState) => void) { subs.add(f); return () => subs.delete(f); },
      setInput(text: string, cursor = text.length) { state = { ...state, input: text, cursor, version: state.version + 1 }; subs.forEach((f) => f(state)); },
      prompt: () => [{ text: '$ ' }],
    },
    run: vi.fn(async () => {}),
    interrupt: vi.fn(),
    complete: () => ({ replace: [0, 0] as [number, number], candidates: [], insert: null }),
  };
}

let app: App | null = null;
beforeEach(() => {
  localStorage.clear();
  page();
});
afterEach(() => {
  app?.destroy();
  app = null;
});

describe('app', () => {
  it('theme toggle flips data-theme, persists and updates aria-pressed', () => {
    app = start({ createTerm: fakeTerm });
    const btn = document.getElementById('t-theme')!;
    btn.click();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('alxnko:theme')).toBe('light');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    btn.click();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('sound toggle persists and notifies', () => {
    const onSound = vi.fn();
    app = start({ createTerm: fakeTerm, onSound });
    const btn = document.getElementById('t-sound')!;
    btn.click();
    expect(localStorage.getItem('alxnko:sound')).toBe('on');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(onSound).toHaveBeenCalledWith('on');
  });

  it('a printable key with nothing editable focused types into the terminal', () => {
    const term = fakeTerm();
    app = start({ createTerm: () => term });
    (document.getElementById('link') as HTMLElement).focus();
    const e = new KeyboardEvent('keydown', { key: 'h', bubbles: true, cancelable: true });
    document.getElementById('link')!.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(term.store.state.input).toBe('h');
    expect(document.activeElement?.id).toBe('term-input');
  });

  it('space on a focused link is left alone; modifier chords are ignored', () => {
    const term = fakeTerm();
    app = start({ createTerm: () => term });
    const link = document.getElementById('link')!;
    link.focus();
    link.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(term.store.state.input).toBe('');
  });

  it('boots fully on the first visit only', async () => {
    const boot = vi.fn();
    app = start({ createTerm: fakeTerm, boot });
    expect(boot).toHaveBeenLastCalledWith(true);
    app.destroy();
    page();
    app = start({ createTerm: fakeTerm, boot });
    expect(boot).toHaveBeenLastCalledWith(false);
  });

  it('fills the 404 path as text', () => {
    const s = document.createElement('span');
    s.className = 'nf-path';
    document.body.append(s);
    fillNotFound('/a%20b/<img>');
    expect(s.textContent).toBe('/a b/<img>');
    expect(s.querySelector('img')).toBeNull();
  });
});
