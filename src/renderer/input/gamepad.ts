/** Gamepad input: polls the standard-mapping pad once a frame and turns it into edges, sticks and a "last used" flag. */

/** Standard-mapping button indices. */
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;
export type Btn = (typeof BTN)[keyof typeof BTN];

export interface PadFrame {
  /** sticks after deadzone and response curve, each -1..1 */
  lx: number; ly: number; rx: number; ry: number;
  /** triggers 0..1 */
  lt: number; rt: number;
  held: ReadonlySet<Btn>;
  /** buttons that went down / up since the last frame */
  pressed: ReadonlySet<Btn>;
  released: ReadonlySet<Btn>;
}

/** Radial deadzone, rescaled so the stick still reaches 1, then a power curve for fine control near the centre. */
export function shapeStick(x: number, y: number, deadzone = 0.18, power = 1.8): [number, number] {
  const m = Math.hypot(x, y);
  if (m <= deadzone) return [0, 0];
  const k = Math.pow(Math.min(1, (m - deadzone) / (1 - deadzone)), power) / m;
  return [x * k, y * k];
}

/** Spatial pick of the next item in a direction from `from`: the nearest centre inside a 90 degree cone, else null. */
export function pickNeighbour(from: { x: number; y: number }, items: { x: number; y: number }[], dir: "up" | "down" | "left" | "right"): number | null {
  const [dx, dy] = dir === "up" ? [0, -1] : dir === "down" ? [0, 1] : dir === "left" ? [-1, 0] : [1, 0];
  let best: number | null = null, bs = Infinity;
  items.forEach((c, i) => {
    const vx = c.x - from.x, vy = c.y - from.y;
    const along = vx * dx + vy * dy, across = Math.abs(vx * dy - vy * dx);
    if (along <= 1 || across > along * 1.6) return;
    const score = along + across * 2;
    if (score < bs) { bs = score; best = i; }
  });
  return best;
}

/** Index of the item after (or before) `cur` in a ring of `n`; -1 or out of range starts at the first (or last). */
export function cycle(cur: number, n: number, step: 1 | -1): number {
  if (n <= 0) return -1;
  if (cur < 0 || cur >= n) return step > 0 ? 0 : n - 1;
  return (cur + step + n) % n;
}

export class GamepadInput {
  private prev = new Set<Btn>();
  private id = -1;
  /** true after the pad was last touched, false after the mouse or touch was; drives the cursor and the hints */
  active = false;
  /** "xbox" | "ps" | "switch" | "generic", from the pad's id string, for button glyphs */
  family: "xbox" | "ps" | "switch" | "generic" = "generic";
  deadzone = 0.18;

  constructor(private getPads: () => (Gamepad | null)[] = () => (typeof navigator !== "undefined" && navigator.getGamepads ? Array.from(navigator.getGamepads()) : [])) {}

  /** Call every frame. Returns null when no pad is connected. */
  poll(): PadFrame | null {
    const pads = this.getPads().filter((p): p is Gamepad => !!p && p.connected);
    const pad = pads.find((p) => p.index === this.id) ?? pads[0];
    if (!pad) { this.prev.clear(); this.id = -1; return null; }
    this.id = pad.index;
    this.family = /xbox|xinput|045e/i.test(pad.id) ? "xbox" : /054c|playstation|dualshock|dualsense/i.test(pad.id) ? "ps" : /057e|nintendo|switch/i.test(pad.id) ? "switch" : "generic";
    const held = new Set<Btn>();
    pad.buttons.forEach((b, i) => { if (i <= 15 && (b.pressed || b.value > 0.5)) held.add(i as Btn); });
    const pressed = new Set<Btn>(), released = new Set<Btn>();
    for (const b of held) if (!this.prev.has(b)) pressed.add(b);
    for (const b of this.prev) if (!held.has(b)) released.add(b);
    this.prev = held;
    const ax = (i: number) => pad.axes[i] ?? 0;
    const [lx, ly] = shapeStick(ax(0), ax(1), this.deadzone), [rx, ry] = shapeStick(ax(2), ax(3), this.deadzone);
    const trig = (i: number) => Math.max(0, Math.min(1, pad.buttons[i]?.value ?? 0));
    if (pressed.size || lx || ly || rx || ry) this.active = true;
    return { lx, ly, rx, ry, lt: trig(BTN.LT), rt: trig(BTN.RT), held, pressed, released };
  }

  /** A short rumble, where the pad supports it. */
  rumble(ms = 30, strong = 0.4): void {
    const pad = this.getPads().find((p) => p?.index === this.id) as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | undefined;
    void pad?.vibrationActuator?.playEffect?.("dual-rumble", { duration: ms, strongMagnitude: strong, weakMagnitude: strong / 2 })?.catch?.(() => {});
  }
}
