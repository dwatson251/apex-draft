import { carStats, type CarConfig } from "./car.ts";
import { vehicleOf } from "./vehicles.ts";
import type { Line } from "./line.ts";
import { PIT_PENALTY, PIT_STOP_TIME } from "./pit.ts";
import { buildProfile, indexAt, sampleAt, type Profile } from "./profile.ts";
import { trackLength, type Track } from "./track.ts";

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
const DEADLOCK_TICKS = 480;
const MAX_TIME = 900;

/** Full tank. */
export const TANK = 100;
/** Laps a full tank lasts for a car with the standard stats. */
export const FUEL_LAPS = 3.4;
/** Tyre health lost per lap at the standard grip, 0 to 1. */
export const TYRE_WEAR_PER_LAP = 0.14;
/** Cornering grip lost when the tyres are completely worn. */
export const TYRE_GRIP_LOSS = 0.25;
/** Acceleration lost with a full tank. */
export const FUEL_MASS_ACCEL = 0.1;
/** Speed of a car that has run dry, as it heads for the pits, units/s. */
export const LIMP_SPEED = 30;
const STOP_TICKS = Math.round(PIT_STOP_TIME * 60);

/** Fuel one lap costs this car, in tank units: the standard car uses TANK / FUEL_LAPS. */
export function fuelPerLap(car: CarConfig): number {
  return (TANK / FUEL_LAPS) * ((0.85 + 0.025 * (car.accel + car.top)) / 1.15) * vehicleOf(car.type).fuel;
}

export interface RaceRules {
  /** tyre wear, fuel, and the pit stop that goes with them */
  realism: boolean;
}

export type RaceEventType = "cross" | "pitStart" | "pitEnd" | "dry" | "out";
export interface RaceEvent { tick: number; id: string; type: RaceEventType }

export interface Entrant {
  id: string;
  name: string;
  car: CarConfig;
  /** One line per lap. If the race has more laps than lines, the last line is driven again. */
  lines: Line[];
  isPlayer?: boolean;
  /** pit[lap] = drive into the pits at the end of that lap. Bots decide for themselves. */
  pit?: boolean[];
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
  /** fuel left, tank units, at every tick */
  ftrace: number[];
  /** tyre health 0 to 1 at every tick */
  ttrace: number[];
  /** 0 on the road, 1 in the pit lane, 2 being serviced, 3 out of the race */
  ptrace: number[];
  fuel: number;
  tyre: number;
  /** pit stops made */
  pits: number;
  /** the lap in progress ends in the pit lane */
  pitIn: boolean;
  /** the lap in progress started in the pit lane */
  pitOut: boolean;
  pitDone: boolean;
  /** ticks of service left */
  dwell: number;
  /** out of fuel and limping to the pits to retire */
  limp: boolean;
  /** retired: parked in the pits */
  out: boolean;
  outProg: number;
  needProf: boolean;
  prof: Profile;
  /** tank units per unit of distance */
  perUnit: number;
  wearMul: number;
}

export interface CarResult {
  id: string;
  name: string;
  isPlayer: boolean;
  slot: number;
  position: number;
  /** what counts: the time over the line plus any penalty */
  finishTime: number | null;
  /** time over the line */
  rawTime: number | null;
  /** added for never pitting */
  penalty: number;
  /** retired, out of fuel */
  dnf: boolean;
  pits: number;
  lapTimes: number[];
}

export class Race {
  readonly cars: RaceCar[] = [];
  readonly events: RaceEvent[] = [];
  tick = 0;
  private profiles = new Map<string, Profile>();
  private lapLen: number;

