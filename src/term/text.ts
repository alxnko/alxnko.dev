// The long text, loaded on first use (R75): the manual pages, the --help texts of cmatrix and
// pacman, and the plain-language / cat-sound answers of the shell. None of it is needed to
// boot the terminal, so it stays out of the initial bundle.
import { MEOW_ALIASES } from './commands/world';
import { MATRIX_COLORS } from './commands/toys';
import { PRESET_NAMES } from '../lib/rgb';

export { catspeak } from './catspeak';
export { phrase } from './phrases';

export const MAN: Record<string, string> = {
  help: 'Lists the commands on this machine, the most fun first; click one to run it. help name shows how to use one.',
  contacts: 'Lists the ways to reach alxnko, as links. open name opens one (open github). Short links work too: alxnko.dev/gh, /tg, /in, /ig and /mail.',
  tour: 'A short walk around the desk: the laptop, the monitor, the desk motor, the rgb lights and the cat. Everything is put back afterwards. ctrl+c ends it early.',
  alias: "Without arguments, lists the aliases (ll and la are there from the start). alias name='command' defines one for this visit, unalias name removes it.",
  man: 'Formats and displays these manual pages. Pages are short on purpose.',
  fastfetch: 'Prints system information beside the cat mark. --compact skips contacts and colors.',
  ls: 'Lists directory contents. -a includes dotfiles, -l uses a long listing format. Directories end in /.',
  cd: 'Changes the working directory. Directories bound to a place on the desk (~, laptop, monitor, /) move the camera there. cd - goes back.',
  cat: 'Concatenates files to standard output. Files under ~/desk reflect the live state of the desk.',
  open: 'Opens a contact in a new tab. Only the five contacts and the committers.top rank are allowed.',
  desk: 'Moves the sit-stand desk. Presets 1, 2, 3 are 74, 95 and 112 cm; up and down step 5 cm within 70 to 120 cm.',
  theme: 'Switches between day and night lighting. Without an argument, toggles.',
  rgb: `One color for the whole desk: the ring light, its glow on the wall, the fan ring, both keyboard backlights, the accent keys, the cat, and this site's accent (links, prompt, cursor). Presets: ${PRESET_NAMES.join(', ')}. Any #rgb or #rrggbb works too (rgb #ff8800); its text shades are worked out so they stay readable by day and by night. rgb off turns the lights off and gives the keys and the cat their own colors back; the accent keeps the last color, and rgb on brings the lights back. Without an argument, shows the color and the presets. Also answers to color, colour and ring. Kept for this browser.`,
  fan: 'Sets the desk fan speed 0 to 3. Without an argument, cycles.',
  sound: 'Sets the sound level. All sounds are synthesized; off by default.',
  meow: `Meows, and the cat on the fan reacts. Also answers to: ${MEOW_ALIASES.join(', ')}.`,
  cmatrix: 'Shows falling characters until you quit with q or ctrl+c (on a phone, tap ^C). Esc leaves it running (in 3D it steps back to the desk). -s is screensaver mode: any key quits. The rain takes the accent color (see rgb); -C color picks another: green, red, blue, white, yellow, cyan or magenta. --both rains on the monitor too; on the page without 3D it covers the contacts.',
  pacman: 'Package manager. -Syu synchronizes and upgrades the system.',
  grep: 'Prints lines matching a fixed-string pattern. -i ignores case, -v inverts the match.',
  history: 'Shows the last commands, numbered. Kept for this browser only. history -c forgets them.',
  exit: 'Logs out, which here means stepping back from the desk.',
};

export const CMATRIX_HELP = [
  'usage: cmatrix [-s] [-C color] [--both]',
  ' -s          screensaver mode: any key quits',
  ` -C color    rain color (default: the rgb accent): ${Object.keys(MATRIX_COLORS).join(', ')}`,
  ' --both      rain on the monitor too',
  ' -h          print this help',
  'quit with q or ctrl+c. esc leaves it running (in 3d it steps back to the desk).',
];

export const PACMAN_HELP = [
  'usage:  pacman <operation> [...]',
  'operations:',
  '    pacman {-h --help}',
  '    pacman {-V --version}',
  '    pacman {-S --sync}    [options] [package(s)]',
  '',
  "try 'pacman -Syu': it synchronizes and upgrades the system.",
];
