/** A soft engine hum for every car, and a soft tyre squeal in corners. All synthesised, nothing to download. */
interface Voice {
  osc: OscillatorNode[];
  filter: BiquadFilterNode;
  hum: GainNode;
  noise: AudioBufferSourceNode;
  band: BiquadFilterNode;
  squeal: GainNode;
  pan: StereoPannerNode | null;
  out: GainNode;
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

export class CarAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new Map<string, Voice>();
  private muted = false;
  private ducked = false;

  /** Needs a user gesture the first time; call it from a click. */
  unlock(): void {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 2;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.applyMaster();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch { this.ctx = null; }
  }

  setMuted(m: boolean): void { this.muted = m; this.applyMaster(); }
  isMuted(): boolean { return this.muted; }
  /** Fast-forward: the engines would just be a chirp. */
  setDucked(d: boolean): void { if (d !== this.ducked) { this.ducked = d; this.applyMaster(); } }

  private applyMaster(): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.muted || this.ducked ? 0 : 0.8, this.ctx.currentTime, 0.08);
  }

  private make(): Voice | null {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.connect(this.master!);
    let pan: StereoPannerNode | null = null;
    let sink: AudioNode = out;
    if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); pan.connect(out); sink = pan; }
    const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.Q.value = 0.7;
    const hum = ctx.createGain(); hum.gain.value = 0;
    const o1 = ctx.createOscillator(); o1.type = "triangle";
    const o2 = ctx.createOscillator(); o2.type = "sawtooth";
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    o1.connect(filter); o2.connect(g2); g2.connect(filter);
    filter.connect(hum); hum.connect(sink);
    const noise = ctx.createBufferSource(); noise.buffer = this.noise; noise.loop = true;
    const band = ctx.createBiquadFilter(); band.type = "bandpass"; band.Q.value = 7;
    const squeal = ctx.createGain(); squeal.gain.value = 0;
    noise.connect(band); band.connect(squeal); squeal.connect(sink);
    o1.start(); o2.start(); noise.start();
    return { osc: [o1, o2], filter, hum, noise, band, squeal, pan, out };
  }

  update(id: string, s: CarSound, player: boolean): void {
    if (!this.ctx || !this.master) return;
    let v = this.voices.get(id);
    if (!v) { v = this.make() ?? undefined; if (!v) return; this.voices.set(id, v); }
    const t = this.ctx.currentTime, k = 0.06;
    const lift = clamp(s.accel / 120, -0.6, 1);
    const f = 46 + s.speed * 0.9 + lift * 10;
    v.osc[0]!.frequency.setTargetAtTime(f, t, k);
    v.osc[1]!.frequency.setTargetAtTime(f * 0.5 + 0.7, t, k);
    v.filter.frequency.setTargetAtTime(220 + s.speed * 3.4 + Math.max(0, lift) * 260 - Math.max(0, -lift) * 80, t, k);
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
  }
}
