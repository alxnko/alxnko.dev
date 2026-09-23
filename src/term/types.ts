// Shared contracts between the terminal core, its renderers, and the 3D world.

export type Color =
  | 'fg' | 'muted' | 'dim' | 'white'
  | 'green' | 'amber' | 'red' | 'blue' | 'magenta' | 'cyan';

export interface Span {
  text: string;
  fg?: Color;
  bold?: boolean;
  /** Only ever set from LINK_ALLOWLIST (see format.link). */
  href?: string;
  /** Decorative (ASCII/block art): shown, but skipped by screen readers. */
  art?: boolean;
}
export type Line = Span[];

export type Landmark = 'wide' | 'desk' | 'laptop' | 'monitor';
export type Theme = 'dark' | 'light';
export type Ring = 'green' | 'purple' | 'off';
export type SoundLevel = 'off' | 'low' | 'on';
export type FanSpeed = 0 | 1 | 2 | 3;

export interface WorldState {
  theme: Theme;
  /** Desk top height in meters. */
  desk: number;
  ring: Ring;
  fan: FanSpeed;
  sound: SoundLevel;
  landmark: Landmark;
}

/** Everything the terminal may ask the world to do. Implemented by the 3D scene, or NullWorld. */
export interface WorldPort {
  get(): WorldState;
  fly(to: Landmark): void;
  /** Resolves when the desk has finished moving. */
  setDesk(h: number): Promise<void>;
  setTheme(t: Theme): void;
  setRing(r: Ring): void;
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
  history: string[];
  /** Transient full-screen toy frame (cmatrix); null normally. */
  overlay: Line[] | null;
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
}

export interface Command {
  name: string;
  summary: string;
  usage: string;
  group: 'info' | 'files' | 'world' | 'fun' | 'text';
  hidden?: boolean;
  complete?(args: string[], cwd: string): string[];
  /** Non-zero exit: throw ExitError. */
  run(ctx: CommandCtx): void | Promise<void>;
}

export class ExitError extends Error {
  constructor(public code = 1) {
    super(`exit ${code}`);
  }
}
