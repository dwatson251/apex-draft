import { carStats, type CarConfig } from "./car.ts";
import { biomeOf, terrainMul, type Biome } from "./biomes.ts";
import { vehicleOf, type Vehicle } from "./vehicles.ts";
import { impact } from "./impact.ts";
import { botLine } from "./bots.ts";
import { Rng } from "./rng.ts";
import { COMPOUNDS, spinRate, tyreGrip, wearRate, type Compound } from "./tyres.ts";
import { rainAt, weatherFor, type Weather } from "./weather.ts";
import { WetField } from "./trackwet.ts";
import type { Line } from "./line.ts";
import { PIT_BAYS, PIT_BAY_GAP, PIT_PENALTY, PIT_STOP_TIME } from "./pit.ts";
import { buildProfile, indexAt, sampleAt, type Profile } from "./profile.ts";
import { nearbySegments, trackLength, ROAD_HALF, type Track } from "./track.ts";

export const TICK = 1 / 60;
/** Distance between rows of the starting grid, units; the second car of a row sits half a row back. */
export const GRID_GAP = 16;
/** How far either side of the middle of the road the two columns of the grid sit. */
export const GRID_SIDE = 8;
/** Centre-to-centre gap the cars try to keep to whatever is ahead on their path, units. */
export const SAFE_GAP = 11;
/** Rough centre-to-centre distance at which two cars touch (it really depends on the two vehicles). */
export const HARD_GAP = 8;
/** Pull of the spring that brings a knocked car back to its line, and its damping: about a second to settle. */
const OFF_K = 36;
const OFF_C = 10.8;

/**
 * Boats on water. Nothing grips, so a boat is allowed to carry more speed into a corner than a car could (DRIFT_ALLOW, scaled by
 * how readily the hull slides), and what it cannot grip it slides: the hull swings into a slip angle `beta` toward the turn
 * (cars do the same on a smaller scale, up to their own peak slip angle)
 * while the boat is carried wide, with only a weak pull back to the line. The angle rises in a fraction of a second and dies away
 * slowly, and the sideways slide scrubs speed off, so a big drift costs time.
 */
const DRIFT_ALLOW = 0.35;
/** On land the tyres still grip: the slide carries a car outward less than a hull, and scrubs less speed. */
const LAND_SLIDE = 0.4;
const BETA_RISE = 5;
const WATER_K = 8;
const WATER_C = 4;
const SLIDE_GAIN = 2.5;
const SLIDE_DRAG = 0.9;
/**
 * Tyres that are worn, or the wrong ones for the road (slicks in the wet, wets on a dry road), have less grip, and a tyre working
 * nearer its limit runs at a bigger slip angle: each 10% of grip lost widens the angle a vehicle reaches by this much, up to a cap.
 * The bigger slide carries the car further out and scrubs more speed, on top of the lower cornering speed the path already has.
 */
const SLIP_PER_LOST_GRIP = 1.2;
const SLIP_WIDEN_MAX = 2;

/** Extra pull from a standing start for machines that launch hard, fading out by 30% of top speed. */
const launchMul = (c: { v: number; entrant: { car: CarConfig } }, vTop: number): number => {
  const l = vehicleOf(c.entrant.car.type).launch;
  return l > 0 ? 1 + l * Math.max(0, 1 - c.v / (0.3 * vTop)) : 1;
};
const OFF_MAX = 26;
/** Hits gentler than this make no sound. */
const BUMP_MIN = 6;
/** Sitting close behind another car cuts the air: how far back the slipstream reaches, and what it is worth at best. */
export const DRAFT_RANGE = 42;
export const DRAFT_TOP = 0.08;
export const DRAFT_ACCEL = 0.3;
/** A car counts as being on my path when its centre is this close to it. */
const LATERAL = 8;
const PLAN_STEP = 3;
const GHOST_LINGER = 1200;
/** How close two cars are predicted to be before the one with less right of way backs off. */
const PREDICT_GAP = 10;
/** A car that has been stuck this long ignores other cars for a while, so a rare jam cannot freeze the race. */
const DEADLOCK_TICKS = 600;
/** Long races stretch the tank and the tyres, so that a handful of stops is enough for fifty laps. */
export function raceScale(laps: number): { fuelLaps: number; wearScale: number } {
  return { fuelLaps: Math.max(11, laps / 3.5), wearScale: 7 / Math.max(7, laps / 3.5) };
}

/** Full tank. */
export const TANK = 100;
/** Laps a full tank lasts for a car with the standard stats. */
export const FUEL_LAPS = 11;
/** Tyre health lost per lap at the standard grip, 0 to 1. */
export const TYRE_WEAR_PER_LAP = 0.076;
/** Cornering grip lost when the tyres are completely worn. */
export const TYRE_GRIP_LOSS = 0.25;
/** Acceleration lost with a full tank. */
export const FUEL_MASS_ACCEL = 0.1;
/** Speed of a car that has run dry, as it heads for the pits, units/s. */
export const LIMP_SPEED = 30;
const STOP_TICKS = Math.round(PIT_STOP_TIME * 60);
/** An emergency refuel is a slow splash of fuel by whoever is nearest: half as long again as a planned stop, no new tyres. */
const EMERGENCY_TICKS = Math.round(PIT_STOP_TIME * 60 * 1.5);
/** Cars leave the pit lane one at a time, first in first out, at least this long apart. */
const RELEASE_TICKS = 54;
/** After the flag a car carries on round its line at this fraction of the speed the road allows. */
const COAST_FRACTION = 0.5;
/** The race is over this long after the last car has taken the flag, so that car coasts too. */
const COAST_SECONDS = 5;
/** A car picks its bay this far (along its lap) before the box, so it can brake for it. */
const BAY_PICK = 120;

