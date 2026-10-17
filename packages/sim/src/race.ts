import { carStats, type CarConfig } from "./car.ts";
import { biomeOf, terrainMul, type Biome } from "./biomes.ts";
import { vehicleOf, type Vehicle } from "./vehicles.ts";
import { impact, lastImpact } from "./impact.ts";
import { botLine } from "./bots.ts";
import { Rng } from "./rng.ts";
import { COMPOUNDS, TEMP_START, spinRate, tempGrip, tyreGrip, wearRate, type Compound } from "./tyres.ts";
import { TACTIC_INFO, type Tactic } from "./tactics.ts";
import { cornerCap } from "./quirks.ts";
import { rainAt, raceDuration, weatherFor, type Weather } from "./weather.ts";
import { WetField } from "./trackwet.ts";
import type { Line } from "./line.ts";
import { PIT_BAYS, PIT_BAY_GAP, pitPenalty, pitStopTime } from "./pit.ts";
import { buildProfile, indexAt, sampleAt, type Profile } from "./profile.ts";
import { levelsOf, nearbySegments, trackLength, CELL, CAR_R, ROAD_HALF, type Track } from "./track.ts";

export const TICK = 1 / 60;
/** Distance between rows of the starting grid, units; the second car of a row sits half a row back. */
export const GRID_GAP = 16;
/** How far either side of the middle of the road the two columns of the grid sit. */
export const GRID_SIDE = 8;
/** The four columns of a grid of more than 32: how far to the side of the middle of the road each sits, and how far back it starts within its row. */
const GRID_COLS4: [number, number][] = [[16, 0], [-16, 8], [5.4, 8], [-5.4, 0]];
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
/** Closing speed (units/s) below which a bump never spins a car. */
const SPIN_CLOSING = 28;
/** Recovery: how hard the tyres pull the travel toward the heading, how hard the driver steers, how fast yaw follows, the turning circle in car lengths, and the sideways speed that starts it. */
const REC_TYRE = 5;
const REC_STEER = 3;
const REC_YAW = 6;
const REC_TURN = 1.4;
/** The turning circle in car lengths at a crawl, and the speed (units/s) by which it has grown to REC_TURN. */
const REC_TURN_SLOW = 0.22;
const REC_TURN_SPEED = 40;
/** How far the rear axle is behind the middle of the car, in car lengths: what a car turns about. */
const REC_HINGE = 0.33;
/** A recovering car's speed cap with its nose a radian or more off the road, and what it gains as the nose comes round, units/s. */
const REC_CRAWL = 8;
const REC_CRAWL_GAIN = 50;
const REC_KICK = 6;
/** After backing up, a car that points the wrong way drives forward this long, swinging its nose round, before it may reverse again. */
const TURN_ROUND_S = 3;
/** Reversing speed, units/s. */
const REV_SPEED = 14;
const wrap = (a: number): number => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
/** Hits gentler than this make no sound. */
const BUMP_MIN = 6;
/** Sitting close behind another car cuts the air: how far back the slipstream reaches, and what it is worth at best. */
/** A follower keeps this many seconds of its own speed as extra gap, on top of the bumper space, so a queue ahead braking does not surprise it. */
const FOLLOW_HEADWAY = 0.1;
export const DRAFT_RANGE = 42;
export const DRAFT_TOP = 0.08;
export const DRAFT_ACCEL = 0.3;
/** The other side of a slipstream: in a bend, the air a car ahead has churned costs the car behind up to this share of its cornering speed, and heats its tyres. */
export const DIRTY_AIR = 0.05;
export const DIRTY_HEAT = 0.25;
/** Tyre temperature (0 to 1, see `tempGrip`): it settles toward a target set by the road, how hard the tyre is worked and the air behind another car, over about this many seconds. */
export const TEMP_TAU = 8;
export const TEMP_WORK = 0.5;
/** Cooler air and rain take the road's baseline temperature down. */
const AMBIENT: Record<string, number> = { grass: 0.4, desert: 0.62, snow: 0.18, city: 0.46, moon: 0.1, water: 0.35 };
/** A car counts as being on my path when its centre is this close to it. */
const LATERAL = 8;
/** The size of car the gaps above were chosen for (a rally car, about). */
const REF_LEN = 8;
const REF_WID = 3.4;
const PLAN_STEP = 3;
const PATH_MAX = 400;
const NEAR_CELL = 80;
/** No two cars further apart than this can be touching. */
const COLLIDE_REACH = 20;
const GHOST_LINGER = 1200;
/** How close two cars are predicted to be before the one with less right of way backs off. */
const PREDICT_GAP = 10;
/** A car that has been stuck creeps forward keeping this much bumper space, and this much sideways room, to the cars round it (see `trafficLimit`). */
const CREEP_GAP = 1.5;
const CREEP_SIDE = 0.7;
/**
 * A car that has sat still this long, wanting to go, stops giving way for a while (it still keeps its distance to whatever is ahead of it),
 * so a ring of cars each waiting on the next cannot freeze a junction.
 */
const DEADLOCK_TICKS = 120;
/** How long it gives way for, once it has been let off. */
const DEADLOCK_FREE_TICKS = 150;
/**
 * Stuck still for this long, a car creeps for PUSH_TICKS: it keeps only the bumper space and sideways room the cars round it really take (see
 * CREEP_GAP), so it can edge up through a jam without ever touching anybody (nothing passes through anything), and a jam can never hold the race.
 */
const PUSH_AFTER_TICKS = 300;
const PUSH_TICKS = 150;
/** A car that has been stopped this long is an obstacle the others steer round rather than queue behind. */
const OBSTACLE_TICKS = 60;
/** Centre-to-centre clearance a car leaves when it steers round a stopped one, and how far ahead it starts. */
const DODGE_GAP = 11.5;
const DODGE_REACH = 110;
const DODGE_BLEND = 40;
/** A car does not drive into a crossing unless the road beyond it is clear this far, so nobody sits in the box blocking the cross traffic. */
const BOX_CLEAR = SAFE_GAP + 10;
/** A wrecked car with traffic coming up behind it pulls to the side of the road, and waits at most this long for the pack to pass. */
const PARK_MAX_TICKS = 300;
/** Cars this far behind, going at least this much faster, make a recovering car pull over. */
const PARK_WATCH = 130;
const PARK_CLOSING = 10;
/**
 * Fuel and tyres are used up by distance driven, not by laps: a long track costs more per lap than a short one. The numbers below are
 * in the lap of an ordinary track, LAP_UNITS long (the average of the 14 to 22 cells of a loop), so that is what "a lap" means in
 * their descriptions.
 */
export const LAP_UNITS = 1800;
/** Long races stretch the tank and the tyres, so that a handful of stops is enough for fifty laps: `distance` is the whole race, in units. */
export function raceScale(distance: number): { fuelRange: number; wearScale: number } {
  const stretch = Math.max(7 * LAP_UNITS, distance / 3.5);
  return { fuelRange: Math.max(11 * LAP_UNITS, distance / 3.5), wearScale: (7 * LAP_UNITS) / stretch };
}

