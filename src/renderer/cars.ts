import { Container, Graphics, Text } from "pixi.js";
import { VEHICLES, type Vehicle, type VehicleId } from "@apex/sim";

export interface CarShape { root: Container; body: Container; shadow: Graphics; brake: Graphics; /** the front tyres, turned to match the steering */ steer: Graphics[]; /** boats only: foam trailing the stern, drawn in world axes */ wake?: Graphics }

const DARK = 0x14161c;
const shade = (c: number, k: number): number => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k)), g = Math.min(255, Math.round(((c >> 8) & 255) * k)), b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
};

/** Which of a class's real models a car is, when it has more than one (muscle cars are a Viper or a Mustang), from its id: a field is a mix. */
export const variantOf = (id: string): number => { let h = 2166136261; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619); return (h >>> 0) % 2; };

/** Top-down drawing of each machine, nose pointing along +x, centred on the origin. */
export interface Livery {
  primary: number;
  secondary: number;
  /** 0 none, 1 one stripe down the middle, 2 two stripes, 3 a band along each side */
  stripe: 0 | 1 | 2 | 3;
  /** 1 to 99 painted on the car; 0 for none */
  number: number;
}
export const LIVERY_COLORS = [0xffcf3f, 0xff7a2f, 0xe9453b, 0xe86bb5, 0x9a6bff, 0x4a8fe8, 0x4fe0ff, 0x5ad07a, 0xf1f1f1, 0x8a8f9a, 0x2b2f3a, 0x14161c] as const;
export const DEFAULT_LIVERY: Livery = { primary: 0xffcf3f, secondary: 0x14161c, stripe: 0, number: 0 };