/** Fuel one lap costs this car, in tank units: the standard car uses TANK / FUEL_LAPS. */
export function fuelPerLap(car: CarConfig, laps = 3): number {
  return (TANK / raceScale(laps).fuelLaps) * ((0.85 + 0.025 * (car.accel + car.top)) / 1.15) * vehicleOf(car.type).fuel;
}

export interface RaceRules {
  /** tyre wear, fuel, and the pit stop that goes with them */
  realism: boolean;
  /** rain and a track that wets and dries (default on) */
  weather?: boolean;
  /** slipstream behind another car (default on, in every mode) */
  draft?: boolean;
  /** how many times faster fuel burns and tyres wear than normal (1 to MAX_WEAR_MULT; default 1) */
  wearMult?: { fuel: number; tyre: number };
  /** compounds every car must run at some point; each one missing from a finisher costs PIT_PENALTY */
  mandatory?: Compound[];
}

/** The most the fuel burn or tyre wear can be turned up. */
export const MAX_WEAR_MULT = 40;
export const clampWear = (x: unknown): number => {
  const n = typeof x === "number" && isFinite(x) ? Math.round(x) : 1;
  return Math.min(MAX_WEAR_MULT, Math.max(1, n));
};

/** A pit stop planned in advance: drive in at the end of this lap and come out on this tyre. */
export interface PitStop { lap: number; tyre?: Compound }
/** The most stops that can be queued at once (stops already made do not count). */
export const MAX_PIT_STOPS = 5;

export type RaceEventType = "cross" | "pitStart" | "pitEnd" | "dry" | "out" | "bump" | "spin" | "rain";
export interface RaceEvent {
  tick: number;
  id: string;
  type: RaceEventType;
  /** bump: how hard, where, and who else was in it */
  strength?: number;
  x?: number;
  y?: number;
  other?: string;
}

export interface Entrant {
  id: string;
  name: string;
  car: CarConfig;
  /** One line per lap. If the race has more laps than lines, the last line is driven again. */
  lines: Line[];
  isPlayer?: boolean;
  /** pit[lap] = drive into the pits at the end of that lap (older form of `pitPlan`). Bots decide for themselves. */
  pit?: boolean[];
  /** the stops the player has queued: at most MAX_PIT_STOPS still to come at any time (a long race can have more over its length) */
  pitPlan?: PitStop[];
  /** tyre on the grid; medium if left out */
  startTyre?: Compound;
  /** the fastest lap this entrant has set on this track; the grid is ordered by the quicker of that and its ideal lap */
  bestLap?: number;
  /** a grid place picked by the caller (0 = pole); entrants without one fill the rest in qualifying order, after those that have one */
  gridSlot?: number;
  /** a lap time to place this entrant on the grid by instead of its ideal lap; Infinity puts it at the back */
  gridTime?: number;
  /** instead of the grid, start this fraction of a lap (0 to 1) behind the line already rolling, as in practice and qualifying where the field is spread round the track */
  startFrac?: number;
  /** how a bot draws its lines, so that it can redraw them as the road changes */
  bot?: { seed: number; skill: number };
}

export interface RaceCar {
  entrant: Entrant;
  slot: number;
  /** sideways distance from the line this car's grid slot puts it at; it melts away as the car drives off */
  gridOff: number;
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
  /** the bay it stopped in (0 is nearest the line) from the moment it heads for the pits until it is let go */
  bay?: number;
  /** stopped in its bay, being serviced or waiting its turn to leave */
  boxed: boolean;
  /** service finished: waiting for the cars that came in before it to leave */
  ready: boolean;
  /** out of fuel and limping to the pits for an emergency refuel */
  limp: boolean;
  /** the stop it is heading for (or in) is an emergency one */
  emergency: boolean;
  /** emergency refuels so far */
  emergencies: number;
  /** retired: parked in the pits */
  out: boolean;
  outProg: number;
  needProf: boolean;
  prof: Profile;
  /** tank units per unit of distance */
  perUnit: number;
  wearMul: number;
  /** heading of the line under the car (h also includes the slew from a knock) */
  hp: number;
  /** how far the car has been knocked off its line, across it, and how fast that is changing */
  off: number;
  offV: number;
  /** slip angle, radians, toward the turn: the hull points further round than the path it is on (a car's is small: its tyres' slip angle; a boat's is a drift) */
  beta: number;
  /** beta at every tick */
  btrace: number[];
  radius: number;
  mass: number;
  anchored: boolean;
  compound: Compound;
  /** the tyre it will take at its next stop */
  nextTyre: Compound | null;
  /** 0 soft, 1 medium, 2 wet, at every tick */
  ctrace: number[];
  /** every compound it has run so far */
  used: Compound[];
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
  /** added for never pitting and for any mandatory compound it did not run */
  penalty: number;
  /** mandatory compounds this car never ran */
  missing: Compound[];
  /** retired (nothing retires a car any more, but the field stays for results that carry it) */
  dnf: boolean;
  pits: number;
  /** how many of those were emergency refuels */
  emergencies: number;
  lapTimes: number[];
}

export class Race {
  readonly cars: RaceCar[] = [];
  readonly events: RaceEvent[] = [];
  tick = 0;
  private profiles = new Map<string, Profile>();
  readonly lapLen: number;
  private biome: Biome;
  readonly weather: Weather;
  readonly field: WetField;
  /** seconds of racing it takes to go a lap at a typical pace, to turn race time into laps for the weather */
  private refLap: number;
  private maxTime: number;
  private rng: Rng;
  private rain = 0;
  /** the state of the road, once a second, for replay */
  readonly wetSnaps: Uint8Array[] = [];
  /** how hard it was raining, once a second */
  readonly rainTrace: number[] = [];
  private profGen = -1;
  /** the last tick a car was let go from its bay */
  private lastRelease = -1e9;
  /** the last tick two cars made a sound hitting each other, so one scrape is one bump */
  private bumped = new Map<string, number>();

