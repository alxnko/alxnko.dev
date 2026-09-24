// @vitest-environment happy-dom
import { TermStore } from '../../../src/term/store';
import { Shell } from '../../../src/term/exec';
import { NullWorld } from '../../../src/term/world';
import { CAT_MARK } from '../../../src/content/mark';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bootLines } from '../../../src/term/boot';
import { PALETTE, text } from '../../../src/term/format';
import { HOME } from '../../../src/term/vfs';
import { setup } from './harness';
import { PRESET_NAMES, PRESETS } from '../../../src/lib/rgb';

beforeEach(() => localStorage.clear());

describe('info commands', () => {
  it('help lists groups and visible commands, never hidden ones or projects', async () => {
    const { out } = setup();
    const h = await out('help');
    expect(h).toContain('meowOS, bash 5.3');
    // the most fun or useful first, then the groups
    expect(h.indexOf('start here')).toBeLessThan(h.indexOf('\ninfo\n'));
    expect(h.split('\n').filter((l) => l.startsWith('  ')).slice(0, 3).map((l) => l.trim().split(' ')[0])).toEqual(['fastfetch', 'contacts', 'tour']);
    for (const g of ['start here', 'info', 'files', 'world', 'fun', 'text']) expect(h).toMatch(new RegExp(`^${g}$`, 'm'));
    for (const cmd of ['help', 'man', 'fastfetch', 'ls', 'cd', 'open', 'desk', 'theme', 'rgb', 'fan', 'sound', 'meow', 'catsay', 'cmatrix', 'pacman', 'grep'])
      expect(h).toMatch(new RegExp(`^  ${cmd} `, 'm'));
    expect(h).not.toMatch(/^ {2}sudo/m);
    expect(h).not.toMatch(/^ {2}(color|colour|ring) /m); // rgb's aliases work but are not listed
    expect(h).not.toMatch(/project/i);
  });

  it('man prints name, synopsis and description', async () => {
    const { out } = setup();
    const m = await out('man ls');
    expect(m).toMatch(/^LS\(1\) .* LS\(1\)$/m);
    expect(m).toContain('NAME\n       ls - list directory contents');
    expect(m).toContain('SYNOPSIS\n       ls [-la] [path...]');
    expect(m).toContain('DESCRIPTION');
  });

  it('man without argument, unknown and hidden pages', async () => {
    const { out } = setup();
    expect(await out('man; echo $?')).toBe("What manual page do you want?\nFor example, try 'man man'.\n1");
    expect(await out('man nope')).toBe('No manual entry for nope');
    expect(await out('man sudo')).toBe('No manual entry for sudo');
  });

  it('whoami and whoami -v', async () => {
    const { out, run } = setup();
    expect(await out('whoami')).toBe('alxnko');
    expect(await out('whoami -v')).toBe('Alex Neko (alxnko) · tech lead · Kyrgyzstan · #1 committer in Kyrgyzstan');
    const [line] = await run('whoami -v');
    expect(line.find((s) => s.href)?.href).toBe('https://committers.top/kyrgyzstan_private');
  });

  it('fastfetch: green cat mark beside facts, contact links, 8 swatches', async () => {
    const { run, tick } = setup();
    tick(3 * 60_000 + 5000);
    const lines = await run('fastfetch');
    const t = lines.map(text);
    for (let i = 0; i < CAT_MARK.length; i++) expect(lines[i][0].fg).toBe('accent'); // the rgb accent
    const all = t.join('\n');
    expect(all).toContain('alxnko@nitro');
    for (const re of [
      /os\s+meowOS x86_64/,
      /host\s+nitro/,
      /kernel\s+7\.2\.6-meow/,
      /uptime\s+3 mins/,
      /shell\s+bash 5\.3/,
      /role\s+tech lead$/m,
      /loc\s+Kyrgyzstan$/m,
      /rank\s+#1 committer in KG/,
      /gh\s+github\.com\/alxnko/,
      /mail\s+aleksandrnyrko@gmail\.com/,
    ])
      expect(all).toMatch(re);
    const hrefs = lines.flat().filter((s) => s.href).map((s) => s.href);
    expect(hrefs).toEqual(expect.arrayContaining(['https://github.com/alxnko', 'https://t.me/ALXNK0', 'mailto:aleksandrnyrko@gmail.com', 'https://committers.top/kyrgyzstan_private']));
    const swatch = lines.at(-1)!.filter((s) => s.text.includes('█'));
    expect(swatch.map((s) => s.fg)).toEqual([...PALETTE]);
  });

  it('fastfetch --compact drops contacts and swatches', async () => {
    const { out } = setup();
    const t = await out('fastfetch --compact');
    expect(t).toContain('meowOS');
    expect(t).not.toContain('github.com');
    expect(t).not.toMatch(/█{24}/);
  });

  it('uname', async () => {
    const { out } = setup();
    expect(await out('uname')).toBe('Linux');
    expect(await out('uname -a')).toBe('Linux nitro 7.2.6-meow #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux');
    expect(await out('uname -r')).toBe('7.2.6-meow');
    expect(await out('uname -m')).toBe('x86_64');
    expect(await out('uname -n')).toBe('nitro');
    expect(await out('uname -z')).toBe("uname: invalid option -- 'z'");
  });

  it('uptime', async () => {
    const { out, tick } = setup();
    tick(125_000);
    expect(await out('uptime')).toBe(' 14:04:16 up 2 min,  1 user,  load average: 0.08, 0.03, 0.01');
    expect(await out('uptime -p')).toBe('up 2 minutes');
    tick(3600_000);
    expect(await out('uptime')).toMatch(/ up {2}1:02, {2}1 user/);
    expect(await out('uptime -p')).toBe('up 1 hour, 2 minutes');
  });

  it('date is Bishkek time', async () => {
    const { out } = setup();
    expect(await out('date')).toBe('Wed Sep 23 14:02:11 +06 2026');
    expect(await out('date -u')).toBe('Wed Sep 23 08:02:11 UTC 2026');
    expect(await out('date tomorrow')).toBe("date: invalid date 'tomorrow'");
  });

  it('echo and hostname', async () => {
    const { out } = setup();
    expect(await out('echo a   b "c  d"')).toBe('a b c  d');
    expect(await out('echo -n x')).toBe('x');
    expect(await out('echo')).toBe('');
    expect(await out('hostname')).toBe('nitro');
  });
});

