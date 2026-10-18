import { Container, Graphics } from "pixi.js";
import type { Look } from "./look.ts";

interface Cloud { air: Graphics; shadow: Graphics; x: number; y: number; vx: number; vy: number }
interface Bird { body: Container; wings: Graphics; shadow: Graphics; x: number; y: number; vx: number; vy: number; phase: number; life: number }

/** What the sky is doing. Later weather (rain, fog, wind) hangs off this. */
export interface Weather {
  /** 0 to 1: how much of the sky is cloud */
  cover: number;
  /** colour of the cloud undersides */
  tint: number;
  /** falling snow */
  snow: boolean;
  /** flocks of birds */
  birds: boolean;
  /** world units per second, the way clouds drift */
  windX: number;
  windY: number;
}

const SHADOW_DX = 46;
const SHADOW_DY = 62;

/** Clouds drifting over the course, with their shadows on the ground, and the odd flock of birds. */
export class Sky {
  /** shadows go on the ground, under the cars */
  readonly shadows = new Container();
  /** clouds and birds go over everything */
  readonly air = new Container();
  weather: Weather = { cover: 0.5, tint: 0xb7c3d8, snow: false, birds: true, windX: 9, windY: 3 };
  private flakes: { x: number; y: number; vy: number; vx: number; r: number }[] = [];
  private snowG = new Graphics();
  private rainG = new Graphics();
  private dim = new Graphics();
  private rain = 0;
  private drops: { x: number; y: number; v: number; l: number }[] = [];
  private clouds: Cloud[] = [];
  private birds: Bird[] = [];
  private w = 700;
  private h = 500;
  private on = false;
  private fade = 0;
  private nextFlock = 4;

  setBounds(w: number, h: number): void {
    this.w = w; this.h = h;
    this.rebuildClouds();
  }

  /** The sky for a place: how cloudy, whether it snows, whether birds fly. */
  configure(look: Look): void {
    this.weather = { ...this.weather, cover: look.clouds, tint: look.cloudTint, snow: look.snow, birds: look.birds };
    this.rebuildClouds();
    this.flakes = look.snow ? Array.from({ length: 160 }, () => ({ x: Math.random() * (this.w + 400) - 200, y: Math.random() * (this.h + 400) - 200, vy: 14 + Math.random() * 18, vx: -4 + Math.random() * 8, r: 0.5 + Math.random() * 1.1 })) : [];
  }

  /** Clouds and birds only show while the sky is active. */
  setActive(on: boolean): void { this.on = on; }
  isOn(): boolean { return this.on; }

  /** How hard it is raining, 0 to 1: streaks of rain, and the whole scene dimmed. */
  setRain(r: number): void {
    this.rain = r;
    if (r > 0 && this.drops.length === 0) this.drops = Array.from({ length: 260 }, () => ({ x: Math.random() * (this.w + 500) - 250, y: Math.random() * (this.h + 500) - 250, v: 340 + Math.random() * 160, l: 5 + Math.random() * 7 }));
  }

  private rebuildClouds(): void {
    for (const c of this.clouds) { c.air.destroy(); c.shadow.destroy(); }
    this.clouds = [];
    const count = this.weather.cover <= 0 ? 0 : Math.round(2 + this.weather.cover * 6);
    for (let i = 0; i < count; i++) {
      const blobs = Array.from({ length: 5 + Math.floor(Math.random() * 4) }, () => ({
        dx: (Math.random() - 0.5) * 56, dy: (Math.random() - 0.5) * 14, r: 7 + Math.random() * 9,
      }));
      const air = new Graphics(), shadow = new Graphics();
      for (const b of blobs) air.circle(b.dx, b.dy + 3, b.r).fill(this.weather.tint);
      for (const b of blobs) air.circle(b.dx - 1.5, b.dy - 1.5, b.r * 0.9).fill(0xffffff);
      for (const b of blobs) shadow.circle(b.dx, b.dy, b.r).fill(0x000000);
      air.alpha = 0.28 + Math.random() * 0.12;
      shadow.alpha = 0.14;
      const scale = 0.8 + Math.random() * 1.1;
      air.scale.set(scale); shadow.scale.set(scale);
      this.air.addChild(air);
      this.shadows.addChild(shadow);
      const k = 0.6 + Math.random() * 0.8;
      this.clouds.push({
        air, shadow, x: -300 + Math.random() * (this.w + 600), y: -300 + Math.random() * (this.h + 600),
        vx: this.weather.windX * k, vy: this.weather.windY * k,
      });
    }
  }

