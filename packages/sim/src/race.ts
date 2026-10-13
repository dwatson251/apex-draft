import { carStats, type CarConfig } from "./car.ts";
import type { Line } from "./line.ts";
import { buildProfile, indexAt, sampleAt, type Profile } from "./profile.ts";
import type { Track } from "./track.ts";

export const TICK = 1 / 60;
/** Distance between grid slots on the start line, units. */
export const GRID_GAP = 14;
/** Followers keep at least this gap to the car in front, units. */
export const MIN_GAP = 10;
const LOOK_AHEAD = 70;
const LANE_WIDTH = 7;
const MAX_TIME = 900;

export interface Entrant {
  id: string;
  name: string;
  car: CarConfig;
  /** One line per lap. If the race has more laps than lines, the last line is driven again. */
  lines: Line[];
  isPlayer?: boolean;
}

export interface RaceCar {
  entrant: Entrant;
  slot: number;
  /** -1 on the run-up to the line, then 0-based lap index; equals the lap count when finished */
  lap: number;
  /** arclength along the current lap's path */
  s: number;
  v: number;
  x: number;
  y: number;
  h: number;
  ghost: boolean;
  /** race times at which each lap began (the moment of crossing the line) */
  lapStart: number[];
  finishTime: number | null;
  /** frames[tick*3 .. +3] = x, y, heading */
  trace: number[];
  /** progress() at every tick, for live standings */
  prog: number[];
}

export interface CarResult {
  id: string;
  name: string;
  isPlayer: boolean;
  slot: number;
  position: number;
  finishTime: number | null;
  lapTimes: number[];
}

export class Race {
  readonly cars: RaceCar[] = [];
  tick = 0;
  private profiles = new Map<string, Profile>();

  /** `entrants` are placed on the grid in qualifying order: fastest ideal lap first. */
  constructor(readonly track: Track, entrants: Entrant[], readonly laps: number) {
    const ranked = entrants
      .map((e, i) => ({ e, i, ideal: this.profile(e, 0).ideal }))
      .sort((a, b) => a.ideal - b.ideal || a.i - b.i);
    ranked.forEach(({ e }, slot) => {
      const p0 = this.profile(e, 0);
      const c: RaceCar = {
        entrant: e, slot, lap: slot === 0 ? 0 : -1,
        s: slot === 0 ? 0 : p0.length - GRID_GAP * slot, v: 0, x: 0, y: 0, h: 0,
        ghost: false, lapStart: slot === 0 ? [0] : [], finishTime: null, trace: [], prog: [],
      };
      this.place(c);
      this.cars.push(c);
    });
    this.record();
  }

  get time(): number { return this.tick * TICK; }

  private profile(e: Entrant, lap: number): Profile {
    const idx = Math.min(Math.max(lap, 0), e.lines.length - 1);
    const k = `${e.id}:${idx}`;
    let p = this.profiles.get(k);
    if (!p) {
      p = buildProfile(this.track, e.lines[idx]!, e.car);
      this.profiles.set(k, p);
    }
    return p;
  }

  /** Call after setting a new line on an entrant so that later laps use it. */
  forget(id: string): void {
    for (const k of [...this.profiles.keys()]) if (k.startsWith(`${id}:`)) this.profiles.delete(k);
  }

  private place(c: RaceCar): void {
    const p = this.profile(c.entrant, c.lap);
    c.x = sampleAt(p, p.x, c.s);
    c.y = sampleAt(p, p.y, c.s);
    const x1 = sampleAt(p, p.x, c.s + 1), y1 = sampleAt(p, p.y, c.s + 1);
    const x0 = sampleAt(p, p.x, c.s - 1), y0 = sampleAt(p, p.y, c.s - 1);
    c.h = Math.atan2(y1 - y0, x1 - x0);
    c.ghost = p.ghost[indexAt(p, c.s)] === 1;
  }

