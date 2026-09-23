// Catspeak: the same engine as the lolnekobot Telegram bot (meowerse/workers/edge), adapted
// for a tty. A whole line made only of cat sounds, cute faces and a little laughter gets a
// cat reply (mirroring you most of the time) instead of "command not found"; a real word
// anywhere cancels it. Replies use tty tails instead of emoji. Pure, so it is unit-tested.

type Kind = 'cat' | 'face' | 'frag';

const SOUNDS: { re: RegExp; kind: Kind }[] = [
  // English / romanised
  { re: /^m+[eiy]*a*[ou]+w*$/iu, kind: 'cat' }, // meow, miaow, myaow, miau, miao
  { re: /^m+e+w+$/iu, kind: 'cat' }, // mew
  { re: /^n+y+a+n*$/iu, kind: 'cat' }, // nya, nyan, nyaaa
  { re: /^p+u+r+$/iu, kind: 'cat' }, // pur, purr
  { re: /^m+r+o+w+p*$/iu, kind: 'cat' }, // mrow, mrrowp
  { re: /^m+r+p+$/iu, kind: 'cat' }, // mrrp
  { re: /^r+a+w+r+$/iu, kind: 'cat' }, // rawr
  { re: /^c+h+i+r+p+$/iu, kind: 'cat' }, // chirp
  { re: /^[bp]+r+[tp]+$/iu, kind: 'cat' }, // brrt, prrt
  { re: /^f+u+r{2,}$/iu, kind: 'cat' }, // furr
  { re: /^f+r{2,}$/iu, kind: 'cat' }, // frr
  { re: /^m+l+e+m+$/iu, kind: 'cat' }, // mlem
  { re: /^b+l+e+p+$/iu, kind: 'cat' }, // blep
  { re: /^(?:p+s+){2,}$/iu, kind: 'cat' }, // pspsps
  { re: /^m+j+a+u+$/iu, kind: 'cat' }, // mjau
  { re: /^m+i+y+a+v+$/iu, kind: 'cat' }, // miyav
  // Russian / Kyrgyz
  { re: /^м+я+[увфкн]*$/iu, kind: 'cat' }, // мяу, мяв, мявк
  { re: /^м+и+[яуаове]*[увкн]*$/iu, kind: 'cat' }, // мияу, миу
  { re: /^м+у+р+л*ы*к*$/iu, kind: 'cat' }, // мур, мурр, мурлык
  { re: /^м+р+[ауяыео]+[увфкн]*$/iu, kind: 'cat' }, // мрау, мря
  { re: /^м+р*$/iu, kind: 'cat' }, // мр, мрррр
  { re: /^н+я+[нвфку]*$/iu, kind: 'cat' }, // ня, нян, няв
  { re: /^ф+ы*р+$/iu, kind: 'cat' }, // фыр, фрр
  { re: /^(?:п+с+){2,}$/iu, kind: 'cat' }, // пспспс
  // Japanese / Chinese / Korean
  { re: /^(?:にゃ+[ーん]*)+$/u, kind: 'cat' }, // にゃー, にゃん
  { re: /^喵+$/u, kind: 'cat' },
  { re: /^야+옹+$/u, kind: 'cat' },
  // Ambiguous fragments: only count when repeated
  { re: /^p+r+$/iu, kind: 'frag' },
  { re: /^m+r+$/iu, kind: 'frag' },
  { re: /^к+[иы]+с+$/iu, kind: 'frag' }, // кис, кыс
  // Faces / hearts
  { re: /^[:=;]+[3зЗ]+$/u, kind: 'face' }, // :3 :з =3
  { re: /^[uoуо]+[wвuу][uoуо]+$/iu, kind: 'face' }, // uwu, owo
  { re: /^\^[_w^.]*\^$/iu, kind: 'face' }, // ^^ ^_^ ^w^
  { re: /^[>＞]+[wшvв]+[<＜]+$/iu, kind: 'face' }, // >w<
  { re: /^(?:<3+|❤+|♥+)$/u, kind: 'face' },
  { re: /^=\^[._]\^=$/u, kind: 'face' }, // =^.^=
];

const FILLERS = [
  /^(?:l+o+l+|le+l|lma+o+|ro+fl+|x+d+|hh+|(?:ha|he|hi|ho){2,}|a?haha+)$/i,
  /^(?:(?:ах|ха|хе|хи|хо|хы){2,}[аеиоуы]*|кек+|ло+л|о+ру*)$/iu,
];

const VOICE = ['nya~', 'nyaa', 'meow', 'mrrp', 'purrr', 'mrrr', 'мяу', 'мур', 'мурр', 'фыр', 'ня', 'мрау'];
const TAILS = ['', '', '', '~', ' :3', ' ^^', ' =^.^='];
const TAILS_HYPE = ['!', '~', '!!', '!!~', ' :3', ' ^w^'];

export interface CatReply {
  text: string;
  /** "nyaaaa!!" energy: the cat reacts bigger. */
  excited: boolean;
  /** Praise ("good cat"): the cat purrs. */
  purr: boolean;
}

type Rand = () => number;
const pick = <T>(a: readonly T[], r: Rand) => a[Math.floor(r() * a.length) % a.length];

const SIGNATURES: { re: RegExp; reply: (r: Rand) => string; purr?: boolean }[] = [
  { re: /^\s*мяу\s+или\s+не\s+мяу\s*[?!.]*\s*$/iu, reply: () => 'мяу' },
  { re: /^\s*meow\s+or\s+not\s+meow\s*[?!.]*\s*$/iu, reply: () => 'meow' },
  { re: /\b(good|best)\s+(cat|kitty|kitten|boy|boi|girl)\b/i, reply: (r) => pick(['purr', 'mrrr', 'nya~'], r), purr: true },
  { re: /хорош(ий|ая|енький|енькая)\s+(кот|кошка|котик|кошечка|кот[её]нок|мальчик|девочка|кис(а|ка))/iu, reply: (r) => pick(['мур', 'мрр', 'мяу~'], r), purr: true },
];

/** The cat's answer to a whole line, or null if the line isn't catspeak. */
export function catspeak(line: string, r: Rand = Math.random): CatReply | null {
  const raw = line.trim();
  if (!raw) return null;
  for (const s of SIGNATURES) if (s.re.test(raw)) return { text: s.reply(r), excited: false, purr: !!s.purr };

  const tokens = raw.split(/[\s!.?~,–—()-]+/u).filter(Boolean);
  if (!tokens.length) return null;
  let cat = 0, face = 0, frag = 0, filler = 0;
  for (const t of tokens) {
    const s = SOUNDS.find((c) => c.re.test(t));
    if (s) { if (s.kind === 'cat') cat++; else if (s.kind === 'face') face++; else frag++; continue; }
    if (FILLERS.some((f) => f.test(t))) { filler++; continue; }
    return null; // a real word cancels the whole line
  }
  if (cat + face === 0 && !(frag >= 2 && filler === 0)) return null;

  const excited = /(.)\1\1/u.test(raw) || /!{2,}/.test(raw);
  const base = r() < 0.7 ? raw.slice(0, 60) : pick(VOICE, r);
  return { text: (base + pick(excited ? TAILS_HYPE : TAILS, r)).slice(0, 64), excited, purr: false };
}
