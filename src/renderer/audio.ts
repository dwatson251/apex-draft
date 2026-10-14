import { vehicleOf, type VehicleId } from "@apex/sim";

/** Everything you hear is synthesised: engines, squeal, a quiet backing track, crowd, wheel guns, radio, aeroplanes. */
interface Voice {
  osc: OscillatorNode[];
  filter: BiquadFilterNode;
  hum: GainNode;
  noise: AudioBufferSourceNode;
  band: BiquadFilterNode;
  squeal: GainNode;
  pan: StereoPannerNode | null;
  out: GainNode;
  pitch: number;
}

export interface CarSound {
  /** units/s */
  speed: number;
  /** units/s², negative when braking */
  accel: number;
  /** 0 to 1: how hard the tyres are working in a corner */
  slip: number;
  /** 0 to 1: how close the car is to the camera */
  vol: number;
  /** -1 to 1 */
  pan: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** A small deterministic generator so the backing track repeats the same way every time. */
const rnd = (n: number) => { let t = (n * 0x9e3779b1) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// Am  F  C  G, as MIDI notes: bass root, then the notes the melody may use
const CHORDS = [
  { root: 45, tones: [69, 72, 76, 79] },
  { root: 41, tones: [69, 72, 77, 81] },
  { root: 48, tones: [67, 72, 76, 79] },
  { root: 43, tones: [67, 71, 74, 79] },
];
const BPM = 98;

export class CarAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private fx: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new Map<string, Voice>();
  private muted = false;
  private ducked = false;
  private musicOn = true;
  private musicTimer: number | null = null;
  private nextStep = 0;
  private stepNo = 0;
  private rainVoice: { gain: GainNode; noise: AudioBufferSourceNode } | null = null;
  private plane: { gain: GainNode; osc: OscillatorNode[]; noise: AudioBufferSourceNode; filter: BiquadFilterNode; pan: StereoPannerNode | null } | null = null;

  /** Needs a user gesture the first time; call it from a click. */
  unlock(): void {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.fx = this.ctx.createGain(); this.fx.gain.value = 1; this.fx.connect(this.master);
        this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.085; this.musicBus.connect(this.master);
        const len = this.ctx.sampleRate * 2;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.applyMaster();
        try { window.speechSynthesis?.getVoices(); } catch { /* no speech */ }
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      if (this.musicOn) this.startMusic();
    } catch { this.ctx = null; }
  }

  setMuted(m: boolean): void { this.muted = m; this.applyMaster(); }
  isMuted(): boolean { return this.muted; }
  /** Fast-forward: the engines would just be a chirp. */
  setDucked(d: boolean): void { if (d !== this.ducked) { this.ducked = d; this.applyMaster(); } }
  /** The app is in the background (Android): stop the audio clock; coming back resumes it. */
  setSuspended(s: boolean): void {
    if (!this.ctx) return;
    if (s) void this.ctx.suspend(); else void this.ctx.resume();
  }
  setMusic(on: boolean): void {
    this.musicOn = on;
    if (on) this.startMusic(); else this.stopMusic();
  }
  isMusic(): boolean { return this.musicOn; }