  /** `entrants` are placed on the grid in qualifying order: fastest ideal lap first. */
  constructor(readonly track: Track, entrants: Entrant[], readonly laps: number, readonly rules: RaceRules = { realism: true }) {
    this.lapLen = trackLength(track);
    const ranked = entrants
      .map((e, i) => ({ e, i, ideal: this.profile(e, 0).ideal }))
      .sort((a, b) => a.ideal - b.ideal || a.i - b.i);
    ranked.forEach(({ e }, slot) => {
      const p0 = this.profile(e, 0);
      // lines differ, so two grid slots can land on top of each other: slide this car back until it is clear
      let back = GRID_GAP * slot;
      const clear = (b: number) => this.cars.every((o) => {
        const sNew = slot === 0 ? 0 : p0.length - b;
        return Math.hypot(sampleAt(p0, p0.x, sNew) - o.x, sampleAt(p0, p0.y, sNew) - o.y) > SAFE_GAP + 2;
      });
      for (let i = 0; slot > 0 && i < 60 && !clear(back); i++) back += 3;
      const c: RaceCar = {
        entrant: e, slot, lap: slot === 0 ? 0 : -1,
        s: slot === 0 ? 0 : p0.length - back, v: 0, x: 0, y: 0, h: 0,
        ghost: false, stuck: 0, ghostFor: 0, powered: false, freeUntil: 0, lapStart: slot === 0 ? [0] : [], finishTime: null,
        trace: [], prog: [], vtrace: [], gtrace: [], ftrace: [], ttrace: [], ptrace: [],
        fuel: TANK, tyre: 1, pits: 0, pitIn: false, pitOut: false, pitDone: false, dwell: 0, limp: false, out: false, outProg: 0,
        needProf: false, prof: p0, perUnit: fuelPerLap(e.car) / this.lapLen, wearMul: (0.8 + 0.04 * e.car.grip) * vehicleOf(e.car.type).wear,
      };
      if (slot === 0) this.startLap(c);
      this.place(c);
      this.cars.push(c);
    });
    this.record();
  }

  get time(): number { return this.tick * TICK; }

  private alive = (c: RaceCar): boolean => c.finishTime === null && !c.out;

  /** A lap's path with nothing special: fresh tyres and a full tank. Used for qualifying and the grid. */
  private profile(e: Entrant, lap: number): Profile {
    return this.build(e, lap, false, false, 1, 1);
  }

  private build(e: Entrant, lap: number, pitIn: boolean, pitOut: boolean, grip: number, accel: number): Profile {
    const idx = Math.min(Math.max(lap, 0), e.lines.length - 1);
    const k = `${e.id}:${idx}:${+pitIn}${+pitOut}:${Math.round(grip * 200)}:${Math.round(accel * 200)}`;
    let p = this.profiles.get(k);
    if (!p) {
      p = buildProfile(this.track, e.lines[idx]!, e.car, { pitIn, pitOut, grip, accel });
      this.profiles.set(k, p);
    }
    return p;
  }

  /** Call after setting a new line on an entrant so that later laps use it. */
  forget(id: string): void {
    for (const k of [...this.profiles.keys()]) if (k.startsWith(`${id}:`)) this.profiles.delete(k);
  }

  private fuelPerLapOf(c: RaceCar): number { return c.perUnit * this.lapLen; }

  /** Whether this car drives into the pits at the end of the lap. The player says so in advance; bots work it out. */
  private decidePit(c: RaceCar, lap: number): boolean {
    if (!this.rules.realism) return false;
    if (c.limp) return true;
    if (lap >= this.laps - 1) return false;
    if (c.entrant.isPlayer || c.entrant.pit) return !!c.entrant.pit?.[lap];
    const perLap = this.fuelPerLapOf(c);
    const left = this.laps - lap;
    const atLine = c.fuel - perLap * 1.05;
    if (atLine < 0) return false; // will not make it round: too late
    if (atLine < perLap * 1.05) return true; // could not do one more lap after this one
    return c.tyre < 0.45 && left >= 3;
  }

  /** Set the path for the lap that is starting. Called again a tick later, in case the player has since changed their line. */
  private startLap(c: RaceCar, refresh = false): void {
    const lap = Math.max(c.lap, 0);
    if (!refresh) { c.pitOut = c.pitIn; c.pitDone = false; c.dwell = 0; }
    c.pitIn = this.decidePit(c, lap);
    const real = this.rules.realism;
    c.prof = this.build(c.entrant, lap, c.pitIn, c.pitOut, real ? 1 - TYRE_GRIP_LOSS * (1 - c.tyre) : 1, real ? 1 - FUEL_MASS_ACCEL * (c.fuel / TANK) : 1);
  }

