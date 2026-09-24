// theme, desk, rgb, fan, sound, meow: commands with a physical effect (spec §3.5).

/** meow in other languages (all hidden from help; see `man meow`). */
export const MEOW_ALIASES: readonly string[] = [
  'mew', 'purr', 'nya', 'nyan', 'nyaa', 'にゃー', 'にゃん', 'мяу', 'мияу',
  'miau', 'miaou', 'miao', 'mjau', 'miyav', '喵', '야옹',
];
import { fail, untilAborted, type ShellEnv } from '../registry';
import { themeName } from '../vfs';
import { fg } from '../format';
import { parseRgb, PRESET_NAMES } from '../../lib/rgb';
import type { Command, FanSpeed, Line, SoundLevel } from '../types';

export const DESK_PRESETS: Record<string, number> = { '1': 0.74, '2': 0.95, '3': 1.12 };
export const DESK_MIN = 0.7;
export const DESK_MAX = 1.2;
const STEP = 0.05;

const cm = (m: number) => `${Math.round(m * 100)} cm`;
const round = (m: number) => Math.round(m * 100) / 100;

export function worldCommands(env: ShellEnv): Command[] {
  const theme: Command = {
    name: 'theme',
    summary: 'day or night',
    usage: 'theme [day|night|toggle]',
    group: 'world',
    complete: () => ['day', 'night', 'toggle'],
    run(ctx) {
      const cur = themeName(ctx.world.get());
      const a = (ctx.args[0] ?? 'toggle').toLowerCase();
      const map: Record<string, 'day' | 'night'> = { day: 'day', light: 'day', night: 'night', dark: 'night', toggle: cur === 'day' ? 'night' : 'day' };
      const next = map[a];
      if (!next) fail(ctx, `theme: invalid theme '${ctx.args[0]}' (day|night|toggle)`, 2);
      ctx.world.setTheme(next === 'day' ? 'light' : 'dark');
      ctx.out(`theme: ${next}`);
    },
  };

  const desk: Command = {
    name: 'desk',
    summary: 'raise or lower the desk',
    usage: 'desk [1|2|3|up|down]',
    group: 'world',
    complete: () => ['1', '2', '3', 'up', 'down'],
    async run(ctx) {
      const cur = round(ctx.world.get().desk);
      const a = ctx.args[0];
      if (a === undefined) return ctx.out(`desk: ${cm(cur)}`);
      let to: number;
      if (a in DESK_PRESETS) to = DESK_PRESETS[a];
      else if (a === 'up' || a === 'down') {
        if (a === 'up' && cur >= DESK_MAX) return ctx.out(`desk: ${cm(cur)} is as high as it goes`);
        if (a === 'down' && cur <= DESK_MIN) return ctx.out(`desk: ${cm(cur)} is as low as it goes`);
        to = round(Math.min(DESK_MAX, Math.max(DESK_MIN, cur + (a === 'up' ? STEP : -STEP))));
      } else fail(ctx, `desk: invalid position '${a}' (1|2|3|up|down)`, 2);
      if (to === cur) return ctx.out(`desk: already at ${cm(cur)}`);
      ctx.out(`desk: moving to ${cm(to)}…`);
      await untilAborted(ctx.world.setDesk(to), ctx.signal);
      ctx.out(`desk: ${cm(to)}`);
    },
  };

  // rgb: one colour for the whole site (R86): the accent, the terminal, the desk's lights,
  // the accent keys and the cat. `color`, `colour` and the old `ring` are the same command.
  const chip = (spec: string): Line[number] => ({ text: spec, fg: 'accent', run: `rgb ${spec}` });
  const shown = (s: string) => (s.length > 16 ? `${s.slice(0, 16)}…` : s);
  const rgb: Command = {
    name: 'rgb',
    summary: 'one color for the lights, keys, cat and accent',
    usage: 'rgb [preset|#hex|off|on]',
    group: 'world',
    complete: () => [...PRESET_NAMES, 'off', 'on'],
    run(ctx) {
      const w = ctx.world.get();
      if (ctx.args.length > 1) fail(ctx, 'rgb: too many arguments (one color: rgb cyan, rgb #ff8800)', 2);
      const a = ctx.args[0];
      if (a === undefined) {
        ctx.out(w.rgb === 'off' ? `rgb: off (the lights are off; the accent stays ${w.accent})` : `rgb: ${w.rgb}`);
        const line: Line = [fg('muted', 'presets: ')];
        PRESET_NAMES.forEach((n, i) => line.push(...(i ? [{ text: ' ' }] : []), chip(n)));
        ctx.out(line);
        return ctx.out([fg('muted', 'or any hex: '), chip('#ff8800'), fg('muted', ', and '), chip(w.rgb === 'off' ? 'on' : 'off')]);
      }
      const spec = a.trim().toLowerCase() === 'on' ? w.accent : parseRgb(a);
      if (spec === null) {
        if (a.trim().startsWith('#')) fail(ctx, `rgb: invalid hex color '${shown(a)}' (use #rgb or #rrggbb, like #ff8800)`, 2);
        fail(ctx, `rgb: unknown color '${shown(a)}' (${PRESET_NAMES.join(', ')}, off, or a #hex)`, 2);
      }
      ctx.world.setRgb(spec);
      ctx.out(spec === 'off' ? `rgb: off (the lights are off; the accent stays ${ctx.world.get().accent})` : `rgb: ${spec}`);
    },
  };
  const rgbAliases = ['color', 'colour', 'ring'].map((name): Command => ({ ...rgb, name, hidden: true, aliasOf: 'rgb' }));

  const fan: Command = {
    name: 'fan',
    summary: 'desk fan speed',
    usage: 'fan [0-3]',
    group: 'world',
    complete: () => ['0', '1', '2', '3'],
    run(ctx) {
      const a = ctx.args[0];
      let s: FanSpeed;
      if (a === undefined) s = ((ctx.world.get().fan + 1) % 4) as FanSpeed;
      else if (/^[0-3]$/.test(a)) s = Number(a) as FanSpeed;
      else fail(ctx, `fan: invalid speed '${a}' (0-3)`, 2);
      ctx.world.setFan(s);
      ctx.out(s === 0 ? 'fan: off' : `fan: speed ${s}`);
    },
  };

  const sound: Command = {
    name: 'sound',
    summary: 'sound on, low or off',
    usage: 'sound [on|low|off]',
    group: 'world',
    complete: () => ['on', 'low', 'off'],
    run(ctx) {
      const a = ctx.args[0];
      if (a === undefined) return ctx.out(`sound: ${ctx.world.get().sound}`);
      if (a !== 'on' && a !== 'low' && a !== 'off') fail(ctx, `sound: invalid level '${a}' (on|low|off)`, 2);
      ctx.world.setSound(a as SoundLevel);
      ctx.out(`sound: ${a}`);
    },
  };

  // Every way the internet says meow. Each answers in its own word, so `nya` says nya and
  // `мяу` says мяу; all of them make the cat react. Only `meow` is listed in help.
  const ENDINGS = ['.', '?', '~', '!', '.'];
  const meowIn = (name: string, hidden: boolean): Command => ({
    name,
    summary: hidden ? `meow, in another language` : 'meow (in many languages)',
    usage: name,
    group: 'world',
    hidden,
    run(ctx) {
      ctx.out(`=^..^=  ${name}${ENDINGS[Math.floor(env.random() * ENDINGS.length) % ENDINGS.length]}`);
      ctx.world.meow();
    },
  });
  const meows = [meowIn('meow', false), ...MEOW_ALIASES.map((n) => meowIn(n, true))];

  // tour: the desk shows itself off, step by step, and puts everything back
  const tour: Command = {
    name: 'tour',
    summary: 'a short walk around the desk',
    usage: 'tour',
    group: 'world',
    async run(ctx) {
      const w = ctx.world;
      if (!w.has3d()) {
        // the page view has no desk to walk around: say so briefly instead of 13 s of text
        ctx.out('tour: the tour walks around the 3d desk, and this view has none.');
        ctx.out([{ text: 'open alxnko.dev/?3d for it, or try ' }, { text: 'contacts', fg: 'accent', run: 'contacts' }, { text: ' and ' }, { text: 'fastfetch', fg: 'accent', run: 'fastfetch' }, { text: '.' }]);
        return;
      }
      const was = w.get();
      const say = (n: number, what: string, cmd: string) =>
        ctx.out([fg('muted', `${n}/5 `), { text: what + ' ' }, fg('muted', 'try: '), { text: cmd, fg: 'accent', run: cmd }]);
      const pause = () => ctx.sleep(2600);
      ctx.out([fg('muted', 'tour: five stops, about fifteen seconds. ctrl+c ends it.')]);
      try {
        w.fly('laptop');
        say(1, "the laptop: this terminal. it's real: pipes, history, tab completion.", 'ls ~/monitor | grep git');
        await pause();
        w.fly('monitor');
        say(2, 'the monitor: contacts, one click each.', 'contacts');
        await pause();
        w.fly('desk');
        say(3, 'the desk is sit-stand. up it goes.', 'desk 2');
        await untilAborted(w.setDesk(DESK_PRESETS['2']), ctx.signal);
        await pause();
        const hue = was.rgb === 'purple' ? 'cyan' : 'purple';
        say(4, 'one color runs the ring light, the keys, the cat and this terminal.', `rgb ${hue}`);
        w.setRgb(hue);
        await pause();
        say(5, 'and the cat on the fan.', 'meow');
        w.meow();
        await pause();
      } finally {
        // put the desk back as it was, even after ctrl+c
        const now = w.get();
        if (now.rgb !== was.rgb || now.accent !== was.accent) {
          w.setRgb(was.accent); // the accent comes back too when the lights were off
          if (was.rgb === 'off') w.setRgb('off');
        }
        if (Math.abs(w.get().desk - was.desk) > 0.005) void w.setDesk(was.desk);
        w.fly('desk');
      }
      ctx.out([{ text: 'that was the tour. everything else: ' }, { text: 'help', fg: 'accent', run: 'help' }]);
    },
  };

  return [theme, desk, rgb, ...rgbAliases, fan, sound, tour, ...meows];
}
