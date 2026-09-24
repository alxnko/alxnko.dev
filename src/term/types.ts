// Shared contracts between the terminal core, its renderers, and the 3D world.

export type Color =
  | 'fg' | 'muted' | 'dim' | 'white'
  | 'green' | 'amber' | 'red' | 'blue' | 'magenta' | 'cyan'
  /** The site accent (`rgb`): green by default; `green` itself is the fixed ANSI green. */
  | 'accent';

export interface Span {
  text: string;
  fg?: Color;
  bold?: boolean;
  /** Only ever set from LINK_ALLOWLIST (see format.link). */
  href?: string;
  /** Decorative (ASCII/block art): shown, but skipped by screen readers. */
  art?: boolean;
  /** A command line: the span is a button that runs it (help's command names, hints). */
  run?: string;
  /**
   * An exact #rrggbb for the text, drawn over `fg` (the `rgb` chips, each in its own colour's
   * dark-theme shade). Renderers apply it only when it is a strict six-digit hex.
   */
  swatch?: string;
}
export type Line = Span[];

export type Landmark = 'wide' | 'desk' | 'laptop' | 'monitor';
export type Theme = 'dark' | 'light';
export type SoundLevel = 'off' | 'low' | 'on';
export type FanSpeed = 0 | 1 | 2 | 3;

export interface WorldState {
  theme: Theme;
  /** Desk top height in meters. */
  desk: number;
  /** `rgb`: a preset name, `#rrggbb` or `off` (normalised by lib/rgb parseRgb). */
  rgb: string;
  /** The accent in use: `rgb` unless that is `off`, then the last colour (never `off`). */
  accent: string;
  fan: FanSpeed;
  sound: SoundLevel;
  landmark: Landmark;
}

/** Everything the terminal may ask the world to do. Implemented by the 3D scene, or NullWorld. */
export interface WorldPort {
  get(): WorldState;
  /** True once the 3D desk is up (the page view has no camera to move). */
  has3d(): boolean;
  fly(to: Landmark): void;
  /** Resolves when the desk has finished moving. */
  setDesk(h: number): Promise<void>;
  setTheme(t: Theme): void;
  /** A normalised spec (lib/rgb parseRgb): the accent everywhere, the desk's RGB lights. */
  setRgb(spec: string): void;
  setFan(s: FanSpeed): void;
  setSound(l: SoundLevel): void;
  meow(): void;
  /** The one scene secret: the cat stares into the camera. */
  stare(): void;
  sfx(kind: 'key' | 'enter' | 'tick'): void;
}

export interface TermState {
  lines: Line[];
  input: string;
  cursor: number;
  /** Absolute path. */
  cwd: string;
  busy: boolean;
  /** Enter pressed while busy: the line to run once the prompt returns (at most one; ^C drops it). */
  queued: string | null;
  history: string[];
  /** Transient full-screen toy frame (cmatrix); null normally. */
  overlay: Line[] | null;
  /** The same for the monitor (cmatrix --both): the 3D monitor, or the contacts on the page. */
  monitor: Line[] | null;
  /** Monotonic; bumps on every mutation. */
  version: number;
}

export interface CommandCtx {
  args: string[];
  stdin: string | null;
  cwd: string;
  world: WorldPort;
  out(line: Line | string): void;
  err(text: string): void;
  setCwd(path: string): void;
  clear(): void;
  signal: AbortSignal;
  sleep(ms: number): Promise<void>;
  history(): string[];
  /**
   * The command takes over the keyboard while it runs (a full-screen toy owns the tty): every
   * key but ctrl+c and Esc goes to `fn` instead of the prompt. Released when the command ends.
   */
  onKey(fn: (key: string) => void): void;
}

export interface Command {
  name: string;
  summary: string;
  usage: string;
  group: 'info' | 'files' | 'world' | 'fun' | 'text';
  hidden?: boolean;
  /** A built-in alias (hidden): help and man show this command's page instead. */
  aliasOf?: string;
  /** What `--help` prints (default: usage, summary and a pointer to man). */
  help?: () => string[] | Promise<string[]>;
  complete?(args: string[], cwd: string): string[];
  /** Non-zero exit: throw ExitError. */
  run(ctx: CommandCtx): void | Promise<void>;
}

export class ExitError extends Error {
  constructor(public code = 1) {
    super(`exit ${code}`);
  }
}