  private place(c: RaceCar): void {
    const p = c.prof;
    c.x = sampleAt(p, p.x, c.s);
    c.y = sampleAt(p, p.y, c.s);
    const x1 = sampleAt(p, p.x, c.s + 1), y1 = sampleAt(p, p.y, c.s + 1);
    const x0 = sampleAt(p, p.x, c.s - 1), y0 = sampleAt(p, p.y, c.s - 1);
    c.h = Math.atan2(y1 - y0, x1 - x0);
    const power = p.ghost[indexAt(p, c.s)] === 1;
    // A ghost only turns solid once nobody is inside it, so the power-up never ends with two cars overlapping.
    const sitting = c.ghost && this.cars.some((o) => o !== c && this.alive(o) && Math.hypot(o.x - c.x, o.y - c.y) < SAFE_GAP + 2);
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
      c.ftrace.push(Math.round(c.fuel * 10) / 10);
      c.ttrace.push(Math.round(c.tyre * 1000) / 1000);
      c.ptrace.push(c.out ? 3 : c.dwell > 0 ? 2 : c.prof.lane[indexAt(c.prof, c.s)] ? 1 : 0);
    }
  }

  /** Progress used for ordering: whole laps first, then distance in the lap. */
  progress(c: RaceCar): number {
    return c.lap * 1e5 + c.s;
  }

  /** Who has right of way: further round the race first, the better grid slot on a tie. */
  private prio(c: RaceCar): number { return c.lap * 1e5 + c.s - c.slot * 1e-3; }

  private posAt(c: RaceCar, s: number): { x: number; y: number } {
    const p = c.prof;
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
    for (const o of racing) {
      if (o === c || o.ghost || o.freeUntil > this.tick) continue;
      const dx = o.x - c.x, dy = o.y - c.y;
      if (dx * dx + dy * dy > (reach + LATERAL) * (reach + LATERAL)) continue;
      // First point of my path, in the next `reach` units, where the other car is in the way: either it is sitting
      // on the path now, or by the time I get there it will be (this catches lines that merge or cross).
      const po = o.prof;
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
      // "ahead" is measured along the average of the two headings, so both cars agree on who is in front
      let ux = Math.cos(c.h) + Math.cos(o.h), uy = Math.sin(c.h) + Math.sin(o.h);
      const ul = Math.hypot(ux, uy) || 1;
      ux /= ul; uy /= ul;
      const along = dx * ux + dy * uy;
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

  private emit(id: string, type: RaceEventType): void { this.events.push({ tick: this.tick, id, type }); }

  /** Tyres and fuel are topped up and the car is let go. */
  private finishStop(c: RaceCar): void {
    c.fuel = TANK;
    c.tyre = 1;
    c.pits++;
    c.pitDone = true;
    this.emit(c.entrant.id, "pitEnd");
  }

  step(): void {
    const racing = this.cars.filter(this.alive);
    for (const c of racing) if (c.needProf) { c.needProf = false; this.startLap(c, true); }
    const next = new Map<RaceCar, { v: number; s: number }>();
    const arrived: RaceCar[] = [];
    for (const c of racing) {
      const p = c.prof;
      const st = carStats(c.entrant.car);
      const i = indexAt(p, c.s);
      let target = sampleAt(p, p.vLim, c.s);
      if (c.limp) target = Math.min(target, LIMP_SPEED);
      const stopping = c.pitIn && !c.pitDone && p.pitS !== undefined;
      // brake to stop exactly in the box
      if (stopping) target = c.dwell > 0 ? 0 : Math.min(target, Math.sqrt(2 * st.brake * 0.7 * Math.max(0, p.pitS! - c.s)));
      if (!c.ghost && c.freeUntil <= this.tick) target = Math.min(target, this.trafficLimit(c, p, st.brake, racing));
      else if (c.ghost && !c.powered) {
        // lingering: get out from inside whoever is still there, by dropping back from a car ahead
        const hx = Math.cos(c.h), hy = Math.sin(c.h);
        for (const o of racing) {
          if (o === c || o.ghost || Math.hypot(o.x - c.x, o.y - c.y) >= SAFE_GAP + 2) continue;
          if ((o.x - c.x) * hx + (o.y - c.y) * hy > 0) target = Math.min(target, Math.max(0, o.v - 14));
        }
      }
      let v = c.v > target ? Math.max(target, c.v - st.brake * TICK) : Math.min(target, c.v + st.accel * p.accelMul[i]! * TICK);
      let s = c.s + v * TICK;
      if (stopping && c.dwell === 0 && p.pitS! - s < 0.5 && v < 5) { s = p.pitS!; v = 0; arrived.push(c); }
      next.set(c, { v, s });
    }
    this.resolveContacts(racing, next);
    for (const c of racing) {
      const n = next.get(c)!;
      const p = c.prof;
      if (c.dwell === 0 && n.v < 1 && c.v < 1 && sampleAt(p, p.vLim, c.s) > 5) {
        if (++c.stuck > DEADLOCK_TICKS) { c.freeUntil = this.tick + 180; c.stuck = 0; }
      } else c.stuck = 0;
    }
    this.tick++;
    const t = this.time;
    for (const c of racing) {
      const n = next.get(c)!;
      const moved = n.s - c.s;
      c.v = n.v;
      c.s = n.s;
      if (this.rules.realism && moved > 0) {
        const p = c.prof;
        c.fuel = Math.max(0, c.fuel - moved * c.perUnit);
        const st = carStats(c.entrant.car);
        const load = Math.min(1.2, (p.kap[indexAt(p, c.s)]! * c.v * c.v) / st.aLat);
        c.tyre = Math.max(0, c.tyre - (moved / this.lapLen) * TYRE_WEAR_PER_LAP * c.wearMul * (0.4 + 1.2 * load * load) / 0.63);
      }
      let p = c.prof;
      while (c.s >= p.length && c.finishTime === null) {
        c.s -= p.length;
        c.lap++;
        this.emit(c.entrant.id, "cross");
        if (c.lap >= this.laps) { c.finishTime = t; break; }
        if (c.lap >= 0) c.lapStart.push(t);
        this.startLap(c);
        c.needProf = true;
        p = c.prof;
      }
      if (c.finishTime === null) this.place(c);
    }
    // out of fuel: limp to the pits and retire there
    for (const c of racing) {
      if (!this.rules.realism || c.limp || c.finishTime !== null || c.fuel > 0) continue;
      c.limp = true;
      this.emit(c.entrant.id, "dry");
      if (!c.pitIn) {
        const real = 1 - TYRE_GRIP_LOSS * (1 - c.tyre);
        const np = this.build(c.entrant, Math.max(c.lap, 0), true, c.pitOut, real, 1);
        // too late to turn in this lap? it goes round once more at limp speed and turns in next time
        if (np.pitFromS !== undefined && c.s < np.pitFromS - 3) { c.prof = np; c.pitIn = true; c.pitDone = false; }
      }
    }
    for (const c of arrived) {
      if (c.limp) { c.out = true; c.outProg = this.progress(c); c.v = 0; this.emit(c.entrant.id, "out"); }
      else { c.dwell = STOP_TICKS; this.emit(c.entrant.id, "pitStart"); }
    }
    for (const c of racing) if (c.dwell > 0 && !arrived.includes(c) && --c.dwell === 0) this.finishStop(c);
    this.record();
  }

  /** Run until the given car has started lap `lap`+1 (i.e. finished `lap`), or the race is over. */
  runLap(carId: string, lap: number): void {
    const car = this.cars.find((c) => c.entrant.id === carId)!;
    while (this.alive(car) && car.lap <= lap && this.time < MAX_TIME) this.step();
  }

  runToEnd(): void {
    while (this.cars.some(this.alive) && this.time < MAX_TIME) this.step();
  }

  get over(): boolean { return this.cars.every((c) => !this.alive(c)) || this.time >= MAX_TIME; }

  private penaltyOf(c: RaceCar): number { return this.rules.realism && c.finishTime !== null && c.pits === 0 ? PIT_PENALTY : 0; }

  results(): CarResult[] {
    const adj = (c: RaceCar) => (c.finishTime === null ? null : c.finishTime + this.penaltyOf(c));
    const order = [...this.cars].sort((a, b) => {
      const ta = adj(a), tb = adj(b);
      if (ta !== null && tb !== null) return ta - tb || a.slot - b.slot;
      if (ta !== null) return -1;
      if (tb !== null) return 1;
      // nobody home: retired cars last, furthest round first
      if (a.out !== b.out) return a.out ? 1 : -1;
      return (a.out ? b.outProg - a.outProg : this.progress(b) - this.progress(a));
    });
    return order.map((c, i) => {
      const lapTimes: number[] = [];
      for (let k = 0; k < c.lapStart.length; k++) {
        const end = k + 1 < c.lapStart.length ? c.lapStart[k + 1]! : c.finishTime;
        if (end !== null) lapTimes.push(end - c.lapStart[k]!);
      }
      return {
        id: c.entrant.id, name: c.entrant.name, isPlayer: !!c.entrant.isPlayer, slot: c.slot, position: i + 1,
        finishTime: adj(c), rawTime: c.finishTime, penalty: this.penaltyOf(c), dnf: c.out, pits: c.pits, lapTimes,
      };
    });
  }

  /** A fingerprint of the race, for determinism tests. */
  hash(): string {
    let h = 0x811c9dc5;
    const mix = (n: number) => { h ^= Math.round(n * 100) | 0; h = Math.imul(h, 0x01000193) >>> 0; };
    mix(this.tick);
    for (const c of this.cars) { mix(c.s); mix(c.v); mix(c.lap); mix(c.finishTime ?? -1); mix(c.fuel); mix(c.tyre * 100); }
    return h.toString(16);
  }
}