/** Full tank. */
export const TANK = 100;
/** How far a full tank lasts a car with the standard stats, in units (11 ordinary laps). */
export const FUEL_RANGE = 11 * LAP_UNITS;
/** Tyre health lost per unit driven at the standard grip, 0 to 1: 0.076 an ordinary lap. */
export const TYRE_WEAR_PER_UNIT = 0.076 / LAP_UNITS;
/** Cornering grip lost when the tyres are completely worn. */
export const TYRE_GRIP_LOSS = 0.25;
/** Acceleration lost with a full tank. */
export const FUEL_MASS_ACCEL = 0.1;
/** Speed of a car that has run dry, as it heads for the pits, units/s. */
export const LIMP_SPEED = 30;
/** An emergency refuel is a slow splash of fuel by whoever is nearest: half as long again as a planned stop, no new tyres. */
const EMERGENCY_FACTOR = 1.5;
/** Cars leave the pit lane one at a time, first in first out, at least this long apart. */
const RELEASE_TICKS = 54;
/** After the flag a car carries on round its line at this fraction of the speed the road allows. */
const COAST_FRACTION = 0.5;
/** The race is over this long after the last car has taken the flag, so that car coasts too. */
const COAST_SECONDS = 5;
/** A car picks its bay this far (along its lap) before the box, so it can brake for it. */
const BAY_PICK = 120;

/** Fuel this car burns per unit driven, in tank units, in a race of `distance` units: the standard car uses TANK / FUEL_RANGE. */
export function fuelPerUnit(car: CarConfig, distance = 3 * LAP_UNITS): number {
  return (TANK / raceScale(distance).fuelRange) * ((0.85 + 0.025 * (car.accel + car.top)) / 1.15) * vehicleOf(car.type).fuel;
}

/** Fuel one lap of `lapLength` units costs this car in a race of `laps` laps, in tank units (for showing to a person: the sim works by distance). */
export function fuelPerLap(car: CarConfig, laps = 3, lapLength = LAP_UNITS): number {
  return fuelPerUnit(car, laps * lapLength) * lapLength;
}

