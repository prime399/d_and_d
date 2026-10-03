import { describe, expect, it } from 'vitest';
import { BLOCKING, getArena, type ArenaMap } from '../maps';
import type { Pos } from '../engine/types';

const LEVELS = [1, 2, 3, 4, 5];
const key = (p: Pos) => `${p.x},${p.y}`;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function reach(a: ArenaMap): Set<string> {
  const seen = new Set<string>(a.heroSpawns.map(key));
  const q = [...a.heroSpawns];
  while (q.length) {
    const p = q.shift()!;
    for (const [dx, dy] of N4) {
      const n = { x: p.x + dx, y: p.y + dy };
      if (n.x < 0 || n.y < 0 || n.x >= a.width || n.y >= a.height) continue;
      if (a.walls[n.y * a.width + n.x] || seen.has(key(n))) continue;
      seen.add(key(n));
      q.push(n);
    }
  }
  return seen;
}
const adjReached = (seen: Set<string>, p: Pos) =>
  N4.some(([dx, dy]) => seen.has(key({ x: p.x + dx, y: p.y + dy })));

describe.each(LEVELS)('level %i', (order) => {
  const a = getArena(order);

  it('has a valid shape and markers', () => {
    expect(a.width).toBeGreaterThanOrEqual(34);
    expect(a.width).toBeLessThanOrEqual(48);
    expect(a.height).toBeGreaterThanOrEqual(22);
    expect(a.height).toBeLessThanOrEqual(32);
    expect(a.rows).toHaveLength(a.height);
    for (const r of a.rows) expect(r).toHaveLength(a.width);
    expect(a.title.length).toBeGreaterThan(0);
    expect(a.heroSpawns).toHaveLength(3);
    expect(a.entrance).toBeDefined();
    expect(a.door).toBeDefined();
  });

  it('has an unbroken outer wall', () => {
    for (let x = 0; x < a.width; x++) {
      expect('#D').toContain(a.rows[0][x]);
      expect(a.rows[a.height - 1][x]).toBe('#');
    }
    for (let y = 0; y < a.height; y++) {
      expect('#D').toContain(a.rows[y][0]);
      expect('#D').toContain(a.rows[y][a.width - 1]);
    }
  });

  it('has 2-4 lairs with at least 4 spawns each', () => {
    expect(a.lairs.length).toBeGreaterThanOrEqual(2);
    expect(a.lairs.length).toBeLessThanOrEqual(4);
    for (const l of a.lairs) {
      expect(l.spawns.length).toBeGreaterThanOrEqual(4);
      expect(l.aggro).toBeGreaterThan(0);
    }
    expect(a.monsterSpawns).toEqual(a.lairs.flatMap((l) => l.spawns));
  });

  it('has 2-3 lore stones with text', () => {
    expect(a.lore.length).toBeGreaterThanOrEqual(2);
    expect(a.lore.length).toBeLessThanOrEqual(3);
    for (const s of a.lore) {
      expect(s.title).not.toBe('Weathered Stone');
      expect(s.text.length).toBeGreaterThan(20);
    }
  });

  it('keeps blocking glyphs off spawns', () => {
    const spawns = [...a.heroSpawns, ...a.monsterSpawns];
    for (const p of spawns) {
      expect(BLOCKING.has(a.rows[p.y][p.x])).toBe(false);
      expect(a.walls[p.y * a.width + p.x]).toBe(false);
    }
  });

  it('is fully reachable from the hero spawns', () => {
    const seen = reach(a);
    for (let y = 0; y < a.height; y++)
      for (let x = 0; x < a.width; x++)
        if (!a.walls[y * a.width + x]) expect(seen.has(key({ x, y })), `floor ${x},${y}`).toBe(true);
    for (const p of a.monsterSpawns) expect(seen.has(key(p))).toBe(true);
    for (const p of [...a.chests, ...a.gold, ...a.lore.map((l) => l.pos), a.door!])
      expect(adjReached(seen, p), `adjacent to ${key(p)}`).toBe(true);
  });
});

describe('boss level', () => {
  it('puts the throne lair last and nearest the door', () => {
    const a = getArena(5);
    const dist = (l: { spawns: Pos[] }) =>
      Math.min(...l.spawns.map((p) => Math.abs(p.x - a.door!.x) + Math.abs(p.y - a.door!.y)));
    const last = a.lairs[a.lairs.length - 1];
    for (const l of a.lairs) expect(dist(last)).toBeLessThanOrEqual(dist(l));
  });
});
