import { vehicleOf, type VehicleId } from "@apex/sim";
import { GEARS, Gearbox } from "./gearbox.ts";

/** Everything you hear is synthesised: engines, squeal, a quiet backing track, crowd, wheel guns, radio, aeroplanes. */
interface Voice {
  /** every oscillator, so stopAll can stop them: the tonal partials, the pulse LFO and the whine */
  osc: OscillatorNode[];
  parts: { o: OscillatorNode; ratio: number }[];
  lfo: OscillatorNode;
  whine: { o: OscillatorNode; g: GainNode } | null;
  rasp: { band: BiquadFilterNode; g: GainNode };
  filter: BiquadFilterNode;
  hum: GainNode;
  noise: AudioBufferSourceNode;
  band: BiquadFilterNode;
  squeal: GainNode;
  pan: StereoPannerNode | null;
  out: GainNode;
  prof: Engine;
  box: Gearbox;
  /** speed that means redline in the profile's units (the profiles were tuned against it) */
  ref: number;
  /** when we last changed gear, and whether it was down (a throttle blip) */
  shiftAt: number;
  blip: boolean;
}

/** What an engine sounds like. Frequencies are for the fundamental: base + slope * speed (+ lift on throttle). */
interface Engine {
  /** partials as [ratio to the fundamental, weight, wave, detune in cents] */
  parts: [number, number, OscillatorType, number][];
  base: number; slope: number; lift: number;
  /** low-pass cutoff: cut + cutSlope * speed + cutLift * throttle */
  cut: number; cutSlope: number; cutLift: number; q: number;
  /** soft clipping that fattens the harmonics (matters for the very low engines on small speakers) */
  drive: number;
  /** firing lumpiness: depth 0 to 1, and the pulse rate as a fraction of the fundamental */
  lump: number; lumpRate: number;
  /** a noisy layer (diesel knock, intake hiss): level, centre frequency, and how that rises with speed */
  rasp: number; raspHz: number; raspSlope: number;
  /** turbo whistle level (it swells with throttle), 0 for none */
  whine: number;
  level: number;
  /** how heavy the engine feels: 1 revs freely, more is slower to rise and fall */
  inertia: number;
  /** how long the power is cut on a change up, seconds */
  shiftCut: number;
}

