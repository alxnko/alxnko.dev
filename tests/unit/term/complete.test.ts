import { describe, expect, it } from 'vitest';
import { complete } from '../../../src/term/complete';
import { createFs, HOME } from '../../../src/term/vfs';
import { setup } from './harness';

const { shell } = setup();
const fs = createFs();
const c = (line: string, cursor = line.length, cwd = HOME) => complete(line, cursor, cwd, shell.registry, fs);

describe('complete', () => {
  it('completes a unique command with a trailing space', () => {
    expect(c('hel')).toEqual({ replace: [0, 3], candidates: ['help'], full: ['help'], insert: 'help ' });
    expect(c('he')).toEqual({ replace: [0, 2], candidates: ['head', 'help'], full: ['head', 'help'], insert: null });
  });

  it('lists multiple commands and inserts the common prefix', () => {
    expect(c('ca')).toEqual({ replace: [0, 2], candidates: ['cat', 'catsay'], full: ['cat', 'catsay'], insert: 'cat' });
    expect(c('cat').insert).toBeNull();
  });

  it('never offers hidden commands', () => {
    expect(c('sud').candidates).toEqual([]);
    expect(c('').candidates).not.toContain('sudo');
    expect(c('').candidates).toContain('help');
  });

  it('completes commands after pipes and operators', () => {
    expect(c('ls | gr').insert).toBe('grep ');
    expect(c('echo hi && pw').insert).toBe('pwd ');
    expect(c('echo hi;pw').replace).toEqual([8, 10]);
  });

  it('completes dirs with a trailing slash', () => {
    expect(c('cd mo')).toEqual({ replace: [3, 5], candidates: ['monitor/'], full: ['monitor/'], insert: 'monitor/' });
  });

  it('cd completes directories only', () => {
    expect(c('cd a').candidates).toEqual([]);
    expect(c('cd ').candidates).toEqual(['desk/', 'laptop/', 'monitor/']);
  });

  it('completes files with a trailing space', () => {
    expect(c('cat a').insert).toBe('about.md ');
    expect(c('cat monitor/g').insert).toBe('monitor/github.lnk ');
    expect(c('cat monitor/g').candidates).toEqual(['github.lnk']);
  });

  it('completes ~ and absolute paths', () => {
    expect(c('ls ~/mon').insert).toBe('~/monitor/');
    expect(c('cat /etc/os').insert).toBe('/etc/os-release ');
    expect(c('ls /').candidates).toEqual(['etc/', 'home/']);
  });

  it('shows dotfiles only when the word starts with a dot', () => {
    expect(c('ls ').candidates).not.toContain('.config/');
    expect(c('ls .c').insert).toBe('.config/');
  });

  it('completes relative to cwd', () => {
    expect(c('cat re', 6, HOME + '/laptop').insert).toBe('readme.txt ');
  });

  it('completes per-command args', () => {
    expect(c('theme d').insert).toBe('day ');
    expect(c('theme ').candidates).toEqual(['day', 'night', 'toggle']);
    expect(c('desk ').candidates).toEqual(['1', '2', '3', 'up', 'down']);
    expect(c('rgb pu').insert).toBe('purple ');
    expect(c('ring pi').insert).toBe('pink '); // the old name completes the same
    expect(c('fan ').candidates).toEqual(['0', '1', '2', '3']);
    expect(c('sound l').insert).toBe('low ');
    expect(c('man fas').insert).toBe('fastfetch ');
    expect(c('man fa').candidates).toEqual(['fan', 'fastfetch']);
    expect(c('open g').candidates).toEqual(['gh', 'github']);
    expect(c('open te').insert).toBe('telegram ');
  });

  it('open also completes paths', () => {
    expect(c('open monitor/in').candidates).toEqual(['instagram.lnk']);
  });

  it('completes only the word under the cursor', () => {
    expect(c('cd mo && ls', 5)).toEqual({ replace: [3, 5], candidates: ['monitor/'], full: ['monitor/'], insert: 'monitor/' });
  });

  it('returns nothing for no match', () => {
    expect(c('zz')).toEqual({ replace: [0, 2], candidates: [], full: [], insert: null });
    expect(c('cat nope/x').candidates).toEqual([]);
  });
});
