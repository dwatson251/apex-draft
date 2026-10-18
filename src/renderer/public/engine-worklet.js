/*
 * The waveguide engine (an experiment): a port of Antonio-R1's engine-sound-generator worklet,
 * https://github.com/Antonio-R1/engine-sound-generator (MIT, Copyright (c) 2021-2022 Antonio-R1; the licence is in docs/AUDIO_CREDITS.md).
 *
 * Each cylinder is a short waveguide fed by the piston and the ignition, with intake, exhaust and extractor pipes whose
 * reflections change as the valves open and close; the extractors feed one straight pipe, a muffler of parallel
 * waveguides and an outlet. Changes from the original: the sample rate is the context's (pipe lengths are given at
 * 44.1 kHz and scaled), the wave returning from the straight pipe is shared between the cylinders, the throttle sets how hard each cylinder fires, the three outputs are mixed into one with a gain,
 * the intake noise and the output are low-passed (the original hissed), the delay-line reads are inlined, and every node measures how long it spends rendering so the game can show the cost.
 */

const REF_RATE = 44100;

class LowpassFilter {
  constructor(frequency) {
    const w = 2.0 * Math.PI * frequency / sampleRate;
    this.alpha = w / (w + 1.0);
    this.lastValue = 0.0;
  }
  get(value) {
    this.lastValue += this.alpha * (value - this.lastValue);
    return this.lastValue;
  }
}

class DelayLine {
  constructor(length) {
    this.data = new Float32Array(Math.max(1, length));
    this.index = 0;
  }
  updateLeft(value) {
    this.data[this.index] = value;
    if (++this.index >= this.data.length) this.index = 0;
  }
  updateRight(value) {
    this.data[this.index] = value;
    if (--this.index < 0) this.index = this.data.length - 1;
  }
}

class Waveguide {
  constructor(length, reflectionFactorLeft, reflectionFactorRight) {
    this.upper = new DelayLine(length);
    this.lower = new DelayLine(length);
    this.reflectionFactorLeft = reflectionFactorLeft;
    this.reflectionFactorRight = reflectionFactorRight;
    this.outputLeft = 0.0;
    this.outputRight = 0.0;
  }
  add(valueLeft, valueRight) {
    const lo = this.lower.data[this.lower.index], up = this.upper.data[this.upper.index];
    const reflectedValueLeft = lo * this.reflectionFactorLeft;
    this.outputLeft = lo * (1.0 - this.reflectionFactorLeft);
    const reflectedValueRight = up * this.reflectionFactorRight;
    this.outputRight = up * (1.0 - this.reflectionFactorRight);
    this.upper.updateRight(valueLeft + reflectedValueLeft);
    this.lower.updateLeft(valueRight + reflectedValueRight);
  }
}

class Cylinder {
  constructor(p, scale) {
    this.cylinderWaveguide = new Waveguide(Math.round(10 * scale), 0.75, 0.75);
    this.intakeWaveguide = new Waveguide(Math.round(p.intakeWaveguideLength * scale), 0.01, p.intakeOpenReflectionFactor);
    this.exhaustWaveguide = new Waveguide(Math.round(p.exhaustWaveguideLength * scale), p.exhaustClosedReflectionFactor, 0.01);
    this.extractorWaveguide = new Waveguide(Math.round(p.extractorWaveguideLength * scale), 0.01, 0.01);
    this.intakeOpenReflectionFactor = p.intakeOpenReflectionFactor;
    this.intakeClosedReflectionFactor = p.intakeClosedReflectionFactor;
    this.exhaustOpenReflectionFactor = p.exhaustOpenReflectionFactor;
    this.exhaustClosedReflectionFactor = p.exhaustClosedReflectionFactor;
    this.ignitionTime = p.ignitionTime;
  }

  update(intakeNoise, straightPipeOutputLeft, x, fire) {
    // the valves, the piston and the ignition through one cycle (two turns of the crank): x is 0 to 1
    const exhaustValve = 0.75 < x && x < 1.0 ? -Math.sin(4.0 * Math.PI * x) : 0;
    const intakeValve = 0 < x && x < 0.25 ? Math.sin(4.0 * Math.PI * x) : 0;
    const pistonMotion = Math.cos(4.0 * Math.PI * x);
    const t = this.ignitionTime;
    const fuelIgnition = 0.0 < x && x < 0.5 * t ? Math.sin(2.0 * Math.PI * (x / t)) : 0;

    const intakeReflection = this.intakeOpenReflectionFactor * intakeValve + this.intakeClosedReflectionFactor * (1.0 - intakeValve);
    const exhaustReflection = this.exhaustOpenReflectionFactor * exhaustValve + this.exhaustClosedReflectionFactor * (1.0 - exhaustValve);
    this.intakeWaveguide.reflectionFactorRight = intakeReflection;
    this.cylinderWaveguide.reflectionFactorLeft = intakeReflection;
    this.exhaustWaveguide.reflectionFactorLeft = exhaustReflection;
    this.cylinderWaveguide.reflectionFactorRight = exhaustReflection;

    intakeNoise *= intakeValve;
    const amplitude = pistonMotion * 1.5 + fuelIgnition * 5.0 * fire;
    const extractorOutputLeft = this.extractorWaveguide.outputLeft;
    const cylinderOutputLeft = this.cylinderWaveguide.outputLeft;
    const cylinderOutputRight = this.cylinderWaveguide.outputRight;
    const intakeOutputRight = this.intakeWaveguide.outputRight;

    this.extractorWaveguide.add(this.exhaustWaveguide.outputRight, straightPipeOutputLeft);
    this.exhaustWaveguide.add(cylinderOutputRight, extractorOutputLeft);
    this.cylinderWaveguide.add(amplitude + intakeOutputRight * (1.0 - intakeReflection), extractorOutputLeft * (1.0 - exhaustReflection));
    this.intakeWaveguide.add(intakeNoise, cylinderOutputLeft * (1.0 - intakeReflection));
  }
}