  /** `entrants` are placed on the grid in qualifying order: fastest ideal lap first. */
  constructor(readonly track: Track, entrants: Entrant[], readonly laps: number, readonly rules: RaceRules = { realism: true }) {
    this.lapLen = trackLength(track);
    this.biome = biomeOf(track.biome);
    this.refLap = this.lapLen / 60;
    this.maxTime = Math.max(900, laps * 100 + 300);
    this.rng = new Rng((track.seed ^ 0x5b17) >>> 0);
    this.weather = rules.weather === false ? { showers: [] } : weatherFor(track.seed, laps, track.biome);
    this.field = new WetField(track);
    const ranked = entrants
      .map((e, i) => ({ e, i, ideal: e.gridTime ?? Math.min(this.profile(e, 0).ideal, e.bestLap ?? Infinity) }))
      .sort((a, b) => +(a.e.startFrac !== undefined) - +(b.e.startFrac !== undefined) || a.ideal - b.ideal || a.i - b.i);
    // callers can fix places on the grid: those entrants take their slot and the rest fill in around them in order
    if (ranked.some((r) => r.e.gridSlot !== undefined)) {
      const slots: (typeof ranked[number] | undefined)[] = [];
      const free: typeof ranked = [];
      for (const r of ranked) {
        let at = r.e.gridSlot === undefined ? -1 : Math.max(0, Math.round(r.e.gridSlot));
        while (at >= 0 && slots[at]) at++;
        if (at < 0) free.push(r); else slots[at] = r;
      }
      const out: typeof ranked = [];
      for (const r of slots) if (r) out.push(r); else if (free.length) out.push(free.shift()!);
      ranked.splice(0, ranked.length, ...out, ...free);
    }
    ranked.forEach(({ e }, slot) => {
      const p0 = this.profile(e, 0);
      // two columns, staggered: the pole car on the line, its neighbour half a row back on the other side, and so on back
      let back = GRID_GAP * (slot >> 1) + (slot & 1) * (GRID_GAP / 2);
      const side: 1 | -1 = slot & 1 ? -1 : 1;
      // on a bend the columns bunch up: slide back until this car is clear of everybody already on the grid
      const spot = (b: number) => {
        const s0 = slot === 0 ? 0 : p0.length - b;
        const off = this.gridOffset(p0, s0, side);
        const h = Math.atan2(sampleAt(p0, p0.y, s0 + 1) - sampleAt(p0, p0.y, s0 - 1), sampleAt(p0, p0.x, s0 + 1) - sampleAt(p0, p0.x, s0 - 1));
        return { s0, off, x: sampleAt(p0, p0.x, s0) - Math.sin(h) * off, y: sampleAt(p0, p0.y, s0) + Math.cos(h) * off };
      };
      const spread = e.startFrac !== undefined && slot > 0;
      for (let i = 0; slot > 0 && !spread && i < 60; i++) {
        const q = spot(back);
        if (this.cars.every((o) => Math.hypot(q.x - o.x, q.y - o.y) > SAFE_GAP + 2)) break;
        back += 2;
      }
      const at = spread ? { s0: p0.length * (1 - Math.min(0.98, Math.max(0.02, e.startFrac!))), off: 0 } : spot(back);
      const sNew = at.s0;
      const c: RaceCar = {
        entrant: e, slot, lap: slot === 0 ? 0 : -1,
        s: sNew, gridOff: at.off, v: spread ? 40 : 0, x: 0, y: 0, h: 0,
        ghost: false, stuck: 0, ghostFor: 0, powered: false, freeUntil: 0, lapStart: slot === 0 ? [0] : [], finishTime: null,
        trace: [], prog: [], vtrace: [], gtrace: [], ftrace: [], ttrace: [], ptrace: [],
        fuel: TANK, tyre: 1, pits: 0, pitIn: false, pitOut: false, pitDone: false, dwell: 0, boxed: false, ready: false, limp: false, emergency: false, emergencies: 0, out: false, outProg: 0,
        needProf: false, prof: p0, perUnit: fuelPerLap(e.car, laps) / this.lapLen, wearMul: (0.8 + 0.04 * e.car.grip) * vehicleOf(e.car.type).wear,
        compound: e.startTyre ?? (slot % 3 === 0 && !e.isPlayer ? "soft" : "medium"), nextTyre: null, ctrace: [], used: [],
        hp: 0, off: 0, offV: 0, beta: 0, btrace: [], radius: (vehicleOf(e.car.type).length + vehicleOf(e.car.type).width) / 4, mass: vehicleOf(e.car.type).mass, anchored: false,
      };
      c.used.push(c.compound);
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

  private build(e: Entrant, lap: number, pitIn: boolean, pitOut: boolean, grip: number, accel: number, tyre?: Compound): Profile {
    // the surface scales what the car can do
    const veh = vehicleOf(e.car.type);
    grip *= terrainMul(this.biome.grip, veh.terrain); accel *= terrainMul(this.biome.accel, veh.terrain);
    if (veh.domain === "water") grip *= 1 + DRIFT_ALLOW * veh.slip;
    // the state of the road changes, so a path built for one moment is only good for a little while
    const gen = Math.floor(this.tick / 600);
    if (gen !== this.profGen) { this.profiles.clear(); this.profGen = gen; }
    let idx = Math.min(Math.max(lap, 0), e.lines.length - 1);
    while (idx > 0 && !e.lines[idx]) idx--; // laps with no line of their own drive the last one that was set
    const k = `${e.id}:${idx}:${+pitIn}${+pitOut}:${Math.round(grip * 200)}:${Math.round(accel * 200)}:${tyre ?? "-"}`;
    let p = this.profiles.get(k);
    if (!p) {
      const field = this.field;
      p = buildProfile(this.track, e.lines[idx]!, e.car, { pitIn, pitOut, grip, accel, brake: terrainMul(this.biome.brake, veh.terrain), gripAt: tyre ? (x, y) => field.gripAt(tyre, x, y) : undefined });
      this.profiles.set(k, p);
    }
    return p;
  }

  /**
   * Bots look at the road and draw a fresh line for the laps `from` to `from + count - 1`, leaning toward the grip their
   * tyre wants: the dry line on slicks, the quiet wet line on wets. The player draws their own.
   */
  replanBots(from: number, count: number): void {
    for (const c of this.cars) {
      const e = c.entrant;
      if (!e.bot || e.isPlayer || !this.alive(c)) continue;
      const line = botLine(this.track, e.bot.seed + from * 7919, e.bot.skill, { compound: c.compound, field: this.field });
      for (let k = 0; k < count; k++) e.lines[from + k] = line;
      this.forget(e.id);
      c.needProf = true;
    }
  }

  /** Call after setting a new line on an entrant so that later laps use it. */
  forget(id: string): void {
    for (const k of [...this.profiles.keys()]) if (k.startsWith(`${id}:`)) this.profiles.delete(k);
  }

  private pairKey(a: RaceCar, b: RaceCar): string { return a.slot < b.slot ? `${a.slot}|${b.slot}` : `${b.slot}|${a.slot}`; }

  private fuelPerLapOf(c: RaceCar): number { return c.perUnit * this.lapLen; }

  /** How wet the road looks along this car's line, 0 to 1. */
  private lineWet(c: RaceCar): number {
    const p = c.prof, pts: { x: number; y: number }[] = [];
    for (let i = 0; i < p.n; i += 12) pts.push({ x: p.x[i]!, y: p.y[i]! });
    return this.field.meanWet(pts);
  }

  /** Whether this car drives into the pits at the end of the lap. The player queues stops in advance; bots work it out. */
  private decidePit(c: RaceCar, lap: number): boolean {
    if (!this.rules.realism) return false;
    if (c.limp) return true;
    if (lap >= this.laps - 1) return false;
    c.nextTyre = null;
    if (c.entrant.isPlayer || c.entrant.pit || c.entrant.pitPlan) {
      const plan = c.entrant.pitPlan?.find((p) => p.lap === lap);
      if (plan) { c.nextTyre = plan.tyre ?? null; return true; }
      return !!c.entrant.pit?.[lap];
    }
    const perLap = this.fuelPerLapOf(c);
    const left = this.laps - lap;
    const atLine = c.fuel - perLap * 1.05;
    if (atLine < 0) return false; // will not make it round: too late
    // read the road: the wrong tyre for it is worth a stop (if there are stops to spare)
    const wetness = this.rules.weather === false ? 0 : this.lineWet(c);
    const ideal: Compound = wetness > 0.45 ? "wet" : left <= 4 ? "soft" : "medium";
    const wrong = (c.compound === "wet" && wetness < 0.25) || (c.compound !== "wet" && wetness > 0.55);
    if (wrong && c.pits < MAX_PIT_STOPS - 1 && left >= 2) { c.nextTyre = ideal; return true; }
    // only stop if the tank cannot get to the flag. Then go when it could not take another lap, or a little before:
    // slots take turns, so the pit lane is not one long queue
    if (c.fuel < perLap * 1.05 * left && atLine < perLap * (1.05 + (c.slot % 3) * 0.55)) { c.nextTyre = ideal === "soft" ? "medium" : ideal; return true; }
    if (c.tyre < 0.45 && left >= 3) { c.nextTyre = ideal; return true; }
    return false;
  }

  /** Set the path for the lap that is starting. Called again a tick later, in case the player has since changed their line. */
  private startLap(c: RaceCar, refresh = false): void {
    const lap = Math.max(c.lap, 0);
    if (!refresh) { c.pitOut = c.pitIn; c.pitDone = false; c.dwell = 0; c.bay = undefined; c.boxed = false; c.ready = false; }
    c.pitIn = this.decidePit(c, lap);
    const real = this.rules.realism;
    c.prof = this.build(c.entrant, lap, c.pitIn, c.pitOut, real ? 1 - TYRE_GRIP_LOSS * (1 - c.tyre) : 1, real ? 1 - FUEL_MASS_ACCEL * (c.fuel / TANK) : 1, real ? c.compound : undefined);
  }

  /** Sideways shift from a car's own line that puts it in its grid column: `side` is 1 for one column, -1 for the other. */
  private gridOffset(p: Profile, sAt: number, side: 1 | -1): number {
    const lx = sampleAt(p, p.x, sAt), ly = sampleAt(p, p.y, sAt);
    const h = Math.atan2(sampleAt(p, p.y, sAt + 1) - sampleAt(p, p.y, sAt - 1), sampleAt(p, p.x, sAt + 1) - sampleAt(p, p.x, sAt - 1));
    let best = Infinity, cx = lx, cy = ly, tx = Math.cos(h), ty = Math.sin(h);
    for (const seg of nearbySegments(this.track, { x: lx, y: ly })) {
      for (let i = 0; i < seg.center.length; i++) {
        const q = seg.center[i]!, d = (q.x - lx) ** 2 + (q.y - ly) ** 2;
        if (d >= best) continue;
        const a = seg.center[Math.max(0, i - 1)]!, b = seg.center[Math.min(seg.center.length - 1, i + 1)]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        best = d; cx = q.x; cy = q.y; tx = (b.x - a.x) / len; ty = (b.y - a.y) / len;
      }
    }
    // a point GRID_SIDE to one side of the middle of the road, and how far that is from the line, across the way the car faces
    const px = cx - ty * side * GRID_SIDE, py = cy + tx * side * GRID_SIDE;
    return (px - lx) * -Math.sin(h) + (py - ly) * Math.cos(h);
  }

  private place(c: RaceCar): void {
    const p = c.prof;
    const bx = sampleAt(p, p.x, c.s), by = sampleAt(p, p.y, c.s);
    const x1 = sampleAt(p, p.x, c.s + 1), y1 = sampleAt(p, p.y, c.s + 1);
    const x0 = sampleAt(p, p.x, c.s - 1), y0 = sampleAt(p, p.y, c.s - 1);
    // at the very end of an open lap the last samples can coincide: keep the heading we had
    if (Math.hypot(x1 - x0, y1 - y0) > 0.05) c.hp = Math.atan2(y1 - y0, x1 - x0);
    // a car that has been knocked sideways sits off its line and points a little along where it is going
    const lat = c.off + c.gridOff;
    c.x = bx - Math.sin(c.hp) * lat;
    c.y = by + Math.cos(c.hp) * lat;
    c.h = c.hp + Math.max(-0.6, Math.min(0.6, Math.atan2(c.offV, Math.max(c.v, 15)))) * 0.7 + c.beta;
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
      c.prog.push(this.progress(c));
      c.vtrace.push(Math.round(c.v * 10) / 10);
      c.gtrace.push(c.ghost ? 1 : 0);
      c.ftrace.push(Math.round(c.fuel * 10) / 10);
      c.ttrace.push(Math.round(c.tyre * 1000) / 1000);
      c.ctrace.push(c.compound === "soft" ? 0 : c.compound === "medium" ? 1 : 2);
      c.btrace.push(Math.round(c.beta * 1000) / 1000);
      c.ptrace.push(c.out ? 3 : c.dwell > 0 ? 2 : c.prof.lane[indexAt(c.prof, c.s)] ? 1 : 0);
    }
  }

  /** Progress used for ordering: whole laps first, then distance in the lap. */
  progress(c: RaceCar): number {
    return c.lap * 1e5 + this.pos(c);
  }

  /** Distance round the lap for ranking: along its own line, or, where the track has shortcuts, round the ring whichever way it went. */
  private pos(c: RaceCar): number {
    return c.prof.canon ? sampleAt(c.prof, c.prof.canon, c.s) : c.s;
  }

  /** Who has right of way: further round the race first, the better grid slot on a tie. */
  private prio(c: RaceCar): number { return c.lap * 1e5 + this.pos(c) - c.slot * 1e-3; }

  /**
   * The speed this car may carry given the traffic on its path. Cars ahead and going the same way are followed at
   * a safe gap. Cars crossing or merging are given way to if they are further round the race.
   */
  /** In the pit area: heading for a bay, in it, or waiting to leave. Nobody here holds anybody else up on the way in. */
  private inPit(c: RaceCar): boolean { return c.bay !== undefined && c.pitIn && !c.pitDone && !c.out && c.finishTime === null; }

  /** The bay a car coming in takes: the one behind the last car already in. */
  private freeBay(c: RaceCar): number {
    let last = -1;
    for (const o of this.cars) if (o !== c && this.inPit(o)) last = Math.max(last, o.bay!);
    return Math.min(PIT_BAYS - 1, last + 1);
  }

  /** Let the car that has been in longest go, once its service is done, if the lane is clear of the last one. */
  private releaseCars(): void {
    if (this.tick - this.lastRelease < RELEASE_TICKS) return;
    let head: RaceCar | undefined;
    for (const o of this.cars) if (this.inPit(o) && (!head || o.bay! < head.bay!)) head = o;
    if (head && head.boxed && head.ready) {
      head.boxed = false; head.ready = false;
      this.lastRelease = this.tick;
      this.finishStop(head);
    }
  }

  private trafficLimit(c: RaceCar, p: Profile, brake: number, racing: RaceCar[]): number {
    let limit = Infinity;
    if (this.inPit(c)) return limit; // free to come in
    const b = brake * 0.6;
    const reach = (c.v * c.v) / (2 * b) + SAFE_GAP + 20;
    const mine = this.prio(c);
    for (const o of racing) {
      if (o === c || o.ghost || o.freeUntil > this.tick || this.inPit(o)) continue;
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
      // (at the very end of an open lap the path ahead has run out, so use the car's own heading)
      const cos = Math.cos(o.h - (Math.hypot(ax, ay) > 1e-6 ? Math.atan2(ay, ax) : c.h));
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

  /**
   * A car that has been knocked off its line tries to get back: a spring pulls it in. And one carrying more speed
   * than the bend allows (because it was shoved, or tipped over its braking point) cannot hold the line: it runs wide.
   */
  private settle(c: RaceCar): void {
    const p = c.prof, i = indexAt(p, c.s);
    const lim = p.vLim[i]!, kap = p.kap[i]!;
    // over the limit for this bend: the grip it lacks is how hard it is pulled outward
    const excess = kap > 0.003 && c.v > lim * 1.12 + 3 ? (c.v / lim) ** 2 - 1 : 0;
    // the line-seeking spring does little while the car is sliding, and takes over again once it has grip
    const veh = vehicleOf(c.entrant.car.type), water = veh.domain === "water";
    const spring = excess > 0 ? 0.12 : 1;
    c.off += c.offV * TICK;
    c.offV += (-(water ? WATER_K : OFF_K) * spring * c.off - (water ? WATER_C : OFF_C) * c.offV) * TICK;
    this.drift(c, veh, i);
    if (excess > 0) {
      // which way is the bend turning? the car goes the other way
      const h0 = Math.atan2(sampleAt(p, p.y, c.s) - sampleAt(p, p.y, c.s - 3), sampleAt(p, p.x, c.s) - sampleAt(p, p.x, c.s - 3));
      const h1 = Math.atan2(sampleAt(p, p.y, c.s + 3) - sampleAt(p, p.y, c.s), sampleAt(p, p.x, c.s + 3) - sampleAt(p, p.x, c.s));
      let dh = h1 - h0;
      if (dh > Math.PI) dh -= 2 * Math.PI; else if (dh < -Math.PI) dh += 2 * Math.PI;
      c.offV += -Math.sign(dh) * excess * this.stats(c).aLat * 0.8 * TICK;
      c.v = Math.max(0, c.v - 20 * Math.min(excess, 1) * TICK); // scrubbing speed off
      if (this.rules.realism) c.tyre = Math.max(0, c.tyre - 0.0006 * excess);
    }
    // (there are no tyres on the water to let go)
    // on slicks in the wet the grip can simply go: a low chance, in a bend, of letting go altogether
    if (!water && this.rules.realism && this.rules.weather !== false && kap > 0.008 && c.v > 25) {
      const g = tyreGrip(c.compound, this.field.wetAt(c.x, c.y), this.field.useAt(c.x, c.y));
      const rate = spinRate(g);
      if (rate > 0 && this.rng.next() < rate * TICK) {
        c.offV += (this.rng.next() < 0.5 ? -1 : 1) * 26;
        c.v *= 0.35;
        if (this.rules.realism) c.tyre = Math.max(0, c.tyre - 0.012);
        this.events.push({ tick: this.tick, id: c.entrant.id, type: "spin", x: c.x, y: c.y });
      }
    }
    // the road is as wide as it is here: a wide piece gives room to run wide, a bottleneck none
    const room = p.half[i]! / ROAD_HALF, offMax = OFF_MAX * room, grass = Math.max(3, 10 + (p.half[i]! - ROAD_HALF));
    c.off = Math.max(-offMax, Math.min(offMax, c.off));
    // well off the road it is on the grass, which grips little
    if (Math.abs(c.off) > grass) c.v *= 1 - 0.6 * TICK * ((Math.abs(c.off) - grass) / Math.max(4, offMax - grass));
  }

  /** The grip the tyres have right now against fresh mediums on a dry road, 0 to 1: they wear, and slicks on a wet road or wets on a dry one grip less. 1 when tyres are not in play. */
  gripLevel(c: RaceCar): number {
    if (!this.rules.realism) return 1;
    const wear = 1 - TYRE_GRIP_LOSS * (1 - c.tyre);
    const cell = this.field.cellAt(c.x, c.y);
    const road = cell < 0 ? tyreGrip(c.compound, 0, 0) : tyreGrip(c.compound, this.field.wet[cell]!, this.field.use[cell]!);
    return Math.min(1, wear * road);
  }

  /**
   * A vehicle's slip angle (a hull's drift, or the angle a car's tyres work at). How hard the corner asks of it, as a multiple of what the hull could hold, sets the angle it swings to;
   * it follows quickly going in and recovers slowly coming out. The slide carries it outward and costs speed.
   */
  private drift(c: RaceCar, veh: Vehicle, i: number): void {
    const slip = veh.slip, water = veh.domain === "water";
    const p = c.prof, n = p.n;
    let dh = p.h[(i + 2) % n]! - p.h[(i + n - 2) % n]!;
    if (dh > Math.PI) dh -= 2 * Math.PI; else if (dh < -Math.PI) dh += 2 * Math.PI;
    const dir = Math.sign(dh);
    // how hard the bend asks, against the grip the tyres have now (worn, or wrong for the road, the path is slower but the tyres are nearer their limit)
    const grip = this.gripLevel(c);
    const demand = (p.kap[i]! * c.v * c.v) / Math.max(this.stats(c).aLat * grip, 1);
    // from nothing at 60% of the grip to the vehicle's own peak slip angle at all of it, and a wider angle on poor tyres
    const widen = Math.min(SLIP_WIDEN_MAX, 1 + SLIP_PER_LOST_GRIP * (1 - grip));
    const want = dir * ((veh.slipDeg * Math.PI) / 180) * widen * Math.min(1, Math.max(0, (demand - 0.6) / 0.4));
    const recover = 2 + 2.5 * (1 - slip);
    const rate = Math.abs(want) > Math.abs(c.beta) && Math.sign(want) === Math.sign(c.beta || want) ? BETA_RISE : recover;
    c.beta += (want - c.beta) * Math.min(1, rate * TICK);
    if (Math.abs(c.beta) < 1e-4) c.beta = 0;
    // sliding outward (away from the turn), and the water dragging the speed off
    const k = water ? 1 : LAND_SLIDE;
    c.offV += -Math.sign(c.beta) * k * SLIDE_GAIN * c.v * Math.sin(Math.abs(c.beta)) * TICK;
    c.v = Math.max(0, c.v - k * SLIDE_DRAG * Math.sin(c.beta) ** 2 * c.v * TICK);
  }

  /** Cars that touch push each other about (see impact.ts). */
  private collide(racing: RaceCar[]): void {
    const touched = new Set<RaceCar>();
    for (let i = 0; i < racing.length; i++) {
      for (let j = i + 1; j < racing.length; j++) {
        const A = racing[i]!, B = racing[j]!;
        if (A.ghost || B.ghost || A.finishTime !== null || B.finishTime !== null || this.inPit(A) || this.inPit(B)) continue;
        A.anchored = A.dwell > 0; B.anchored = B.dwell > 0;
        const force = impact(A, B);
        if (force < 0) continue;
        touched.add(A); touched.add(B);
        if (force >= BUMP_MIN) {
          const k = this.pairKey(A, B);
          if (this.tick - (this.bumped.get(k) ?? -999) > 24) this.events.push({ tick: this.tick, id: A.entrant.id, type: "bump", strength: force, x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, other: B.entrant.id });
          this.bumped.set(k, this.tick);
          if (this.rules.realism) { const w = 0.0004 * force; A.tyre = Math.max(0, A.tyre - w); B.tyre = Math.max(0, B.tyre - w); }
        }
      }
    }
    for (const c of touched) {
      const offMax = OFF_MAX * c.prof.half[indexAt(c.prof, c.s)]! / ROAD_HALF;
      c.off = Math.max(-offMax, Math.min(offMax, c.off));
      if (c.dwell > 0) c.v = 0;
      this.place(c);
    }
  }

  /**
   * How much of a slipstream this car is in, 0 to 1: tucked in close behind another car, in its lane and going its way.
   * It is worth more the closer the gap and, because drag grows with speed, the faster the car following.
   */
  draft(c: RaceCar, racing: RaceCar[]): number {
    if (this.rules.draft === false || c.ghost || c.dwell > 0 || c.v < 20 || c.prof.lane[indexAt(c.prof, c.s)]) return 0;
    const hx = Math.cos(c.h), hy = Math.sin(c.h);
    let near = 0;
    for (const o of racing) {
      if (o === c || o.ghost || o.dwell > 0) continue;
      const dx = o.x - c.x, dy = o.y - c.y, along = dx * hx + dy * hy;
      if (along < 3 || along > DRAFT_RANGE) continue;
      if (Math.abs(-dx * hy + dy * hx) > 6.5 || Math.cos(o.h - c.h) < 0.9) continue;
      near = Math.max(near, 1 - (along - 3) / (DRAFT_RANGE - 3));
    }
    const speed = Math.min(1, c.v / 110);
    return near * speed * speed;
  }

  /** The car's stats on this surface. */
  private stats(c: RaceCar) {
    const st = carStats(c.entrant.car);
    const t = vehicleOf(c.entrant.car.type).terrain;
    st.brake *= terrainMul(this.biome.brake, t); st.accel *= terrainMul(this.biome.accel, t); st.aLat *= terrainMul(this.biome.grip, t);
    return st;
  }

  private emit(id: string, type: RaceEventType): void { this.events.push({ tick: this.tick, id, type }); }

  /** Tyres and fuel are topped up and the car is let go. */
  private finishStop(c: RaceCar): void {
    c.fuel = TANK;
    if (c.emergency) { c.emergencies++; c.emergency = false; } // fuel only: the tyres stay as they are
    else { c.tyre = 1; if (c.nextTyre) c.compound = c.nextTyre; if (!c.used.includes(c.compound)) c.used.push(c.compound); }
    c.nextTyre = null;
    c.limp = false;
    c.pits++;
    c.pitDone = true;
    this.emit(c.entrant.id, "pitEnd");
  }

  /** The rain, and the wet and dry patches of road, move on a tenth of a second at a time. */
  private weatherStep(racing: RaceCar[]): void {
    if (this.tick % 6 === 0) {
      const rain = this.rules.weather === false ? 0 : rainAt(this.weather, this.time / this.refLap);
      if ((rain > 0.05) !== (this.rain > 0.05)) this.events.push({ tick: this.tick, id: "", type: "rain", strength: rain });
      this.rain = rain;
      this.field.update(0.1, rain, racing.filter((c) => !c.ghost && c.dwell === 0).map((c) => ({ x: c.x, y: c.y })));
    }
    if (this.tick % 60 === 0) { this.wetSnaps.push(this.field.snapshot()); this.rainTrace.push(Math.round(this.rain * 100) / 100); }
  }

  step(): void {
    const racing = this.cars.filter(this.alive);
    this.weatherStep(racing);
    for (const c of racing) if (c.needProf) { c.needProf = false; this.startLap(c, true); }
    const next = new Map<RaceCar, { v: number; s: number }>();
    const arrived: RaceCar[] = [];
    for (const c of racing) {
      const p = c.prof;
      const st = this.stats(c);
      const i = indexAt(p, c.s);
      let target = sampleAt(p, p.vLim, c.s);
      // in a slipstream: a little more top speed (only where the car is at its top speed, not in a bend) and quicker acceleration
      const dr = this.draft(c, racing);
      if (dr > 0 && target >= st.vTop * 0.97) target *= 1 + DRAFT_TOP * dr;
      if (c.limp) target = Math.min(target, LIMP_SPEED);
      const stopping = c.pitIn && !c.pitDone && p.pitS !== undefined;
      if (stopping && c.bay === undefined && p.pitS! - c.s <= BAY_PICK) c.bay = this.freeBay(c);
      const stopS = stopping ? p.pitS! - (c.bay ?? PIT_BAYS - 1) * PIT_BAY_GAP : 0;
      // brake to stop exactly in the bay
      if (stopping) target = c.boxed ? 0 : Math.min(target, Math.sqrt(2 * st.brake * 0.7 * Math.max(0, stopS - c.s)));
      if (!c.ghost && c.freeUntil <= this.tick) target = Math.min(target, this.trafficLimit(c, p, st.brake, racing));
      else if (c.ghost && !c.powered) {
        // lingering: get out from inside whoever is still there, by dropping back from a car ahead
        const hx = Math.cos(c.h), hy = Math.sin(c.h);
        for (const o of racing) {
          if (o === c || o.ghost || Math.hypot(o.x - c.x, o.y - c.y) >= SAFE_GAP + 2) continue;
          if ((o.x - c.x) * hx + (o.y - c.y) * hy > 0) target = Math.min(target, Math.max(0, o.v - 14));
        }
      }
      let v = c.v > target ? Math.max(target, c.v - st.brake * TICK) : Math.min(target, c.v + st.accel * p.accelMul[i]! * (1 + DRAFT_ACCEL * dr) * launchMul(c, st.vTop) * TICK);
      let s = c.s + v * TICK;
      if (stopping && !c.boxed && c.bay !== undefined && stopS - s < 0.5 && v < 5) { s = stopS; v = 0; arrived.push(c); }
      next.set(c, { v, s });
    }
    for (const c of racing) {
      const n = next.get(c)!;
      const p = c.prof;
      if (!c.boxed && c.dwell === 0 && n.v < 1 && c.v < 1 && sampleAt(p, p.vLim, c.s) > 5) {
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
      if (c.gridOff !== 0 && moved > 0) c.gridOff = Math.abs(c.gridOff) < 0.01 ? 0 : c.gridOff * Math.exp(-moved / 30);
      if (this.rules.realism && moved > 0) {
        const p = c.prof;
        c.fuel = Math.max(0, c.fuel - moved * c.perUnit * this.biome.fuel * clampWear(this.rules.wearMult?.fuel));
        const st = this.stats(c);
        const load = Math.min(1.2, (p.kap[indexAt(p, c.s)]! * c.v * c.v) / st.aLat);
        c.tyre = Math.max(0, c.tyre - (moved / this.lapLen) * TYRE_WEAR_PER_LAP * raceScale(this.laps).wearScale * c.wearMul * this.biome.wear * clampWear(this.rules.wearMult?.tyre) * wearRate(c.compound, this.field.wetAt(c.x, c.y)) * (0.4 + 1.2 * load * load) / 0.6);
      }
      this.settle(c);
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
    this.collide(racing);
    for (const c of this.cars) if (c.finishTime !== null && !c.out) this.coast(c);
    // out of fuel: limp to the pits for an emergency refuel, then carry on
    for (const c of racing) {
      if (!this.rules.realism || c.limp || c.finishTime !== null || c.fuel > 0) continue;
      c.limp = true;
      this.emit(c.entrant.id, "dry");
      if (!c.pitIn) {
        c.emergency = true;
        const real = 1 - TYRE_GRIP_LOSS * (1 - c.tyre);
        const np = this.build(c.entrant, Math.max(c.lap, 0), true, c.pitOut, real, 1, c.compound);
        // too late to turn in this lap? it goes round once more at limp speed and turns in next time
        if (np.pitFromS !== undefined && c.s < np.pitFromS - 3) { c.prof = np; c.pitIn = true; c.pitDone = false; }
      }
    }
    for (const c of arrived) {
      c.boxed = true;
      c.dwell = c.emergency ? EMERGENCY_TICKS : STOP_TICKS;
      this.emit(c.entrant.id, "pitStart");
    }
    for (const c of racing) if (c.dwell > 0 && !arrived.includes(c) && --c.dwell === 0) c.ready = true;
    this.releaseCars();
    this.record();
  }

  /** Run until the given car has started lap `lap`+1 (i.e. finished `lap`), or the race is over. */
  runLap(carId: string, lap: number): void {
    const car = this.cars.find((c) => c.entrant.id === carId)!;
    while (this.alive(car) && car.lap <= lap && this.time < this.maxTime) this.step();
  }

  /**
   * Run until the given car pulls into its pit box and the stop begins, which is the only time the player may change
   * their line. Returns true if it stopped there, false if the car finished (or was out) without another stop.
   */
  runToStop(carId: string): boolean {
    const car = this.cars.find((c) => c.entrant.id === carId)!;
    let seen = this.events.length;
    while (this.alive(car) && this.time < this.maxTime) {
      this.step();
      for (let i = seen; i < this.events.length; i++) { const e = this.events[i]!; if (e.id === carId && e.type === "pitStart") return true; }
      seen = this.events.length;
    }
    return false;
  }

  runToEnd(): void {
    while (!this.over) this.step();
  }

  /** Over once every car has finished (or retired) and the last of them has had a few seconds to coast on. */
  get over(): boolean {
    if (this.time >= this.maxTime) return true;
    if (this.cars.some(this.alive)) return false;
    const last = Math.max(-Infinity, ...this.cars.map((c) => c.finishTime ?? -Infinity));
    return this.time >= last + COAST_SECONDS;
  }

  /** A car that has taken the flag keeps going at half speed, on its line, and out of everyone's way: it is a ghost to them. */
  private coast(c: RaceCar): void {
    const p = c.prof, st = this.stats(c);
    const target = COAST_FRACTION * sampleAt(p, p.vLim, c.s);
    c.v = c.v > target ? Math.max(target, c.v - st.brake * 0.3 * TICK) : Math.min(target, c.v + st.accel * TICK);
    c.s += c.v * TICK;
    if (c.s >= p.length) { if (p.open) { c.s = p.length; c.v = 0; } else c.s -= p.length; }
    this.place(c);
    c.ghost = true;
  }

  private missingOf(c: RaceCar): Compound[] { return this.rules.realism && c.finishTime !== null ? (this.rules.mandatory ?? []).filter((m) => !c.used.includes(m)) : []; }
  private penaltyOf(c: RaceCar): number { return this.rules.realism && c.finishTime !== null ? (c.pits === 0 ? PIT_PENALTY : 0) + this.missingOf(c).length * PIT_PENALTY : 0; }

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
        finishTime: adj(c), rawTime: c.finishTime, penalty: this.penaltyOf(c), missing: this.missingOf(c), dnf: c.out, pits: c.pits, emergencies: c.emergencies, lapTimes,
      };
    });
  }

  /** A fingerprint of the race, for determinism tests. */
  hash(): string {
    let h = 0x811c9dc5;
    const mix = (n: number) => { h ^= Math.round(n * 100) | 0; h = Math.imul(h, 0x01000193) >>> 0; };
    mix(this.tick);
    for (const c of this.cars) { mix(c.s); mix(c.v); mix(c.lap); mix(c.finishTime ?? -1); mix(c.fuel); mix(c.tyre * 100); mix(c.beta); }
    return h.toString(16);
  }
}
