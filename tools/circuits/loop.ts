import { dist, pathLength, type OsmWay, type Pt } from "./osm.ts";

export interface Edge { way: OsmWay; pts: Pt[]; from: number; to: number; len: number }

/** Join ways end to end into directed edges between junction nodes (ends within `tol` metres are the same node). */
export function graph(ways: OsmWay[], proj: (g: { lat: number; lon: number }) => Pt, tol = 4, directed = true): { edges: Edge[]; nodes: Pt[] } {
  const nodes: Pt[] = [];
  const nodeAt = (p: Pt): number => {
    for (let i = 0; i < nodes.length; i++) if (dist(nodes[i]!, p) < tol) return i;
    nodes.push(p);
    return nodes.length - 1;
  };
  const edges: Edge[] = [];
  for (const way of ways) {
    const pts = way.geometry.map(proj);
    if (pts.length < 2) continue;
    const e: Edge = { way, pts, from: nodeAt(pts[0]!), to: nodeAt(pts.at(-1)!), len: pathLength(pts) };
    edges.push(e);
    if (!directed || way.tags.oneway !== "yes") edges.push({ way, pts: [...pts].reverse(), from: e.to, to: e.from, len: e.len });
  }
  return { edges, nodes };
}

/** Every simple directed cycle through the node of `via` (a way id), as lists of edges. Small graphs only. */
export function cyclesThrough(edges: Edge[], via: number, limit = 200): Edge[][] {
  const start = edges.find((e) => e.way.id === via);
  if (!start) throw new Error(`no way ${via}`);
  const out: Edge[][] = [];
  const used = new Set<number>();
  const visitedNodes = new Set<number>();
  const walk = (path: Edge[], at: number) => {
    if (out.length >= limit) return;
    for (const e of edges) {
      if (e.from !== at) continue;
      if (used.has(e.way.id)) continue;
      if (e.to === start.from) { out.push([...path, e]); continue; }
      if (visitedNodes.has(e.to)) continue;
      used.add(e.way.id); visitedNodes.add(e.to);
      walk([...path, e], e.to);
      used.delete(e.way.id); visitedNodes.delete(e.to);
    }
  };
  used.add(start.way.id); visitedNodes.add(start.from); visitedNodes.add(start.to);
  walk([start], start.to);
  return out;
}

/** Mend small gaps in a mapped lap: ways whose ends hang loose are joined to the nearest other loose end within `maxGap` metres. */
export function bridgeGaps(edges: Edge[], nodes: Pt[], maxGap: number): number {
  const degree = new Map<number, number>();
  for (const e of edges) degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
  const loose = [...degree.entries()].filter(([, d]) => d === 1).map(([n]) => n);
  const used = new Set<number>();
  let made = 0;
  for (const a of loose) {
    if (used.has(a)) continue;
    let best = -1, bd = maxGap;
    for (const b of loose) {
      if (b === a || used.has(b)) continue;
      const d = dist(nodes[a]!, nodes[b]!);
      if (d < bd) { bd = d; best = b; }
    }
    if (best < 0) continue;
    used.add(a); used.add(best);
    const pts = [nodes[a]!, nodes[best]!];
    const way = { id: -(++made), tags: {}, geometry: [] } as OsmWay;
    edges.push({ way, pts, from: a, to: best, len: bd }, { way, pts: [...pts].reverse(), from: best, to: a, len: bd });
  }
  return made;
}
