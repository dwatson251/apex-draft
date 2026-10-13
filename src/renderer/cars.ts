import { Container, Graphics } from "pixi.js";
import { VEHICLES, type Vehicle, type VehicleId } from "@apex/sim";

export interface CarShape { root: Container; body: Container; shadow: Graphics; brake: Graphics }

const DARK = 0x14161c;
const shade = (c: number, k: number): number => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k)), g = Math.min(255, Math.round(((c >> 8) & 255) * k)), b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
};

/** Top-down drawing of each machine, nose pointing along +x, centred on the origin. */
export function buildCar(vehicle: Vehicle | VehicleId, color: number, isPlayer: boolean): CarShape {
  const v = typeof vehicle === "string" ? VEHICLES[vehicle] : vehicle;
  const L = v.length, W = v.width, hl = L / 2, hw = W / 2;
  const ring = { width: isPlayer ? 1.3 : 0.7, color: isPlayer ? 0xffffff : DARK };
  const g = new Graphics();
  const wheel = (x: number, y: number, w = 2.2, h = 1.2) => g.rect(x - w / 2, y - h / 2, w, h).fill(DARK);

  switch (v.id) {
    case "kart": {
      for (const [x, y] of [[-hl * 0.55, -hw], [hl * 0.5, -hw], [-hl * 0.55, hw], [hl * 0.5, hw]] as const) wheel(x, y, 2.2, 1.5);
      g.roundRect(-hl, -hw * 0.62, L, W * 0.62 * 2, 1.2).fill(color).stroke(ring);
      g.roundRect(hl * 0.45, -hw * 0.45, hl * 0.5, hw * 0.9, 0.6).fill(shade(color, 0.7));
      g.circle(-hl * 0.1, 0, hw * 0.46).fill(0xf1f1ee).stroke({ width: 0.5, color: DARK });
      break;
    }
    case "formula": {
      wheel(-hl * 0.55, -hw * 0.95, 2.8, 1.6); wheel(-hl * 0.55, hw * 0.95, 2.8, 1.6); wheel(hl * 0.55, -hw * 0.85, 2.4, 1.4); wheel(hl * 0.55, hw * 0.85, 2.4, 1.4);
      g.rect(hl * 0.84, -hw * 1.05, hl * 0.18, W * 1.05).fill(shade(color, 0.8)); // front wing
      g.rect(-hl * 1.0, -hw * 0.95, hl * 0.2, W * 0.95).fill(shade(color, 0.8)); // rear wing
      g.roundRect(-hl * 0.85, -hw * 0.34, L * 0.88, hw * 0.68, 1.4).fill(color).stroke(ring);
      g.circle(-hl * 0.1, 0, hw * 0.3).fill(0xf1f1ee).stroke({ width: 0.4, color: DARK });
      g.rect(-hl * 0.5, -hw * 0.5, hl * 0.5, hw).fill(shade(color, 0.85));
      break;
    }
    case "muscle": {
      for (const [x, y] of [[-hl * 0.55, -hw], [hl * 0.55, -hw], [-hl * 0.55, hw], [hl * 0.55, hw]] as const) wheel(x, y, 2.6, 1.3);
      g.roundRect(-hl, -hw * 0.88, L, W * 0.88 * 2, 1.4).fill(color).stroke(ring);
      g.rect(-hl * 0.8, -hw * 0.28, L * 0.9, hw * 0.18).fill({ color: 0xffffff, alpha: 0.85 });
      g.rect(-hl * 0.8, hw * 0.1, L * 0.9, hw * 0.18).fill({ color: 0xffffff, alpha: 0.85 });
      g.roundRect(-hl * 0.15, -hw * 0.6, L * 0.34, hw * 1.2, 0.8).fill(DARK);
      g.rect(hl * 0.45, -hw * 0.3, hl * 0.22, hw * 0.6).fill(shade(color, 0.7)); // hood scoop
      break;
    }
    case "truck": {
      for (const [x, y] of [[-hl * 0.6, -hw], [-hl * 0.15, -hw], [hl * 0.62, -hw], [-hl * 0.6, hw], [-hl * 0.15, hw], [hl * 0.62, hw]] as const) wheel(x, y, 2.3, 1.4);
      g.roundRect(-hl, -hw * 0.9, L * 0.62, W * 0.9 * 2, 0.8).fill(0xc8ccd6).stroke(ring); // load box
      g.rect(-hl * 0.85, -hw * 0.7, L * 0.5, hw * 0.1).fill({ color: 0x000000, alpha: 0.18 });
      g.rect(-hl * 0.85, hw * 0.6, L * 0.5, hw * 0.1).fill({ color: 0x000000, alpha: 0.18 });
      g.roundRect(hl * 0.3, -hw * 0.82, L * 0.34, W * 0.82 * 2, 1.2).fill(color).stroke(ring); // cab
      g.rect(hl * 0.5, -hw * 0.62, L * 0.12, hw * 1.24).fill(DARK);
      break;
    }
    case "tank": {
      g.roundRect(-hl, -hw, L, W * 0.3, 0.5).fill(DARK).stroke({ width: 0.4, color: 0x3a3d46 }); // tracks
      g.roundRect(-hl, hw - W * 0.3, L, W * 0.3, 0.5).fill(DARK).stroke({ width: 0.4, color: 0x3a3d46 });
      for (let x = -hl + 0.8; x < hl; x += 1.6) { g.rect(x, -hw, 0.4, W * 0.3).fill(0x3a3d46); g.rect(x, hw - W * 0.3, 0.4, W * 0.3).fill(0x3a3d46); }
      g.roundRect(-hl * 0.9, -hw * 0.66, L * 0.9, W * 0.66 * 2, 1.2).fill(shade(color, 0.7)).stroke(ring);
      g.circle(-hl * 0.1, 0, hw * 0.52).fill(shade(color, 0.9)).stroke({ width: 0.6, color: DARK });
      g.rect(0, -0.5, hl * 1.2, 1).fill(DARK); // barrel
      g.circle(-hl * 0.18, 0, hw * 0.18).fill(DARK);
      break;
    }
    default: { // rally
      for (const [x, y] of [[-hl * 0.55, -hw], [hl * 0.55, -hw], [-hl * 0.55, hw], [hl * 0.55, hw]] as const) wheel(x, y);
      g.roundRect(-hl, -hw * 0.84, L, W * 0.84 * 2, 1.6).fill(color).stroke(ring);
      g.rect(-hl * 0.7, -hw * 0.12, L * 0.72, hw * 0.24).fill({ color: 0xffffff, alpha: 0.5 });
      g.roundRect(hl * 0.05, -hw * 0.6, L * 0.3, hw * 1.2, 0.8).fill(DARK);
      g.rect(-hl * 1.0, -hw * 0.7, hl * 0.14, hw * 1.4).fill(shade(color, 0.7)); // spoiler
    }
  }
  const brake = new Graphics().rect(-hl - 0.2, -hw * 0.7, 0.9, hw * 0.45).rect(-hl - 0.2, hw * 0.25, 0.9, hw * 0.45).fill(0xff2a2a);
  brake.visible = false;
  const body = new Container();
  body.addChild(g, brake);
  const shadow = new Graphics().roundRect(-hl, -hw, L, W, 1.5).fill({ color: 0x000000, alpha: 0.32 });
  const root = new Container();
  root.addChild(shadow, body);
  return { root, body, shadow, brake };
}