export function buildCar(vehicle: Vehicle | VehicleId, color: number, isPlayer: boolean, variant = 0, livery?: Livery): CarShape {
  const v = typeof vehicle === "string" ? VEHICLES[vehicle] : vehicle;
  const L = v.length, W = v.width, hl = L / 2, hw = W / 2;
  // every car gets the same outline, so the player's is the same model as the rest; the player is marked by a halo around it instead
  const ring = { width: 0.7, color: DARK };
  const g = new Graphics();
  // the front tyres are drawn apart from the body so they can be turned: they sit under it, as the tyres always have
  const steer: Graphics[] = [], wheelsBelow = new Container();
  const front = (x: number, y: number, len: number, wid: number, c = DARK) => { const w = new Graphics().roundRect(-len / 2, -wid / 2, len, wid, 0.3).fill(c); w.position.set(x, y); steer.push(w); wheelsBelow.addChild(w); };
  const wheel = (x: number, y: number, w = 2.2, h = 1.2) => g.rect(x - w / 2, y - h / 2, w, h).fill(DARK);

  // outline helpers for the real-car shapes: points are [x as a fraction of half-length, y as a fraction of half-width], one side only
  const half = (pts: number[][]) => [...pts.map(([x, y]) => [x! * hl, y! * hw]), ...pts.slice().reverse().map(([x, y]) => [x! * hl, -y! * hw])].flat() as number[];
  const hull = (pts: number[][]) => g.poly(half(pts)).fill(color).stroke(ring);
  const body2 = (pts: number[][], c: number) => g.poly(pts.map(([x, y]) => [x! * hl, y! * hw]).flat() as number[]).fill(c);
  const glass = (pts: number[][]) => g.poly(pts.map(([x, y]) => [x! * hl, y! * hw]).flat() as number[]).fill({ color: 0x1a2430, alpha: 0.95 }).stroke({ width: 0.3, color: DARK });
  const line = (pts: number[][], w: number, c: number) => { g.moveTo(pts[0]![0]! * hl, pts[0]![1]! * hw); for (const [x, y] of pts.slice(1)) g.lineTo(x! * hl, y! * hw); g.stroke({ width: w, color: c }); };
  const mirrors = (x: number, y: number) => { g.rect(x * hl - 0.4, -hw * y - 0.55, 0.8, 0.7).fill(DARK); g.rect(x * hl - 0.4, hw * y - 0.15, 0.8, 0.7).fill(DARK); };
  // tyres to scale: about 0.65 m across on a 4.6 m car (14% of its length); `wf` and `wr` are the front and rear widths in half-widths
  const tyres = (xf: number, xr: number, y: number, wf: number, wr: number) => {
    for (const s of [-1, 1]) { front(xf * hl, s * hw * y, L * 0.14, hw * wf); g.rect(xr * hl - L * 0.07, s * hw * y - hw * wr / 2, L * 0.14, hw * wr).fill(DARK); }
  };
  // fractional rectangles and ellipses, and a pair of tyres: `len` is a fraction of the length, `wid` of the half-width
  const R = (x0: number, x1: number, y0: number, y1: number, c: number) => g.rect(Math.min(x0, x1) * hl, Math.min(y0, y1) * hw, Math.abs(x1 - x0) * hl, Math.abs(y1 - y0) * hw).fill(c);
  const E = (x: number, y: number, rx: number, ry: number, c: number) => g.ellipse(x * hl, y * hw, rx * hl, ry * hw).fill(c);
  const pair = (x: number, y: number, len: number, wid: number, c = DARK, steered = false) => { for (const s of [-1, 1]) if (steered) front(x * hl, s * hw * y, L * len, hw * wid, c); else g.roundRect(x * hl - L * len / 2, s * hw * y - hw * wid / 2, L * len, hw * wid, 0.3).fill(c); };
  const flare = (x: number, y: number, w: number) => { for (const s of [-1, 1]) g.roundRect(x * hl - w / 2, s * hw * y - 0.45, w, 0.9, 0.4).fill(shade(color, 0.85)); };

  switch (v.id) {
    case "kart": { // racing kart (Tony Kart / OTK class, 1.9 x 1.4 m): exposed tyres, tube frame, nose cone and pods, offset engine, driver in a seat
      const suit = 0x2b3a67, glove = 0xe8e8e0;
      pair(0.66, 0.78, 0.16, 0.26, DARK, true); pair(-0.58, 0.9, 0.22, 0.4); // front 10 in and rear 11 in slicks, rear track wider
      line([[0.66, 0.78], [0.66, -0.78]], 0.5, 0x8a8f9a); line([[-0.58, 0.9], [-0.58, -0.9]], 0.6, 0x8a8f9a); // stub axle and the live rear axle
      g.roundRect(-hl * 0.78, -hw * 0.58, hl * 1.42, hw * 1.16, 0.5).stroke({ width: 0.7, color: 0x8a8f9a }); // chrome-moly frame rails
      line([[0.55, -0.58], [0.18, -0.2], [-0.2, -0.2], [-0.78, -0.4]], 0.4, 0x8a8f9a); line([[0.55, 0.58], [0.18, 0.2], [-0.2, 0.2], [-0.78, 0.4]], 0.4, 0x8a8f9a);
      hull([[1, 0.14], [0.95, 0.34], [0.8, 0.46], [0.56, 0.5], [0.34, 0.5]].map(([x, y]) => [x!, y!])); // nose cone fairing
      R(0.32, -0.34, -0.96, -0.6, shade(color, 0.85)); R(0.32, -0.34, 0.6, 0.96, shade(color, 0.85)); // side pods (the right one is a touch bigger)
      R(0.92, 0.98, -0.86, 0.86, DARK); R(-1, -0.94, -0.8, 0.8, DARK); // front and rear bumpers
      R(-0.46, -0.66, 0.18, 0.62, shade(color, 0.55)); R(-0.5, -0.62, 0.28, 0.5, 0xb7b09a); // engine on the right of the seat, with its exhaust and clutch cover
      line([[-0.52, 0.2], [-0.58, -0.1]], 0.5, 0x8a8f9a); // chain
      g.roundRect(-hl * 0.5, -hw * 0.34, hl * 0.4, hw * 0.68, 0.6).fill(0x262a33); // seat
      g.roundRect(hl * 0.04, -hw * 0.18, hl * 0.52, hw * 0.12, 0.5).fill(suit); g.roundRect(hl * 0.04, hw * 0.06, hl * 0.52, hw * 0.12, 0.5).fill(suit); // legs reaching under the nose
      g.ellipse(-hl * 0.18, 0, hl * 0.12, hw * 0.4).fill(suit).stroke({ width: 0.3, color: DARK }); // shoulders and torso
      line([[-0.2, -0.34], [0.12, -0.22], [0.3, -0.14]], 0.9, suit); line([[-0.2, 0.34], [0.12, 0.22], [0.3, 0.14]], 0.9, suit); // arms to the wheel
      g.circle(hl * 0.3, -hw * 0.14, hw * 0.07).fill(glove); g.circle(hl * 0.3, hw * 0.14, hw * 0.07).fill(glove); // gloves
      g.circle(hl * 0.32, 0, hw * 0.2).stroke({ width: 0.5, color: DARK }); line([[0.3, -0.2], [0.34, 0.2]], 0.4, DARK); // small steering wheel
      g.circle(-hl * 0.12, 0, hw * 0.25).fill(color).stroke({ width: 0.4, color: DARK }); // helmet
      g.ellipse(-hl * 0.04, 0, hl * 0.05, hw * 0.17).fill(0x10151c); // visor
      R(-0.16, -0.08, -0.04, 0.04, 0xffffff); // helmet stripe
      break;
    }
    case "formula": { // 2020s F1 car (5.6 x 2.0 m): front wing, narrow nose, exposed tyres, sidepods, halo, airbox, rear wing
      R(0.9, 1, -1, 1, shade(color, 0.7)); R(0.84, 0.92, -1, 1, shade(color, 0.85)); // two-element front wing, endplates
      R(0.88, 1, -1, -0.92, DARK); R(0.88, 1, 0.92, 1, DARK);
      pair(0.56, 0.8, 0.125, 0.3, DARK, true); pair(-0.62, 0.82, 0.145, 0.4); // 18 in tyres, wider at the rear
      line([[0.55, 0.8], [0.3, 0.36]], 0.4, DARK); line([[0.55, -0.8], [0.3, -0.36]], 0.4, DARK); line([[-0.62, 0.8], [-0.4, 0.5]], 0.4, DARK); line([[-0.62, -0.8], [-0.4, -0.5]], 0.4, DARK); // wishbones
      hull([[0.9, 0.08], [0.6, 0.14], [0.28, 0.24], [0.05, 0.38], [-0.2, 0.5], [-0.5, 0.42], [-0.78, 0.2], [-0.9, 0.1]]); // nose, monocoque, sidepods, engine cover
      R(-0.14, 0.16, -0.62, -0.5, DARK); R(-0.14, 0.16, 0.5, 0.62, DARK); // sidepod inlets
      g.circle(-hl * 0.08, 0, hw * 0.16).fill(0xf1f1ee).stroke({ width: 0.3, color: DARK }); // helmet
      g.circle(-hl * 0.08, 0, hw * 0.3).stroke({ width: 0.7, color: DARK }); // halo
      R(-0.5, -0.1, -0.06, 0.06, shade(color, 0.6)); // airbox / shark fin
      R(-1, -0.88, -0.92, 0.92, shade(color, 0.7)); R(-1, -0.88, -0.94, -0.86, DARK); R(-1, -0.88, 0.86, 0.94, DARK); // rear wing and endplates
      break;
    }
    case "muscle": { // alternates between a Dodge Viper GT (4.5 x 1.95 m) and a Ford Mustang GT (4.8 x 1.92 m)
      if (variant === 0) {
        tyres(0.6, -0.5, 0.94, 0.3, 0.38);
        hull([[1, 0.55], [0.96, 0.78], [0.8, 0.86], [0.5, 0.86], [0.1, 0.84], [-0.25, 0.92], [-0.7, 0.96], [-0.93, 0.86], [-1, 0.6]]); // very long bonnet, hips over the rear wheels
        R(0.3, 0.92, -0.2, -0.05, 0xf4f4f0); R(0.3, 0.92, 0.05, 0.2, 0xf4f4f0); R(-0.95, 0.3, -0.2, -0.05, 0xf4f4f0); R(-0.95, 0.3, 0.05, 0.2, 0xf4f4f0); // GT racing stripes
        E(0.55, -0.55, 0.12, 0.06, DARK); E(0.55, 0.55, 0.12, 0.06, DARK); // bonnet vents
        glass([[-0.05, 0.56], [-0.18, 0.66], [-0.5, 0.66], [-0.6, 0.5], [-0.6, -0.5], [-0.5, -0.66], [-0.18, -0.66], [-0.05, -0.56]]); // small cabin set far back
        body2([[-0.22, 0.24], [-0.46, 0.24], [-0.46, -0.24], [-0.22, -0.24]], shade(color, 1.15));
        mirrors(-0.04, 0.8);
        R(-1, -0.94, -0.5, 0.5, shade(color, 0.6)); // tail lip
      } else {
        tyres(0.6, -0.55, 0.92, 0.3, 0.34);
        hull([[1, 0.6], [0.97, 0.8], [0.82, 0.88], [0.5, 0.9], [0.1, 0.9], [-0.4, 0.9], [-0.85, 0.88], [-0.97, 0.78], [-1, 0.6]]); // wide squared-off coupe
        R(0.45, 0.93, -0.22, -0.06, 0x1d2a44); R(0.45, 0.93, 0.06, 0.22, 0x1d2a44); R(-0.96, -0.2, -0.22, -0.06, 0x1d2a44); R(-0.96, -0.2, 0.06, 0.22, 0x1d2a44); // dual stripes
        E(0.42, -0.5, 0.1, 0.07, DARK); E(0.42, 0.5, 0.1, 0.07, DARK); // bonnet vents
        R(0.97, 1, -0.7, 0.7, DARK); // grille
        glass([[0.2, 0.66], [0.06, 0.74], [-0.45, 0.74], [-0.7, 0.6], [-0.7, -0.6], [-0.45, -0.74], [0.06, -0.74], [0.2, -0.66]]); // fastback glasshouse
        body2([[-0.05, 0.56], [-0.5, 0.56], [-0.5, -0.56], [-0.05, -0.56]], shade(color, 1.12));
        mirrors(0.16, 0.9);
        R(-1, -0.93, -0.7, 0.7, shade(color, 0.6)); // decklid spoiler
      }
      break;
    }
    case "truck": { // full-size pickup (F-150 Raptor: 5.9 x 2.2 m, wheelbase 3.7 m): bonnet, crew cab, open bed, wide arches
      pair(0.68, 0.93, 0.15, 0.36, DARK, true); pair(-0.58, 0.93, 0.15, 0.36); // 35 in tyres
      hull([[1, 0.62], [0.97, 0.84], [0.62, 0.9], [0.4, 0.9], [-0.1, 0.9], [-0.95, 0.9], [-1, 0.86]]); // outline: long overhangs front and rear
      R(0.94, 1, -0.72, 0.72, DARK); R(0.97, 1, -0.5, 0.5, 0xc8ccd6); // grille and bumper
      line([[0.9, 0.4], [0.5, 0.45]], 0.5, shade(color, 0.7)); line([[0.9, -0.4], [0.5, -0.45]], 0.5, shade(color, 0.7)); // bonnet lines
      glass([[0.46, 0.7], [0.4, 0.78], [-0.02, 0.78], [-0.06, 0.7], [-0.06, -0.7], [-0.02, -0.78], [0.4, -0.78], [0.46, -0.7]]); // crew cab
      R(0.26, 0.34, -0.5, 0.5, shade(color, 0.8)); R(0.12, 0.2, -0.46, 0.46, shade(color, 0.8)); // roof rows
      R(-0.12, -0.96, -0.78, 0.78, 0x2a2d34); // bed floor
      R(-0.12, -0.96, -0.82, -0.76, shade(color, 0.85)); R(-0.12, -0.96, 0.76, 0.82, shade(color, 0.85)); R(-0.12, -0.18, -0.82, 0.82, shade(color, 0.85)); R(-0.94, -0.98, -0.82, 0.82, shade(color, 0.85)); // bed walls and tailgate
      for (const x of [-0.3, -0.5, -0.7]) R(x - 0.01, x + 0.01, -0.76, 0.76, 0x1d1f25); // bed ribs
      mirrors(0.34, 0.95); E(0.7, -0.62, 0.05, 0.1, 0xffe9a8); E(0.7, 0.62, 0.05, 0.1, 0xffe9a8);
      break;
    }
    case "tank": { // M1 Abrams (hull 7.9 m, 9.8 m with the gun forward, 3.7 m wide): track belts, side skirts, wedge turret, long barrel
      const hx = 0.6; // the hull's nose; the gun reaches to 1
      R(-1, hx, -1, -0.8, 0x23262e); R(-1, hx, 0.8, 1, 0x23262e); // track belts
      for (let x = -0.97; x < hx - 0.02; x += 0.06) { R(x, x + 0.02, -1, -0.8, 0x3a3d46); R(x, x + 0.02, 0.8, 1, 0x3a3d46); }
      g.poly([[-1, -0.78], [hx * 0.7, -0.78], [hx, -0.5], [hx, 0.5], [hx * 0.7, 0.78], [-1, 0.78]].flatMap(([x, y]) => [x! * hl, y! * hw])).fill(shade(color, 0.85)).stroke(ring); // hull
      for (let i = 0; i < 6; i++) { const x0 = -0.96 + i * 0.26; R(x0, x0 + 0.24, -0.99, -0.8, shade(color, 0.7)); R(x0, x0 + 0.24, 0.8, 0.99, shade(color, 0.7)); } // skirt panels
      R(-0.98, -0.62, -0.6, 0.6, shade(color, 0.6)); for (let i = 0; i < 4; i++) R(-0.95, -0.65, -0.5 + i * 0.26, -0.44 + i * 0.26, DARK); // engine deck and grilles
      line([[hx * 0.7, -0.78], [hx * 0.7, 0.78]], 0.4, DARK);
      g.poly([[0.3, -0.34], [0.46, -0.5], [0.46, 0.5], [0.3, 0.34], [-0.2, 0.58], [-0.58, 0.62], [-0.58, -0.62], [-0.2, -0.58]].flatMap(([x, y]) => [x! * hl * 0.9, y! * hw])).fill(shade(color, 1.05)).stroke({ width: 0.5, color: DARK }); // wedge turret
      R(-0.78, -0.58, -0.5, 0.5, shade(color, 0.7)); // bustle rack
      R(0.26, 1, -0.1, 0.1, DARK); R(0.5, 0.72, -0.16, 0.16, shade(color, 0.7)); R(0.98, 1, -0.14, 0.14, DARK); // barrel, thermal sleeve and muzzle
      g.circle(-hl * 0.22, -hw * 0.26, hw * 0.15).fill(0x1a2430).stroke({ width: 0.4, color: DARK }); // loader's hatch
      g.circle(-hl * 0.2, hw * 0.3, hw * 0.18).fill(shade(color, 0.7)).stroke({ width: 0.4, color: DARK }); // commander's cupola
      R(-0.26, -0.02, 0.28, 0.32, DARK); // machine gun
      break;
    }
    case "superbike": { // sportsbike (Panigale-class, 2.1 x 0.8 m): thin tyres, nose fairing, tank and tail, rider tucked behind the screen
      g.roundRect(-hl, -hw * 0.18, L * 0.26, hw * 0.36, 0.5).fill(DARK); front(hl * 0.98, 0, L * 0.24, hw * 0.28); // 190 and 120 section tyres
      hull([[0.8, 0.14], [0.7, 0.32], [0.42, 0.42], [0.1, 0.4], [-0.3, 0.36], [-0.7, 0.26], [-0.92, 0.12]].map(([x, y]) => [x!, y!])); // fairing, tank, tail
      body2([[0.62, 0.22], [0.4, 0.26], [0.4, -0.26], [0.62, -0.22]], 0x1a2430); // screen
      line([[0.3, 0.9], [0.3, -0.9]], 0.7, DARK); // bars
      R(0.24, 0.3, -1.1, -0.9, DARK); R(0.24, 0.3, 0.9, 1.1, DARK); // mirrors
      R(0.02, 0.26, -0.34, 0.34, shade(color, 0.6)); // tank
      g.ellipse(-hl * 0.22, 0, hl * 0.32, hw * 0.55).fill(shade(color, 0.5)); // rider's back
      g.circle(hl * 0.1, 0, hw * 0.4).fill(0xf1f1ee).stroke({ width: 0.3, color: DARK }); // helmet
      R(-0.95, -0.78, -0.3, 0.3, DARK); // tail light
      break;
    }
    case "buggy": { // Ariel Nomad (3.7 x 1.85 m): open tube frame, two seats side by side, long-travel arms, mid engine, minimal wings
      pair(0.62, 0.9, 0.17, 0.34, DARK, true); pair(-0.58, 0.9, 0.18, 0.4); // 33 in off-road tyres
      for (const s of [-1, 1]) { // double wishbones to each wheel
        line([[0.62, 0.9 * s], [0.34, 0.52 * s]], 0.5, 0x8a8f9a); line([[0.62, 0.82 * s], [0.3, 0.4 * s]], 0.4, 0x8a8f9a);
        line([[-0.58, 0.9 * s], [-0.3, 0.52 * s]], 0.5, 0x8a8f9a); line([[-0.58, 0.82 * s], [-0.26, 0.4 * s]], 0.4, 0x8a8f9a);
        R(0.42, 0.8, 0.62 * s, 0.82 * s, shade(color, 0.8)); R(-0.78, -0.4, 0.62 * s, 0.82 * s, shade(color, 0.8)); // short wings over the wheels
      }
      hull([[0.98, 0.18], [0.82, 0.32], [0.5, 0.42], [0.1, 0.46], [-0.4, 0.46], [-0.85, 0.36], [-0.98, 0.2]].map(([x, y]) => [x!, y!])); // tub: nose, floor and rear deck
      R(0.5, 0.9, -0.22, 0.22, shade(color, 0.75)); // front bodywork with lights
      R(0.93, 0.98, -0.2, -0.08, 0xffe9a8); R(0.93, 0.98, 0.08, 0.2, 0xffe9a8);
      g.roundRect(-hl * 0.5, -hw * 0.44, hl * 0.75, hw * 0.88, 0.4).stroke({ width: 0.8, color: 0x2a2d34 }); // roll cage
      line([[-0.5, 0.44], [0.25, -0.44]], 0.5, 0x2a2d34); line([[-0.5, -0.44], [0.25, 0.44]], 0.5, 0x2a2d34); line([[0.25, 0.44], [0.45, 0.2]], 0.5, 0x2a2d34); line([[0.25, -0.44], [0.45, -0.2]], 0.5, 0x2a2d34);
      for (const y of [-0.22, 0.22]) { g.roundRect(-hl * 0.32, hw * y - hw * 0.15, hl * 0.2, hw * 0.3, 0.3).fill(0x262a33); g.circle(-hl * 0.18, hw * y, hw * 0.12).fill(0xf1f1ee).stroke({ width: 0.3, color: DARK }); } // two seats, two helmets
      R(-0.88, -0.56, -0.3, 0.3, shade(color, 0.55)); R(-0.98, -0.88, -0.46, 0.46, DARK); // engine and exposed rear
      break;
    }
    case "electric": { // Porsche Taycan-class electric GT (4.96 x 1.97 m): flush coupe roof, four-point light bars, aero wheels
      tyres(0.6, -0.55, 0.93, 0.3, 0.34);
      hull([[1, 0.5], [0.96, 0.76], [0.8, 0.86], [0.5, 0.88], [0.1, 0.9], [-0.35, 0.92], [-0.8, 0.86], [-0.96, 0.7], [-1, 0.5]]);
      glass([[0.3, 0.6], [0.14, 0.72], [-0.35, 0.74], [-0.72, 0.52], [-0.72, -0.52], [-0.35, -0.74], [0.14, -0.72], [0.3, -0.6]]); // long sloping glass roof
      body2([[0.0, 0.5], [-0.5, 0.5], [-0.5, -0.5], [0.0, -0.5]], 0x2a3a4a);
      R(0.93, 0.99, -0.72, -0.28, 0x7fe7ff); R(0.93, 0.99, 0.28, 0.72, 0x7fe7ff); // front lights
      R(-1, -0.95, -0.8, 0.8, 0xff5a5a); // full-width rear light bar
      mirrors(0.28, 0.93); R(0.1, 0.8, -0.04, 0.04, shade(color, 0.7));
      break;
    }
    case "dragster": { // Top Fuel dragster (7.6 m): spidery front wheels, blown engine ahead of the driver, huge rear slicks, tall wing
      pair(0.78, 0.55, 0.06, 0.1, 0x2a2d34, true); // narrow front wheels
      pair(-0.74, 0.8, 0.16, 0.42); // 36 x 17.5 in rear slicks
      line([[0.78, 0.55], [0.5, 0.12]], 0.3, DARK); line([[0.78, -0.55], [0.5, -0.12]], 0.3, DARK);
      hull([[0.96, 0.05], [0.85, 0.1], [0.4, 0.14], [-0.2, 0.2], [-0.55, 0.3], [-0.95, 0.3]].map(([x, y]) => [x!, y!])); // chassis and tub
      R(0.62, 0.9, -0.56, 0.56, shade(color, 0.7)); R(0.62, 0.66, -0.56, 0.56, DARK); // front wing
      R(0.04, 0.34, -0.14, 0.14, 0x3a3d46); R(0.1, 0.28, -0.1, 0.1, 0xc8ccd6); R(0.14, 0.24, -0.05, 0.05, DARK); // engine block, blower, injector hat
      for (let i = 0; i < 4; i++) { R(0.06 + i * 0.07, 0.1 + i * 0.07, -0.3, -0.14, 0xb7b09a); R(0.06 + i * 0.07, 0.1 + i * 0.07, 0.14, 0.3, 0xb7b09a); } // headers
      g.ellipse(-hl * 0.42, 0, hl * 0.22, hw * 0.22).fill({ color: 0x1a2430, alpha: 0.95 }).stroke({ width: 0.3, color: DARK }); // cockpit canopy
      g.circle(-hl * 0.38, 0, hw * 0.12).fill(0xf1f1ee); // driver
      R(-1, -0.86, -0.98, 0.98, shade(color, 0.7)); R(-1, -0.86, -1.0, -0.94, DARK); R(-1, -0.86, 0.94, 1.0, DARK); // rear wing
      break;
    }
    // The four racing classes follow real cars seen from above, with the outline measured as fractions of length (x, nose = +1)
    // and half-width (y); wheelbase, overhangs, glasshouse and wing positions come from the real dimensions.
    case "touring": { // BMW 330i (F30) in BTCC trim: 4.64 x 1.81 m, wheelbase 2.81, long bonnet, notchback boot, wing on the lid
      tyres(0.62, -0.55, 0.92, 0.3, 0.3);
      hull([[1, 0.5], [0.97, 0.74], [0.86, 0.84], [0.6, 0.88], [0.15, 0.9], [-0.4, 0.9], [-0.8, 0.87], [-0.96, 0.78], [-1, 0.55]]);
      flare(0.62, 0.9, L * 0.19); flare(-0.55, 0.9, L * 0.19); // arch flares over the wheels
      line([[0.88, 0.4], [0.3, 0.46]], 0.5, shade(color, 0.7)); line([[0.88, -0.4], [0.3, -0.46]], 0.5, shade(color, 0.7)); // bonnet creases
      glass([[0.27, 0.64], [0.12, 0.74], [-0.5, 0.74], [-0.62, 0.62], [-0.62, -0.62], [-0.5, -0.74], [0.12, -0.74], [0.27, -0.64]]);
      body2([[-0.03, 0.56], [-0.37, 0.56], [-0.37, -0.56], [-0.03, -0.56]], shade(color, 1.15)); // roof
      mirrors(0.2, 0.92);
      g.rect(hl * 0.97, -hw * 0.82, hl * 0.06, hw * 1.64).fill(DARK); // splitter
      g.rect(-hl * 1.0, -hw * 0.82, hl * 0.18, hw * 1.64).fill(shade(color, 0.6)).stroke({ width: 0.3, color: DARK }); // BTCC wing
      g.rect(hl * 0.1, -hw * 0.07, hl * 0.35, hw * 0.14).fill({ color: 0xffffff, alpha: 0.7 }); // livery stripe
      break;
    }
    case "prototype": { // Audi R18-style closed prototype: 4.65 x 2.0 m, covered wheels, central tub, bubble canopy, shark fin
      g.roundRect(hl * 0.5, -hw * 1.0, hl * 0.4, hw * 0.46, 1).fill(shade(color, 0.8)).stroke(ring); // front wheel pods
      g.roundRect(hl * 0.5, hw * 0.54, hl * 0.4, hw * 0.46, 1).fill(shade(color, 0.8)).stroke(ring);
      g.roundRect(-hl * 0.88, -hw * 1.0, hl * 0.62, hw * 0.52, 1.4).fill(shade(color, 0.8)).stroke(ring); // rear wheel pods
      g.roundRect(-hl * 0.88, hw * 0.48, hl * 0.62, hw * 0.52, 1.4).fill(shade(color, 0.8)).stroke(ring);
      hull([[1, 0.2], [0.9, 0.4], [0.6, 0.52], [0.2, 0.58], [-0.2, 0.6], [-0.6, 0.5], [-0.9, 0.32], [-1, 0.2]]); // tub
      g.ellipse(hl * 0.05, 0, hl * 0.3, hw * 0.34).fill({ color: 0x1a2430, alpha: 0.95 }).stroke({ width: 0.4, color: DARK }); // canopy
      g.rect(-hl * 0.88, -0.35, hl * 0.78, 0.7).fill(shade(color, 0.6)); // engine cover and fin
      g.rect(hl * 0.94, -hw * 0.96, hl * 0.07, hw * 1.92).fill(DARK); // front splitter
      g.rect(-hl * 1.0, -hw * 0.98, hl * 0.14, hw * 1.96).fill(shade(color, 0.55)).stroke({ width: 0.3, color: DARK }); // rear wing
      break;
    }
    case "gt3": { // Porsche 911 GT3 R: 4.62 x 2.04 m, rear engine, round front wings, short cabin far forward, swan-neck wing
      tyres(0.6, -0.5, 0.94, 0.3, 0.38);
      hull([[1, 0.5], [0.95, 0.72], [0.82, 0.84], [0.62, 0.86], [0.3, 0.82], [-0.05, 0.84], [-0.4, 0.93], [-0.75, 0.95], [-0.93, 0.85], [-1, 0.6]]);
      g.ellipse(hl * 0.74, -hw * 0.6, hl * 0.12, hw * 0.2).fill(shade(color, 1.2)); g.ellipse(hl * 0.74, hw * 0.6, hl * 0.12, hw * 0.2).fill(shade(color, 1.2)); // round headlight pods
      glass([[0.38, 0.58], [0.25, 0.68], [-0.2, 0.7], [-0.5, 0.52], [-0.5, -0.52], [-0.2, -0.7], [0.25, -0.68], [0.38, -0.58]]);
      body2([[0.1, 0.5], [-0.28, 0.5], [-0.28, -0.5], [0.1, -0.5]], shade(color, 1.15)); // roof
      body2([[-0.55, 0.45], [-0.88, 0.45], [-0.88, -0.45], [-0.55, -0.45]], shade(color, 0.8)); // engine lid
      mirrors(0.36, 0.9);
      g.rect(hl * 0.96, -hw * 0.92, hl * 0.06, hw * 1.84).fill(DARK); // splitter
      g.rect(-hl * 0.98, -hw * 0.95, hl * 0.2, hw * 1.9).fill(shade(color, 0.55)).stroke({ width: 0.3, color: DARK }); // wing
      g.rect(-hl * 0.86, -hw * 0.55, 0.5, hw * 0.1).fill(DARK); g.rect(-hl * 0.86, hw * 0.45, 0.5, hw * 0.1).fill(DARK); // swan necks
      break;
    }
    case "gt4": { // Mazda 6 sedan (Atenza) in GT4 trim: 4.87 x 1.84 m, wheelbase 2.83, long deck, lip spoiler
      tyres(0.63, -0.56, 0.9, 0.28, 0.28);
      hull([[1, 0.55], [0.97, 0.76], [0.85, 0.85], [0.55, 0.88], [0.1, 0.88], [-0.45, 0.88], [-0.85, 0.84], [-0.97, 0.72], [-1, 0.5]]);
      glass([[0.28, 0.62], [0.12, 0.72], [-0.5, 0.72], [-0.68, 0.6], [-0.68, -0.6], [-0.5, -0.72], [0.12, -0.72], [0.28, -0.62]]);
      body2([[-0.02, 0.54], [-0.4, 0.54], [-0.4, -0.54], [-0.02, -0.54]], shade(color, 1.12)); // roof
      mirrors(0.22, 0.9);
      line([[0.95, 0.35], [0.3, 0.4]], 0.5, shade(color, 0.7)); line([[0.95, -0.35], [0.3, -0.4]], 0.5, shade(color, 0.7));
      g.rect(hl * 0.98, -hw * 0.7, hl * 0.04, hw * 1.4).fill(DARK); // front lip
      g.rect(-hl * 0.98, -hw * 0.6, hl * 0.07, hw * 1.2).fill(shade(color, 0.6)); // lip spoiler
      g.rect(-hl * 0.2, -hw * 0.06, hl * 0.9, hw * 0.12).fill({ color: 0xffffff, alpha: 0.5 }); // stripe
      break;
    }
    case "jetski": { // sit-down personal watercraft (Sea-Doo RXP-X, 3.3 x 1.2 m): pointed bow, hood, bars, long seat, side footwells, jet nozzle
      g.poly([[1, 0], [0.82, -0.5], [0.4, -0.8], [-0.3, -0.84], [-0.9, -0.7], [-1, -0.45], [-1, 0.45], [-0.9, 0.7], [-0.3, 0.84], [0.4, 0.8], [0.82, 0.5]].flatMap(([x, y]) => [x! * hl, y! * hw])).fill(color).stroke(ring); // hull
      R(0.52, 0.62, -0.1, 0.1, shade(color, 0.7)); // bow eye
      g.poly([[0.82, 0], [0.62, -0.42], [0.1, -0.44], [0.1, 0.44], [0.62, 0.42]].flatMap(([x, y]) => [x! * hl, y! * hw])).fill(shade(color, 1.12)); // hood
      R(0.1, -0.7, -0.62, -0.46, 0x2a2d34); R(0.1, -0.7, 0.46, 0.62, 0x2a2d34); // sponsons/footwells
      g.roundRect(-hl * 0.7, -hw * 0.3, hl * 0.6, hw * 0.6, 1).fill(0x23262e); // seat
      line([[0.3, -0.5], [0.3, 0.5]], 0.8, 0xc8ccd6); // handlebars
      g.circle(-hl * 0.08, 0, hw * 0.24).fill(0xf1f1ee).stroke({ width: 0.3, color: DARK }); // rider
      R(-1.02, -0.9, -0.2, 0.2, 0x3a3d46); // jet nozzle
      break;
    }
    case "speedboat": { // offshore powerboat (39 ft deep-V, 11.9 x 2.6 m): long pointed foredeck, enclosed cockpit, sun pad and quad outboards
      g.poly([[1, 0], [0.8, -0.38], [0.4, -0.78], [-0.2, -0.9], [-0.9, -0.9], [-1, -0.8], [-1, 0.8], [-0.9, 0.9], [-0.2, 0.9], [0.4, 0.78], [0.8, 0.38]].flatMap(([x, y]) => [x! * hl, y! * hw])).fill(color).stroke(ring); // deep-V hull
      line([[1, 0], [-0.7, 0]], 0.4, shade(color, 0.7)); line([[0.8, -0.38], [-0.2, -0.64]], 0.4, shade(color, 0.7)); line([[0.8, 0.38], [-0.2, 0.64]], 0.4, shade(color, 0.7)); // chine and keel lines
      g.poly([[0.16, -0.5], [0.1, -0.3], [0.1, 0.3], [0.16, 0.5], [-0.3, 0.52], [-0.3, -0.52]].flatMap(([x, y]) => [x! * hl, y! * hw])).fill({ color: 0x1a2430, alpha: 0.95 }).stroke({ width: 0.4, color: DARK }); // canopy and windscreen
      R(-0.34, -0.8, -0.4, 0.4, shade(color, 1.2)); // rear sun pad
      for (const y of [-0.54, -0.18, 0.18, 0.54]) R(-1.1, -0.9, y - 0.1, y + 0.1, 0x23262e); // four outboards on the transom
      break;
    }
    case "hovercraft": { // racing hovercraft (Formula Hover, 4.6 x 2.4 m): skirted oval hull, open cockpit, pusher fan in a cage with twin rudders
      g.ellipse(0, 0, hl * 0.92, hw).fill(shade(color, 0.7)).stroke(ring); // skirt
      g.ellipse(0, 0, hl * 0.8, hw * 0.86).fill(color);
      g.poly([[0.62, 0], [0.4, -0.4], [-0.1, -0.52], [-0.1, 0.52], [0.4, 0.4]].flatMap(([x, y]) => [x! * hl, y! * hw])).fill(shade(color, 1.12)); // nose deck
      g.roundRect(-hl * 0.1, -hw * 0.22, hl * 0.3, hw * 0.44, 0.6).fill(0x23262e); // seat
      g.circle(hl * 0.02, 0, hw * 0.2).fill(0xf1f1ee).stroke({ width: 0.3, color: DARK }); // driver
      g.circle(-hl * 0.62, 0, hw * 0.46).fill({ color: 0x000000, alpha: 0.25 }).stroke({ width: 0.6, color: DARK }); // propeller cage
      line([[-0.62, -0.5], [-0.62, 0.5]], 0.5, 0xc8ccd6); line([[-0.62 - 0.35, 0], [-0.62 + 0.35, 0]], 0.5, 0xc8ccd6); // blades
      R(-0.98, -0.9, -0.5, -0.1, shade(color, 0.6)); R(-0.98, -0.9, 0.1, 0.5, shade(color, 0.6)); // rudders
      break;
    }
    case "airboat": { // swamp / racing airboat (5.5 x 2.3 m): flat punt hull, raised seat, caged aero engine and fan on a tall frame, rudders
      g.poly([[1, -0.4], [0.9, -0.62], [-0.8, -0.66], [-0.8, 0.66], [0.9, 0.62], [1, 0.4]].flatMap(([x, y]) => [x! * hl, y! * hw])).fill(color).stroke(ring); // flat hull with square bow
      line([[1, -0.4], [-0.8, -0.4]], 0.4, shade(color, 0.7)); line([[1, 0.4], [-0.8, 0.4]], 0.4, shade(color, 0.7));
      g.roundRect(-hl * 0.2, -hw * 0.3, hl * 0.4, hw * 0.6, 0.6).fill(0xf1f1ee).stroke({ width: 0.4, color: DARK }); // raised bench seat
      g.circle(hl * 0.0, 0, hw * 0.2).fill(0xc8ccd6).stroke({ width: 0.3, color: DARK }); // driver
      g.roundRect(-hl * 0.78, -hw * 0.42, hl * 0.34, hw * 0.84, 0.4).fill(shade(color, 0.6)).stroke({ width: 0.5, color: DARK }); // engine on its frame
      g.roundRect(-hl * 1.02, -hw * 0.9, hl * 0.22, hw * 1.8, 0.4).fill({ color: 0x000000, alpha: 0.2 }).stroke({ width: 0.6, color: DARK }); // fan cage
      R(-1.02, -0.96, -0.9, 0.9, 0xc8ccd6); // blades seen edge-on
      R(-0.98, -0.8, -0.7, -0.5, shade(color, 0.7)); R(-0.98, -0.8, 0.5, 0.7, shade(color, 0.7)); R(-0.98, -0.8, -0.1, 0.1, shade(color, 0.7)); // rudders
      break;
    }
    default: { // rally: Subaru Impreza WRC (4.4 x 1.77 m): stubby saloon, bonnet scoop, roof vent, rally lights, big wing, mudflaps
      tyres(0.62, -0.58, 0.93, 0.3, 0.3);
      hull([[1, 0.52], [0.97, 0.78], [0.84, 0.86], [0.55, 0.88], [0.1, 0.9], [-0.45, 0.9], [-0.85, 0.88], [-0.97, 0.76], [-1, 0.55]]);
      flare(0.62, 0.9, L * 0.2); flare(-0.58, 0.9, L * 0.2);
      R(0.5, 0.88, -0.26, 0.26, shade(color, 0.55)); R(0.55, 0.8, -0.2, 0.2, DARK); // bonnet scoop
      for (const y of [-0.5, -0.32, 0.32, 0.5]) E(0.92, y, 0.04, 0.09, 0xffe9a8); // rally lights
      glass([[0.3, 0.66], [0.14, 0.76], [-0.5, 0.76], [-0.62, 0.64], [-0.62, -0.64], [-0.5, -0.76], [0.14, -0.76], [0.3, -0.66]]);
      body2([[0.0, 0.58], [-0.4, 0.58], [-0.4, -0.58], [0.0, -0.58]], shade(color, 1.12));
      R(-0.22, -0.12, -0.2, 0.2, DARK); // roof vent
      mirrors(0.22, 0.94);
      R(-1, -0.84, -0.9, 0.9, shade(color, 0.6)); R(-1, -0.84, -0.94, -0.88, DARK); R(-1, -0.84, 0.88, 0.94, DARK); // tall wing and endplates
      break;
    }
  }
  const brake = new Graphics().rect(-hl - 0.2, -hw * 0.7, 0.9, hw * 0.45).rect(-hl - 0.2, hw * 0.25, 0.9, hw * 0.45).fill(0xff2a2a);
  brake.visible = false;
  const body = new Container();
  if (isPlayer) body.addChild(new Graphics().circle(0, 0, Math.hypot(hl, hw) + 1.5).fill({ color: 0xbfe0ff, alpha: 0.1 }).stroke({ width: 0.8, color: 0xbfe0ff, alpha: 0.4 })); // a circle round the whole vehicle, whatever its shape
  body.addChild(wheelsBelow, g, brake);
  if (livery && v.domain !== "water") {
    const d = new Graphics();
    // stripes run over the bonnet and the boot and leave the cabin clear, so they never cut across the glass; side stripes run along the flanks
    const bar = (x0: number, x1: number, y0: number, y1: number) => d.rect(x0 * hl, y0 * hw, (x1 - x0) * hl, (y1 - y0) * hw).fill({ color: livery.secondary, alpha: 0.95 });
    const ends = (y0: number, y1: number) => { bar(0.5, 0.94, y0, y1); bar(-0.94, -0.52, y0, y1); };
    if (livery.stripe === 1) ends(-0.16, 0.16);
    else if (livery.stripe === 2) { ends(-0.32, -0.17); ends(0.17, 0.32); }
    else if (livery.stripe === 3) { bar(-0.7, 0.7, -0.8, -0.66); bar(-0.7, 0.7, 0.66, 0.8); }
    body.addChild(d);
    if (livery.number > 0) {
      // a round plate on the roof, in the stripe colour, with the number in whichever of black and white reads better on it
      const lum = (((livery.secondary >> 16) & 255) * 0.299 + ((livery.secondary >> 8) & 255) * 0.587 + (livery.secondary & 255) * 0.114) / 255;
      const r = Math.min(hw * 0.62, hl * 0.24);
      const plate = new Graphics().circle(0, 0, r).fill(livery.secondary).stroke({ width: Math.max(0.2, r * 0.1), color: DARK });
      // (drawn large and scaled down, so it stays sharp however far the camera is zoomed in)
      const t = new Text({ text: String(livery.number), resolution: 4, style: { fontSize: 64, fill: lum > 0.55 ? 0x14161c : 0xffffff, fontWeight: "900", fontFamily: "system-ui, Segoe UI, sans-serif" } });
      t.anchor.set(0.5);
      t.scale.set((r * (livery.number > 9 ? 1.35 : 1.05)) / 64 * 1);
      const badge = new Container();
      badge.addChild(plate, t);
      badge.rotation = Math.PI / 2;
      badge.position.set(-hl * 0.06, 0);
      body.addChild(badge);
    }
  }
  const shadow = new Graphics().roundRect(-hl, -hw, L, W, 1.5).fill({ color: 0x000000, alpha: 0.32 });
  const root = new Container();
  let wake: Graphics | undefined;
  if (v.domain === "water") {
    wake = new Graphics().poly([-hl * 0.8, -hw * 0.5, -hl * 0.8 - 26, -hw * 1.7, -hl * 0.8 - 26, hw * 1.7, -hl * 0.8, hw * 0.5]).fill({ color: 0xffffff, alpha: 0.5 });
    root.addChild(wake);
  }
  root.addChild(shadow, body);
  return { root, body, shadow, brake, steer, wake };
}
