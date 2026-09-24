// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { TermStore } from '../../../src/term/store';
import { b, fg, link, text } from '../../../src/term/format';
import { HOME } from '../../../src/term/vfs';

beforeEach(() => localStorage.clear());

describe('TermStore', () => {
  it('print appends and bumps the version', () => {
    const s = new TermStore();
    const v = s.state.version;
    s.print('hello');
    expect(s.state.lines).toEqual([[{ text: 'hello' }]]);
    expect(s.state.version).toBe(v + 1);
  });

  it('splits multi-line strings into lines', () => {
    const s = new TermStore();
    s.print('a\nb');
    expect(s.state.lines.map(text)).toEqual(['a', 'b']);
  });

  it('notifies subscribers exactly once per mutation, and unsubscribes', () => {
    const s = new TermStore();
    let n = 0;
    const off = s.subscribe(() => n++);
    s.print('a');
    s.printAll(['b', 'c']);
    s.setInput('x');
    s.setCwd('/etc');
    s.setBusy(true);
    s.setOverlay([[{ text: 'm' }]]);
    s.clear();
    expect(n).toBe(7);
    off();
    s.print('d');
    expect(n).toBe(7);
  });

  it('trims the oldest lines past maxLines', () => {
    const s = new TermStore({ maxLines: 3 });
    s.printAll(['1', '2', '3', '4', '5']);
    expect(s.state.lines.map(text)).toEqual(['3', '4', '5']);
    expect(s.trimmed).toBe(2);
    s.clear();
    expect(s.state.lines).toEqual([]);
    expect(s.trimmed).toBe(0);
  });

  it('defaults to 500 lines', () => {
    const s = new TermStore();
    for (let i = 0; i < 600; i++) s.print(String(i));
    expect(s.state.lines).toHaveLength(500);
    expect(text(s.state.lines[0])).toBe('100');
  });

  it('clamps input to 256 chars and the cursor into range', () => {
    const s = new TermStore();
    s.setInput('x'.repeat(300));
    expect(s.state.input).toHaveLength(256);
    expect(s.state.cursor).toBe(256);
    s.setInput('abc', 99);
    expect(s.state.cursor).toBe(3);
    s.setInput('abc', -4);
    expect(s.state.cursor).toBe(0);
    s.setInput('abc', 1);
    expect(s.state.cursor).toBe(1);
  });

  it('history dedupes consecutive entries, caps at 100 and persists', () => {
    const s = new TermStore();
    s.pushHistory('ls');
    s.pushHistory('ls');
    s.pushHistory('pwd');
    s.pushHistory('ls');
    s.pushHistory('   ');
    expect(s.state.history).toEqual(['ls', 'pwd', 'ls']);
    for (let i = 0; i < 150; i++) s.pushHistory('c' + i);
    expect(s.state.history).toHaveLength(100);
    expect(s.state.history.at(-1)).toBe('c149');
    const again = new TermStore();
    expect(again.state.history).toEqual(s.state.history);
    expect(localStorage.getItem('alxnko:history')).not.toBeNull();
  });

  it('survives corrupt persisted history', () => {
    localStorage.setItem('alxnko:history', '{nope');
    expect(new TermStore().state.history).toEqual([]);
    localStorage.setItem('alxnko:history', JSON.stringify([1, 'ok', null]));
    expect(new TermStore().state.history).toEqual(['ok']);
  });

  it('honours a custom history key', () => {
    const s = new TermStore({ historyKey: 'h2' });
    s.pushHistory('x');
    expect(localStorage.getItem('alxnko:h2')).toBe('["x"]');
  });

  it('prompt() renders ~ for HOME and absolute paths elsewhere', () => {
    const s = new TermStore();
    expect(text(s.prompt())).toBe('[alxnko@nitro ~]$ ');
    s.setCwd('/etc');
    expect(text(s.prompt())).toBe('[alxnko@nitro /etc]$ ');
    s.setCwd(HOME + '/monitor');
    expect(text(s.prompt())).toBe('[alxnko@nitro ~/monitor]$ ');
    expect(s.prompt().some((sp) => sp.fg === 'accent')).toBe(true);
  });

  it('setOverlay sets and clears the overlay frame', () => {
    const s = new TermStore();
    s.setOverlay([[{ text: 'x' }]]);
    expect(s.state.overlay).toHaveLength(1);
    s.setOverlay(null);
    expect(s.state.overlay).toBeNull();
  });

  it('setQueued holds at most one pending line; a later call replaces it, null drops it', () => {
    const s = new TermStore();
    expect(s.state.queued).toBeNull();
    s.setQueued('whoami');
    expect(s.state.queued).toBe('whoami');
    s.setQueued('pwd'); // a later Enter replaces it, never stacks
    expect(s.state.queued).toBe('pwd');
    s.setQueued(null); // ^C drops it
    expect(s.state.queued).toBeNull();
  });

  it('strips non-allowlisted hrefs on print (defense in depth)', () => {
    const s = new TermStore();
    s.print([{ text: 'evil', href: 'https://evil.example' }, { text: 'gh', href: 'https://github.com/alxnko' }]);
    expect(s.state.lines[0][0].href).toBeUndefined();
    expect(s.state.lines[0][1].href).toBe('https://github.com/alxnko');
  });
});

describe('format', () => {
  it('fg and b build spans', () => {
    expect(fg('red', 'x')).toEqual({ text: 'x', fg: 'red' });
    expect(b('x')).toEqual({ text: 'x', bold: true });
    expect(b('x', 'amber')).toEqual({ text: 'x', bold: true, fg: 'amber' });
  });

  it('link only sets href for allowlisted URLs', () => {
    expect(link('gh', 'https://github.com/alxnko').href).toBe('https://github.com/alxnko');
    const bad = link('x', 'javascript:alert(1)');
    expect(bad.href).toBeUndefined();
    expect(bad.text).toBe('x');
    expect(link('x', 'https://github.com/alxnko/../evil').href).toBeUndefined();
  });
});
