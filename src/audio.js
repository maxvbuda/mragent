/**
 * Every sound is synthesised with WebAudio: key clicks, servo whirs, footsteps,
 * the coffee machine, the Mac's boot chime, UI ticks and a small lo-fi music engine.
 */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
    this.musicGain = null;
  }

  /** Browsers only allow sound after a user gesture; call this from one. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? this.volume : 0;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.9;
      this.sfx.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.55;
      this.musicGain.connect(this.master);
      this.noiseBuf = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.05);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master && this.enabled) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 1.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  noise({ dur = 0.05, freq = 3000, q = 1, type = 'bandpass', gain = 0.3, attack = 0.002, at = 0, pan = 0, sweepTo = null } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(this.sfx);
    src.start(t, Math.random() * 1.2);
    src.stop(t + dur + 0.05);
  }

  tone({ freq = 440, dur = 0.2, type = 'sine', gain = 0.2, attack = 0.005, at = 0, slideTo = null, dest = null, release = null } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (release ?? dur));
    o.connect(g).connect(dest || this.sfx);
    o.start(t);
    o.stop(t + (release ?? dur) + 0.05);
  }

  // ------------------------------------------------------------ robot & room
  key(kind = 'key', pan = 0) {
    const big = kind === 'space' || kind === 'enter' || kind === 'backspace';
    this.noise({ dur: big ? 0.07 : 0.035, freq: big ? 1800 : 3200 + Math.random() * 1600, q: 2.5, gain: big ? 0.22 : 0.14, pan });
    this.noise({ dur: 0.02, freq: 7000, q: 4, gain: 0.05, at: 0.012, pan });
  }

  servo(dur = 0.4, pitch = 1) {
    if (!this.ready) return;
    this.tone({ freq: 180 * pitch, slideTo: 260 * pitch, dur, type: 'sawtooth', gain: 0.025, attack: 0.05 });
    this.noise({ dur, freq: 900 * pitch, q: 6, gain: 0.03, attack: 0.05 });
  }

  step() {
    this.tone({ freq: 90, slideTo: 50, dur: 0.12, type: 'sine', gain: 0.18 });
    this.noise({ dur: 0.05, freq: 2400, q: 3, gain: 0.04, at: 0.01 });
  }

  sip() {
    this.noise({ dur: 0.5, freq: 1200, sweepTo: 2600, q: 3, gain: 0.08, attack: 0.08 });
    this.noise({ dur: 0.25, freq: 600, q: 2, gain: 0.05, at: 0.45 });
  }

  whoosh() { this.noise({ dur: 0.5, freq: 400, sweepTo: 2000, q: 0.8, gain: 0.12, attack: 0.15 }); }

  happy() {
    [880, 1175, 1568].forEach((f, i) => this.tone({ freq: f, dur: 0.18, type: 'triangle', gain: 0.07, at: i * 0.08 }));
  }

  beep() { this.tone({ freq: 1320, dur: 0.12, type: 'square', gain: 0.04 }); }

  brew(seconds = 4) {
    if (!this.ready) return;
    this.noise({ dur: seconds, freq: 300, q: 1.2, gain: 0.07, attack: 0.3, type: 'lowpass' });
    this.tone({ freq: 55, dur: seconds, type: 'sawtooth', gain: 0.025, attack: 0.3 });
    this.noise({ dur: seconds * 0.7, freq: 2400, q: 8, gain: 0.025, attack: 0.5, at: 0.6 });
  }

  // ------------------------------------------------------------ Mac
  chime() {
    if (!this.ready) return;
    [174.6, 220, 261.6, 349.2, 440].forEach((f) => {
      this.tone({ freq: f, dur: 2.6, type: 'sine', gain: 0.06, attack: 0.02, release: 2.6 });
      this.tone({ freq: f * 2.003, dur: 2, type: 'sine', gain: 0.015, attack: 0.02 });
    });
  }

  click() { this.noise({ dur: 0.02, freq: 4500, q: 3, gain: 0.05 }); }
  pop() { this.tone({ freq: 600, slideTo: 1200, dur: 0.08, type: 'sine', gain: 0.06 }); }
  trash() { this.noise({ dur: 0.4, freq: 1500, sweepTo: 300, q: 1, gain: 0.12 }); }
  error() { this.tone({ freq: 220, dur: 0.18, type: 'square', gain: 0.04 }); this.tone({ freq: 196, dur: 0.18, type: 'square', gain: 0.04, at: 0.16 }); }
  message() { this.tone({ freq: 1046, dur: 0.15, type: 'sine', gain: 0.08 }); this.tone({ freq: 1568, dur: 0.25, type: 'sine', gain: 0.07, at: 0.09 }); }
  screenshot() { this.noise({ dur: 0.08, freq: 3000, q: 2, gain: 0.15 }); this.noise({ dur: 0.1, freq: 2000, q: 2, gain: 0.12, at: 0.12 }); }
}

export const audio = new AudioEngine();

/**
 * Procedural lo-fi: Rhodes-ish chords, a soft kick/snare/hat pattern and a
 * pentatonic melody, all scheduled ahead on the audio clock.
 */
