import { describe, expect, it } from 'vitest';
import { createFs, HOME, lookup, pretty, resolve } from '../../../src/term/vfs';
import type { WorldState } from '../../../src/term/types';

const W: WorldState = { theme: 'dark', desk: 0.74, ring: 'green', fan: 2, sound: 'off', landmark: 'desk' };

describe('vfs', () => {
  const root = createFs();

  it('resolves relative, absolute, ~, . and ..', () => {
    expect(resolve('/home/alxnko', '..')).toBe('/home');
    expect(resolve(HOME, '~/monitor/../desk')).toBe(HOME + '/desk');
    expect(resolve(HOME, '~')).toBe(HOME);
    expect(resolve(HOME, '')).toBe(HOME);
    expect(resolve(HOME, '.')).toBe(HOME);
    expect(resolve('/', '../../..')).toBe('/');
    expect(resolve(HOME, '/etc/./hostname')).toBe('/etc/hostname');
    expect(resolve(HOME, 'monitor//')).toBe(HOME + '/monitor');
    expect(resolve('/etc', 'motd')).toBe('/etc/motd');
  });

  it('looks up nodes and landmarks', () => {
    expect(lookup(root, HOME + '/monitor')?.landmark).toBe('monitor');
    expect(lookup(root, HOME + '/laptop')?.landmark).toBe('laptop');
    expect(lookup(root, HOME)?.landmark).toBe('desk');
    expect(lookup(root, '/')?.landmark).toBe('wide');
    expect(lookup(root, '/nope')).toBeNull();
    expect(lookup(root, HOME + '/about.md/x')).toBeNull();
  });

  it('has etc and home at the root', () => {
    const names = root.children!.map((c) => c.name);
    expect(names).toContain('etc');
    expect(names).toContain('home');
  });

  it('.config is hidden', () => {
    expect(lookup(root, HOME + '/.config')?.hidden).toBe(true);
  });

  it('monitor links carry allowlisted hrefs', () => {
    const gh = lookup(root, HOME + '/monitor/github.lnk')!;
    expect(gh.kind).toBe('link');
    expect(gh.href).toBe('https://github.com/alxnko');
    expect(gh.read!(W)).toBe('https://github.com/alxnko');
    const names = lookup(root, HOME + '/monitor')!.children!.map((c) => c.name).sort();
    expect(names).toEqual(['email.lnk', 'github.lnk', 'instagram.lnk', 'linkedin.lnk', 'telegram.lnk']);
  });

  it('desk files reflect live world state', () => {
    expect(lookup(root, HOME + '/desk/height')!.read!(W)).toBe('74 cm');
    expect(lookup(root, HOME + '/desk/fan')!.read!(W)).toBe('2');
    expect(lookup(root, HOME + '/desk/ring')!.read!(W)).toBe('green');
    expect(lookup(root, HOME + '/.config/theme')!.read!(W)).toBe('night');
    expect(lookup(root, HOME + '/.config/theme')!.read!({ ...W, theme: 'light' })).toBe('day');
  });

  it('etc files are meowOS and never name the upstream distro', () => {
    const os = lookup(root, '/etc/os-release')!.read!(W);
    expect(os).toContain('NAME="meowOS"');
    expect(os).toContain('BUILD_ID=rolling');
    expect(os).not.toMatch(/arch/i);
    expect(lookup(root, '/etc/hostname')!.read!(W)).toBe('nitro');
    expect(lookup(root, '/etc/motd')!.read!(W).length).toBeGreaterThan(0);
  });

  it('about.md has only public facts', () => {
    const a = lookup(root, HOME + '/about.md')!.read!(W);
    expect(a).toContain('Alex Neko');
    expect(a).toContain('tech lead');
    expect(a).not.toContain('AIT');
    expect(a).toContain('Kyrgyzstan');
    expect(a).toContain('#1 committer in Kyrgyzstan');
    expect(a).toContain('i build systems and ship. meow.');
  });

  it('laptop readme', () => {
    expect(lookup(root, HOME + '/laptop/readme.txt')!.read!(W)).toBe("you're typing on it.");
  });

  it('pretty() shortens HOME to ~', () => {
    expect(pretty(HOME)).toBe('~');
    expect(pretty(HOME + '/monitor')).toBe('~/monitor');
    expect(pretty('/etc')).toBe('/etc');
    expect(pretty('/home/alxnkoX')).toBe('/home/alxnkoX');
  });
});
