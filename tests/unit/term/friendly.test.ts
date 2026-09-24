import { describe, expect, it, vi } from 'vitest';
import { text } from '../../../src/term/format';
import { phrase } from '../../../src/term/phrases';
import { suggest } from '../../../src/term/suggest';
import { DEFAULT_WORLD } from '../../../src/term/world';
import { setup } from './harness';

describe('plain-language lines (command_not_found_handle for people)', () => {
  it('a phrase that means a command runs it, shown first as a comment', async () => {
    const { out } = setup();
    expect(await out('who are you?')).toBe('# whoami -v\nAlex Neko (alxnko) · tech lead · Kyrgyzstan · #1 committer in Kyrgyzstan');
    expect((await out('what is this')).split('\n')[0]).toBe('# help');
    expect((await out('How can I contact you?')).split('\n')[0]).toBe('# contacts');
    expect((await out('show me around')).split('\n')[0]).toBe('# tour');
  });

  it('greetings and contact names answer with a clickable next command', async () => {
    const { run } = setup();
    const hi = (await run('hi!'))[0];
    expect(text(hi)).toContain('real terminal');
    expect(hi.filter((s) => s.run).map((s) => s.run)).toEqual(['help', 'tour']);
    expect(text((await run('github'))[0])).toBe('github is a contact, not a command. try open github.');
  });

  it('never shadows a real command, and cat sounds stay catspeak', async () => {
    expect(phrase('meow')).toBeNull(); // catspeak and the meow command own it
    const { out } = setup();
    expect(await out('help')).not.toContain('# help');
    expect(await out('nya nya')).toMatch(/^=\^\.\.\^=/);
    expect(await out('hi; echo $?')).toContain('command not found'); // only a whole line is a phrase
  });
});

describe('friendlier errors, still bash', () => {
  it('not found: case, habits from other systems, typos, then a next step', async () => {
    const { out, run } = setup();
    expect(await out('LS')).toBe("bash: LS: command not found\ndid you mean 'ls'?");
    expect(await out('neofetch')).toBe("bash: neofetch: command not found\ndid you mean 'fastfetch'?");
    expect(await out('apt install x')).toBe("bash: apt: command not found\ndid you mean 'pacman -Syu'?");
    expect(await out('vim about.md')).toContain('no editors on this desk');
    expect(await out('zzz; echo $?')).toBe('bash: zzz: command not found\n127');
    const hint = (await run('claer'))[1];
    expect(hint.find((s) => s.run)?.run).toBe('clear'); // the suggestion is a button
  });

  it('--help works everywhere (echo prints it, like bash)', async () => {
    const { out } = setup();
    expect(await out('ls --help')).toBe('usage: ls [-la] [path...]\n  list directory contents\nmore: man ls');
    expect(await out('desk --help; echo $?')).toContain('usage: desk [1|2|3|up|down]');
    expect(await out('echo --help')).toBe('--help');
    expect(await out('grep -- --help about.md; echo $?')).toBe('1');
  });

  it('help name, pacman -h/-V, catsay -h, history -c, true/false', async () => {
    const { out, store } = setup();
    expect(await out('help desk')).toBe('desk: desk [1|2|3|up|down]\n    raise or lower the desk\n    more: man desk');
    expect(await out('help nope; echo $?')).toContain("no help topics match `nope'");
    expect(await out('pacman -h')).toContain('usage:  pacman <operation> [...]');
    expect(await out('pacman -V')).toContain('Pacman v');
    expect(await out('catsay -h')).toContain('usage: catsay');
    await out('echo one');
    await out('history -c');
    expect(store.state.history).toEqual([]);
    expect(await out('true && echo y; false || echo n; false; echo $?')).toBe('y\nn\n1');
  });

  it('grep/head/tail/wc: a missing file is reported once, without the usage', async () => {
    const { out } = setup();
    expect(await out('grep x nope; echo $?')).toBe('grep: nope: No such file or directory\n2');
    expect(await out('head nope; echo $?')).toBe('head: nope: No such file or directory\n1');
    expect(await out('wc nope; echo $?')).toBe('wc: nope: No such file or directory\n1');
    expect(await out('grep; echo $?')).toBe('usage: grep [-iv] PATTERN [FILE...]\n2');
  });

  it('ls -l sizes agree with wc -c (files end in a newline)', async () => {
    const { out } = setup();
    const size = (await out('ls -l about.md')).split(/\s+/)[4];
    expect(await out('wc -c about.md')).toBe(`${size} about.md`);
  });

  it('fastfetch rejects unknown options', async () => {
    const { out } = setup();
    expect(await out('fastfetch --bogus; echo $?')).toBe("fastfetch: unknown option '--bogus' (try --compact)\n1");
  });
});

