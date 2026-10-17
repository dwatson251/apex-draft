import { Container, Graphics, Text } from "pixi.js";

/**
 * Name labels over the cars of the player and the other online racers: a name above a small triangle pointing down at the car.
 * With many in one place the player's name always wins, and the rest are shown as far as they fit: first the name is dropped
 * (the arrow stays), then, if arrows themselves pile up, the least important are hidden. Pure layout lives in `declutterLabels`.
 */

export interface LabelItem {
  id: string;
  /** the car's place on screen, pixels */
  x: number; y: number;
  /** how wide the name is, pixels */
  w: number;
  /** lower is more important; the player is 0 */
  priority: number;
  /** never dropped, whatever is in the way */
  always?: boolean;
}

export interface LabelPlace { id: string; text: boolean; arrow: boolean; /** pixels the name was lifted to clear another */ lift: number }

export interface LabelMetrics { width: number; height: number; textH: number; arrow: number; gap: number; lift: number }
export const LABEL_METRICS = { textH: 16, arrow: 9, gap: 3, lift: 18 };

interface Rect { x0: number; y0: number; x1: number; y1: number }
const hit = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export function declutterLabels(items: LabelItem[], screen: { width: number; height: number }, m = LABEL_METRICS): LabelPlace[] {
  const margin = 24;
  const order = [...items].sort((a, b) => (a.always ? -1 : 0) - (b.always ? -1 : 0) || a.priority - b.priority || (a.id < b.id ? -1 : 1));
  const taken: Rect[] = [];
  const out: LabelPlace[] = [];
  for (const it of order) {
    // off the screen (or nearly): nothing to point at
    if (it.x < -margin || it.y < -margin || it.x > screen.width + margin || it.y > screen.height + margin) { out.push({ id: it.id, text: false, arrow: false, lift: 0 }); continue; }
    const arrow: Rect = { x0: it.x - m.arrow / 2, x1: it.x + m.arrow / 2, y1: it.y - m.gap, y0: it.y - m.gap - m.arrow };
    if (!it.always && taken.some((t) => hit(t, arrow))) { out.push({ id: it.id, text: false, arrow: false, lift: 0 }); continue; }
    taken.push(arrow);
    let placed = false, lift = 0;
    for (let step = 0; step < 3 && !placed; step++) {
      const bottom = arrow.y0 - 2 - step * m.lift;
      const r: Rect = { x0: it.x - it.w / 2 - 3, x1: it.x + it.w / 2 + 3, y1: bottom, y0: bottom - m.textH };
      if (it.always || !taken.some((t) => hit(t, r))) { taken.push(r); placed = true; lift = step * m.lift; }
    }
    out.push({ id: it.id, text: placed, arrow: true, lift });
  }
  return out;
}

const PLAYER_ARROW = 0xffcf3f;

interface Slot { root: Container; text: Text; tri: Graphics; name: string; color: number; w: number; alpha: number; arrowAlpha: number }

/** The Pixi side: pooled labels in screen space, faded in and out as the layout changes. */
export class LabelLayer {
  readonly root = new Container();
  private slots = new Map<string, Slot>();

  constructor() { this.root.eventMode = "none"; }

  /** Create (or rename) the label for an id and report how wide its name is. */
  measure(id: string, name: string, color: number): number {
    let s = this.slots.get(id);
    if (!s) {
      const text = new Text({ text: name, style: { fontSize: 14, fontWeight: "700", fill: color, stroke: { color: 0x10131a, width: 3 }, fontFamily: "system-ui, sans-serif" } });
      text.anchor.set(0.5, 1);
      const tri = new Graphics();
      const root = new Container();
      root.addChild(tri, text);
      root.visible = false;
      this.root.addChild(root);
      s = { root, text, tri, name, color, w: 0, alpha: 0, arrowAlpha: 0 };
      this.slots.set(id, s);
      this.paint(s, color);
    }
    if (s.name !== name) { s.name = name; s.text.text = name; }
    if (s.color !== color) this.paint(s, color);
    s.w = s.text.width;
    return s.w;
  }

  private paint(s: Slot, color: number): void {
    s.color = color;
    s.text.style.fill = color;
    const a = LABEL_METRICS.arrow;
    s.tri.clear().poly([-a / 2, -a, a / 2, -a, 0, 0]).fill(color).stroke({ width: 1.5, color: 0x10131a });
  }

  /** Lay out and draw. `items` are the cars that want a label; anything not in it fades out. */
  update(items: LabelItem[], screen: { width: number; height: number }, dt: number): void {
    const placed = new Map(declutterLabels(items, screen).map((p) => [p.id, p]));
    const wanted = new Map(items.map((i) => [i.id, i]));
    const k = 1 - Math.exp(-dt * 14);
    for (const [id, s] of this.slots) {
      const it = wanted.get(id), p = placed.get(id);
      const showArrow = !!(it && p?.arrow), showText = !!(it && p?.text);
      s.arrowAlpha += ((showArrow ? 1 : 0) - s.arrowAlpha) * k;
      s.alpha += ((showText ? 1 : 0) - s.alpha) * k;
      s.root.visible = s.arrowAlpha > 0.02;
      if (!s.root.visible) continue;
      if (it) s.root.position.set(Math.round(it.x), Math.round(it.y - LABEL_METRICS.gap));
      s.tri.alpha = s.arrowAlpha;
      s.text.alpha = s.alpha;
      s.text.position.set(0, -LABEL_METRICS.arrow - 2 - (p?.lift ?? 0));
    }
  }

  /** Forget labels for cars that are gone (a new race). */
  clear(): void {
    for (const s of this.slots.values()) s.root.destroy({ children: true });
    this.slots.clear();
  }
}

export { PLAYER_ARROW };
