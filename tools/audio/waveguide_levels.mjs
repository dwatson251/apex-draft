// Renders every waveguide engine offline (no browser) to set its gain and to measure what it costs:
//   node --experimental-strip-types tools/audio/waveguide_levels.mjs [--wav dir]
// It prints each engine's loudness at mid revs, the gain that would bring it to TARGET (a starting point: the gains in
// waveguide.ts are then matched to each machine's synth engine in the browser), and the time one engine takes to render a
// second of sound (a share of one core: the audio thread).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RATE = 48000, TARGET = 0.12;
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
let Processor = null;
const scope = {
  sampleRate: RATE,
  AudioWorkletProcessor: class { constructor() { this.port = { postMessage() {}, onmessage: null }; } },
  registerProcessor: (_n, cls) => { Processor = cls; },
};
new Function(...Object.keys(scope), readFileSync(here("../../src/renderer/public/engine-worklet.js"), "utf8"))(...Object.values(scope));
const { WAVEGUIDE_ENGINES } = await import(here("../../src/renderer/waveguide.ts"));

const wavDir = process.argv.includes("--wav") ? process.argv[process.argv.indexOf("--wav") + 1] : null;
if (wavDir) mkdirSync(wavDir, { recursive: true });
const wav = (path, data) => {
  const b = Buffer.alloc(44 + data.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + data.length * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(data.length * 2, 40);
  data.forEach((x, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
  writeFileSync(path, b);
};

for (const [id, cfg] of Object.entries(WAVEGUIDE_ENGINES)) {
  const p = new Processor({ processorOptions: cfg });
  const render = (seconds, rpmAt) => {
    const n = Math.round(seconds * RATE / 128), out = new Float32Array(n * 128), block = new Float32Array(128);
    for (let b = 0; b < n; b++) {
      p.process([], [[block]], { rpm: [rpmAt(b / n)], throttle: [1] });
      out.set(block, b * 128);
    }
    return out;
  };
  const mid = cfg.idle + 0.6 * (cfg.redline - cfg.idle);
  render(0.5, () => mid); // (let the pipes fill)
  const t0 = performance.now();
  const steady = render(2, () => mid);
  const cost = (performance.now() - t0) / 2000;
  let sq = 0, peak = 0;
  for (const x of steady) { sq += x * x; peak = Math.max(peak, Math.abs(x)); }
  const rms = Math.sqrt(sq / steady.length);
  console.log(`${id.padEnd(11)} ${String(cfg.cylinders).padStart(2)} cyl  rms ${rms.toFixed(4)}  peak ${peak.toFixed(3)}  gain ${(cfg.gain * TARGET / rms).toFixed(3)}  cost ${(cost * 100).toFixed(1)}% of a core`);
  if (wavDir) wav(`${wavDir}/${id}.wav`, render(6, (x) => cfg.idle + (cfg.redline - cfg.idle) * (x < 0.7 ? x / 0.7 : 1 - (x - 0.7) / 0.3 * 0.6)).map((x) => x * TARGET / rms * 2));
}
