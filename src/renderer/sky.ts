import { Container, Graphics } from "pixi.js";

interface Cloud { air: Graphics; shadow: Graphics; x: number; y: number; vx: number; vy: number }
interface Bird { body: Container; wings: Graphics; shadow: Graphics; x: number; y: number; vx: number; vy: number; phase: number; life: number }

/** What the sky is doing. Later weather (rain, fog, wind) hangs off this. */
export interface Weather {
  /** 0 to 1: how much of the sky is cloud */
  cover: number;
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
  weather: Weather = { cover: 0.5, windX: 9, windY: 3 };
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

  /** Clouds and birds only show while the sky is active. */
  setActive(on: boolean): void { this.on = on; }
  isOn(): boolean { return this.on; }

  private rebuildClouds(): void {
    for (const c of this.clouds) { c.air.destroy(); c.shadow.destroy(); }
    this.clouds = [];
    const count = Math.round(2 + this.weather.cover * 6);
    for (let i = 0; i < count; i++) {
      const blobs = Array.from({ length: 5 + Math.floor(Math.random() * 4) }, () => ({
        dx: (Math.random() - 0.5) * 56, dy: (Math.random() - 0.5) * 14, r: 7 + Math.random() * 9,
      }));
      const air = new Graphics(), shadow = new Graphics();
      for (const b of blobs) air.circle(b.dx, b.dy + 3, b.r).fill(0xb7c3d8);
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
    if (this.on && (this.nextFlock -= dt) <= 0) { this.spawnFlock(); this.nextFlock = 9 + Math.random() * 14; }
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
