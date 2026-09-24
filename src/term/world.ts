// WorldPort (see types.ts) and NullWorld: an in-memory world for tests and the no-3D fallback.
import type { FanSpeed, Landmark, SoundLevel, Theme, WorldPort, WorldState } from './types';

export type { WorldPort, WorldState } from './types';

export const DEFAULT_WORLD: Readonly<WorldState> = {
  theme: 'dark',
  desk: 0.74,
  rgb: 'green',
  accent: 'green',
  fan: 1,
  sound: 'off',
  landmark: 'desk',
};

export class NullWorld implements WorldPort {
  private s: WorldState;

  constructor(initial: Partial<WorldState> = {}, public threeD = false) {
    this.s = { ...DEFAULT_WORLD, ...initial };
  }

  has3d(): boolean {
    return this.threeD;
  }

  get(): WorldState {
    return { ...this.s };
  }
  fly(to: Landmark): void {
    this.s.landmark = to;
  }
  setDesk(h: number): Promise<void> {
    this.s.desk = h;
    return Promise.resolve();
  }
  setTheme(t: Theme): void {
    this.s.theme = t;
  }
  setRgb(spec: string): void {
    this.s.rgb = spec;
    if (spec !== 'off') this.s.accent = spec;
  }
  setFan(f: FanSpeed): void {
    this.s.fan = f;
  }
  setSound(l: SoundLevel): void {
    this.s.sound = l;
  }
  meow(): void {}
  stare(): void {}
  sfx(_kind: 'key' | 'enter' | 'tick'): void {}
}
