import { carStats, type CarConfig } from "./car.ts";
import type { Line } from "./line.ts";
import { buildProfile, indexAt, sampleAt, type Profile } from "./profile.ts";
import type { Track } from "./track.ts";

export const TICK = 1 / 60;
/** Distance between grid slots on the start line, units. */
export const GRID_GAP = 14;
/** Centre-to-centre gap the cars try to keep to whatever is ahead on their path, units. */
export const SAFE_GAP = 11;
/** Centre-to-centre distance below which two cars are touching. The sim never lets it happen. */
export const HARD_GAP = 8;
/** A car counts as being on my path when its centre is this close to it. */
const LATERAL = 8;
const PLAN_STEP = 3;
const GHOST_LINGER = 1200;
/** How close two cars are predicted to be before the one with less right of way backs off. */
const PREDICT_GAP = 10;
/** A car that has been stuck this long ignores other cars for a while, so a rare jam cannot freeze the race. */
const DEADLOCK_TICKS = 240;
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
  /** consecutive ticks spent stopped behind something */
  stuck: number;
  /** ticks a ghost has lingered after its power-up ran out */
  ghostFor: number;
  /** true while the ghost power-up itself is active (as opposed to lingering until clear) */
  powered: boolean;
  /** until this tick the car ignores others (a failsafe against two cars waiting on each other) */
  freeUntil: number;
  /** race times at which each lap began (the moment of crossing the line) */
  lapStart: number[];
  finishTime: number | null;
  /** frames[tick*3 .. +3] = x, y, heading */
  trace: number[];
  /** progress() at every tick, for live standings */
  prog: number[];
  /** speed at every tick, units/s */
  vtrace: number[];
  /** 1 on the ticks the car is a ghost */
  gtrace: number[];
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
      // lines differ, so two grid slots can land on top of each other: slide this car back until it is clear
      let back = GRID_GAP * slot;
      const clear = (b: number) => this.cars.every((o) => {
        const q = this.profile(o.entrant, 0);
        const sNew = slot === 0 ? 0 : p0.length - b;
        return Math.hypot(sampleAt(p0, p0.x, sNew) - o.x, sampleAt(p0, p0.y, sNew) - o.y) > SAFE_GAP + 2 && q.length > 0;
      });
      for (let i = 0; slot > 0 && i < 60 && !clear(back); i++) back += 3;
      const c: RaceCar = {
        entrant: e, slot, lap: slot === 0 ? 0 : -1,
        s: slot === 0 ? 0 : p0.length - back, v: 0, x: 0, y: 0, h: 0,
        ghost: false, stuck: 0, ghostFor: 0, powered: false, freeUntil: 0, lapStart: slot === 0 ? [0] : [], finishTime: null, trace: [], prog: [], vtrace: [], gtrace: [],
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
    const power = p.ghost[indexAt(p, c.s)] === 1;
    // A ghost only turns solid once nobody is inside it, so the power-up never ends with two cars overlapping.
    const sitting = c.ghost && this.cars.some((o) => o !== c && o.finishTime === null && Math.hypot(o.x - c.x, o.y - c.y) < SAFE_GAP + 2);
    c.powered = power;
    c.ghost = power || (sitting && c.ghostFor++ < GHOST_LINGER);
    if (!c.ghost) c.ghostFor = 0;
  }

  private record(): void {
    for (const c of this.cars) c.trace.push(Math.round(c.x * 100) / 100, Math.round(c.y * 100) / 100, Math.round(c.h * 1000) / 1000);
    for (const c of this.cars) {
      c.prog.push(c.lap * 1e5 + c.s);
      c.vtrace.push(Math.round(c.v * 10) / 10);
      c.gtrace.push(c.ghost ? 1 : 0);
    }
  }

  /** Progress used for ordering: whole laps first, then distance in the lap. */
  progress(c: RaceCar): number {
    return c.lap * 1e5 + c.s;
  }

  /** Who has right of way: further round the race first, the better grid slot on a tie. */
  private prio(c: RaceCar): number { return c.lap * 1e5 + c.s - c.slot * 1e-3; }

  private posAt(c: RaceCar, s: number): { x: number; y: number } {
    const p = this.profile(c.entrant, c.lap);
    return { x: sampleAt(p, p.x, s), y: sampleAt(p, p.y, s) };
  }

  /**
   * The speed this car may carry given the traffic on its path. Cars ahead and going the same way are followed at
   * a safe gap. Cars crossing or merging are given way to if they are further round the race.
   */
  private trafficLimit(c: RaceCar, p: Profile, brake: number, racing: RaceCar[]): number {
    let limit = Infinity;
    const b = brake * 0.6;
    const reach = (c.v * c.v) / (2 * b) + SAFE_GAP + 20;
    const mine = this.prio(c);
    const hx = Math.cos(c.h), hy = Math.sin(c.h);
    for (const o of racing) {
      if (o === c || o.ghost || o.freeUntil > this.tick) continue;
      const dx = o.x - c.x, dy = o.y - c.y;
      if (dx * dx + dy * dy > (reach + LATERAL) * (reach + LATERAL)) continue;
      // First point of my path, in the next `reach` units, where the other car is in the way: either it is sitting
      // on the path now, or by the time I get there it will be (this catches lines that merge or cross).
      const po = this.profile(o.entrant, o.lap);
      const speed = Math.max(c.v, 12);
      let hit = -1;
      for (let d = 0; d <= reach; d += PLAN_STEP) {
        const px = sampleAt(p, p.x, c.s + d), py = sampleAt(p, p.y, c.s + d);
        let q = (px - o.x) * (px - o.x) + (py - o.y) * (py - o.y);
        if (q < LATERAL * LATERAL) { hit = d; break; }
        const ahead = o.s + (o.v * d) / speed;
        const ex = px - sampleAt(po, po.x, ahead), ey = py - sampleAt(po, po.y, ahead);
        q = ex * ex + ey * ey;
        if (d > 0 && q < PREDICT_GAP * PREDICT_GAP) { hit = d; break; }
      }
      if (hit < 0) continue;
      const along = dx * hx + dy * hy;
      if (hit === 0 && along <= 0) continue; // behind me
      const ax = sampleAt(p, p.x, c.s + hit + 1) - sampleAt(p, p.x, c.s + hit - 1);
      const ay = sampleAt(p, p.y, c.s + hit + 1) - sampleAt(p, p.y, c.s + hit - 1);
      const cos = Math.cos(o.h - Math.atan2(ay, ax));
      // Only a car clearly ahead is followed. Alongside, or crossing, the car further round the race has right of
      // way, which is a strict order and so can never leave two cars each waiting for the other. A car behind me
      // is its own driver's problem.
      const room = Math.sqrt(2 * b * Math.max(0, Math.min(hit, Math.hypot(dx, dy)) - SAFE_GAP));
      if (cos > 0.3) {
        if (along > 1.5) limit = Math.min(limit, o.v * cos + room);
        else if (along > -1.5 && this.prio(o) > mine) limit = Math.min(limit, o.v * cos + room);
      } else if (this.prio(o) > mine) {
        limit = Math.min(limit, room);
      }
    }
    return limit;
  }

  /** Last line of defence: if two cars would touch after this tick, the one with less right of way stops. */
  private resolveContacts(racing: RaceCar[], next: Map<RaceCar, { v: number; s: number }>): void {
    for (let iter = 0; iter < 3; iter++) {
      let changed = false;
      for (let i = 0; i < racing.length; i++) {
        for (let j = i + 1; j < racing.length; j++) {
          const A = racing[i]!, B = racing[j]!;
          if (A.ghost || B.ghost || A.freeUntil > this.tick || B.freeUntil > this.tick) continue;
          const pa = this.posAt(A, next.get(A)!.s), pb = this.posAt(B, next.get(B)!.s);
          if (Math.hypot(pa.x - pb.x, pa.y - pb.y) >= HARD_GAP) continue;
          const loser = this.prio(A) < this.prio(B) ? A : B;
          const winner = loser === A ? B : A;
          const ln = next.get(loser)!;
          const target = ln.v === 0 && ln.s === loser.s ? winner : loser;
          next.set(target, { v: 0, s: target.s });
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  step(): void {
    const racing = this.cars.filter((c) => c.finishTime === null);
    const next = new Map<RaceCar, { v: number; s: number }>();
    for (const c of racing) {
      const p = this.profile(c.entrant, c.lap);
      const st = carStats(c.entrant.car);
      const i = indexAt(p, c.s);
      let target = sampleAt(p, p.vLim, c.s);
      if (!c.ghost && c.freeUntil <= this.tick) target = Math.min(target, this.trafficLimit(c, p, st.brake, racing));
      else if (c.ghost && !c.powered) {
        // lingering: get out from inside whoever is still there, by dropping back from a car ahead
        const hx = Math.cos(c.h), hy = Math.sin(c.h);
        for (const o of racing) {
          if (o === c || o.ghost || Math.hypot(o.x - c.x, o.y - c.y) >= SAFE_GAP + 2) continue;
          if ((o.x - c.x) * hx + (o.y - c.y) * hy > 0) target = Math.min(target, Math.max(0, o.v - 14));
        }
      }
      const v = c.v > target ? Math.max(target, c.v - st.brake * TICK) : Math.min(target, c.v + st.accel * p.accelMul[i]! * TICK);
      next.set(c, { v, s: c.s + v * TICK });
    }
    this.resolveContacts(racing, next);
    for (const c of racing) {
      const n = next.get(c)!;
      const p = this.profile(c.entrant, c.lap);
      if (n.v < 1 && c.v < 1 && sampleAt(p, p.vLim, c.s) > 5) {
        if (++c.stuck > DEADLOCK_TICKS) { c.freeUntil = this.tick + 180; c.stuck = 0; }
      } else c.stuck = 0;
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