class Muffler {
  constructor(elementLengths, action, scale) {
    this.elements = elementLengths.map((l) => new Waveguide(Math.round(l * scale), 0.0, action));
    this.inverse = 1.0 / this.elements.length;
    this.outputLeft = 0.0;
    this.outputRight = 0.0;
  }
  update(mufflerInput, outletValue) {
    mufflerInput *= this.inverse;
    outletValue *= this.inverse;
    this.outputLeft = 0.0;
    this.outputRight = 0.0;
    for (const e of this.elements) {
      this.outputLeft += e.outputLeft;
      this.outputRight += e.outputRight;
      e.add(mufflerInput, outletValue);
    }
  }
}

class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "rpm", defaultValue: 0, minValue: 0, automationRate: "k-rate" },
      { name: "throttle", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor(options) {
    super();
    this.options = options.processorOptions;
    this.build(this.options);
    this.alive = true;
    // the cost meter: Date.now() is all a worklet has, and it is coarse, but summed over a second the rounding evens out
    this.busy = 0;
    this.blocks = 0;
    this.port.onmessage = (e) => { if (e.data === "stop") this.alive = false; };
  }

  /** Every pipe and filter, empty. Also how a node starts over if its numbers ever stop being finite. */
  build(p) {
    const scale = sampleRate / REF_RATE;
    this.cylinders = [];
    for (let i = 0; i < p.cylinders; i++) this.cylinders.push(new Cylinder(p, scale));
    this.inverse = 1.0 / p.cylinders;
    // a two-stroke fires every turn, not every other one
    this.strokeRate = p.twoStroke ? 60.0 : 120.0;
    this.straightPipe = new Waveguide(Math.round(p.straightPipeWaveguideLength * scale), p.straightPipeReflectionFactor, p.straightPipeReflectionFactor);
    this.muffler = new Muffler(p.mufflerElementsLength, p.action, scale);
    this.outlet = new Waveguide(Math.round(p.outletWaveguideLength * scale), p.outletReflectionFactor, p.outletReflectionFactor);
    this.mix = p.mix; // [intake, engine block, outlet]
    this.gain = p.gain;
    // the intake's noise, low-passed far below the original's 11 kHz (that came through as a hiss over the engine), and
    // two more poles on the output to take off what fizz is left
    this.intakeNoiseFilter = new LowpassFilter(p.noiseCut ?? 1800.0);
    this.tone1 = new LowpassFilter(p.toneCut ?? 5000.0);
    this.tone2 = new LowpassFilter(p.toneCut ?? 5000.0);
    this.crankshaftFilter = new LowpassFilter(75.0);
    this.engineFilter = new LowpassFilter(125.0);
    this.revolution = 0.0;
  }

  process(_inputs, outputs, parameters) {
    if (!this.alive) return false;
    const t0 = Date.now();
    const out = outputs[0][0];
    const rpm = parameters.rpm[0], fire = 0.35 + 0.65 * parameters.throttle[0];
    const step = rpm / this.strokeRate / sampleRate;
    const cyl = this.cylinders, n = cyl.length, inv = this.inverse;
    const [mi, mb, mo] = this.mix, gain = this.gain;
    for (let s = 0; s < out.length; s++) {
      let intakeNoise = this.intakeNoiseFilter.get(2.0 * Math.random() - 1.0);
      if (rpm < 25.0) intakeNoise = 0;
      const crank = this.crankshaftFilter.get(0.25 * Math.random());
      let block = 0.0, intake = 0.0, straightPipeInput = 0.0;
      // (the wave coming back up the straight pipe splits between the cylinders at the collector: the original fed all of it to
      // every one, which gains energy round the loop and blows up past about four cylinders)
      const pipeLeft = this.straightPipe.outputLeft * inv;
      for (let i = 0; i < n; i++) {
        const c = cyl[i];
        c.update(intakeNoise, pipeLeft, (this.revolution + i * (inv + crank)) % 1, fire);
        block += c.cylinderWaveguide.outputLeft;
        intake += c.intakeWaveguide.outputLeft;
        straightPipeInput += c.extractorWaveguide.outputRight;
      }
      this.revolution += step;
      if (this.revolution > 1.0) this.revolution -= 1.0;
      this.straightPipe.add(straightPipeInput, this.muffler.outputLeft);
      this.outlet.add(this.muffler.outputRight, 0.0);
      const outlet = this.outlet.outputRight;
      this.muffler.update(this.straightPipe.outputRight, this.outlet.outputLeft);
      out[s] = gain * this.tone2.get(this.tone1.get(mi * intake + mb * this.engineFilter.get(block) + mo * outlet));
    }
    // a NaN or an infinity reaching the speakers silences every sound in the page, not just this engine: if one ever appears, this
    // block is silent and the engine starts over from empty pipes
    let sum = 0;
    for (let s = 0; s < out.length; s++) sum += out[s];
    if (!Number.isFinite(sum)) { out.fill(0); this.build(this.options); this.port.postMessage("reset"); }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    this.busy += Date.now() - t0;
    if (++this.blocks * out.length >= sampleRate) {
      this.port.postMessage(this.busy / 1000);
      this.busy = 0;
      this.blocks = 0;
    }
    return true;
  }
}

registerProcessor("waveguide-engine", EngineProcessor);