  private spawnFlock(): void {
    const margin = 60;
    const fromLeft = Math.random() < 0.5;
    const x0 = fromLeft ? -margin : this.w + margin;
    const y0 = Math.random() * this.h;
    const tx = fromLeft ? this.w + margin : -margin, ty = Math.random() * this.h;
    const dist = Math.hypot(tx - x0, ty - y0), speed = 38 + Math.random() * 18;
    const vx = ((tx - x0) / dist) * speed, vy = ((ty - y0) / dist) * speed;
    for (let i = 0, n = 3 + Math.floor(Math.random() * 4); i < n; i++) {
      const body = new Container(), wings = new Graphics(), shadow = new Graphics();
      body.addChild(wings);
      body.rotation = Math.atan2(vy, vx);
      this.air.addChild(body);
      this.shadows.addChild(shadow);
      this.birds.push({
        body, wings, shadow, x: x0 - (vx / speed) * i * 9 + (Math.random() - 0.5) * 14, y: y0 - (vy / speed) * i * 9 + (Math.random() - 0.5) * 14,
        vx, vy, phase: Math.random() * 6, life: dist / speed + 4,
      });
    }
  }

  update(dt: number): void {
    this.fade += ((this.on ? 1 : 0) - this.fade) * (1 - Math.exp(-dt * 1.6));
    const show = this.fade > 0.01;
    this.air.visible = this.shadows.visible = show;
    if (!show) return;
    this.air.alpha = this.shadows.alpha = this.fade;
    for (const c of this.clouds) {
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.x > this.w + 320) { c.x = -320; c.y = -300 + Math.random() * (this.h + 600); }
      if (c.y > this.h + 320) c.y = -320;
      c.air.position.set(c.x, c.y);
      c.shadow.position.set(c.x + SHADOW_DX, c.y + SHADOW_DY);
    }
    // rain: streaks falling at a slant, and a grey-blue dimming of everything
    if (this.rain > 0.02) {
      if (!this.rainG.parent) { this.air.addChild(this.dim, this.rainG); }
      this.dim.clear().rect(-2200, -2200, this.w + 4400, this.h + 4400).fill({ color: 0x0a1a33, alpha: 0.26 * this.rain });
      const g = this.rainG.clear(), shown = Math.floor(this.drops.length * Math.min(1, this.rain));
      for (let i = 0; i < shown; i++) {
        const d = this.drops[i]!;
        d.y += d.v * dt; d.x -= d.v * 0.18 * dt;
        if (d.y > this.h + 250) { d.y = -250; d.x = Math.random() * (this.w + 500) - 250; }
        g.moveTo(d.x, d.y).lineTo(d.x + d.l * 0.18, d.y - d.l);
      }
      g.stroke({ width: 0.9, color: 0xdcebff, alpha: 0.45 + 0.3 * Math.min(1, this.rain) });
    } else if (this.rainG.parent) { this.rainG.clear(); this.dim.clear(); }
    if (this.on && this.weather.birds && (this.nextFlock -= dt) <= 0) { this.spawnFlock(); this.nextFlock = 9 + Math.random() * 14; }
    if (this.weather.snow) {
      if (!this.snowG.parent) this.air.addChild(this.snowG);
      const g = this.snowG.clear();
      for (const f of this.flakes) {
        f.y += f.vy * dt; f.x += (f.vx + Math.sin(f.y * 0.05) * 6 + this.weather.windX * 0.5) * dt;
        if (f.y > this.h + 200) { f.y = -200; f.x = Math.random() * (this.w + 400) - 200; }
        if (f.x > this.w + 200) f.x = -200;
        g.circle(f.x, f.y, f.r).fill({ color: 0xffffff, alpha: 0.85 });
      }
    }
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i]!;
      b.x += b.vx * dt; b.y += b.vy * dt; b.phase += dt * 13; b.life -= dt;
      const flap = Math.sin(b.phase) * 2.6;
      b.wings.clear().moveTo(-0.5, -4.2 + flap * 0.3).lineTo(0.8, flap * -0.2).lineTo(-0.5, 4.2 - flap * 0.3).stroke({ width: 1.2, color: 0x1b1b24, cap: "round", join: "round" });
      b.wings.circle(1.2, 0, 1.1).fill(0x1b1b24);
      b.body.position.set(b.x, b.y);
      b.shadow.clear().ellipse(0, 0, 3.4, 1.8 + Math.abs(flap) * 0.3).fill({ color: 0x000000, alpha: 0.22 });
      b.shadow.position.set(b.x + 16, b.y + 22);
      b.shadow.rotation = b.body.rotation;
      if (b.life <= 0) { b.body.destroy(); b.shadow.destroy(); this.birds.splice(i, 1); }
    }
  }
}
