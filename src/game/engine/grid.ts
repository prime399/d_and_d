// Tile grid helpers: walkability, 5e distance (diagonals cost 1), LOS, pathfinding.
import type { Grid, Pos } from './types';

export function createGrid(width: number, height: number, walls: Pos[] = []): Grid {
  const g: Grid = { width, height, walls: new Array(width * height).fill(false) };
  for (const w of walls) setWall(g, w, true);
  return g;
}

/** Build a grid from ASCII rows: '#' = wall, anything else = floor. */
export function gridFromAscii(rows: string[]): Grid {
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const g = createGrid(width, height);
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' && setWall(g, { x, y }, true)));
  return g;
}

export function setWall(g: Grid, p: Pos, wall: boolean): void {
  if (inBounds(g, p)) g.walls[p.y * g.width + p.x] = wall;
}

export function inBounds(g: Grid, p: Pos): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < g.width && p.y < g.height;
}

export function isWall(g: Grid, p: Pos): boolean {
  return !inBounds(g, p) || g.walls[p.y * g.width + p.x];
}

/** In bounds, not a wall, and not in `occupied` (keys from posKey). */
export function isWalkable(g: Grid, p: Pos, occupied?: Set<string>): boolean {
  return !isWall(g, p) && !(occupied?.has(posKey(p)) ?? false);
}

export const posKey = (p: Pos): string => `${p.x},${p.y}`;
export const samePos = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y;

/** Chebyshev distance: 5e grid where diagonals cost 1. */
export function distance(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Bresenham line of sight; endpoints never block, walls in between do. */
export function hasLineOfSight(g: Grid, a: Pos, b: Pos): boolean {
  let x0 = a.x, y0 = a.y;
  const dx = Math.abs(b.x - x0), dy = -Math.abs(b.y - y0);
  const sx = x0 < b.x ? 1 : -1, sy = y0 < b.y ? 1 : -1;
  let err = dx + dy;
  while (!(x0 === b.x && y0 === b.y)) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
    if (x0 === b.x && y0 === b.y) break;
    if (isWall(g, { x: x0, y: y0 })) return false;
  }
  return true;
}

const DIRS: Pos[] = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];

/** Walkable neighbours; diagonal steps may not cut wall corners. */
export function neighbors(g: Grid, p: Pos, occupied?: Set<string>): Pos[] {
  const out: Pos[] = [];
  for (const d of DIRS) {
    const n = { x: p.x + d.x, y: p.y + d.y };
    if (!isWalkable(g, n, occupied)) continue;
    if (d.x !== 0 && d.y !== 0 && (isWall(g, { x: p.x + d.x, y: p.y }) || isWall(g, { x: p.x, y: p.y + d.y }))) continue;
    out.push(n);
  }
  return out;
}

/**
 * BFS shortest path from `from` to `to` (exclusive of start, inclusive of goal).
 * Returns null if unreachable. `occupied` tiles are blocked, except the goal
 * when `allowOccupiedGoal` is set.
 */
export function findPath(
  g: Grid, from: Pos, to: Pos, occupied?: Set<string>, allowOccupiedGoal = false,
): Pos[] | null {
  if (samePos(from, to)) return [];
  const goalKey = posKey(to);
  const occ = occupied && allowOccupiedGoal ? new Set([...occupied].filter((k) => k !== goalKey)) : occupied;
  if (!isWalkable(g, to, occ)) return null;
  const prev = new Map<string, Pos | null>([[posKey(from), null]]);
  const queue: Pos[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (samePos(cur, to)) {
      const path: Pos[] = [];
      let c: Pos | null = cur;
      while (c && !samePos(c, from)) { path.unshift(c); c = prev.get(posKey(c)) ?? null; }
      return path;
    }
    for (const n of neighbors(g, cur, occ)) {
      const k = posKey(n);
      if (!prev.has(k)) { prev.set(k, cur); queue.push(n); }
    }
  }
  return null;
}

/** All tiles reachable within `steps` moves (excludes the start), with their step cost. */
export function reachableTiles(g: Grid, from: Pos, steps: number, occupied?: Set<string>): { pos: Pos; cost: number }[] {
  const seen = new Map<string, number>([[posKey(from), 0]]);
  const out: { pos: Pos; cost: number }[] = [];
  let frontier: Pos[] = [from];
  for (let s = 1; s <= steps && frontier.length; s++) {
    const next: Pos[] = [];
    for (const p of frontier) {
      for (const n of neighbors(g, p, occupied)) {
        const k = posKey(n);
        if (seen.has(k)) continue;
        seen.set(k, s);
        out.push({ pos: n, cost: s });
        next.push(n);
      }
    }
    frontier = next;
  }
  return out;
}

/** Tiles within Chebyshev `radius` of center (inclusive, in bounds). */
export function tilesInRadius(g: Grid, center: Pos, radius: number): Pos[] {
  const out: Pos[] = [];
  for (let y = center.y - radius; y <= center.y + radius; y++)
    for (let x = center.x - radius; x <= center.x + radius; x++)
      if (inBounds(g, { x, y })) out.push({ x, y });
  return out;
}
