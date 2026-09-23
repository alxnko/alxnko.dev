import { describe, expect, it } from 'vitest';
import { catspeak } from '../../../src/term/catspeak';
import { TermStore } from '../../../src/term/store';
import { Shell } from '../../../src/term/exec';
import { NullWorld } from '../../../src/term/world';

const mirror = () => 0.1; // < 0.7: mirror the user's own words, first tail

describe('catspeak', () => {
  it.each(['nyaaa', 'мррр', 'мяу мяу', 'brrt', 'pspsps', 'пспспс', ':3', 'uwu', 'nya :3 hahaha', 'мур мур', 'にゃー', '喵喵', 'кис кис', 'mrrp?'])(
    '%s is catspeak', (l) => expect(catspeak(l, mirror)).not.toBeNull(),
  );
  it.each(['hello', 'meow world', 'ls', 'кот', 'haha', 'kis', 'mr', ''])('%s is not', (l) => expect(catspeak(l, mirror)).toBeNull());
  it('mirrors the user most of the time, answers in its own voice otherwise', () => {
    expect(catspeak('nyaa', mirror)!.text).toBe('nyaa');
    const voiced = catspeak('nyaa', () => 0.9)!.text;
    expect(voiced).not.toBe('nyaa');
  });
  it('gets excited on repeats or !!', () => {
    expect(catspeak('nyaaaa', mirror)!.excited).toBe(true);
    expect(catspeak('meow!!', mirror)!.excited).toBe(true);
    expect(catspeak('meow', mirror)!.excited).toBe(false);
  });
  it('signature phrases and praise', () => {
    expect(catspeak('meow or not meow', mirror)!.text).toBe('meow');
    expect(catspeak('мяу или не мяу?', mirror)!.text).toBe('мяу');
    const good = catspeak('good cat', mirror)!;
    expect(good.purr).toBe(true);
    expect(catspeak('хороший котик', mirror)!.purr).toBe(true);
  });
  it('never uses emoji and stays short', () => {
    for (let i = 0; i < 50; i++) {
      const r = catspeak('nyaaaaaa!!! '.repeat(10), Math.random)!;
      expect(r.text.length).toBeLessThanOrEqual(64);
      expect(r.text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe('shell + catspeak', () => {
  const run = async (line: string) => {
    const store = new TermStore();
    const world = new NullWorld();
    let meows = 0;
    world.meow = () => { meows++; };
    await new Shell(store, world, undefined, { random: mirror }).run(line);
    return { text: store.state.lines.slice(1).map((l) => l.map((s) => s.text).join('')).join('\n'), meows };
  };
  it('replies instead of command-not-found and the cat reacts', async () => {
    const r = await run('мур мур');
    expect(r.text).toBe('=^..^=  мур мур');
    expect(r.meows).toBe(1);
    expect((await run('мррр')).text).toBe('=^..^=  мррр!'); // excited: repeats
  });
  it('real commands and unknown words are unaffected', async () => {
    expect((await run('meow')).text).toMatch(/^=\^\.\.\^=  meow/);
    expect((await run('blah')).text).toContain('command not found');
  });
});
