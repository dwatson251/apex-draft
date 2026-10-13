import { Container, Graphics } from "pixi.js";
import { CELL, Rng } from "@apex/sim";

const GRASS = [0x2f6b3a, 0x34763f];
const HILL = [0x2a5e35, 0x32703f, 0x3c844b, 0x4a9a5b];
const ROCK = [0x6c6f78, 0x80838d, 0x9a9da7, 0xb4b7c0];
const TREE = [0x1f5a2b, 0x2a6e35, 0x2f7a3a];
/** How far past the grid the countryside goes, in cells. The camera never sees past it. */
export const MARGIN_CELLS = 4;

export interface Ground {
  /** mown grass: always shown */
  grass: Container;
  /** hills, trees: shown once the whole track is known, because they would show which cells are road */
  decor: Container;
}

export function buildGround(cols: number, rows: number, roadCells: Set<string>, seed: number): Ground {
  const rng = new Rng(seed ^ 0x5eed5eed);
  const W = cols * CELL, H = rows * CELL, M = MARGIN_CELLS * CELL;

  const grass = new Container();
  const g = new Graphics();
  g.rect(-M * 4, -M * 4, W + M * 8, H + M * 8).fill(GRASS[0]!);
  for (let y = -M, k = 0; y < H + M; y += 25, k++) if (k % 2) g.rect(-M, y, W + 2 * M, 25).fill(GRASS[1]!);
  grass.addChild(g);

  const decor = new Container();
  const d = new Graphics();
  const cells: { cx: number; cy: number }[] = [];
  for (let cy = -MARGIN_CELLS; cy < rows + MARGIN_CELLS; cy++) {
    for (let cx = -MARGIN_CELLS; cx < cols + MARGIN_CELLS; cx++) {
      if (!roadCells.has(`${cx},${cy}`)) cells.push({ cx, cy });
    }
  }
  // hills first, back to front, then trees on top
  const hills: { x: number; y: number; r: number; rock: boolean }[] = [];
  const trees: { x: number; y: number; r: number }[] = [];
  for (const { cx, cy } of cells) {
    const outside = cx < 0 || cy < 0 || cx >= cols || cy >= rows;
    if (rng.chance(outside ? 0.7 : 0.45)) {
      hills.push({ x: (cx + 0.5) * CELL + rng.range(-5, 5), y: (cy + 0.5) * CELL + rng.range(-5, 5), r: rng.range(24, 40), rock: rng.chance(0.15) });
    }
    for (let k = rng.int(outside ? 5 : 3); k > 0; k--) {
      trees.push({ x: cx * CELL + rng.range(12, CELL - 12), y: cy * CELL + rng.range(12, CELL - 12), r: rng.range(3.6, 6.4) });
    }
  }
  hills.sort((a, b) => a.y - b.y);
  for (const h of hills) {
    const pal = h.rock ? ROCK : HILL;
    d.ellipse(h.x + h.r * 0.14, h.y + h.r * 0.22, h.r, h.r * 0.85).fill({ color: 0x000000, alpha: 0.22 });
    pal.forEach((col, i) => {
      const k = [1, 0.78, 0.56, 0.34][i]!;
      const e = d.ellipse(h.x - h.r * 0.07 * i, h.y - h.r * 0.09 * i, h.r * k, h.r * 0.85 * k).fill(col);
      if (i === 0) e.stroke({ width: 0.8, color: h.rock ? 0x4b4e57 : 0x1f4a2a, alpha: 0.7 });
    });
  }
  trees.sort((a, b) => a.y - b.y);
  for (const t of trees) {
    d.ellipse(t.x + t.r * 0.5, t.y + t.r * 0.7, t.r, t.r * 0.8).fill({ color: 0x000000, alpha: 0.25 });
    d.circle(t.x, t.y, t.r).fill(rng.pick(TREE)).stroke({ width: 0.7, color: 0x143d1e, alpha: 0.8 });
    d.circle(t.x - t.r * 0.28, t.y - t.r * 0.32, t.r * 0.5).fill({ color: 0x5aa85c, alpha: 0.75 });
  }
  decor.addChild(d);
  return { grass, decor };
}