export interface RaceRules {
  /** tyre wear, fuel, and the pit stop that goes with them */
  realism: boolean;
  /** rain and a track that wets and dries (default on) */
  weather?: boolean;
  /** slipstream behind another car (default on, in every mode) */
  draft?: boolean;
  /** rubber an earlier session of the weekend left on the road (see `Race.rubberOut`) */
  rubber?: Uint8Array;
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
export interface PitStop { lap: number; tyre?: Compound; /** how to drive the stint that follows (kept as it was if left out) */ tactic?: Tactic }
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
  /** how to drive the first stint; balanced if left out */
  startTactic?: Tactic;
  /** the fastest lap this entrant has set on this track; the grid is ordered by the quicker of that and its ideal lap */
  bestLap?: number;
  /** a grid place picked by the caller (0 = pole); entrants without one fill the rest in qualifying order, after those that have one */
  gridSlot?: number;
  /** a lap time to place this entrant on the grid by instead of its ideal lap; Infinity puts it at the back */
  gridTime?: number;
  /** instead of the grid, start this fraction of a lap (0 to 1) behind the line already rolling, as in practice and qualifying where the field is spread round the track */
  startFrac?: number;
  /** how a bot draws its lines, so that it can redraw them as the road changes */
  bot?: { seed: number; skill: number; /** the lane it keeps to in a big field: see `BotLineOpts.lane` */ lane?: number };
  /** drive at this fraction of the car's pace, 1 if left out: how a bot is made easier */
  pace?: number;
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
  /** the last traffic limit worked out for this car, and the tick it was worked out on */
  tlVal: number;
  tlAt: number;
  /** the wet-field bin under the car, remembered for the position it was worked out at */
  cellAtX: number;
  cellAtY: number;
  cellIdx: number;
  /** until this tick the car drives on without looking at the others (but stays solid): the last resort for a car that has been stuck for seconds */
  pushUntil: number;
  /** until this tick the car gives way to nobody (a failsafe against cars waiting on each other in a ring) */
  freeUntil: number;
  /** where the car is steering to across its line to get round a stopped car (0 is its line), and where it has got to */
  aim: number;
  /** where it is steering to across its line, as against where it has got to (`aim`) */
  aimWant: number;
  /** a recovering car: the side of the road it is pulling over to (0 not at all), how long it has waited there, and whether it has given up on that */
  park: number;
  parkT: number;
  noPark: boolean;
  /** traction at the last contact, for the impact */
  grip?: number;
  /**
   * Recovering from a hit or a spin: the car is a body with a heading (`psi`) and a direction of travel (`phi`), both measured from the line,
   * and a yaw rate. Its tyres pull the travel toward the heading as far as they grip, and it steers, at the turning circle, to get back.
   */
  rec: boolean;
  /** in reverse, to back out of a wall or turn round: the car travels the way opposite to its heading */
  back: boolean;
  psi: number;
  phi: number;
  yaw: number;
  backT: number;
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
  /** the level at every tick: positive on a bridge (which one), negative on the road under it, 0 anywhere else */
  ltrace: number[];
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
  /** the machine's real size (units), and the radius of the circle round the whole car: for a quick look at who could be touching */
  length: number;
  width: number;
  circ: number;
  mass: number;
  anchored: boolean;
  compound: Compound;
  /** the tyre it will take at its next stop */
  nextTyre: Compound | null;
  /** the tactic for the stint after the coming stop, if the plan sets one */
  nextTactic: Tactic | null;
  /** how the car is driving the stint it is on */
  tactic: Tactic;
  /** tyre temperature, 0 to 1 */
  temp: number;
  /** how much of a slipstream the car was in on the last tick (also the dirty air it is driving through in a bend) */
  wake: number;
  /** tyre temperature once a second of ticks, for the interface */
  tmtrace: number[];
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
    this.levels = levelsOf(track);
    this.hasCross = track.allSegments.some((x) => x.kind === "cross");
    this.lapLen = trackLength(track);
    this.biome = biomeOf(track.biome);
    this.maxTime = Math.max(900, laps * 100 + 300);
    this.rng = new Rng((track.seed ^ 0x5b17) >>> 0);
    this.weather = rules.weather === false ? { showers: [] } : weatherFor(track.seed, raceDuration(track, entrants[0]?.car.type ?? "rally", laps), track.biome);
    this.field = new WetField(track, rules.rubber);
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
    const gridCols = ranked.length > 32 ? 4 : 2;
    ranked.forEach(({ e: given }, slot) => {
      const e = this.laned(given, slot, gridCols);
      const p0 = this.profile(e, 0);
      // two columns, staggered: the pole car on the line, its neighbour half a row back on the other side, and so on back.
      // A field of more than 32 uses four, so the grid is not longer than the lap
      const col = slot % gridCols, row = Math.floor(slot / gridCols);
      const rowGap = Math.max(GRID_GAP, vehicleOf(e.car.type).length + 8);
      let back = rowGap * row + (gridCols === 2 ? (col & 1) * (rowGap / 2) : GRID_COLS4[col]![1]);
      const lateral = gridCols === 2 ? (col & 1 ? -GRID_SIDE : GRID_SIDE) : GRID_COLS4[col]![0];
      // on a bend the columns bunch up: slide back until this car is clear of everybody already on the grid
      const spot = (b: number) => {
        const s0 = slot === 0 ? 0 : p0.length - b;
        const off = this.gridOffset(p0, s0, lateral);
        const h = Math.atan2(sampleAt(p0, p0.y, s0 + 1) - sampleAt(p0, p0.y, s0 - 1), sampleAt(p0, p0.x, s0 + 1) - sampleAt(p0, p0.x, s0 - 1));
        return { s0, off, x: sampleAt(p0, p0.x, s0) - Math.sin(h) * off, y: sampleAt(p0, p0.y, s0) + Math.cos(h) * off };
      };
      const spread = e.startFrac !== undefined && slot > 0;
      for (let i = 0; slot > 0 && !spread && i < (gridCols === 4 ? 200 : 60); i++) {
        const q = spot(back);
        if (this.cars.every((o) => Math.hypot(q.x - o.x, q.y - o.y) > SAFE_GAP + 2 + (vehicleOf(e.car.type).length + o.length) / 2 - REF_LEN)) break;
        back += 2;
      }
      const at = spread ? { s0: p0.length * (1 - Math.min(0.98, Math.max(0.02, e.startFrac!))), off: 0 } : spot(back);
      const sNew = at.s0;
      const c: RaceCar = {
        entrant: e, slot, lap: slot === 0 ? 0 : -1,
        s: sNew, gridOff: at.off, v: spread ? 40 : 0, x: 0, y: 0, h: 0,
        ghost: false, stuck: 0, ghostFor: 0, powered: false, freeUntil: 0, pushUntil: 0, aimWant: 0, tlVal: 0, tlAt: -1e9, cellAtX: NaN, cellAtY: NaN, cellIdx: -1, aim: 0, park: 0, parkT: 0, noPark: false, lapStart: slot === 0 ? [0] : [], finishTime: null,
        trace: [], prog: [], vtrace: [], gtrace: [], ltrace: [], ftrace: [], ttrace: [], ptrace: [],
        fuel: TANK, tyre: 1, pits: 0, pitIn: false, pitOut: false, pitDone: false, dwell: 0, boxed: false, ready: false, limp: false, emergency: false, emergencies: 0, out: false, outProg: 0,
        needProf: false, prof: p0, perUnit: fuelPerUnit(e.car, laps * this.lapLen), wearMul: (0.8 + 0.04 * e.car.grip) * vehicleOf(e.car.type).wear,
        compound: e.startTyre ?? (slot % 3 === 0 && !e.isPlayer ? "soft" : "medium"), nextTyre: null, nextTactic: null, tactic: e.startTactic ?? "balanced", temp: TEMP_START, wake: 0, tmtrace: [], ctrace: [], used: [],
        hp: 0, off: 0, offV: 0, beta: 0, rec: false, back: false, backT: 0, psi: 0, phi: 0, yaw: 0, btrace: [], radius: (vehicleOf(e.car.type).length + vehicleOf(e.car.type).width) / 4, length: vehicleOf(e.car.type).length, width: vehicleOf(e.car.type).width, circ: Math.hypot(vehicleOf(e.car.type).length, vehicleOf(e.car.type).width) / 2, mass: vehicleOf(e.car.type).mass, anchored: false,
      };
      c.used.push(c.compound);
      if (slot === 0) this.startLap(c);
      this.place(c);
      this.cars.push(c);
    });
    this.record();
  }

  /**
   * In a field of more than 32 (four abreast on the grid) every computer driver keeps to the lane of its grid column for the whole lap: parallel
   * lanes never cross, so the field does not merge into one file, which at 256 cars would be longer than the lap and could never move.
   */
  private laned(e: Entrant, slot: number, gridCols: number): Entrant {
    if (gridCols !== 4 || !e.bot || e.isPlayer) return e;
    const lane = GRID_COLS4[slot % 4]![0] / ROAD_HALF;
    this.forget(e.id);
    return { ...e, lines: [botLine(this.track, e.bot.seed, e.bot.skill, { lane })], bot: { ...e.bot, lane } };
  }

  /** The rubber on the road now, to hand to the next session of the weekend. */
  rubberOut(): Uint8Array { return this.field.rubberSnapshot(); }

  get time(): number { return this.tick * TICK; }

  /** The wet-field bin under a car (-1 off the road). It is looked up a lot in a tick, and the car has not moved between the lookups. */
  private cellOf(c: RaceCar): number {
    if (c.cellAtX !== c.x || c.cellAtY !== c.y) { c.cellIdx = this.field.cellAt(c.x, c.y); c.cellAtX = c.x; c.cellAtY = c.y; }
    return c.cellIdx;
  }
  private wetOf(c: RaceCar): number { const i = this.cellOf(c); return i < 0 ? 0 : this.field.wet[i]!; }
  private useOf(c: RaceCar): number { const i = this.cellOf(c); return i < 0 ? 0 : this.field.use[i]!; }
  private rubberOf(c: RaceCar): number { const i = this.cellOf(c); return i < 0 ? 0 : this.field.rubber[i]!; }

  /** The bridges of the track, if it has any (see levelsOf). */
  private levels: Int16Array | null = null;
  /** the track has a flat crossing, so a car has a junction to keep clear */
  private hasCross = false;

  /** Which level a car is on: positive on a bridge, negative on the road beneath it, 0 anywhere else. */
  levelOf(c: RaceCar): number {
    return this.levels ? this.levels[c.prof.seg[indexAt(c.prof, c.s)]!] ?? 0 : 0;
  }

  /** Whether one car is on a bridge and the other on the road under that same bridge: they pass through each other without a touch or a thought. */
  private apart(a: RaceCar, b: RaceCar): boolean {
    if (!this.levels) return false;
    const la = this.levelOf(a);
    return la !== 0 && la === -this.levelOf(b);
  }

  private alive = (c: RaceCar): boolean => c.finishTime === null && !c.out;

  /** A lap's path with nothing special: fresh tyres and a full tank. Used for qualifying and the grid. */
  private profile(e: Entrant, lap: number): Profile {
    return this.build(e, lap, false, false, 1, 1);
  }

  private build(e: Entrant, lap: number, pitIn: boolean, pitOut: boolean, grip: number, accel: number, tyre?: Compound, tactic?: Tactic): Profile {
    // the surface scales what the car can do
    const veh = vehicleOf(e.car.type);
    grip *= terrainMul(this.biome.grip, veh.terrain); accel *= terrainMul(this.biome.accel, veh.terrain);
    if (veh.domain === "water") grip *= 1 + DRIFT_ALLOW * veh.slip;
    // the state of the road changes, so a path built for one moment is only good for a little while
    const gen = Math.floor(this.tick / 600);
    if (gen !== this.profGen) { this.profiles.clear(); this.profGen = gen; }
    let idx = Math.min(Math.max(lap, 0), e.lines.length - 1);
    while (idx > 0 && !e.lines[idx]) idx--; // laps with no line of their own drive the last one that was set
    const k = `${e.id}:${idx}:${+pitIn}${+pitOut}:${Math.round(grip * 200)}:${Math.round(accel * 200)}:${tyre ?? "-"}:${tactic ?? "-"}`;
    let p = this.profiles.get(k);
    if (!p) {
      const field = this.field;
      p = buildProfile(this.track, e.lines[idx]!, e.car, { pace: e.pace === undefined && !tactic ? undefined : (e.pace ?? 1) * (tactic ? TACTIC_INFO[tactic].pace : 1), pitIn, pitOut, grip, accel, brake: terrainMul(this.biome.brake, veh.terrain), gripAt: tyre ? (x, y) => field.gripAt(tyre, x, y) : undefined });
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
      const line = botLine(this.track, e.bot.seed + from * 7919, e.bot.skill, { compound: c.compound, field: this.field, ...(e.bot.lane !== undefined ? { lane: e.bot.lane } : {}) });
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
    c.nextTyre = null; c.nextTactic = null;
    if (c.entrant.isPlayer || c.entrant.pit || c.entrant.pitPlan) {
      const plan = c.entrant.pitPlan?.find((p) => p.lap === lap);
      if (plan) { c.nextTyre = plan.tyre ?? null; c.nextTactic = plan.tactic ?? null; return true; }
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
    // (a stop for tyres alone is skipped when the pit lane is already full: a driver who sees the queue stays out, which is what keeps a big field from all stopping at once)
    const queue = this.cars.filter((o) => this.inPit(o)).length;
    if (wrong && c.pits < MAX_PIT_STOPS - 1 && left >= 2 && queue < PIT_BAYS) { c.nextTyre = ideal; return true; }
    // only stop if the tank cannot get to the flag. Then go when it could not take another lap, or a little before:
    // slots take turns, so the pit lane is not one long queue
    if (c.fuel < perLap * 1.05 * left && atLine < perLap * (1.05 + (c.slot % 3) * 0.55)) { c.nextTyre = ideal === "soft" ? "medium" : ideal; return true; }
    if (c.tyre < 0.45 && left >= 3 && queue < PIT_BAYS) { c.nextTyre = ideal; return true; }
    return false;
  }

  /** Set the path for the lap that is starting. Called again a tick later, in case the player has since changed their line. */
  private startLap(c: RaceCar, refresh = false): void {
    const lap = Math.max(c.lap, 0);
    if (!refresh) { c.pitOut = c.pitIn; c.pitDone = false; c.dwell = 0; c.bay = undefined; c.boxed = false; c.ready = false; }
    c.pitIn = this.decidePit(c, lap);
    const real = this.rules.realism;
    c.prof = this.build(c.entrant, lap, c.pitIn, c.pitOut, real ? (1 - TYRE_GRIP_LOSS * (1 - c.tyre)) * tempGrip(c.compound, c.temp) : 1, real ? 1 - FUEL_MASS_ACCEL * (c.fuel / TANK) : 1, real ? c.compound : undefined, real ? c.tactic : undefined);
  }

  /** Sideways shift from a car's own line that puts it in its grid column, `lateral` units to one side of the middle of the road. */
  private gridOffset(p: Profile, sAt: number, lateral: number): number {
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
    const px = cx - ty * lateral, py = cy + tx * lateral;
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
    c.h = c.rec ? c.hp + c.psi : c.hp + Math.max(-0.6, Math.min(0.6, Math.atan2(c.offV, Math.max(c.v, 15)))) * 0.7 + c.beta;
    const power = p.ghost[indexAt(p, c.s)] === 1;
    // A ghost only turns solid once nobody is inside it, so the power-up never ends with two cars overlapping.
    const sitting = c.ghost && this.cars.some((o) => o !== c && this.alive(o) && Math.hypot(o.x - c.x, o.y - c.y) < this.gap(c, o) + 2 && !this.apart(c, o));
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
      c.ltrace.push(this.levelOf(c));
      c.ftrace.push(Math.round(c.fuel * 10) / 10);
      c.ttrace.push(Math.round(c.tyre * 1000) / 1000);
      c.tmtrace.push(Math.round(c.temp * 100) / 100);
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

  /**
   * The gaps the traffic logic keeps are set for a car of REF_LEN by REF_WID; a longer or wider machine (a truck, a tank) needs more, and a shorter one
   * (a kart) a little less: the centre-to-centre gap that leaves the same bumper space, and the sideways clearance that leaves the same room.
   */
  private gap(a: { length: number }, b: { length: number }): number { return SAFE_GAP + (a.length + b.length) / 2 - REF_LEN; }
  private side(a: { width: number }, b: { width: number }): number { return (a.width + b.width) / 2 - REF_WID; }

  /** Who has right of way: further round the race first, the better grid slot on a tie. */
  private prio(c: RaceCar): number { return c.lap * 1e5 + this.pos(c) - c.slot * 1e-3; }

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

  /** Whether this car is an obstacle for the others: wrecked and recovering, or stopped long enough that it is not just queueing. */
  private blocking(o: RaceCar): boolean {
    return !o.ghost && o.dwell === 0 && !o.boxed && !this.inPit(o) && (o.rec || o.stuck > OBSTACLE_TICKS) && !o.prof.lane[indexAt(o.prof, o.s)];
  }

  /**
   * Steer round cars that are stopped on the road ahead (a wreck, a car stuck in a spin) instead of queueing behind them: pick the
   * offset from my line nearest the one I have that clears every one of them by DODGE_GAP and keeps the car on the road.
   * Where there is no room the aim goes back to the line and the traffic code brakes for the obstacle instead.
   */
  private dodge(c: RaceCar, p: Profile, racing: RaceCar[]): void {
    let want = 0;
    const i = indexAt(p, c.s);
    if (!c.rec && !c.ghost && c.v > 0.5 && !p.lane[i] && !this.inPit(c)) {
      const nx = -Math.sin(c.hp), ny = Math.cos(c.hp), hx = Math.cos(c.hp), hy = Math.sin(c.hp);
      const lim = Math.max(0, p.half[i]! - CAR_R - 3), own = c.off + c.gridOff;
      const blocked: [number, number][] = [];
      for (const o of this.near(c.x, c.y, DODGE_REACH * 1.5)) {
        if (o === c || !this.blocking(o) || this.apart(c, o)) continue;
        const dx = o.x - c.x, dy = o.y - c.y, along = dx * hx + dy * hy;
        if (along < -SAFE_GAP / 2 || along > DODGE_REACH || Math.abs(dx) + Math.abs(dy) > DODGE_REACH * 1.5) continue;
        const lat = dx * nx + dy * ny + own; // how far the obstacle sits from my line
        const dg = DODGE_GAP + this.side(c, o);
          if (lat - dg < lim && lat + dg > -lim) blocked.push([lat - dg, lat + dg]);
      }
      if (blocked.length) {
        const free = (a: number) => Math.abs(a) <= lim + 1e-6 && blocked.every(([lo, hi]) => a <= lo || a >= hi);
        // nearest to where the car is steering already; the line itself on a tie
        let best: number | null = null;
        for (const a of [0, ...blocked.flatMap(([lo, hi]) => [lo, hi])]) {
          if (!free(a)) continue;
          const da = Math.abs(a - c.aim), db = best === null ? Infinity : Math.abs(best - c.aim);
          if (da < db - 1e-6 || (Math.abs(da - db) <= 1e-6 && Math.abs(a) < Math.abs(best!))) best = a;
        }
        want = best ?? 0;
      }
    }
    // it moves across the road only as fast as it is rolling: no movement, no steering
    c.aimWant = want;
    c.aim += (want - c.aim) * Math.min(1, (want !== 0 ? 8 : 1.5) * Math.min(1, c.v / 25) * TICK);
    if (Math.abs(c.aim) < 0.01) c.aim = 0;
  }

  /** Whether faster traffic is coming up behind this car, on the road it is on. */
  private trafficBehind(c: RaceCar, racing: RaceCar[]): boolean {
    const hx = Math.cos(c.hp), hy = Math.sin(c.hp), nx = -hy, ny = hx;
    for (const o of this.near(c.x, c.y, PARK_WATCH + 30)) {
      if (o === c || o.ghost || o.dwell > 0 || this.inPit(o) || o.v < c.v + PARK_CLOSING || this.apart(c, o)) continue;
      const dx = o.x - c.x, dy = o.y - c.y, along = dx * hx + dy * hy;
      if (along > 2 || along < -PARK_WATCH || Math.abs(dx * nx + dy * ny) > 26) continue;
      if (Math.cos(o.h - c.hp) > 0.3) return true;
    }
    return false;
  }

  /**
   * Keep the box clear: the speed that stops a car short of a crossing when the road just beyond it is held up by a car that is
   * (nearly) stopped, so it does not sit in the junction and block everyone crossing, who would block it in turn.
   */
  private boxLimit(c: RaceCar, p: Profile, b: number, reach: number, racing: RaceCar[]): number {
    const inBox = (d: number): boolean => {
      const sg = this.track.allSegments[p.seg[indexAt(p, c.s + d)]!];
      if (!sg || sg.kind !== "cross") return false;
      return Math.max(Math.abs(sampleAt(p, p.x, c.s + d) - (sg.cx + 0.5) * CELL), Math.abs(sampleAt(p, p.y, c.s + d) - (sg.cy + 0.5) * CELL)) < ROAD_HALF + 2;
    };
    if (inBox(0)) return Infinity; // already in: carry on through
    let enter = -1, leave = -1;
    for (let d = PLAN_STEP; d <= reach + 40; d += PLAN_STEP) {
      if (enter < 0) { if (inBox(d)) enter = d; }
      else if (!inBox(d)) { leave = d; break; }
    }
    if (enter < 0 || leave < 0 || enter > reach) return Infinity;
    for (const o of this.near(c.x, c.y, reach + 40 + BOX_CLEAR + LATERAL + 2)) {
      if (o === c || o.ghost || this.inPit(o) || o.v > 6 || this.apart(c, o)) continue;
      for (let d = leave; d <= leave + BOX_CLEAR; d += PLAN_STEP) {
        const px = sampleAt(p, p.x, c.s + d) - o.x, py = sampleAt(p, p.y, c.s + d) - o.y;
        if (px * px + py * py < LATERAL * LATERAL) return Math.sqrt(2 * b * Math.max(0, enter - 8));
      }
    }
    return Infinity;
  }

  /**
   * The speed this car may carry given the traffic on its path. Cars ahead and going the same way are followed at a safe gap. Cars
   * crossing or merging are given way to if they are further round the race, unless this car is wrecked and has to clear the road, or has
   * waited so long it has been let off (it still follows whatever is directly ahead of it).
   */
  private trafficLimit(c: RaceCar, p: Profile, brake: number, racing: RaceCar[], creep = false): number {
    let limit = Infinity;
    if (this.inPit(c)) return limit; // free to come in
    const yields = !c.rec && c.freeUntil <= this.tick;
    const b = brake * 0.6;
    const reach = (c.v * c.v) / (2 * b) + SAFE_GAP + Math.max(0, c.length - REF_LEN) + 20;
    const mine = this.prio(c);
    if (yields && this.hasCross) limit = Math.min(limit, this.boxLimit(c, p, b, reach, racing));
    // my own path, worked out once for every car it is checked against
    const steps = Math.min(PATH_MAX, Math.floor(reach / PLAN_STEP) + 1);
    let pathDone = false;
    for (const o of this.near(c.x, c.y, reach + LATERAL + 2)) {
      if (o === c || o.ghost || this.inPit(o) || this.apart(c, o)) continue;
      const dx = o.x - c.x, dy = o.y - c.y;
      if (dx * dx + dy * dy > (reach + LATERAL) * (reach + LATERAL)) continue;
      // a car behind me and going my way is its own driver's problem: it can only catch me by being faster, and then it is the one to brake
      if (dx * Math.cos(c.hp) + dy * Math.sin(c.hp) < -LATERAL && Math.cos(o.h - c.hp) > 0.5 && !o.rec) continue;
      // First point of my path, in the next `reach` units, where the other car is in the way: either it is sitting
      // on the path now, or by the time I get there it will be (this catches lines that merge or cross).
      const po = o.prof;
      const speed = Math.max(c.v, 12);
      if (!pathDone) {
        pathDone = true;
        for (let k = 0; k < steps; k++) {
          const d = k * PLAN_STEP;
          let px = sampleAt(p, p.x, c.s + d), py = sampleAt(p, p.y, c.s + d);
          // the path swings from where the car is to where it is steering over the next DODGE_BLEND units
        const shift = c.aim + (c.aimWant - c.aim) * Math.min(1, d / DODGE_BLEND);
        if (shift !== 0) { const hd = p.h[indexAt(p, c.s + d)]!; px -= Math.sin(hd) * shift; py += Math.cos(hd) * shift; }
          this.pathX[k] = px; this.pathY[k] = py;
        }
      }
      let hit = -1;
      // (a car that has been stuck "creeps": it keeps only the bumper space and sideways room the two cars really need, so it can edge up through a jam without touching)
      const sideX = creep ? (c.width + o.width) / 2 + CREEP_SIDE - LATERAL : this.side(c, o), sg = creep ? (c.length + o.length) / 2 + CREEP_GAP : this.gap(c, o);
      const predictGap = creep ? LATERAL + sideX : PREDICT_GAP + sideX;
      for (let k = 0; k < steps; k++) {
        const d = k * PLAN_STEP, px = this.pathX[k]!, py = this.pathY[k]!;
        let q = (px - o.x) * (px - o.x) + (py - o.y) * (py - o.y);
        if (q < (LATERAL + sideX) * (LATERAL + sideX)) { hit = d; break; }
        // where it will be is on its own line, `o.v * d / speed` further along and (at most) as far off that line as it is now: when my
        // point is further than that from where it is, the prediction cannot bring it within PREDICT_GAP, so it is not worked out
        const slack = predictGap + (o.v * d) / speed + Math.abs(o.off + o.gridOff) + 2;
        if (q > slack * slack) continue;
        const ahead = o.s + (o.v * d) / speed;
        const ex = px - sampleAt(po, po.x, ahead), ey = py - sampleAt(po, po.y, ahead);
        q = ex * ex + ey * ey;
        if (d > 0 && q < predictGap * predictGap) { hit = d; break; }
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
      // is its own driver's problem. A wreck has right of way over nobody, but everybody gives way to it.
      const room = Math.sqrt(2 * b * Math.max(0, Math.min(hit, Math.hypot(dx, dy)) - sg - FOLLOW_HEADWAY * c.v));
      // (a recovering car gives way to nobody, not even to another wreck, so two of them cannot each wait for the other)
      const theirs = !c.rec && (o.rec || (yields && this.prio(o) > mine));
      if (cos > 0.3) {
        if (along > 1.5) limit = Math.min(limit, o.v * cos + room);
        else if (along > -1.5 && theirs) limit = Math.min(limit, o.v * cos + room);
      } else if (theirs) {
        limit = Math.min(limit, room);
      }
    }
    return limit;
  }

  /**
   * A car that has been knocked off its line tries to get back: a spring pulls it in. And one carrying more speed
   * than the bend allows (because it was shoved, or tipped over its braking point) cannot hold the line: it runs wide.
   */
  /** The road's edge: it is as wide as it is here, and well off it the car is on grass, which grips little. */
  private edge(c: RaceCar, p: Profile, i: number): void {
    const room = p.half[i]! / ROAD_HALF, offMax = OFF_MAX * room, grass = Math.max(3, 10 + (p.half[i]! - ROAD_HALF));
    const was = c.off;
    c.off = Math.max(-offMax, Math.min(offMax, c.off));
    if (c.rec && c.off !== was) { c.v *= 0.97; c.phi *= 0.8; } // into the barrier
    if (Math.abs(c.off) > grass) c.v *= 1 - 0.6 * TICK * ((Math.abs(c.off) - grass) / Math.max(4, offMax - grass));
  }

  /** Put a car into recovery: it keeps the velocity the hit gave it, points `kick` radians further round, and spins at `yaw`. */
  private startRecovery(c: RaceCar, kick: number, yaw: number): void {
    if (c.dwell > 0 || c.ghost || this.inPit(c)) return;
    const wasRec = c.rec;
    const vm = Math.hypot(c.v, wasRec ? 0 : c.offV);
    c.phi = wasRec ? c.phi : Math.max(-2.2, Math.min(2.2, Math.atan2(c.offV, Math.max(c.v, 1))));
    c.v = vm;
    c.psi = wrap((wasRec ? c.psi : c.phi) + kick);
    c.yaw = wasRec ? c.yaw + yaw : yaw;
    if (!wasRec) c.backT = 0;
    c.rec = true;
    c.offV = c.v * Math.sin(c.phi);
  }

  /**
   * A car that has been hit or spun drives itself back. Its tyres drag its direction of travel toward the way it points, only as hard as
   * they grip, and scrub speed while it slides; the driver steers the nose toward a heading that brings it back to the line, at the
   * turning circle (and no tighter than the tyres allow), and cannot steer at all while the car is sliding. So a car turns, or goes round
   * in a circle, and rejoins, rather than sliding sideways into place.
   */
  private recover(c: RaceCar, p: Profile, i: number): void {
    const veh = vehicleOf(c.entrant.car.type), st = this.stats(c);
    const aMax = Math.max(8, st.aLat * Math.max(0.25, this.traction(c)));
    const v = Math.max(c.v, 0.1);
    // stuck, nose into the wall or pointing the wrong way: back out. Once it points well along the road again, go forward
    const room = p.half[i]! / ROAD_HALF, offMax = OFF_MAX * room;
    const atWall = Math.abs(c.off) > offMax * 0.9 && c.off * Math.sin(c.psi) > 0.3 * Math.abs(c.off);
    // (having switched to forward to turn round, it does not go straight back into reverse: backT counts up from -TURN_ROUND_S)
    if (!c.back && c.v < 5 && (atWall || (c.backT >= 0 && Math.abs(c.psi) > 1.9))) { c.back = true; c.backT = 0; }
    else if (c.back && (c.backT > 6 || (Math.abs(c.psi) < 0.9 && !atWall) || (Math.abs(c.psi) > 2.6 && Math.abs(c.off) < 4 && !atWall))) { c.back = false; c.backT = -TURN_ROUND_S; }
    if (c.back || c.backT < 0) c.backT += TICK;
    const hdg = c.back ? wrap(c.psi + Math.PI) : c.psi; // the way the car actually travels when its tyres have their way
    const slip = wrap(hdg - c.phi);
    // the tyres turn the travel toward the heading, and sliding sideways costs speed
    const aT = Math.max(-aMax, Math.min(aMax, REC_TYRE * slip * Math.max(v, 10)));
    c.phi = wrap(c.phi + (aT / Math.max(v, 4)) * TICK);
    const sideways = Math.abs(Math.sin(slip));
    c.v = Math.max(0, c.v - (aMax * 0.55 * sideways + 6 * sideways * sideways) * TICK);
    // steering
    const look = Math.max(18, v * 0.6);
    // forward: point the nose where it will carry the car back to the line; in reverse: point the tail there, so the car backs toward the road
    // with traffic coming up behind, get to the side of the road and let it by (it is the wreck that is in the way, and the pack that has the pace); on a clear road head for the line
    const lim = Math.max(0, p.half[i]! - CAR_R - 3);
    const coming = !c.noPark && lim > 6 && this.trafficBehind(c, this.live);
    if (coming && c.park === 0) c.park = (c.off >= 0 ? 1 : -1) * (lim - 1);
    else if (!coming && c.park !== 0) { c.park = 0; c.parkT = 0; }
    const parked = c.park !== 0 && Math.abs(c.off - c.park) < 2 && c.v < 3;
    if (parked && ++c.parkT > PARK_MAX_TICKS) { c.park = 0; c.parkT = 0; c.noPark = true; }
    const toward = Math.max(-1, Math.min(1, -Math.atan2(c.off - c.park, look)));
    const want = c.back ? wrap(toward + Math.PI) : toward;
    const authority = Math.max(0.2, Math.min(1, 1 - Math.abs(slip) / 1.4));
    // the slower it goes the tighter it turns: the turning circle shrinks from REC_TURN car lengths at speed toward REC_TURN_SLOW at a crawl,
    // and a car barely moving can still swing its nose round (it does not have to be doing 6 units/s to steer)
    const circle = veh.length * (REC_TURN_SLOW + (REC_TURN - REC_TURN_SLOW) * Math.min(1, v / REC_TURN_SPEED));
    // steering turns the car only as fast as it is rolling (the wheels have to move to swing the nose round): none at a standstill
    const wMax = Math.min(c.v / circle, aMax / Math.max(c.v, 1)) * authority;
    const wDes = Math.max(-wMax, Math.min(wMax, REC_STEER * wrap(want - c.psi)));
    c.yaw += (wDes - c.yaw) * Math.min(1, REC_YAW * TICK * (0.2 + authority));
    c.yaw *= 1 - 0.9 * TICK * (1 - authority); // a spin dies away as the tyres bite
    const psi0 = c.psi;
    c.psi = wrap(c.psi + c.yaw * TICK);
    // a car with grip turns about its rear axle, so its middle swings out as the nose comes round (a sliding one just spins)
    const hinge = REC_HINGE * veh.length * authority;
    c.off += hinge * (Math.sin(c.psi) - Math.sin(psi0));
    c.s += hinge * (Math.cos(c.psi) - Math.cos(psi0));
    // where the car actually goes follows the way it is travelling
    c.offV = c.v * Math.sin(c.phi);
    c.off += c.offV * TICK;
    c.beta = wrap(hdg - c.phi);
    this.edge(c, p, i);
    // back on the line and pointing along it: the ordinary line-following takes over again
    if (!c.back && c.park === 0 && Math.abs(c.off) < 0.8 && Math.abs(c.psi) < 0.1 && Math.abs(c.phi) < 0.1 && Math.abs(c.yaw) < 0.3) { c.rec = false; c.psi = c.phi = c.yaw = 0; c.beta = 0; c.offV = 0; c.off = 0; c.parkT = 0; c.noPark = false; c.backT = 0; c.back = false; }
  }

  private settle(c: RaceCar): void {
    const p = c.prof, i = indexAt(p, c.s);
    if (c.rec) { this.recover(c, p, i); return; }
    const lim = p.vLim[i]!, kap = p.kap[i]!;
    // over the limit for this bend: the grip it lacks is how hard it is pulled outward
    const excess = kap > 0.003 && c.v > lim * 1.12 + 3 ? (c.v / lim) ** 2 - 1 : 0;
    // the line-seeking spring does little while the car is sliding, and takes over again once it has grip
    const veh = vehicleOf(c.entrant.car.type), water = veh.domain === "water";
    const spring = excess > 0 ? 0.12 : 1;
    c.off += c.offV * TICK;
    c.offV += (-(water ? WATER_K : OFF_K) * spring * (c.off - c.aim) - (water ? WATER_C : OFF_C) * c.offV) * TICK;
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
      const g = tyreGrip(c.compound, this.wetOf(c), this.useOf(c), this.rubberOf(c));
      const rate = spinRate(g);
      if (rate > 0 && this.rng.next() < rate * TICK) {
        const dir = this.rng.next() < 0.5 ? -1 : 1;
        this.startRecovery(c, dir * (1.4 + 1.8 * this.rng.next()), dir * 7);
        if (this.rules.realism) c.tyre = Math.max(0, c.tyre - 0.012);
        this.events.push({ tick: this.tick, id: c.entrant.id, type: "spin", x: c.x, y: c.y });
      }
    }
    this.edge(c, p, i);
  }

  /** The grip the tyres have right now against fresh mediums on a dry road, 0 to 1: they wear, and slicks on a wet road or wets on a dry one grip less. 1 when tyres are not in play. */
  gripLevel(c: RaceCar): number {
    if (!this.rules.realism) return 1;
    const wear = 1 - TYRE_GRIP_LOSS * (1 - c.tyre);
    const cell = this.cellOf(c);
    const road = cell < 0 ? tyreGrip(c.compound, 0, 0) : tyreGrip(c.compound, this.field.wet[cell]!, this.field.use[cell]!, this.field.rubber[cell]!);
    return Math.min(1, wear * road * tempGrip(c.compound, c.temp));
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
    const grip = this.gripLevel(c), gm = p.gripMul[i]!;
    const demand = (p.kap[i]! * c.v * c.v) / Math.max(cornerCap(c.entrant.car.type, this.stats(c).aLat * grip * gm, c.v), 1);
    // from nothing at 60% of the grip to the vehicle's own peak slip angle at all of it, and a wider angle on poor tyres
    const widen = Math.min(SLIP_WIDEN_MAX, 1 + SLIP_PER_LOST_GRIP * (1 - grip * Math.min(1, gm)));
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
    // the cars have moved since the start of the tick: sort them again, and look for a touch only between neighbours (in the same order as ever)
    this.buildNear(racing);
    const order = new Map<RaceCar, number>();
    racing.forEach((c, i) => order.set(c, i));
    for (let i = 0; i < racing.length; i++) {
      const A = racing[i]!;
      const cand = this.near(A.x, A.y, 2 * COLLIDE_REACH).filter((B) => order.get(B)! > i).sort((a, b) => order.get(a)! - order.get(b)!);
      for (const B of cand) {
        if (A.ghost || B.ghost || A.finishTime !== null || B.finishTime !== null || this.inPit(A) || this.inPit(B) || this.apart(A, B)) continue;
        const reach = A.circ + B.circ;
        if ((A.x - B.x) ** 2 + (A.y - B.y) ** 2 >= reach * reach) continue;
        A.anchored = A.dwell > 0; B.anchored = B.dwell > 0;
        A.grip = this.traction(A); B.grip = this.traction(B);
        const force = impact(A, B);
        if (force < 0) continue;
        touched.add(A); touched.add(B);
        this.knock(A, lastImpact.closing, lastImpact.alignA);
        this.knock(B, lastImpact.closing, lastImpact.alignB);
        if (force >= BUMP_MIN) {
          const k = this.pairKey(A, B);
          if (this.tick - (this.bumped.get(k) ?? -999) > 24) this.events.push({ tick: this.tick, id: A.entrant.id, type: "bump", strength: force, x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, other: B.entrant.id });
          this.bumped.set(k, this.tick);
          if (this.rules.realism) { const w = 0.0004 * force; A.tyre = Math.max(0, A.tyre - w); B.tyre = Math.max(0, B.tyre - w); }
        }
      }
    }
    for (const c of touched) {
      // knocked sideways: the car now points and travels off the line and must steer back (a tap does not count)
      if (!c.rec && Math.abs(c.offV) > REC_KICK) this.startRecovery(c, Math.max(-1, Math.min(1, (c.offV / Math.max(c.v, 12)) * 0.9)) , Math.sign(c.offV) * Math.min(3, Math.abs(c.offV) / 12));
      const offMax = OFF_MAX * c.prof.half[indexAt(c.prof, c.s)]! / ROAD_HALF;
      c.off = Math.max(-offMax, Math.min(offMax, c.off));
      if (c.dwell > 0) c.v = 0;
      this.place(c);
    }
  }

  /** How much traction a car has where it is: the surface, the tyre on it, how wet the road is and how worn the tyre. 1 is dry tarmac, fresh tyres. */
  private traction(c: RaceCar): number {
    const veh = vehicleOf(c.entrant.car.type);
    let g = terrainMul(this.biome.grip, veh.terrain);
    g *= c.prof.gripMul[indexAt(c.prof, c.s)]!;
    if (this.rules.realism) g *= tyreGrip(c.compound, this.wetOf(c), this.useOf(c), this.rubberOf(c)) * (1 - TYRE_GRIP_LOSS * (1 - c.tyre)) * tempGrip(c.compound, c.temp);
    return g;
  }

  /**
   * A hard hit can put a car into a spin, and the faster the cars were closing and the less grip the car has, the likelier it is. A hit
   * on the side counts for the most; both cars in a side-swipe are knocked, each by its own grip.
   */
  private knock(c: RaceCar, closing: number, align: number): void {
    if (c.dwell > 0 || c.ghost || closing < SPIN_CLOSING) return;
    const slip = Math.max(0, 1 - (c.grip ?? 1));
    const chance = Math.min(0.95, ((closing - SPIN_CLOSING) / 40 + 0.25 * slip) * (0.15 + 0.85 * (1 - align)) * (1 + 2.5 * slip));
    if (this.rng.next() >= chance) return;
    const dir = this.rng.next() < 0.5 ? -1 : 1;
    this.startRecovery(c, dir * (1.3 + 2 * this.rng.next() + slip), dir * (6 + 4 * Math.min(1, closing / 60)));
    c.v *= 0.6 - 0.2 * slip;
    this.events.push({ tick: this.tick, id: c.entrant.id, type: "spin", x: c.x, y: c.y });
  }

  /**
   * How much of a slipstream this car is in, 0 to 1: tucked in close behind another car, in its lane and going its way.
   * It is worth more the closer the gap and, because drag grows with speed, the faster the car following.
   */
  draft(c: RaceCar, racing: RaceCar[]): number {
    if (this.rules.draft === false || c.ghost || c.dwell > 0 || c.v < 20 || c.prof.lane[indexAt(c.prof, c.s)]) return 0;
    const hx = Math.cos(c.h), hy = Math.sin(c.h);
    let near = 0;
    // (called from a step it looks only at the cars round it; called on its own, at all of them)
    for (const o of racing === this.live ? this.near(c.x, c.y, DRAFT_RANGE + 8) : racing) {
      if (o === c || o.ghost || o.dwell > 0) continue;
      const dx = o.x - c.x, dy = o.y - c.y, along = dx * hx + dy * hy;
      if (along < 3 || along > DRAFT_RANGE) continue;
      if (Math.abs(-dx * hy + dy * hx) > 6.5 || Math.cos(o.h - c.h) < 0.9) continue;
      near = Math.max(near, 1 - (along - 3) / (DRAFT_RANGE - 3));
    }
    const speed = Math.min(1, c.v / 110);
    return near * speed * speed;
  }

  /** What a tyre's temperature settles at with nothing asking anything of it: the road, cooled by rain. */
  private ambient(): number {
    return Math.max(0, (AMBIENT[this.biome.id] ?? 0.4) - 0.15 * Math.min(1, this.rain * 2));
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
    else { c.tyre = 1; c.temp = this.ambient(); if (c.nextTyre) c.compound = c.nextTyre; if (!c.used.includes(c.compound)) c.used.push(c.compound); }
    if (c.nextTactic) c.tactic = c.nextTactic;
    c.nextTyre = null; c.nextTactic = null;
    c.limp = false;
    c.pits++;
    c.pitDone = true;
    this.emit(c.entrant.id, "pitEnd");
  }

  /** The rain, and the wet and dry patches of road, move on a tenth of a second at a time. */
  private weatherStep(racing: RaceCar[]): void {
    if (this.tick % 6 === 0) {
      const rain = this.rules.weather === false ? 0 : rainAt(this.weather, this.time);
      if ((rain > 0.05) !== (this.rain > 0.05)) this.events.push({ tick: this.tick, id: "", type: "rain", strength: rain });
      this.rain = rain;
      this.field.update(0.1, rain, racing.filter((c) => !c.ghost && c.dwell === 0).map((c) => ({ x: c.x, y: c.y })));
    }
    if (this.tick % 60 === 0) { this.wetSnaps.push(this.field.snapshot()); this.rainTrace.push(Math.round(this.rain * 100) / 100); }
  }

  /**
   * The cars sorted into square cells of GRID_CELL units, once a tick, so a car looking for the others near it looks at a handful
   * instead of the whole field (which is what made a big field slow: every car checked every other car, several times a tick).
   */
  private cellsOfCars = new Map<number, RaceCar[]>();
  private buildNear(racing: RaceCar[]): void {
    for (const list of this.cellsOfCars.values()) list.length = 0;
    for (const c of racing) {
      const k = Math.floor(c.x / NEAR_CELL) * 4096 + Math.floor(c.y / NEAR_CELL);
      const list = this.cellsOfCars.get(k);
      if (list) list.push(c); else this.cellsOfCars.set(k, [c]);
    }
  }
  /** Every car racing whose cell touches the square of half-width `r` round (x, y), as it stood at the start of the tick: a superset of those within `r`. */
  private near(x: number, y: number, r: number): RaceCar[] {
    const out: RaceCar[] = [];
    const x0 = Math.floor((x - r) / NEAR_CELL), x1 = Math.floor((x + r) / NEAR_CELL), y0 = Math.floor((y - r) / NEAR_CELL), y1 = Math.floor((y + r) / NEAR_CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) { const l = this.cellsOfCars.get(ix * 4096 + iy); if (l) for (const o of l) out.push(o); }
    return out;
  }

  /** scratch space for a car's own path while it is checked against the others */
  private pathX = new Float64Array(PATH_MAX);
  private pathY = new Float64Array(PATH_MAX);

  /** The cars still racing, for the checks a single car makes on the rest. */
  private live: RaceCar[] = [];

  step(): void {
    const racing = this.cars.filter(this.alive);
    this.live = racing;
    this.buildNear(racing);
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
      // ... and in a bend the same air is churned: the less the road is straight, the more the car behind loses
      else if (dr > 0) {
        const demand = (sampleAt(p, p.kap, c.s) * c.v * c.v) / cornerCap(c.entrant.car.type, st.aLat, c.v);
        target *= 1 - DIRTY_AIR * dr * Math.min(1, Math.max(0, (demand - 0.4) / 0.5));
      }
      c.wake = dr;
      if (c.limp) target = Math.min(target, LIMP_SPEED);
      const stopping = c.pitIn && !c.pitDone && p.pitS !== undefined;
      if (stopping && c.bay === undefined && p.pitS! - c.s <= BAY_PICK) c.bay = this.freeBay(c);
      const stopS = stopping ? p.pitS! - (c.bay ?? PIT_BAYS - 1) * PIT_BAY_GAP : 0;
      // brake to stop exactly in the bay
      if (stopping) target = c.boxed ? 0 : Math.min(target, Math.sqrt(2 * st.brake * 0.7 * Math.max(0, stopS - c.s)));
      if (!c.ghost) {
        this.dodge(c, p, racing);
        // on a clear road nobody is about to get in the way within a few ticks, so the look round is done every third tick; near anyone, every tick
        if (c.tlVal !== Infinity || this.tick - c.tlAt >= 3 || c.rec) { c.tlVal = this.trafficLimit(c, p, st.brake, racing, c.pushUntil > this.tick); c.tlAt = this.tick; }
        target = Math.min(target, c.tlVal);
      }
      else if (c.ghost && !c.powered) {
        // lingering: get out from inside whoever is still there, by dropping back from a car ahead
        const hx = Math.cos(c.h), hy = Math.sin(c.h);
        for (const o of racing) {
          if (o === c || o.ghost || Math.hypot(o.x - c.x, o.y - c.y) >= this.gap(c, o) + 2 || this.apart(c, o)) continue;
          if ((o.x - c.x) * hx + (o.y - c.y) * hy > 0) target = Math.min(target, Math.max(0, o.v - 14));
        }
      }
      if (c.rec) {
        // (a car with its nose well off the road comes round at a crawl, where its turning circle is tight, and only picks up speed as it straightens)
        target = c.back ? REV_SPEED : Math.min(target, target * Math.max(0.2, Math.min(1, 1.2 - Math.abs(c.psi) / 1.3)), REC_CRAWL + REC_CRAWL_GAIN * Math.max(0, 1 - Math.abs(c.psi)));
        // at the side of the road, waiting for the pack to go by
        if (c.park !== 0 && Math.abs(c.off - c.park) < 2 && Math.abs(c.psi) < 0.3) target = 0;
      }
      let v = c.v > target ? Math.max(target, c.v - st.brake * p.brakeMul[i]! * TICK) : Math.min(target, c.v + st.accel * p.accelMul[i]! * (1 + DRAFT_ACCEL * dr) * launchMul(c, st.vTop) * TICK);
      // a car pointing the wrong way slows down, and one that is sliding travels along the line only as far as its direction takes it
      let s = c.s + (c.rec ? v * Math.cos(c.phi) : v) * TICK;
      if (stopping && !c.boxed && c.bay !== undefined && stopS - s < 0.5 && v < 5) { s = stopS; v = 0; arrived.push(c); }
      next.set(c, { v, s });
    }
    for (const c of racing) {
      const n = next.get(c)!;
      const p = c.prof;
      if (!c.boxed && c.dwell === 0 && n.v < 1 && c.v < 1 && sampleAt(p, p.vLim, c.s) > 5) {
        if (++c.stuck > DEADLOCK_TICKS && c.freeUntil <= this.tick) c.freeUntil = this.tick + DEADLOCK_FREE_TICKS;
        if (c.stuck > PUSH_AFTER_TICKS) { c.pushUntil = this.tick + PUSH_TICKS; c.stuck = 0; c.tlAt = -1e9; }
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
        c.fuel = Math.max(0, c.fuel - moved * c.perUnit * TACTIC_INFO[c.tactic].fuel * this.biome.fuel * clampWear(this.rules.wearMult?.fuel));
        const st = this.stats(c);
        const load = Math.min(1.2, (p.kap[indexAt(p, c.s)]! * c.v * c.v) / cornerCap(c.entrant.car.type, st.aLat, c.v));
        const tac = TACTIC_INFO[c.tactic];
        c.tyre = Math.max(0, c.tyre - moved * TYRE_WEAR_PER_UNIT * raceScale(this.laps * this.lapLen).wearScale * c.wearMul * tac.wear * this.biome.wear * clampWear(this.rules.wearMult?.tyre) * wearRate(c.compound, this.wetOf(c)) * (0.4 + 1.2 * load * load) / 0.6);
        // the tyre warms with the work it does and with the dirty air it drives through, and settles toward that over a few seconds
        const goal = this.ambient() + (TEMP_WORK * load * load + DIRTY_HEAT * c.wake) * tac.heat;
        c.temp += (goal - c.temp) * Math.min(1, TICK / TEMP_TAU);
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
      c.dwell = Math.round(pitStopTime(c.entrant.car.type) * 60 * (c.emergency ? EMERGENCY_FACTOR : 1));
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

  /**
   * Work the race out a little at a time: `runToStop` and then `runToEnd`, but at most `maxTicks` ticks per call, so a game can keep
   * drawing between calls and start playing the part that is done. `stage` carries on from one call to the next. Returns what has happened:
   * "stop" (the car has pulled into its pit box), "end" (the race is over), or "running" (call again).
   */
  advance(carId: string, stage: { toEnd: boolean }, maxTicks: number): "running" | "stop" | "end" {
    const car = this.cars.find((c) => c.entrant.id === carId)!;
    for (let n = 0; n < maxTicks; n++) {
      if (stage.toEnd) { if (this.over) return "end"; this.step(); continue; }
      if (!this.alive(car) || this.time >= this.maxTime) { stage.toEnd = true; continue; }
      const seen = this.events.length;
      this.step();
      for (let i = seen; i < this.events.length; i++) { const e = this.events[i]!; if (e.id === carId && e.type === "pitStart") return "stop"; }
    }
    return stage.toEnd && this.over ? "end" : "running";
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
  private penaltyOf(c: RaceCar): number { return this.rules.realism && c.finishTime !== null ? (c.pits === 0 ? pitPenalty(c.entrant.car.type) : 0) + this.missingOf(c).length * pitPenalty(c.entrant.car.type) : 0; }

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
    for (const c of this.cars) { mix(c.s); mix(c.v); mix(c.lap); mix(c.finishTime ?? -1); mix(c.fuel); mix(c.tyre * 100); mix(c.beta); mix(c.psi); mix(c.phi); }
    return h.toString(16);
  }
}