  private record(): void {
    for (const c of this.cars) c.trace.push(Math.round(c.x * 100) / 100, Math.round(c.y * 100) / 100, Math.round(c.h * 1000) / 1000);
    for (const c of this.cars) c.prog.push(c.lap * 1e5 + c.s);
  }

  /** Progress used for ordering: whole laps first, then distance in the lap. */
  progress(c: RaceCar): number {
    return c.lap * 1e5 + c.s;
  }

  step(): void {
    const racing = this.cars.filter((c) => c.finishTime === null);
    const next = new Map<RaceCar, { v: number; s: number }>();
    for (const c of racing) {
      const p = this.profile(c.entrant, c.lap);
      const st = carStats(c.entrant.car);
      const i = indexAt(p, c.s);
      let target = sampleAt(p, p.vLim, c.s);
      if (!c.ghost) {
        const hx = Math.cos(c.h), hy = Math.sin(c.h);
        for (const o of racing) {
          if (o === c || o.ghost) continue;
          const rx = o.x - c.x, ry = o.y - c.y;
          const along = rx * hx + ry * hy;
          if (along <= 0.5 || along > LOOK_AHEAD) continue;
          if (Math.abs(rx * hy - ry * hx) > LANE_WIDTH) continue;
          const vo = Math.max(0, o.v * Math.cos(o.h - c.h));
          target = Math.min(target, vo + Math.sqrt(2 * st.brake * Math.max(0, along - MIN_GAP)));
        }
      }
      let v = c.v;
      if (v > target) v = Math.max(target, v - st.brake * TICK);
      else v = Math.min(target, v + st.accel * p.accelMul[i]! * TICK);
      next.set(c, { v, s: c.s + v * TICK });
    }
    this.tick++;
    const t = this.time;
    for (const c of racing) {
      const n = next.get(c)!;
      c.v = n.v;
      c.s = n.s;
      let p = this.profile(c.entrant, c.lap);
      while (c.s >= p.length && c.finishTime === null) {
        c.s -= p.length;
        c.lap++;
        if (c.lap >= this.laps) { c.finishTime = t; break; }
        if (c.lap >= 0) c.lapStart.push(t);
        p = this.profile(c.entrant, c.lap);
      }
      if (c.finishTime === null) this.place(c);
    }
    this.record();
  }

  /** Run until the given car has started lap `lap`+1 (i.e. finished `lap`), or the race is over. */
  runLap(carId: string, lap: number): void {
    const car = this.cars.find((c) => c.entrant.id === carId)!;
    while (car.finishTime === null && car.lap <= lap && this.time < MAX_TIME) this.step();
  }

  runToEnd(): void {
    while (this.cars.some((c) => c.finishTime === null) && this.time < MAX_TIME) this.step();
  }

  get over(): boolean { return this.cars.every((c) => c.finishTime !== null) || this.time >= MAX_TIME; }

  results(): CarResult[] {
    const order = [...this.cars].sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime || a.slot - b.slot;
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;
      return this.progress(b) - this.progress(a);
    });
    return order.map((c, i) => {
      const lapTimes: number[] = [];
      for (let k = 0; k < c.lapStart.length; k++) {
        const end = k + 1 < c.lapStart.length ? c.lapStart[k + 1]! : c.finishTime;
        if (end !== null) lapTimes.push(end - c.lapStart[k]!);
      }
      return { id: c.entrant.id, name: c.entrant.name, isPlayer: !!c.entrant.isPlayer, slot: c.slot, position: i + 1, finishTime: c.finishTime, lapTimes };
    });
  }

  /** A fingerprint of the race, for determinism tests. */
  hash(): string {
    let h = 0x811c9dc5;
    const mix = (n: number) => { h ^= Math.round(n * 100) | 0; h = Math.imul(h, 0x01000193) >>> 0; };
    mix(this.tick);
    for (const c of this.cars) { mix(c.s); mix(c.v); mix(c.lap); mix(c.finishTime ?? -1); }
    return h.toString(16);
  }
}