  private applyMaster(): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.08);
    this.fx?.gain.setTargetAtTime(this.ducked ? 0 : 1, this.ctx.currentTime, 0.08);
  }

  // ---------- engines ----------
  private make(type: VehicleId | undefined): Voice | null {
    const ctx = this.ctx!, veh = vehicleOf(type);
    const out = ctx.createGain();
    out.connect(this.fx!);
    let pan: StereoPannerNode | null = null;
    let sink: AudioNode = out;
    if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); pan.connect(out); sink = pan; }
    const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.Q.value = 0.7 + veh.buzz;
    const hum = ctx.createGain(); hum.gain.value = 0;
    const o1 = ctx.createOscillator(); o1.type = veh.buzz > 0.7 ? "square" : "triangle";
    const o2 = ctx.createOscillator(); o2.type = "sawtooth";
    const g2 = ctx.createGain(); g2.gain.value = 0.2 + 0.4 * veh.buzz;
    o1.connect(filter); o2.connect(g2); g2.connect(filter);
    filter.connect(hum); hum.connect(sink);
    const noise = ctx.createBufferSource(); noise.buffer = this.noise; noise.loop = true;
    const band = ctx.createBiquadFilter(); band.type = "bandpass"; band.Q.value = 7;
    const squeal = ctx.createGain(); squeal.gain.value = 0;
    noise.connect(band); band.connect(squeal); squeal.connect(sink);
    o1.start(); o2.start(); noise.start();
    return { osc: [o1, o2], filter, hum, noise, band, squeal, pan, out, pitch: veh.pitch };
  }

  update(id: string, type: VehicleId | undefined, s: CarSound, player: boolean): void {
    if (!this.ctx || !this.master) return;
    let v = this.voices.get(id);
    if (!v) { v = this.make(type) ?? undefined; if (!v) return; this.voices.set(id, v); }
    const t = this.ctx.currentTime, k = 0.06;
    const lift = clamp(s.accel / 120, -0.6, 1);
    const f = (46 + s.speed * 0.9 + lift * 10) * v.pitch;
    v.osc[0]!.frequency.setTargetAtTime(f, t, k);
    v.osc[1]!.frequency.setTargetAtTime(f * 0.5 + 0.7, t, k);
    v.filter.frequency.setTargetAtTime((220 + s.speed * 3.4 + Math.max(0, lift) * 260 - Math.max(0, -lift) * 80) * (0.7 + 0.3 * v.pitch), t, k);
    const level = (player ? 0.05 : 0.026) * (0.65 + 0.35 * clamp(0.5 + lift, 0, 1)) * s.vol;
    v.hum.gain.setTargetAtTime(s.speed < 1 ? 0 : level, t, k);
    v.band.frequency.setTargetAtTime(1500 + s.speed * 5 + s.slip * 500, t, k);
    v.squeal.gain.setTargetAtTime(s.slip * s.slip * (player ? 0.05 : 0.03) * s.vol, t, 0.04);
    if (v.pan) v.pan.pan.setTargetAtTime(clamp(s.pan, -0.9, 0.9), t, k);
  }

  /** Silence one car, e.g. when it has finished. */
  hush(id: string): void {
    const v = this.voices.get(id);
    if (v && this.ctx) { v.hum.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); v.squeal.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); }
  }

  stopAll(): void {
    for (const v of this.voices.values()) {
      try { v.osc.forEach((o) => o.stop()); v.noise.stop(); v.out.disconnect(); } catch { /* already stopped */ }
    }
    this.voices.clear();
    this.planeSound(null);
    this.rain(0);
  }

  // ---------- one-shots ----------
  private burst(dest: AudioNode, t: number, dur: number, freq: number, q: number, peak: number, attack = 0.01): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
    return g;
  }

  /** A crowd roaring as you go past: formant-filtered noise swelling and flickering, with a few whoops. All random. */
  cheer(strength = 0.5 + Math.random() * 0.5): void {
    if (!this.ctx || !this.fx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.02, dur = 1.5 + Math.random() * 1.8;
    const bus = ctx.createGain(); bus.gain.value = 0.16 * strength; bus.connect(this.fx);
    const roar = this.burst(bus, t, dur, 800 + Math.random() * 300, 0.9, 1, 0.3 + Math.random() * 0.3);
    this.burst(bus, t, dur, 2100 + Math.random() * 600, 1.3, 0.6, 0.35);
    for (let x = 0.15; x < dur * 0.8; x += 0.06 + Math.random() * 0.05) roar.gain.setValueAtTime(0.5 + Math.random() * 0.6, t + x);
    for (let i = 0, n = 3 + Math.floor(Math.random() * 4); i < n; i++) {
      const st = t + Math.random() * dur * 0.55, len = 0.3 + Math.random() * 0.35, f0 = 260 + Math.random() * 260;
      const o = ctx.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(f0, st); o.frequency.linearRampToValueAtTime(f0 * 1.55, st + len * 0.45); o.frequency.linearRampToValueAtTime(f0 * 1.2, st + len);
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900 + Math.random() * 500; bp.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(0.1, st + 0.06); g.gain.linearRampToValueAtTime(0, st + len);
      o.connect(bp); bp.connect(g); g.connect(bus);
      o.start(st); o.stop(st + len + 0.05);
    }
    window.setTimeout(() => bus.disconnect(), (dur + 1) * 1000);
  }

  /** Wheel guns in the pit box: four bursts of rattling impacts and a clunk, spread over `seconds`. */
  drill(seconds = 2, strength = 1): void {
    if (!this.ctx || !this.fx) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    const bus = ctx.createGain(); bus.gain.value = 0.2 * strength; bus.connect(this.fx);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200; lp.connect(bus);
    const span = Math.max(0.8, seconds - 0.3);
    for (let k = 0; k < 4; k++) {
      const st = t0 + 0.1 + (k * span) / 4, len = 0.22 + Math.random() * 0.06;
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(150 + Math.random() * 60, st); o.frequency.linearRampToValueAtTime(230, st + len);
      const g = ctx.createGain();
      for (let i = 0; i * 0.017 < len; i++) g.gain.setValueAtTime(i % 2 ? 0.05 : 0.9, st + i * 0.017);
      g.gain.setValueAtTime(0, st + len);
      o.connect(g); g.connect(lp);
      o.start(st); o.stop(st + len + 0.02);
      this.burst(lp, st, len, 2400, 1.2, 0.5, 0.005);
      this.burst(lp, st + len, 0.09, 700, 2, 0.8, 0.003); // the clunk when the nut comes off
    }
    window.setTimeout(() => bus.disconnect(), (seconds + 1.5) * 1000);
  }

  /** Two cars touching: a dull thump and a bit of metal. Harder hits are louder and longer. */
  bump(strength: number): void {
    if (!this.ctx || !this.fx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01, k = Math.min(1, strength / 60);
    const bus = ctx.createGain(); bus.gain.value = 0.1 + 0.3 * k; bus.connect(this.fx);
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    const g = ctx.createGain(); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2 + 0.1 * k);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.35);
    this.burst(bus, t, 0.12 + 0.18 * k, 1800 + 1200 * k, 1.4, 0.8, 0.002); // the crunch
    this.burst(bus, t + 0.03, 0.2, 520, 3, 0.3, 0.004);                    // and a rattle
    window.setTimeout(() => bus.disconnect(), 1200);
  }

  /** The race director on the radio: static, then "Go! Go! Go!", then static. */
  goGoGo(): void {
    if (!this.ctx || !this.fx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.02;
    const bus = ctx.createGain(); bus.gain.value = 0.2; bus.connect(this.fx);
    this.burst(bus, t, 0.12, 1900, 2.5, 0.7, 0.004);
    let spoken = false;
    try {
      const ss = window.speechSynthesis;
      if (ss && ss.getVoices().length > 0) {
        const u = new SpeechSynthesisUtterance("Go! Go! Go!");
        u.pitch = 0.75; u.rate = 1.2; u.volume = this.muted ? 0 : 0.8;
        window.setTimeout(() => ss.speak(u), 110);
        spoken = true;
      }
    } catch { /* no speech engine */ }
    if (!spoken) {
      // no voice available: three clipped shouts
      for (let i = 0; i < 3; i++) {
        const st = t + 0.16 + i * 0.3, o = ctx.createOscillator(); o.type = "sawtooth";
        o.frequency.setValueAtTime(150, st); o.frequency.linearRampToValueAtTime(115, st + 0.2);
        const f1 = ctx.createBiquadFilter(); f1.type = "bandpass"; f1.frequency.value = 520; f1.Q.value = 4;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(0.5, st + 0.03); g.gain.linearRampToValueAtTime(0, st + 0.22);
        o.connect(f1); f1.connect(g); g.connect(bus);
        o.start(st); o.stop(st + 0.25);
      }
    }
    this.burst(bus, t + 1.15, 0.1, 1700, 2.5, 0.5, 0.004);
    window.setTimeout(() => bus.disconnect(), 3000);
  }

  // ---------- rain ----------
  /** The patter of rain on everything: filtered noise, louder as it rains harder. 0 fades it out. */
  rain(intensity: number): void {
    if (!this.ctx || !this.fx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.rainVoice) {
      if (intensity <= 0.02) return;
      const noise = ctx.createBufferSource(); noise.buffer = this.noise; noise.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 900;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 5200; bp.Q.value = 0.5;
      const gain = ctx.createGain(); gain.gain.value = 0;
      noise.connect(hp); hp.connect(bp); bp.connect(gain); gain.connect(this.fx);
      noise.start();
      this.rainVoice = { gain, noise };
    }
    this.rainVoice.gain.gain.setTargetAtTime(intensity > 0.02 ? 0.02 + 0.07 * intensity : 0, t, 0.5);
    if (intensity <= 0.02) {
      const dead = this.rainVoice;
      window.setTimeout(() => { if (this.rainVoice === dead && dead.gain.gain.value < 0.001) { try { dead.noise.stop(); dead.gain.disconnect(); } catch { /* stopped */ } this.rainVoice = null; } }, 2500);
    }
  }

  // ---------- aeroplane ----------
  /** The engine of the one aeroplane, louder the closer it is to what you are watching. null silences it. */
  planeSound(p: { vol: number; pan: number; pitch: number } | null): void {
    if (!this.ctx || !this.fx) return;
    const ctx = this.ctx;
    if (!this.plane) {
      if (!p) return;
      const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 650; filter.Q.value = 0.8;
      const gain = ctx.createGain(); gain.gain.value = 0;
      const o1 = ctx.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = 70;
      const o2 = ctx.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = 73.5;
      const noise = ctx.createBufferSource(); noise.buffer = this.noise; noise.loop = true;
      const ng = ctx.createGain(); ng.gain.value = 0.5;
      o1.connect(filter); o2.connect(filter); noise.connect(ng); ng.connect(filter); filter.connect(gain);
      let pan: StereoPannerNode | null = null;
      if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); gain.connect(pan); pan.connect(this.fx); } else gain.connect(this.fx);
      o1.start(); o2.start(); noise.start();
      this.plane = { gain, osc: [o1, o2], noise, filter, pan };
    }
    const q = this.plane, t = ctx.currentTime;
    if (!p) {
      q.gain.gain.setTargetAtTime(0, t, 0.3);
      const dead = q;
      window.setTimeout(() => { if (this.plane === dead && dead.gain.gain.value < 0.001) { try { dead.osc.forEach((o) => o.stop()); dead.noise.stop(); dead.gain.disconnect(); } catch { /* stopped */ } this.plane = null; } }, 1200);
      return;
    }
    q.gain.gain.setTargetAtTime(p.vol * 0.07, t, 0.15);
    q.osc[0]!.frequency.setTargetAtTime(70 * p.pitch, t, 0.2);
    q.osc[1]!.frequency.setTargetAtTime(73.5 * p.pitch, t, 0.2);
    q.filter.frequency.setTargetAtTime(450 + 450 * p.vol, t, 0.2);
    q.pan?.pan.setTargetAtTime(clamp(p.pan, -0.9, 0.9), t, 0.2);
  }

  // ---------- music ----------
  private startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextStep = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.pump(), 100);
  }

  private stopMusic(): void {
    if (this.musicTimer !== null) { window.clearInterval(this.musicTimer); this.musicTimer = null; }
  }

  private pump(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const stepDur = 60 / BPM / 4;
    if (this.nextStep < ctx.currentTime - 0.5) this.nextStep = ctx.currentTime + 0.05; // the tab slept: skip ahead
    while (this.nextStep < ctx.currentTime + 0.35) { this.step(this.stepNo++, this.nextStep, stepDur); this.nextStep += stepDur; }
  }

  private tone(t: number, dur: number, f: number, type: OscillatorType, peak: number, cutoff: number, attack = 0.01): void {
    const ctx = this.ctx!, o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; lp.type = "lowpass"; lp.frequency.value = cutoff;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(this.musicBus!);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** One sixteenth of the backing track: soft kick and clap, ticking hats, a round bass and a light plucked melody. */
  private step(n: number, t: number, d: number): void {
    const ctx = this.ctx!, bus = this.musicBus!;
    const s = n % 16, bar = Math.floor(n / 16), chord = CHORDS[bar % 4]!;
    if (s === 0 || s === 8 || (s === 10 && rnd(n) < 0.5)) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.22);
    }
    if (s === 4 || s === 12) this.burst(bus, t, 0.16, 1500, 0.8, 0.28, 0.004);
    if (s % 2 === 0) this.burst(bus, t, s === 14 ? 0.14 : 0.04, 7500, 1.5, s % 4 === 2 ? 0.16 : 0.1, 0.002);
    if (s === 0 || s === 3 || s === 8 || s === 11 || (s === 14 && rnd(n + 3) < 0.4)) this.tone(t, d * 3, hz(chord.root + (s === 11 ? 12 : 0)), "triangle", 0.5, 420);
    if (s === 0) for (const k of [0, 1, 2]) this.tone(t, d * 14, hz(chord.tones[k]! - 12), "sine", 0.1, 900, 0.18); // a soft pad under it
    const play = s % 2 === 0 ? rnd(n * 7 + bar) < 0.5 : rnd(n * 13 + bar) < 0.18;
    if (play && bar % 8 >= 1) {
      const note = chord.tones[Math.floor(rnd(n * 31 + 5) * chord.tones.length)]!;
      this.tone(t, d * 3.5, hz(note + (bar % 8 >= 4 && rnd(n) < 0.15 ? 12 : 0)), "triangle", 0.2, 2600, 0.006);
    }
  }
}
