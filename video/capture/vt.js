// Injected before the site loads (capture.ts). Until __vt.start() everything runs on the real
// clock, so the page loads normally. After it, time only moves when the capture calls
// __vt.step(ms): JS timers, requestAnimationFrame, performance.now/Date.now and every CSS
// animation/transition all follow the virtual clock, so each captured frame is exactly one
// step later however long it took to render and grab. The page's WebAudio runs on an
// OfflineAudioContext on the same clock, so its sounds render sample-accurate with the picture.
(() => {
  const real = {
    now: performance.now.bind(performance),
    dateNow: Date.now,
    raf: window.requestAnimationFrame.bind(window),
    caf: window.cancelAnimationFrame.bind(window),
    st: window.setTimeout.bind(window),
    ct: window.clearTimeout.bind(window),
    si: window.setInterval.bind(window),
    ci: window.clearInterval.bind(window),
  };
  const FIRST_ID = 1e9; // virtual ids never collide with the browser's own
  let on = false, vNow = 0, dateOffset = 0, t0 = 0, nextId = FIRST_ID;
  const timers = new Map(); // id → { at, fn, args, every }
  const frames = new Map(); // id → callback
  const anims = new WeakMap(); // Animation → virtual start

  performance.now = () => (on ? vNow : real.now());
  Date.now = () => (on ? Math.round(vNow + dateOffset) : real.dateNow());

  const addTimer = (fn, ms, args, every) => {
    const id = nextId++;
    timers.set(id, { at: vNow + Math.max(0, Number(ms) || 0), fn, args, every });
    return id;
  };
  window.setTimeout = (fn, ms, ...args) => (on ? addTimer(fn, ms, args, 0) : real.st(fn, ms, ...args));
  window.setInterval = (fn, ms, ...args) => (on ? addTimer(fn, ms, args, Math.max(1, Number(ms) || 1)) : real.si(fn, ms, ...args));
  window.clearTimeout = (id) => (id >= FIRST_ID ? timers.delete(id) : real.ct(id));
  window.clearInterval = (id) => (id >= FIRST_ID ? timers.delete(id) : real.ci(id));
  window.requestAnimationFrame = (cb) => {
    if (!on) return real.raf(cb);
    const id = nextId++;
    frames.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => (id >= FIRST_ID ? frames.delete(id) : real.caf(id));

  // a macrotask yield that the virtual clock does not touch: promise chains settle
  const channel = new MessageChannel();
  const waiting = [];
  channel.port1.onmessage = () => waiting.shift()?.();
  const yieldTask = () => new Promise((r) => { waiting.push(r); channel.port2.postMessage(0); });

  const call = (fn, args) => {
    try { typeof fn === 'function' ? fn(...args) : (0, eval)(String(fn)); } catch (e) { console.error(e); }
  };

  // ---- audio: the site's WebAudio renders offline on the virtual clock ----
  const RATE = 48000, MAX_S = 90;
  let offline = null;
  const OAC = window.OfflineAudioContext;
  function VirtualAudioContext() {
    offline = new OAC(2, RATE * MAX_S, RATE);
    return new Proxy(offline, {
      get(target, key) {
        if (key === 'currentTime') return Math.max(0, (vNow - t0) / 1000);
        if (key === 'state') return 'running';
        if (key === 'resume' || key === 'suspend' || key === 'close') return () => Promise.resolve();
        const v = Reflect.get(target, key, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
  }
  window.AudioContext = VirtualAudioContext;
  window.webkitAudioContext = VirtualAudioContext;

  const wav = (buf, seconds) => {
    const n = Math.min(buf.length, Math.round(seconds * RATE)), ch = [buf.getChannelData(0), buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0)];
    const out = new DataView(new ArrayBuffer(44 + n * 4));
    const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
    out.setUint32(24, RATE, true); out.setUint32(28, RATE * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true);
    str(36, 'data'); out.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) out.setInt16(44 + i * 4 + c * 2, Math.max(-1, Math.min(1, ch[c][i])) * 0x7fff, true);
    let s = ''; const u = new Uint8Array(out.buffer);
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return btoa(s);
  };

  window.__vt = {
    get on() { return on; },
    /** Freeze the clock here; t = 0 of the capture (and of the audio timeline). */
    start() {
      vNow = real.now();
      t0 = vNow;
      dateOffset = real.dateNow() - vNow;
      on = true;
    },
    /** Advance ms: fire due timers in order (settling promises between), run the frame's
     *  rAF callbacks, then seek every CSS animation to the new time. */
    async step(ms) {
      const target = vNow + ms;
      for (let guard = 0; guard < 5000; guard++) {
        let id = -1, t = null;
        for (const [k, v] of timers) if (v.at <= target && (!t || v.at < t.at || (v.at === t.at && k < id))) { id = k; t = v; }
        if (!t) break;
        vNow = Math.max(vNow, t.at);
        if (t.every) t.at += t.every; else timers.delete(id);
        call(t.fn, t.args);
        await yieldTask();
      }
      vNow = target;
      const cbs = [...frames.values()];
      frames.clear();
      for (const cb of cbs) call(cb, [vNow]);
      await yieldTask();
      for (const a of document.getAnimations()) {
        if (!anims.has(a)) { anims.set(a, vNow - (Number(a.currentTime) || 0)); a.pause(); }
        a.currentTime = vNow - anims.get(a);
      }
      return vNow - t0;
    },
    /** The capture's audio as a 16-bit stereo WAV (base64), from t = 0. */
    async audio(seconds) {
      if (!offline) return null;
      const buf = await offline.startRendering();
      return wav(buf, seconds);
    },
  };
})();