describe('filesystem commands', () => {
  it('ls colours dirs blue with / and links cyan', async () => {
    const { run, out } = setup();
    expect(await out('ls')).toBe('about.md  desk/  laptop/  monitor/');
    const [line] = await run('ls');
    expect(line.find((s) => s.text === 'desk/')?.fg).toBe('blue');
    const [mon] = await run('ls monitor');
    expect(text(mon)).toBe('email.lnk  github.lnk  instagram.lnk  linkedin.lnk  telegram.lnk');
    expect(mon.find((s) => s.text === 'github.lnk')?.fg).toBe('cyan');
  });

  it('ls -a shows dotfiles, ls -la long format', async () => {
    const { out } = setup();
    expect(await out('ls -a')).toBe('./  ../  .config/  about.md  desk/  laptop/  monitor/');
    const l = await out('ls -la ~');
    expect(l).toMatch(/^total \d+$/m);
    expect(l).toMatch(/^drwxr-xr-x \d alxnko alxnko +4096 Sep 23 \d\d:\d\d \.config\/$/m);
    expect(l).toMatch(/^-rw-r--r-- 1 alxnko alxnko +\d+ Sep 23 \d\d:\d\d about\.md$/m);
    const m = await out('ls -l monitor');
    expect(m).toMatch(/^lrwxrwxrwx 1 alxnko alxnko +\d+ .* github\.lnk -> https:\/\/github\.com\/alxnko$/m);
    expect(await out('ls -l /etc')).toMatch(/root root/);
  });

  it('ls in a pipe prints one name per line', async () => {
    const { out } = setup();
    expect(await out('ls | head -n 2')).toBe('about.md\ndesk/');
  });

  it('ls errors', async () => {
    const { out } = setup();
    expect(await out('ls nope; echo $?')).toBe("ls: cannot access 'nope': No such file or directory\n2");
    expect(await out('ls -z')).toBe("ls: invalid option -- 'z'");
    expect(await out('ls about.md')).toBe('about.md');
  });

  it('cd flies to landmarks', async () => {
    const { out, store, world } = setup();
    await out('cd monitor');
    expect(store.state.cwd).toBe(HOME + '/monitor');
    expect(world.get().landmark).toBe('monitor');
    await out('cd ../laptop');
    expect(world.get().landmark).toBe('laptop');
    await out('cd /');
    expect(store.state.cwd).toBe('/');
    expect(world.get().landmark).toBe('wide');
    await out('cd');
    expect(store.state.cwd).toBe(HOME);
    expect(world.get().landmark).toBe('desk');
    await out('cd /etc');
    expect(world.get().landmark).toBe('desk');
    expect(await out('cd -')).toBe(HOME);
    expect(store.state.cwd).toBe(HOME);
    await out('cd ~');
    expect(store.state.cwd).toBe(HOME);
  });

  it('cd errors', async () => {
    const { out } = setup();
    expect(await out('cd nope')).toBe('bash: cd: nope: No such file or directory');
    expect(await out('cd about.md')).toBe('bash: cd: about.md: Not a directory');
    expect(await out('cd a b')).toBe('bash: cd: too many arguments');
  });

  it('pwd', async () => {
    const { out } = setup();
    expect(await out('pwd')).toBe('/home/alxnko');
    expect(await out('cd desk && pwd')).toBe('/home/alxnko/desk');
  });

  it('cat reads files, links and live desk state', async () => {
    const { out, run, world } = setup();
    expect(await out('cat about.md')).toContain('# Alex Neko (alxnko)');
    expect(await out('cat desk/height')).toBe('74 cm');
    world.setFan(3);
    expect(await out('cat desk/fan')).toBe('3');
    expect(await out('cat ~/.config/theme')).toBe('night');
    const [l] = await run('cat monitor/github.lnk');
    expect(l[0].href).toBe('https://github.com/alxnko');
    expect(await out('cat /etc/hostname /etc/os-release')).toMatch(/^nitro\nNAME="meowOS"/);
    expect(await out('echo hi | cat')).toBe('hi');
  });

  it('cat about.md auto-links the rank url', async () => {
    const { run } = setup();
    const lines = await run('cat about.md');
    expect(lines.flat().some((s) => s.href === 'https://committers.top/kyrgyzstan_private')).toBe(true);
  });

  it('cat errors', async () => {
    const { out } = setup();
    expect(await out('cat desk')).toBe('cat: desk: Is a directory');
    expect(await out('cat nope')).toBe('cat: nope: No such file or directory');
  });

  it('tree', async () => {
    const { out } = setup();
    const t = await out('tree');
    expect(t.split('\n')[0]).toBe('.');
    expect(t).toContain('├── about.md');
    expect(t).toContain('│   ├── fan');
    expect(t).toContain('└── monitor');
    expect(t).toContain('    └── telegram.lnk -> https://t.me/ALXNK0');
    expect(t).toMatch(/3 directories, 10 files$/);
    expect(await out('tree -a')).toContain('.config');
    expect(await out('tree /etc')).toMatch(/^\/etc\n/);
    expect(await out('tree nope')).toBe('nope [error opening dir]\n\n0 directories, 0 files');
  });

  it('open accepts contacts, shorts, paths and allowlisted urls', async () => {
    const { out, run, opened } = setup();
    expect(await out('open gh')).toBe('opening https://github.com/alxnko');
    expect(await out('open telegram')).toBe('opening https://t.me/ALXNK0');
    expect(await out('open monitor/email.lnk')).toBe('opening mailto:aleksandrnyrko@gmail.com');
    expect(await out('open https://linkedin.com/in/alxnko')).toBe('opening https://linkedin.com/in/alxnko');
    const [l] = await run('open ig');
    expect(l.find((s) => s.href)?.href).toBe('https://instagram.com/alxnko');
    expect(opened).toEqual([
      'https://github.com/alxnko',
      'https://t.me/ALXNK0',
      'mailto:aleksandrnyrko@gmail.com',
      'https://linkedin.com/in/alxnko',
      'https://instagram.com/alxnko',
    ]);
  });

  it('open rejects everything else', async () => {
    const { out, run, opened } = setup();
    expect(await out('open https://evil.example; echo $?')).toBe("open: refusing to open 'https://evil.example': not in the allowlist\n1");
    expect(await out('open javascript:alert(1)')).toBe("open: refusing to open 'javascript:alert(1)': not in the allowlist");
    expect(await out('open about.md')).toBe('open: about.md: not a link (try cat)');
    expect(await out('open monitor')).toBe('open: monitor: is a directory (try cd)');
    expect(await out('open nope')).toBe('open: nope: No such file or directory');
    expect(await out('open')).toBe('usage: open <github|telegram|linkedin|instagram|email|path>');
    const lines = await run('open https://evil.example');
    expect(lines.flat().some((s) => s.href)).toBe(false);
    expect(opened).toEqual([]);
  });
});

