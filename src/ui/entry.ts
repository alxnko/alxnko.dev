// Page entry. ISOLATED ON PURPOSE: `localShell` is a small self-contained shell so the page
// is complete on its own; at integration this file is swapped to wire the real terminal core
// (src/term/store.ts, exec.ts, complete.ts). Nothing else imports from here.
import type { Color, Line, TermState } from '../term/types';
import { CONTACTS, SITE } from '../content/site';
import * as prefs from '../lib/prefs';
import { start } from './app';
import type { TermDeps } from './terminal-dom';
import { setTheme } from './theme';

const t = (text: string, fg?: Color): Line => [{ text, fg }];
const kv = (k: string, v: string): Line => [{ text: k.padEnd(8), fg: 'muted' }, { text: v }];
const CAT = [' /\\_/\\ ', '( o.o )', ' > ^ < '];

function localShell(): TermDeps & { boot(first: boolean): Promise<void> } {
  const subs = new Set<(s: TermState) => void>();
  let history: string[] = [];
  try {
    history = (JSON.parse(prefs.get('history') ?? '[]') as unknown[]).filter((x): x is string => typeof x === 'string');
  } catch { /* fresh history */ }
  let state: TermState = {
    lines: [], input: '', cursor: 0, cwd: `/home/${SITE.handle}`, busy: false, history, overlay: null, version: 0,
  };
  let desk = 0.74;
  let abort: AbortController | null = null;
  const set = (p: Partial<TermState>) => {
    state = { ...state, ...p, version: state.version + 1 };
    subs.forEach((f) => f(state));
  };
  const out = (...ls: Line[]) => set({ lines: [...state.lines, ...ls].slice(-500) });
  const prompt = (): Line => [{ text: `[${SITE.handle}@${SITE.host} ` }, { text: '~', fg: 'green' }, { text: ']$ ' }];
  const m = (h: number) => `${h.toFixed(2)} m`;

  const CMDS: Record<string, [string, (a: string[]) => Line[]]> = {
    help: ['this list', () => [
      t('commands:', 'muted'),
      ...Object.entries(CMDS).map(([k, [d]]) => [{ text: '  ' + k.padEnd(11), fg: 'white' as Color }, { text: d, fg: 'muted' as Color }]),
    ]],
    whoami: ['who is at the desk', () => [t(SITE.handle)]],
    ls: ['list files (try: ls monitor)', (a) => (a[0] ?? '').replace(/\/$/, '') === 'monitor'
      ? CONTACTS.map((c) => [{ text: `${c.label}.lnk`.padEnd(15), fg: 'cyan' as Color }, { text: c.display, href: c.href }])
      : [[{ text: 'about.md  ' }, { text: 'desk/  laptop/  monitor/', fg: 'blue' }]]],
    fastfetch: ['system summary', () => {
      const rows = [
        [{ text: `${SITE.handle}@${SITE.host}`, bold: true }],
        t('-------------', 'dim'),
        kv('os', `${SITE.os} rolling`),
        kv('role', `${SITE.role} · ${SITE.company}`),
        kv('locale', `${SITE.country} · ${SITE.coords}`),
        kv('rank', SITE.rank.short),
      ];
      return rows.map((r, i) => [{ text: (CAT[i] ?? '').padEnd(10), fg: 'green' as Color }, ...r]);
    }],
    desk: ['raise/lower the desk: up, down, 1, 2, 3', (a) => {
      const was = desk;
      const preset = { '1': 0.74, '2': 0.95, '3': 1.12 }[a[0] ?? ''];
      if (a[0] === 'up') desk = Math.min(1.2, desk + 0.05);
      else if (a[0] === 'down') desk = Math.max(0.7, desk - 0.05);
      else if (preset) desk = preset;
      else return [t(`desk: height ${m(desk)}`)];
      return [t(`desk: ${m(was)} → ${m(desk)}`)];
    }],
    theme: ['day | night', (a) => {
      if (a[0] !== 'day' && a[0] !== 'night') return [t('usage: theme day|night', 'muted')];
      setTheme(a[0] === 'day' ? 'light' : 'dark');
      return [t(`theme: ${a[0]}`)];
    }],
    echo: ['print text', (a) => [t(a.join(' '))]],
    clear: ['clear the screen (ctrl+l)', () => []],
  };

  const shell = {
    store: {
      get state() { return state; },
      subscribe(fn: (s: TermState) => void) { subs.add(fn); return () => void subs.delete(fn); },
      setInput(text: string, cursor = text.length) { set({ input: text.slice(0, 256), cursor: Math.min(cursor, 256) }); },
      prompt,
    },
    async run(line: string) {
      const echo: Line = [...prompt(), { text: line }];
      const [name, ...args] = line.trim().split(/\s+/);
      if (line.trim()) {
        const h = [...state.history.filter((x) => x !== line.trim()), line.trim()].slice(-100);
        prefs.set('history', JSON.stringify(h));
        set({ history: h });
      }
      if (name === 'clear') return set({ lines: [] });
      if (!name) return out(echo);
      const cmd = CMDS[name];
      out(echo, ...(cmd ? cmd[1](args) : [t(`bash: ${name}: command not found`)]));
    },
    interrupt() {
      if (abort) return abort.abort();
      out([...prompt(), { text: state.input }, { text: '^C', fg: 'muted' }]);
      set({ input: '', cursor: 0 });
    },
    clear() { set({ lines: [] }); },
    complete(line: string, cursor: number) {
      const head = line.slice(0, cursor);
      const word = /\S*$/.exec(head)![0];
      const start = cursor - word.length;
      const pool = head.trimStart().includes(' ') ? ['desk/', 'laptop/', 'monitor/', 'about.md'] : Object.keys(CMDS);
      const candidates = pool.filter((c) => c.startsWith(word));
      if (!candidates.length) return { replace: [start, cursor] as [number, number], candidates, insert: null };
      let p = candidates[0];
      for (const c of candidates) while (!c.startsWith(p)) p = p.slice(0, -1);
      const insert = candidates.length === 1 ? p + (p.endsWith('/') ? '' : ' ') : p;
      return { replace: [start, cursor] as [number, number], candidates, insert };
    },
    async boot(first: boolean) {
      const motd = [t(`${SITE.os} rolling · ${SITE.host} tty1`, 'muted'), t('type help, or pick a command below.', 'muted'), []];
      if (!first) return out(...motd);
      abort = new AbortController();
      const { signal } = abort;
      set({ busy: true });
      for (const s of [`Mounted /home/${SITE.handle}.`, 'Started fan speed controller.', `Reached target desk (${m(desk)}).`, 'Started getty on tty1.']) {
        await new Promise((r) => setTimeout(r, 260));
        if (signal.aborted) break;
        out([{ text: '[' }, { text: '  OK  ', fg: 'green' }, { text: '] ' + s }]);
      }
      abort = null;
      set({ busy: false });
      out([], ...motd);
    },
  };
  return shell;
}

const shell = localShell();
start({ createTerm: () => shell, boot: (first) => shell.boot(first) });