describe('alias', () => {
  it('ll and la exist; define, list, run, unalias', async () => {
    const { out } = setup();
    expect(await out('alias')).toBe("alias la='ls -a'\nalias ll='ls -l'");
    expect(await out('ll monitor | wc -l')).toBe('6');
    await out("alias hey='echo hi $USER'");
    expect(await out('hey there')).toBe('hi alxnko there');
    expect(await out('alias hey')).toBe("alias hey='echo hi $USER'");
    await out("alias ls='ls -1'"); // expands once, like bash
    expect(await out('ls monitor')).toBe('email.lnk\ngithub.lnk\ninstagram.lnk\nlinkedin.lnk\ntelegram.lnk');
    expect(await out("alias bad='a | b'; echo $?")).toContain('only a simple command');
    expect(await out('unalias hey && hey; echo $?')).toContain('127');
    expect(await out('unalias nope; echo $?')).toBe('bash: unalias: nope: not found\n1');
  });
});

describe('contacts and tour', () => {
  it('contacts lists the links and the short links, nothing else', async () => {
    const { run } = setup();
    const ls = await run('contacts');
    expect(ls.slice(0, 5).map(text)).toEqual([
      'gh    github.com/alxnko', 'tg    t.me/ALXNK0', 'in    linkedin.com/in/alxnko', 'ig    instagram.com/alxnko', 'mail  aleksandrnyrko@gmail.com',
    ]);
    expect(ls.slice(0, 5).every((l) => l[1].href)).toBe(true);
    expect(text(ls[6])).toContain('short links: alxnko.dev/gh /tg /in /ig /mail');
  });

  it('tour visits the landmarks, moves things, and puts everything back (also after ctrl+c)', async () => {
    const { out, world } = setup();
    const fly = vi.spyOn(world, 'fly');
    const was = world.get();
    const o = await out('tour');
    expect(o).toContain('1/5');
    expect(o).toContain('5/5');
    expect(fly.mock.calls.map((c) => c[0])).toEqual(['laptop', 'monitor', 'desk', 'desk']);
    expect(world.get().ring).toBe(was.ring);
    expect(world.get().desk).toBe(was.desk);
  });
});

describe('suggestion chips', () => {
  const w = DEFAULT_WORLD;
  it('start with the friendliest commands and follow what was run', () => {
    expect(suggest(null, w)).toEqual(['help', 'fastfetch', 'contacts', 'tour', 'cmatrix']);
    expect(suggest({ line: 'contacts', status: 0 }, w)[0]).toBe('open github');
    expect(suggest({ line: 'desk 3', status: 0 }, { ...w, desk: 1.12 })[0]).toBe('desk down');
    expect(suggest({ line: 'cmatrix', status: 130 }, w)[0]).toBe('cmatrix --both');
    expect(suggest({ line: 'blah', status: 127 }, w)[0]).toBe('help');
    for (const l of ['help', 'ls', 'theme', 'tour', 'fastfetch', 'x']) {
      const s = suggest({ line: l, status: 0 }, w);
      expect(s.length).toBeGreaterThan(2);
      expect(s.length).toBeLessThanOrEqual(5);
      expect(s).not.toContain(l);
    }
  });

  it('every suggestion runs cleanly', async () => {
    const lines = new Set<string>();
    for (const l of [null, ...['help', 'contacts', 'ls', 'desk 1', 'desk 3', 'theme', 'cmatrix', 'tour', 'x', 'fastfetch'].map((line) => ({ line, status: 0 }))])
      suggest(l, DEFAULT_WORLD).forEach((c) => lines.add(c));
    const { shell } = setup();
    for (const c of lines) {
      await shell.run(c);
      expect(shell.last?.status, c).toBe(0);
    }
  });
});