describe('session commands', () => {
  it('history is numbered', async () => {
    const { out } = setup();
    await out('pwd');
    await out('whoami');
    expect(await out('history')).toBe('    1  pwd\n    2  whoami\n    3  history');
    expect(await out('history 1')).toBe('    4  history 1');
  });

  it('clear empties the scrollback', async () => {
    const { store, shell } = setup();
    await shell.run('pwd');
    await shell.run('clear');
    expect(store.state.lines).toEqual([]);
  });

  it('exit prints logout and flies wide', async () => {
    const { out, world } = setup();
    expect(await out('exit')).toBe('logout');
    expect(world.get().landmark).toBe('wide');
  });
});

describe('world commands', () => {
  it('theme', async () => {
    const { out, world } = setup();
    expect(await out('theme day')).toBe('theme: day');
    expect(world.get().theme).toBe('light');
    expect(await out('theme night')).toBe('theme: night');
    expect(world.get().theme).toBe('dark');
    expect(await out('theme')).toBe('theme: day');
    expect(await out('theme toggle')).toBe('theme: night');
    expect(await out('theme blue; echo $?')).toBe("theme: invalid theme 'blue' (day|night|toggle)\n2");
  });

  it('desk moves and awaits the world', async () => {
    const { out, world } = setup();
    const spy = vi.spyOn(world, 'setDesk');
    expect(await out('desk 2')).toBe('desk: moving to 95 cm…\ndesk: 95 cm');
    expect(spy).toHaveBeenCalledWith(0.95);
    expect(world.get().desk).toBe(0.95);
    expect(await out('desk 3')).toBe('desk: moving to 112 cm…\ndesk: 112 cm');
    expect(await out('desk up')).toBe('desk: moving to 117 cm…\ndesk: 117 cm');
    expect(await out('desk up')).toBe('desk: moving to 120 cm…\ndesk: 120 cm');
    expect(await out('desk up')).toBe('desk: 120 cm is as high as it goes');
    expect(await out('desk 1')).toBe('desk: moving to 74 cm…\ndesk: 74 cm');
    expect(await out('desk 1')).toBe('desk: already at 74 cm');
    expect(await out('desk down')).toBe('desk: moving to 70 cm…\ndesk: 70 cm');
    expect(await out('desk down')).toBe('desk: 70 cm is as low as it goes');
    expect(await out('desk')).toBe('desk: 70 cm');
    expect(await out('desk 9; echo $?')).toBe("desk: invalid position '9' (1|2|3|up|down)\n2");
  });

  it('rgb: presets, hex, off/on, and the aliases', async () => {
    const { out, run, world } = setup();
    const shown = await run('rgb');
    expect(shown.map(text)).toEqual([
      'rgb: green',
      'presets: green purple red orange amber yellow cyan blue pink white',
      'or any hex: #ff8800, and off',
    ]);
    // every preset is a chip that runs it
    expect(shown[1].filter((s) => s.run).map((s) => s.run)).toEqual(PRESET_NAMES.map((n) => `rgb ${n}`));
    // each chip is drawn in its own preset's dark shade (made for the dark terminal)
    expect(shown[1].filter((s) => s.run).map((s) => s.swatch)).toEqual(PRESET_NAMES.map((n) => PRESETS[n].dark));
    expect(await out('rgb purple')).toBe('rgb: purple');
    expect(world.get()).toMatchObject({ rgb: 'purple', accent: 'purple' });
    expect(await out('rgb #F0A')).toBe('rgb: #ff00aa');
    expect(await out('rgb #00FF82')).toBe('rgb: green'); // a preset's own fill is the preset
    expect(await out('rgb #ff00ff')).toBe('rgb: #ff00ff');
    expect(await out('rgb off')).toBe('rgb: off (the lights are off; the accent stays #ff00ff)');
    expect(world.get()).toMatchObject({ rgb: 'off', accent: '#ff00ff' });
    expect(await out('rgb')).toContain('and on');
    expect(await out('rgb on')).toBe('rgb: #ff00ff');
    for (const alias of ['color', 'colour', 'ring']) expect(await out(`${alias} cyan`)).toBe('rgb: cyan');
    expect(world.get().rgb).toBe('cyan');
    // the aliases have rgb's help and manual page
    expect(await out('man colour')).toContain('rgb - one color for the lights, keys, cat and accent');
    expect(await out('man rgb')).toMatch(/Presets: green, purple, red,[\s\S]*pink, white\./);
    expect(await out('help ring')).toContain('rgb: rgb [preset|#hex|off|on]');
  });

  it('rgb rejects anything that is not a preset or a strict #hex', async () => {
    const { out, world } = setup();
    expect(await out('rgb javascript:; echo $?')).toBe(`rgb: unknown color 'javascript:' (${PRESET_NAMES.join(', ')}, off, or a #hex)\n2`);
    expect(await out('rgb #12; echo $?')).toBe("rgb: invalid hex color '#12' (use #rgb or #rrggbb, like #ff8800)\n2");
    expect(await out('rgb #12345g')).toBe("rgb: invalid hex color '#12345g' (use #rgb or #rrggbb, like #ff8800)");
    expect(await out(`rgb ${'#'.repeat(200)}`)).toBe("rgb: invalid hex color '################…' (use #rgb or #rrggbb, like #ff8800)");
    expect(await out(`rgb ${'x'.repeat(200)}`)).toContain("rgb: unknown color 'xxxxxxxxxxxxxxxx…'");
    for (const bad of ['rgb(1,2,3)', 'red;', 'url(x)', '#ff00ff00', '#fff\u0000', 'transparent', 'ff00ff', '"#ff00ff"'])
      expect(await out(`rgb '${bad}'`)).toMatch(/^rgb: (unknown color|invalid hex color) /);
    expect(await out('rgb red blue')).toBe('rgb: too many arguments (one color: rgb cyan, rgb #ff8800)');
    expect(world.get().rgb).toBe('green'); // nothing changed
  });

  it('fan cycles or sets', async () => {
    const { out, world } = setup();
    expect(world.get().fan).toBe(1);
    expect(await out('fan')).toBe('fan: speed 2');
    expect(await out('fan')).toBe('fan: speed 3');
    expect(await out('fan')).toBe('fan: off');
    expect(await out('fan 1')).toBe('fan: speed 1');
    expect(world.get().fan).toBe(1);
    expect(await out('fan 7')).toBe("fan: invalid speed '7' (0-3)");
  });

  it('sound', async () => {
    const { out, world } = setup();
    expect(await out('sound')).toBe('sound: off');
    expect(await out('sound low')).toBe('sound: low');
    expect(world.get().sound).toBe('low');
    expect(await out('sound on')).toBe('sound: on');
    expect(await out('sound loud')).toBe("sound: invalid level 'loud' (on|low|off)");
  });

  it('meow prints a cat line and pokes the cat', async () => {
    const { out, world } = setup();
    const spy = vi.spyOn(world, 'meow');
    expect(await out('meow')).toMatch(/^=\^\.\.\^= {2}\S+/);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('toys', () => {
  it('catsay', async () => {
    const { out } = setup();
    expect(await out('catsay hi')).toBe([' ____', '< hi >', ' ----', '    \\', '     \\  /\\_/\\', '       ( o.o )', '        > ^ <'].join('\n'));
    expect(await out('echo purr | catsay')).toContain('< purr >');
    expect(await out('catsay')).toContain('< meow >');
    const long = await out('catsay ' + 'word '.repeat(20));
    expect(long).toMatch(/^\/ word/m);
    expect(long).toMatch(/^\\ word/m);
  });

  it('cmatrix draws overlay frames, never scrollback (one note for screen readers), and cleans up', async () => {
    const { run, store } = setup();
    const frames: number[] = [];
    let busyDuring = false;
    store.subscribe((s) => {
      if (s.overlay) {
        frames.push(s.overlay.length);
        busyDuring ||= s.busy;
        expect(s.overlay.every((row) => row.map((sp) => sp.text).join('').length === 80)).toBe(true);
        expect(s.monitor).toBeNull(); // only with --both
      }
    });
    const lines = await run('cmatrix');
    expect(lines.map(text)).toEqual(['cmatrix running, press ctrl+c to stop']);
    expect(frames.length).toBe(100); // the harness quits it with q after 100 frames
    expect(frames.every((n) => n === 24)).toBe(true);
    expect(busyDuring).toBe(true);
    expect(store.state.overlay).toBeNull();
  });

  it('cmatrix flags: -h, -C colors, bad options, and never in a pipe', async () => {
    const { out } = setup();
    expect(await out('cmatrix -h')).toContain('usage: cmatrix [-s] [-C color] [--both]');
    expect(await out('cmatrix --help')).toContain('--both');
    expect(await out('cmatrix -C pink; echo $?')).toBe("cmatrix: invalid color 'pink' (green, red, blue, white, yellow, cyan, magenta)\n1");
    expect(await out('cmatrix -C')).toBe("cmatrix: option requires an argument -- 'C'");
    expect(await out('cmatrix -x')).toBe("cmatrix: invalid option -- 'x'\ntry 'cmatrix -h' for the options");
    expect(await out('cmatrix --nope')).toContain("unexpected argument '--nope'");
    expect(await out('cmatrix | wc -l; echo $?')).toBe('cmatrix: stdout is not a terminal\n0\n0');
    for (const c of ['-Cred', '-C YELLOW', '-sC cyan']) expect(await out(`cmatrix ${c}`)).toContain('cmatrix running');
    expect(await out('cmatrix -s')).toBe('cmatrix running, press any key to stop');
  });

  it('cmatrix under reduced motion shows one still frame of rain already falling', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }));
    try {
      const { run, store, shell } = setup();
      const frames: string[] = [];
      store.subscribe((s) => {
        if (!s.overlay) return;
        frames.push(s.overlay.map((row) => row.map((sp) => sp.text).join('')).join('\n'));
        queueMicrotask(() => shell.key('q')); // the still frame waits for a key, not a timer
      });
      await run('cmatrix');
      expect(frames.length).toBe(1);
      // not the near-empty first step (every trail still above the top row)
      const glyphs = frames[0].replace(/[\s]/g, '').length;
      expect(glyphs).toBeGreaterThan(80 * 24 * 0.15);
      expect(store.state.overlay).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('pacman -Syu and yay', async () => {
    const { out } = setup();
    const p = await out('pacman -Syu');
    expect(p).toMatch(/^:: Synchronizing package databases\.\.\.\n core .*\[#+\] 100%\n extra .*100%\n multilib .*100%\n:: Starting full system upgrade\.\.\.\n there is nothing to do$/);
    const y = await out('yay');
    expect(y).toContain(':: Searching AUR for updates...');
    expect(y).toMatch(/ there is nothing to do$/);
    expect(await out('yay -Syu')).toMatch(/ there is nothing to do$/);
  });

  it('pacman other operations', async () => {
    const { out } = setup();
    expect(await out('pacman -S vim')).toBe('error: you cannot perform this operation unless you are root.');
    expect(await out('pacman')).toBe('error: no operation specified (use -h for help)');
  });

  it('rm -rf / refuses, with a gag', async () => {
    const { out } = setup();
    expect(await out('rm -rf /')).toBe("rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe");
    expect(await out('rm -rf / --no-preserve-root')).toBe('nice try. meow.');
    expect(await out('rm about.md')).toBe("rm: cannot remove 'about.md': Read-only file system");
    expect(await out('rm desk')).toBe("rm: cannot remove 'desk': Is a directory");
    expect(await out('rm nope')).toBe("rm: cannot remove 'nope': No such file or directory");
    expect(await out('rm -f nope')).toBe('');
    expect(await out('rm')).toBe('rm: missing operand');
  });
});

describe('secret', () => {
  it('sudo reports the incident and the cat stares', async () => {
    const { out, world } = setup();
    const stare = vi.spyOn(world, 'stare');
    const sleeps: number[] = [];
    const { out: out2, world: w2 } = setup({ sleep: async (ms) => void sleeps.push(ms) });
    const stare2 = vi.spyOn(w2, 'stare');
    expect(await out('sudo ls || echo denied')).toBe(
      '[sudo] password for alxnko: \nalxnko is not in the sudoers file.  This incident will be reported.\ndenied',
    );
    expect(stare).toHaveBeenCalledOnce();
    await out2('sudo rm -rf /');
    expect(sleeps).toContain(700);
    expect(stare2).toHaveBeenCalledOnce();
  });

  it('the incident line is amber', async () => {
    const { run } = setup();
    const lines = await run('sudo x');
    expect(lines[1][0].fg).toBe('amber');
  });

  it('bare sudo prints usage', async () => {
    const { out } = setup();
    expect(await out('sudo')).toBe('usage: sudo command');
  });
});

describe('text commands', () => {
  it('grep filters stdin, -i ignores case, -v inverts, exit 1 on no match', async () => {
    const { out, run } = setup();
    expect(await out('ls | grep o')).toBe('about.md\nlaptop/\nmonitor/');
    expect(await out('cat about.md | grep -i KYRGYZ')).toContain('Kyrgyzstan');
    expect(await out('ls | grep -v o')).toBe('desk/');
    expect(await out('ls | grep zzz || echo none')).toBe('none');
    const [l] = await run('ls | grep desk');
    expect(l.find((s) => s.text === 'desk')?.fg).toBe('red');
    expect(await out('grep')).toBe('usage: grep [-iv] PATTERN [FILE...]');
    expect(await out('grep meow about.md')).toBe('i build systems and ship. meow.');
  });

  it('head and tail', async () => {
    const { out } = setup();
    expect(await out('ls | head -n 2')).toBe('about.md\ndesk/');
    expect(await out('ls | head -1')).toBe('about.md');
    expect(await out('ls | tail -n 1')).toBe('monitor/');
    expect(await out('ls | tail -2')).toBe('laptop/\nmonitor/');
    expect(await out('ls | head -n x')).toBe("head: invalid number of lines: 'x'");
    expect(await out('cat /etc/os-release | head -n 1')).toBe('NAME="meowOS"');
    expect(await out('head -n 1 about.md')).toBe('# Alex Neko (alxnko)');
  });

  it('wc', async () => {
    const { out } = setup();
    expect(await out('ls | wc -l')).toBe('4');
    expect(await out('echo hi there | wc')).toBe('      1       2       9');
    expect(await out('echo hi | wc -c')).toBe('3');
    expect(await out('wc -l about.md')).toMatch(/^\d+ about\.md$/);
  });
});

describe('bootLines', () => {
  it('reads like a systemd boot to a tty login', () => {
    const lines = bootLines();
    const t = lines.map(text);
    const ok = t.filter((l) => l.startsWith('[  OK  ] '));
    expect(ok.length).toBeGreaterThanOrEqual(12);
    expect(ok.length).toBeLessThanOrEqual(16);
    expect(ok.every((l) => /^\[ {2}OK {2}\] (Started|Reached target|Mounted|Finished) .+\.$/.test(l))).toBe(true);
    for (const l of lines.filter((l) => text(l).startsWith('[  OK  ]'))) expect(l.find((s) => s.text.includes('OK'))?.fg).toBe('accent');
    expect(t).toContain('meowOS rolling (tty1)');
    expect(t.at(-1)).toBe('nitro login: alxnko (automatic login)');
  });
});

describe('never names the upstream distro', () => {
  it('no output of any command contains "arch"', async () => {
    const { store, shell } = setup();
    const all = [
      'help', 'man ls', 'man man', 'man desk', 'man pacman', 'man fastfetch', 'whoami', 'whoami -v', 'fastfetch', 'fastfetch --compact',
      'uname -a', 'uname -o', 'uptime', 'date', 'echo $SHELL $PATH', 'hostname', 'ls -la ~', 'ls -la /', 'ls -la /etc', 'tree -a /',
      'cat /etc/os-release /etc/motd /etc/hostname about.md laptop/readme.txt', 'cat desk/height desk/fan desk/rgb .config/theme',
      'open gh', 'open evil', 'history', 'theme', 'desk 2', 'desk up', 'ring', 'fan', 'sound', 'meow', 'catsay hello',
      'pacman -Syu', 'yay', 'pacman -S x', 'pacman', 'rm -rf /', 'rm -rf / --no-preserve-root', 'sudo ls', 'sudo', 'foo', 'claer',
      'ls | grep o', 'ls | wc', 'man', 'exit', 'cmatrix',
    ];
    for (const cmd of all) await shell.run(cmd);
    for (const man of shell.registry.names(true)) await shell.run(`man ${man}`);
    const body = store.state.lines.map(text).join('\n') + '\n' + bootLines().map(text).join('\n');
    expect(body.length).toBeGreaterThan(2000);
    expect(body).not.toMatch(/\barch\b/i);
    expect(body).not.toMatch(/archlinux|arch linux/i);
  });

  it('no src/term file mentions it either', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
    const files = walk(join(process.cwd(), 'src/term'));
    expect(files.filter((f) => /\barch\b/i.test(readFileSync(f, 'utf8')))).toEqual([]);
  });
});

describe('meow in many languages', () => {
  it.each(['meow', 'nya', 'nyan', 'мяу', 'мияу', 'miau', 'にゃー', '喵', '야옹'])('%s answers in its own word and makes the cat react', async (w) => {
    const store = new TermStore();
    const world = new NullWorld();
    let meows = 0;
    world.meow = () => { meows++; };
    const sh = new Shell(store, world);
    await sh.run(w);
    const last = store.state.lines.at(-1)!.map((s) => s.text).join('');
    expect(last).toMatch(new RegExp(`^=\\^\\.\\.\\^=  ${w}[.?~!]$`));
    expect(meows).toBe(1);
  });
  it('only meow is listed in help; man meow lists the aliases', async () => {
    const store = new TermStore();
    const sh = new Shell(store, new NullWorld());
    await sh.run('help');
    const help = store.state.lines.map((l) => l.map((s) => s.text).join('')).join('\n');
    expect(help).toMatch(/meow\s+meow \(in many languages\)/);
    expect(help).not.toMatch(/^\s+nya\s/m);
    await sh.run('man meow');
    const man = store.state.lines.map((l) => l.map((s) => s.text).join('')).join('\n');
    expect(man).toContain('nya');
    expect(man).toContain('мяу');
  });
});