const ENGINES: Record<VehicleId, Engine> = {
  // two-stroke "braap": high, square and nasal, two slightly detuned voices for the warble
  kart: { parts: [[1, 1, "square", 0], [1, 0.7, "square", 18], [2, 0.5, "sawtooth", 0], [0.5, 0.3, "sawtooth", 0]], base: 70, slope: 1.4, lift: 14,
    cut: 1000, cutSlope: 6, cutLift: 500, q: 3, drive: 0, lump: 0.25, lumpRate: 0.5, rasp: 0.12, raspHz: 3200, raspSlope: 4, whine: 0, level: 1.62, inertia: 0.8, shiftCut: 0.05 },
  // V12: smooth (no lump), stacked upper harmonics, a long rev range and a bright resonant top
  formula: { parts: [[1, 1, "sawtooth", 0], [2, 0.75, "sawtooth", 6], [3, 0.55, "sawtooth", -5], [4, 0.4, "sawtooth", 4], [6, 0.22, "square", 0]], base: 95, slope: 2, lift: 20,
    cut: 2600, cutSlope: 12, cutLift: 1200, q: 2.2, drive: 0, lump: 0, lumpRate: 0, rasp: 0.07, raspHz: 5200, raspSlope: 6, whine: 0, level: 1.6, inertia: 0.55, shiftCut: 0.04 },
  // turbo four: flat mid note, a burble when the throttle lifts, and a turbo whistle
  rally: { parts: [[1, 1, "sawtooth", 0], [1, 0.4, "square", 9], [2, 0.35, "sawtooth", 0]], base: 55, slope: 1, lift: 10,
    cut: 800, cutSlope: 4.5, cutLift: 600, q: 1.4, drive: 0, lump: 0.3, lumpRate: 0.5, rasp: 0.08, raspHz: 1800, raspSlope: 5, whine: 0.04, level: 1.86, inertia: 1, shiftCut: 0.1 },
  // V8: low and loping, with a pulsing rumble
  muscle: { parts: [[1, 1, "sawtooth", 0], [0.5, 0.8, "sine", 0], [2, 0.4, "sawtooth", 7]], base: 38, slope: 0.55, lift: 8,
    cut: 430, cutSlope: 3, cutLift: 300, q: 0.9, drive: 1.2, lump: 0.55, lumpRate: 0.15, rasp: 0.14, raspHz: 600, raspSlope: 2, whine: 0, level: 2.55, inertia: 1.4, shiftCut: 0.18 },
  // heavy diesel: slow chug, throaty, a turbo whine behind it
  truck: { parts: [[1, 1, "sawtooth", 0], [2, 0.7, "sawtooth", 0], [0.5, 0.5, "sine", 0], [3, 0.3, "square", 0]], base: 18, slope: 0.55, lift: 6,
    cut: 360, cutSlope: 2.4, cutLift: 200, q: 0.9, drive: 1.8, lump: 0.55, lumpRate: 0.2, rasp: 0.3, raspHz: 650, raspSlope: 2, whine: 0.04, level: 2.12, inertia: 2, shiftCut: 0.3 },
  // huge diesel: a very low fundamental with thick harmonics so small speakers still get it, a heavy chug and a clattering knock
  tank: { parts: [[1, 1, "sawtooth", 0], [2, 0.9, "sawtooth", 0], [3, 0.7, "sawtooth", 0], [4, 0.4, "square", 0], [0.5, 0.6, "sine", 0]], base: 26, slope: 0.22, lift: 5,
    cut: 280, cutSlope: 1.8, cutLift: 140, q: 0.8, drive: 2.6, lump: 0.75, lumpRate: 0.25, rasp: 0.5, raspHz: 520, raspSlope: 1.5, whine: 0, level: 2.79, inertia: 2.6, shiftCut: 0.45 },
  // inline-four superbike: a high, clean scream with a thin edge
  superbike: { parts: [[1, 1, "sawtooth", 0], [2, 0.6, "sawtooth", 5], [3, 0.35, "square", -4]], base: 90, slope: 1.9, lift: 18,
    cut: 2200, cutSlope: 10, cutLift: 1000, q: 2, drive: 0, lump: 0.08, lumpRate: 0.5, rasp: 0.08, raspHz: 4200, raspSlope: 6, whine: 0, level: 1.5, inertia: 0.5, shiftCut: 0.02 },
  // flat-four buggy: gruff, buzzy and mid-pitched
  buggy: { parts: [[1, 1, "square", 0], [1, 0.5, "sawtooth", 12], [0.5, 0.5, "sine", 0]], base: 48, slope: 0.9, lift: 9,
    cut: 700, cutSlope: 4, cutLift: 500, q: 1.2, drive: 0.6, lump: 0.4, lumpRate: 0.5, rasp: 0.12, raspHz: 1400, raspSlope: 4, whine: 0, level: 1.9, inertia: 1, shiftCut: 0.1 },
  // electric motor: no firing at all, just a clean whine that climbs with speed, and a little tyre hiss
  electric: { parts: [[1, 1, "sine", 0], [2, 0.45, "sine", 0], [3, 0.2, "triangle", 0]], base: 220, slope: 7, lift: 40,
    cut: 5000, cutSlope: 10, cutLift: 1500, q: 0.7, drive: 0, lump: 0, lumpRate: 0, rasp: 0.04, raspHz: 3000, raspSlope: 8, whine: 0, level: 1.1, inertia: 0.35, shiftCut: 0 },
  // supercharged big-block: a deep, brutal bellow with a blower whine
  dragster: { parts: [[1, 1, "sawtooth", 0], [0.5, 0.9, "sine", 0], [2, 0.5, "sawtooth", 8]], base: 42, slope: 0.7, lift: 12,
    cut: 600, cutSlope: 4, cutLift: 600, q: 1, drive: 1.6, lump: 0.5, lumpRate: 0.15, rasp: 0.25, raspHz: 900, raspSlope: 3, whine: 0.06, level: 2.4, inertia: 1.1, shiftCut: 0.1 },
  // turbo four in a touring car: a hard, buzzy bark with an overrun crackle and a turbo whistle
  touring: { parts: [[1, 1, "sawtooth", 0], [1, 0.45, "square", 10], [2, 0.5, "sawtooth", 4]], base: 62, slope: 1.2, lift: 12,
    cut: 1100, cutSlope: 5.5, cutLift: 700, q: 1.6, drive: 0, lump: 0.2, lumpRate: 0.5, rasp: 0.1, raspHz: 2000, raspSlope: 5, whine: 0.05, level: 1.8, inertia: 0.85, shiftCut: 0.04 },
  // flat-plane V8 prototype: a high, hard bellow, smooth and shrill at the top
  prototype: { parts: [[1, 1, "sawtooth", 0], [2, 0.65, "sawtooth", 5], [3, 0.4, "sawtooth", -4], [0.5, 0.5, "sine", 0]], base: 78, slope: 1.6, lift: 16,
    cut: 1700, cutSlope: 8, cutLift: 900, q: 1.8, drive: 0.2, lump: 0.1, lumpRate: 0.5, rasp: 0.1, raspHz: 3000, raspSlope: 5, whine: 0, level: 1.9, inertia: 0.6, shiftCut: 0.04 },
  // GT3: a big naturally aspirated flat-six or V8, deep with a hard edge
  gt3: { parts: [[1, 1, "sawtooth", 0], [0.5, 0.7, "sine", 0], [2, 0.5, "sawtooth", 6], [3, 0.25, "square", 0]], base: 60, slope: 1.3, lift: 14,
    cut: 1000, cutSlope: 6, cutLift: 700, q: 1.4, drive: 0.4, lump: 0.25, lumpRate: 0.4, rasp: 0.14, raspHz: 1800, raspSlope: 5, whine: 0, level: 2.1, inertia: 0.9, shiftCut: 0.07 },
  // GT4: a lightly tuned road engine: lower and softer than GT3
  gt4: { parts: [[1, 1, "sawtooth", 0], [0.5, 0.6, "sine", 0], [2, 0.4, "sawtooth", 5]], base: 52, slope: 1.1, lift: 11,
    cut: 800, cutSlope: 4.5, cutLift: 600, q: 1.2, drive: 0.3, lump: 0.3, lumpRate: 0.4, rasp: 0.12, raspHz: 1500, raspSlope: 4, whine: 0, level: 2.2, inertia: 1, shiftCut: 0.12 },
  // two-stroke jet ski: a buzzy snarl
  jetski: { parts: [[1, 1, "square", 0], [1, 0.6, "square", 22], [2, 0.4, "sawtooth", 0]], base: 80, slope: 1.6, lift: 16,
    cut: 1400, cutSlope: 7, cutLift: 600, q: 2.5, drive: 0, lump: 0.3, lumpRate: 0.5, rasp: 0.2, raspHz: 2600, raspSlope: 5, whine: 0, level: 1.6, inertia: 0.7, shiftCut: 0 },
  // inboard V8: a wet burble, low and loud
  speedboat: { parts: [[1, 1, "sawtooth", 0], [0.5, 0.8, "sine", 0], [2, 0.4, "square", 5]], base: 40, slope: 0.6, lift: 9,
    cut: 450, cutSlope: 3, cutLift: 350, q: 1, drive: 1.3, lump: 0.6, lumpRate: 0.15, rasp: 0.3, raspHz: 700, raspSlope: 2, whine: 0, level: 2.5, inertia: 1.3, shiftCut: 0.1 },
  // lift fan: a low, wide roar of noise over a faint hum
  hovercraft: { parts: [[1, 0.7, "triangle", 0], [2, 0.4, "sine", 0]], base: 60, slope: 0.7, lift: 10,
    cut: 600, cutSlope: 3, cutLift: 300, q: 0.7, drive: 0, lump: 0.15, lumpRate: 0.6, rasp: 0.7, raspHz: 900, raspSlope: 3, whine: 0, level: 1.9, inertia: 1.6, shiftCut: 0 },
  // caged propeller: a hard, high whine and a rasp
  airboat: { parts: [[1, 1, "sawtooth", 0], [2, 0.7, "square", 0], [3, 0.4, "sawtooth", 6]], base: 70, slope: 0.9, lift: 14,
    cut: 1500, cutSlope: 5, cutLift: 800, q: 1.6, drive: 0.8, lump: 0.1, lumpRate: 0.5, rasp: 0.5, raspHz: 1800, raspSlope: 4, whine: 0.05, level: 2.2, inertia: 1, shiftCut: 0 },
};

