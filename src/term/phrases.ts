// The shell's command_not_found_handle for people, not typos: a few plain-language lines a
// visitor may type ("hi", "who are you", "how can i contact you") answer with the real command that does
// it. A line that means a command runs that command, shown first as a `#` comment so the
// visitor learns it; a greeting just answers. Cat sounds are catspeak's (checked before this).
import type { Line } from './types';

export interface Phrase {
  /** Printed first (a comment line, or the whole answer). */
  say: Line;
  /** The command line this phrase stands for; run after `say`. */
  run?: string;
}

const tip = (cmd: string): Line => [{ text: cmd, fg: 'accent', run: cmd }];
const comment = (cmd: string): Line => [{ text: `# ${cmd}`, fg: 'muted' }];

const MEANS: [RegExp, string][] = [
  [/^(who are you|who is this|who r u|whoareyou|who am i talking to|who made this|whose site is this)$/, 'whoami -v'],
  [/^(about|about me|about you|tell me about (yourself|you|him)|what do you do)$/, 'cat ~/about.md'],
  [/^(how (do i|can i|to) (contact|reach|message|write to) (you|him|alex)|get in touch|email|e-mail|mail|socials|links)$/, 'contacts'],
  [/^(what is this|whats this|what can i do( here)?|what do i do|how does this work|commands|menu|start|i need help|\?)$/, 'help'],
  [/^(show me around|take me on a tour|demo|show me)$/, 'tour'],
  [/^(quit|bye|goodbye|log ?out)$/, 'exit'],
  [/^cls$/, 'clear'],
];

const HELLO = /^(hi|hii+|hello|hey|hey there|hello there|hi there|yo|sup|good (morning|evening|afternoon)|привет|салам|салют|hola|salut|ciao)$/;
const THANKS = /^(thanks|thank you|thx|ty|спасибо|рахмат)$/;
const CONTACTS = /^(github|telegram|linkedin|instagram)$/;

/** Normalises a typed line: lower case, no trailing punctuation, single spaces. */
const norm = (s: string) => s.trim().toLowerCase().replace(/[!.,]+$/g, '').replace(/[’']/g, '').replace(/\s+/g, ' ');

export function phrase(src: string): Phrase | null {
  const s = norm(src);
  if (!s) return null;
  if (HELLO.test(s)) return { say: [{ text: 'hi. this is a real terminal: type a command and press enter. start with ' }, ...tip('help'), { text: ' or ' }, ...tip('tour'), { text: '.' }] };
  if (THANKS.test(s)) return { say: [{ text: 'anytime. meow.' }] };
  if (CONTACTS.test(s)) return { say: [{ text: `${s} is a contact, not a command. try ` }, ...tip(`open ${s}`), { text: '.' }] };
  for (const [re, cmd] of MEANS) if (re.test(s.replace(/\?+$/, '')) || re.test(s)) return { say: comment(cmd), run: cmd };
  return null;
}
