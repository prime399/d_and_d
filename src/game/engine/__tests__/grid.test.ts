import { describe, expect, it } from 'vitest';
import { distance, findPath, gridFromAscii, hasLineOfSight, posKey, reachableTiles } from '../grid';

const g = gridFromAscii([
  '.....',
  '.###.',
  '.....',
]);

describe('grid', () => {
  it('chebyshev distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(3);
    expect(distance({ x: 0, y: 0 }, { x: 4, y: 1 })).toBe(4);
  });

  it('paths around walls', () => {
    const p = findPath(g, { x: 2, y: 0 }, { x: 2, y: 2 })!;
    expect(p).not.toBeNull();
    expect(p.length).toBe(6); // around the wall; diagonals may not cut wall corners
    expect(p.every((s) => !(s.y === 1 && s.x >= 1 && s.x <= 3))).toBe(true);
    expect(p[p.length - 1]).toEqual({ x: 2, y: 2 });
  });

  it('avoids occupied tiles', () => {
    const occ = new Set([posKey({ x: 0, y: 1 })]);
    const p = findPath(g, { x: 0, y: 0 }, { x: 0, y: 2 }, occ)!;
    expect(p.length).toBeGreaterThan(2);
    expect(findPath(g, { x: 0, y: 0 }, { x: 0, y: 1 }, occ)).toBeNull();
  });

  it('line of sight blocked by walls', () => {
    expect(hasLineOfSight(g, { x: 2, y: 0 }, { x: 2, y: 2 })).toBe(false);
    expect(hasLineOfSight(g, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
  });

  it('reachable tiles within N steps', () => {
    const r = reachableTiles(g, { x: 0, y: 0 }, 1);
    expect(r.map((t) => posKey(t.pos)).sort()).toEqual(['0,1', '1,0']);
    expect(reachableTiles(g, { x: 0, y: 0 }, 2).length).toBe(4);
  });
});
