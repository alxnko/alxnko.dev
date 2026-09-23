// Optional, off-by-default soundscape (spec §3.7). Every sound is synthesized with
// WebAudio, so it ships zero audio files. The AudioContext is created only inside the
// user gesture that turns sound on (autoplay rules), and levels stay near-subliminal.
import type { FanSpeed, SoundLevel } from '../term/types';

const LEVEL: Record<SoundLevel, number> = { off: 0, low: 0.06, on: 0.12 };

export interface Sound {
  setLevel(l: SoundLevel): void;
  key(): void;
  enter(): void;
  tick(): void;
  motor(ms: number): void;
  /** Motor hum until the returned stop() is called (press-and-hold on the paddle). */
  motorHold(): () => void;
  meow(): void;
  fan(s: FanSpeed): void;
}

export function createSound(): Sound {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let fanGain: GainNode | null = null;
  let fanFilter: BiquadFilterNode | null = null;
  let noise: AudioBuffer | null = null;
  let level: SoundLevel = 'off';
  let fanSpeed: FanSpeed = 1;

  const ensure = () => {
    if (ctx) return ctx;
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC() as AudioContext;
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    // one second of brown noise, reused by every noisy sound
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    // fan hum: looping filtered brown noise
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    fanFilter = ctx.createBiquadFilter();
    fanFilter.type = 'lowpass';
    fanGain = ctx.createGain();
    src.connect(fanFilter).connect(fanGain).connect(master);
    src.start();
    applyFan();
    return ctx;
  };

  const applyFan = () => {
    if (!ctx || !fanGain || !fanFilter) return;
    const t = ctx.currentTime;
    fanGain.gain.setTargetAtTime([0, 0.25, 0.4, 0.55][fanSpeed], t, 0.4);
    fanFilter.frequency.setTargetAtTime([80, 260, 420, 620][fanSpeed], t, 0.4);
  };

  const burst = (freq: number, q: number, dur: number, gain: number) => {
    if (!ctx || !master || !noise || level === 'off') return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.5, dur + 0.02);
  };

  return {
    setLevel(l) {
      level = l;
      if (l === 'off' && !ctx) return;
      const c = ensure();
      if (!c || !master) return;
      if (c.state === 'suspended') void c.resume();
      master.gain.setTargetAtTime(LEVEL[l], c.currentTime, 0.15);
    },
    key() { burst(2400 + Math.random() * 900, 1.2, 0.035, 0.7); },
    enter() { burst(1500, 1, 0.07, 0.9); },
    tick() { burst(3200, 3, 0.02, 0.5); },
    motor(ms) {
      if (!ctx || !master || level === 'off') return;
      const t = ctx.currentTime, end = t + ms / 1000;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(58, t);
      o.frequency.linearRampToValueAtTime(64, end);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 240;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.12);
      g.gain.setValueAtTime(0.35, end - 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      o.connect(f).connect(g).connect(master);
      o.start(t);
      o.stop(end + 0.05);
    },
    motorHold() {
      if (!ctx || !master || level === 'off') return () => {};
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 60;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 240;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.12);
      o.connect(f).connect(g).connect(master);
      o.start(t);
      return () => {
        if (!ctx) return;
        const e = ctx.currentTime;
        g.gain.cancelScheduledValues(e);
        g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), e);
        g.gain.exponentialRampToValueAtTime(0.0001, e + 0.15);
        o.stop(e + 0.2);
      };
    },
    meow() {
      if (!ctx || !master || level === 'off') return;
      // a voiced source swept through a moving formant: "mi-aa-ow"
      const t = ctx.currentTime, d = 0.45;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(520, t);
      o.frequency.linearRampToValueAtTime(760, t + d * 0.35);
      o.frequency.exponentialRampToValueAtTime(430, t + d);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 6;
      f.frequency.setValueAtTime(700, t);
      f.frequency.linearRampToValueAtTime(1200, t + d * 0.4);
      f.frequency.linearRampToValueAtTime(500, t + d);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(f).connect(g).connect(master);
      o.start(t);
      o.stop(t + d + 0.05);
    },
    fan(s) {
      fanSpeed = s;
      applyFan();
    },
  };
}