export interface CarSound {
  /** units/s */
  speed: number;
  /** the car's top speed, units/s: where the gears and the redline are set. Defaults to a mid-stat car. */
  top?: number;
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

/** The stems of a biome's loop; they share a length and a start so they stay in step when looped together. */
type Layer = "drums" | "bass" | "music";
const LAYERS: Layer[] = ["drums", "bass", "music"];
type Loop = Record<Layer, AudioBuffer>;
interface Scene { biome: string; src: AudioBufferSourceNode[]; gains: Record<Layer, GainNode>; lp: BiquadFilterNode; out: GainNode }
/** Loudness of the loops on the music bus: quiet and dark in menus, full and bright when the race is on. */
const LOOP_LEVEL = { menu: 0.04, race: 0.07, title: 0.07 };

/** Fetch a bundled file. XMLHttpRequest because fetch cannot read file:// in the packaged desktop app. */
const getBytes = (url: string) => new Promise<ArrayBuffer>((resolve, reject) => {
  const x = new XMLHttpRequest();
  x.open("GET", url); x.responseType = "arraybuffer";
  x.onload = () => (x.status === 0 || x.status === 200) && x.response ? resolve(x.response as ArrayBuffer) : reject(new Error(`${url}: ${x.status}`));
  x.onerror = () => reject(new Error(url));
  x.send();
});

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
  private loopBus: GainNode | null = null;
  private loops = new Map<string, Promise<Loop | null>>();
  private scene: Scene | null = null;
  /** null is the title screen, which plays the "title" loop; otherwise the biome being played. */
  private biome: string | null = null;
  private racing = false;
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
        this.loopBus = this.ctx.createGain(); this.loopBus.gain.value = 1; this.loopBus.connect(this.master);
        const len = this.ctx.sampleRate * 2;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.applyMaster();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      if (this.musicOn) this.startMusic();
    } catch { this.ctx = null; }
  }

  /** Start the sound as the app opens. Desktop and Android allow that; a plain browser holds the context
   *  suspended until the first tap, key or click anywhere, so this also listens for that and resumes then. */
  arm(): void {
    this.unlock();
    if (this.ctx?.state === "running") return;
    const events = ["pointerdown", "keydown", "touchend"];
    const go = () => this.unlock();
    const done = () => { if (this.ctx?.state === "running") for (const e of events) window.removeEventListener(e, go, true); };
    for (const e of events) window.addEventListener(e, go, true);
    this.ctx?.addEventListener("statechange", done);
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
  /** Which music to play: a biome's layered loop, or null for the title screen's own track. */
  setBiome(biome: string | null): void {
    if (biome === this.biome) return;
    this.biome = biome;
    if (this.musicOn) this.startMusic();
  }
  /** True while a race is running: the drums and the bright top come in. Menus, the grid and results take them out. */
  setRacing(on: boolean): void {
    if (on === this.racing) return;
    this.racing = on;
    this.mixScene();
  }

  private applyMaster(): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.08);
    this.fx?.gain.setTargetAtTime(this.ducked ? 0 : 1, this.ctx.currentTime, 0.08);
  }

  // ---------- engines ----------
  private make(type: VehicleId | undefined): Voice | null {
    const ctx = this.ctx!, veh = vehicleOf(type), prof = ENGINES[veh.id] ?? ENGINES.rally;
    const out = ctx.createGain();
    out.connect(this.fx!);
    let pan: StereoPannerNode | null = null;
    let sink: AudioNode = out;
    if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); pan.connect(out); sink = pan; }
    const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.Q.value = prof.q;
    const hum = ctx.createGain(); hum.gain.value = 0;
    // firing pulses: a slow LFO on a gain stage that both the tone and the knock pass through
    const lump = ctx.createGain(); lump.gain.value = 1 - prof.lump / 2;
    const lfo = ctx.createOscillator(); lfo.type = "sine";
    const depth = ctx.createGain(); depth.gain.value = prof.lump / 2;
    lfo.connect(depth); depth.connect(lump.gain);
    // the tonal partials, normalised so a rich engine is not louder than a plain one
    const total = prof.parts.reduce((a, p) => a + p[1], 0);
    let tone: AudioNode = filter;
    if (prof.drive > 0) {
      const sh = ctx.createWaveShaper(), n = 512, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) curve[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * (1 + prof.drive * 2)) / Math.tanh(1 + prof.drive * 2);
      sh.curve = curve; sh.connect(filter); tone = sh;
    }
    const parts = prof.parts.map(([ratio, w, wave, cents]) => {
      const o = ctx.createOscillator(); o.type = wave; o.detune.value = cents;
      const g = ctx.createGain(); g.gain.value = w / total;
      o.connect(g); g.connect(tone);
      return { o, ratio };
    });
    filter.connect(lump); lump.connect(hum); hum.connect(sink);
    // diesel knock / intake hiss
    const noise = ctx.createBufferSource(); noise.buffer = this.noise; noise.loop = true;
    const rb = ctx.createBiquadFilter(); rb.type = "bandpass"; rb.Q.value = 1.2; rb.frequency.value = prof.raspHz;
    const rg = ctx.createGain(); rg.gain.value = 0;
    noise.connect(rb); rb.connect(rg); rg.connect(lump);
    // tyre squeal shares the noise buffer
    const band = ctx.createBiquadFilter(); band.type = "bandpass"; band.Q.value = 7;
    const squeal = ctx.createGain(); squeal.gain.value = 0;
    noise.connect(band); band.connect(squeal); squeal.connect(sink);
    let whine: Voice["whine"] = null;
    if (prof.whine > 0) {
      const o = ctx.createOscillator(); o.type = "sine";
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(hum); o.start();
      whine = { o, g };
    }
    for (const p of parts) p.o.start();
    lfo.start(); noise.start();
    const osc = [...parts.map((p) => p.o), lfo, ...(whine ? [whine.o] : [])];
    const g = GEARS[veh.id] ?? GEARS["rally"]!;
    return { osc, parts, lfo, whine, rasp: { band: rb, g: rg }, filter, hum, noise, band, squeal, pan, out, prof,
      box: new Gearbox(g.hi, g.idle, g.gap, g.up, g.down), ref: 110 * veh.top, shiftAt: -10, blip: false };
  }

  update(id: string, type: VehicleId | undefined, s: CarSound, player: boolean): void {
    if (!this.ctx || !this.master) return;
    let v = this.voices.get(id);
    if (!v) { v = this.make(type) ?? undefined; if (!v) return; this.voices.set(id, v); }
    const t = this.ctx.currentTime, p = v.prof;
    const lift = clamp(s.accel / 120, -0.6, 1), on = clamp(0.5 + lift, 0, 1);
    // the gearbox decides the revs: they climb in a gear, fall away on a change up, and snap up on a change down
    const { rev, shift } = v.box.step(clamp(s.speed / (s.top ?? v.ref), 0, 1.1), lift, t);
    if (shift) { v.shiftAt = t; v.blip = shift < 0; }
    const since = t - v.shiftAt;
    const r = clamp(rev + (v.blip && since < 0.09 ? 0.07 : 0), 0, 1.08);
    const vs = r * v.ref; // "speed" as far as the engine profile is concerned
    const k = (since < 0.3 ? 0.025 : 0.06) * p.inertia;
    const f = p.base + p.slope * vs + lift * p.lift;
    for (const q of v.parts) q.o.frequency.setTargetAtTime(f * q.ratio, t, k);
    v.lfo.frequency.setTargetAtTime(f * p.lumpRate, t, k);
    v.filter.frequency.setTargetAtTime(p.cut + p.cutSlope * vs + Math.max(0, lift) * p.cutLift - Math.max(0, -lift) * 80, t, k);
    const cutting = !v.blip && since < p.shiftCut; // the power is off while the clutch is in
    const level = (player ? 0.05 : 0.026) * p.level * (0.65 + 0.35 * on) * s.vol * (cutting ? 0.35 : 1);
    v.hum.gain.setTargetAtTime(s.speed < 1 ? 0 : level, t, cutting || since < 0.1 ? 0.02 : 0.06);
    v.rasp.band.frequency.setTargetAtTime(p.raspHz + p.raspSlope * vs, t, k);
    v.rasp.g.gain.setTargetAtTime(p.rasp * (0.4 + 0.6 * on), t, 0.06);
    if (v.whine) {
      v.whine.o.frequency.setTargetAtTime(1900 + vs * 12, t, 0.12);
      v.whine.g.gain.setTargetAtTime(p.whine * Math.max(0, lift) * (0.3 + vs / 200), t, 0.15);
    }
    if (vehicleOf(type).domain === "water") {
      // no tyres: a wash of spray that grows with speed and swells when the hull slides
      v.band.frequency.setTargetAtTime(2200 + s.speed * 8 + s.slip * 900, t, 0.08);
      v.squeal.gain.setTargetAtTime((0.35 * clamp(s.speed / 120, 0, 1) * 0.03 + s.slip * 0.06) * (player ? 1 : 0.6) * s.vol, t, 0.08);
    } else {
      v.band.frequency.setTargetAtTime(1500 + s.speed * 5 + s.slip * 500, t, 0.06);
      v.squeal.gain.setTargetAtTime(s.slip * s.slip * (player ? 0.05 : 0.03) * s.vol, t, 0.04);
    }
    if (v.pan) v.pan.pan.setTargetAtTime(clamp(s.pan, -0.9, 0.9), t, 0.06);
  }

  /** Which gear a car is in, for the engine lab. */
  gearOf(id: string): number { return this.voices.get(id)?.box.gear ?? 0; }

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
    this.setRacing(false); // the race is over or abandoned: take the drums out
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

  /** The pit crew on the radio: a click of static, three quick clipped shouts, then static. */
  goGoGo(): void {
    if (!this.ctx || !this.fx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.02;
    const bus = ctx.createGain(); bus.gain.value = 0.2; bus.connect(this.fx);
    this.burst(bus, t, 0.08, 1900, 2.5, 0.7, 0.004);
    for (let i = 0; i < 3; i++) {
      const st = t + 0.1 + i * 0.18, o = ctx.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(170, st); o.frequency.linearRampToValueAtTime(130, st + 0.14);
      const f1 = ctx.createBiquadFilter(); f1.type = "bandpass"; f1.frequency.value = 560; f1.Q.value = 4;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(0.5, st + 0.02); g.gain.linearRampToValueAtTime(0, st + 0.15);
      o.connect(f1); f1.connect(g); g.connect(bus);
      o.start(st); o.stop(st + 0.18);
    }
    this.burst(bus, t + 0.7, 0.08, 1700, 2.5, 0.5, 0.004);
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
  /** Start whatever music suits the current scene: a biome loop once it has loaded, else the synthesised track. */
  private startMusic(): void {
    if (!this.ctx) return;
    const biome = this.biome ?? "title";
    if (this.scene?.biome === biome) return;
    this.stopScene();
    this.stopSynth();
    void this.load(biome).then((loop) => {
      if ((this.biome ?? "title") !== biome || !this.musicOn) return;
      if (loop) this.startScene(biome, loop); else this.startSynth(); // files missing: keep the old track
    });
  }

  private stopMusic(): void { this.stopSynth(); this.stopScene(); }

  private startSynth(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextStep = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.pump(), 100);
  }

  private stopSynth(): void {
    if (this.musicTimer !== null) { window.clearInterval(this.musicTimer); this.musicTimer = null; }
  }

  private load(biome: string): Promise<Loop | null> {
    let p = this.loops.get(biome);
    if (!p) {
      const ctx = this.ctx!;
      p = Promise.all(LAYERS.map(async (l) => ctx.decodeAudioData(await getBytes(`audio/${biome}/${l}.ogg`))))
        .then(([drums, bass, music]) => ({ drums: drums!, bass: bass!, music: music! }))
        .catch(() => { this.loops.delete(biome); return null; });
      this.loops.set(biome, p);
    }
    return p;
  }

  private startScene(biome: string, loop: Loop): void {
    const ctx = this.ctx!, t = ctx.currentTime + 0.05;
    const out = ctx.createGain(); out.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.5;
    out.connect(lp); lp.connect(this.loopBus!);
    const len = Math.min(...LAYERS.map((l) => loop[l].duration));
    const gains = {} as Record<Layer, GainNode>, src: AudioBufferSourceNode[] = [];
    for (const l of LAYERS) {
      const g = ctx.createGain(); g.gain.value = l === "drums" ? 0 : 1; g.connect(out);
      const s = ctx.createBufferSource(); s.buffer = loop[l]; s.loop = true; s.loopStart = 0; s.loopEnd = len;
      s.connect(g); s.start(t);
      gains[l] = g; src.push(s);
    }
    this.scene = { biome, src, gains, lp, out };
    this.mixScene(true);
  }

  /** Menus: bass and the lead under a low-pass. Racing (and the title screen): the drums join and the top opens up. */
  private mixScene(instant = false): void {
    const sc = this.scene, ctx = this.ctx;
    if (!sc || !ctx) return;
    const t = ctx.currentTime, k = instant ? 0.001 : 0.7, title = sc.biome === "title", r = this.racing || title; // the title plays in full
    sc.out.gain.setTargetAtTime(title ? LOOP_LEVEL.title : r ? LOOP_LEVEL.race : LOOP_LEVEL.menu, t, k);
    sc.gains.drums.gain.setTargetAtTime(r ? 1 : 0, t, k);
    sc.lp.frequency.setTargetAtTime(r ? 20000 : 1400, t, k);
  }

  private stopScene(): void {
    const sc = this.scene, ctx = this.ctx;
    if (!sc || !ctx) return;
    this.scene = null;
    sc.out.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    window.setTimeout(() => { for (const s of sc.src) { try { s.stop(); } catch { /* stopped */ } } sc.out.disconnect(); }, 1500);
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