export class LofiPlayer {
  constructor(engine) {
    this.a = engine;
    this.playing = false;
    this.track = 0;
    this.listeners = new Set();
    this.level = 0;
  }

  static TRACKS = [
    { title: 'Compile & Chill', artist: 'Mr. Agent', bpm: 76, root: 57, prog: [[0, 4, 7, 11], [5, 9, 12, 16], [2, 5, 9, 12], [7, 11, 14, 17]] },
    { title: 'Late Night Linting', artist: 'Mr. Agent', bpm: 70, root: 53, prog: [[0, 3, 7, 10], [5, 8, 12, 15], [-2, 2, 5, 9], [3, 7, 10, 14]] },
    { title: 'Merge Conflict Blues', artist: 'The Rebasers', bpm: 84, root: 55, prog: [[0, 4, 7, 10], [5, 9, 12, 15], [0, 4, 7, 10], [7, 10, 14, 17]] },
    { title: 'Espresso Shot (9 bar mix)', artist: 'Coffee.rs', bpm: 90, root: 60, prog: [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]] },
  ];

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  notify() { this.listeners.forEach((f) => f(this)); }

  get info() { return LofiPlayer.TRACKS[this.track]; }

  play(i = this.track) {
    this.a.unlock();
    if (!this.a.ready) return;
    this.track = (i + LofiPlayer.TRACKS.length) % LofiPlayer.TRACKS.length;
    this.stopTimer();
    this.playing = true;
    this.bar = 0;
    this.started = performance.now();
    this.nextTime = this.a.ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), 50);
    this.notify();
  }

  pause() { this.playing = false; this.stopTimer(); this.notify(); }
  toggle() { this.playing ? this.pause() : this.play(); }
  next() { this.play(this.track + 1); }
  prev() { this.play(this.track - 1); }
  stopTimer() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  schedule() {
    const ctx = this.a.ctx, tr = this.info;
    const spb = 60 / tr.bpm / 4; // 16th notes
    while (this.nextTime < ctx.currentTime + 0.25) {
      const s = this.step % 16, bar = Math.floor(this.step / 16);
      const chord = tr.prog[bar % tr.prog.length];
      const t = this.nextTime - ctx.currentTime;
      const swing = s % 2 ? spb * 0.18 : 0;
      const dest = this.a.musicGain;
      const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
      if (s === 0 || s === 8) chord.forEach((n) => this.a.tone({ freq: hz(tr.root + n), dur: spb * 7, type: 'triangle', gain: 0.03, attack: 0.03, at: t, dest }));
      if (s === 0) this.a.tone({ freq: hz(tr.root - 12 + chord[0]), dur: spb * 6, type: 'sine', gain: 0.12, at: t, dest });
      if (s === 0 || s === 10) { this.a.tone({ freq: 120, slideTo: 45, dur: 0.22, type: 'sine', gain: 0.35, at: t, dest }); this.level = 1; }
      if (s === 4 || s === 12) this.a.noise({ dur: 0.18, freq: 1800, q: 0.7, gain: 0.12, at: t + swing });
      if (s % 2 === 0) this.a.noise({ dur: 0.03, freq: 8000, q: 1, type: 'highpass', gain: 0.03 + (s % 4 === 2 ? 0.02 : 0), at: t + swing });
      if ((s === 3 || s === 6 || s === 11 || s === 14) && Math.random() < 0.7) {
        const scale = [0, 3, 5, 7, 10, 12, 15];
        this.a.tone({ freq: hz(tr.root + 12 + scale[Math.floor(Math.random() * scale.length)]), dur: spb * 3, type: 'sine', gain: 0.05, at: t + swing, dest });
      }
      this.nextTime += spb;
      this.step++;
    }
    this.level *= 0.8;
  }

  /** Seconds since the current track started. */
  get elapsed() { return this.playing ? (performance.now() - this.started) / 1000 : 0; }
}

export const music = new LofiPlayer(audio);
