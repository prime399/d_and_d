import { describe, expect, it } from 'vitest';
import { mulberry32, parseDice, resolveAdvantage, roll, rollD20 } from '../dice';
import { f, seq } from './fixtures';

describe('dice', () => {
  it('parses notation', () => {
    expect(parseDice('1d20+5')).toEqual({ dice: [{ count: 1, sides: 20 }], modifier: 5 });
    expect(parseDice('2d6+3')).toEqual({ dice: [{ count: 2, sides: 6 }], modifier: 3 });
    expect(parseDice('1d8')).toEqual({ dice: [{ count: 1, sides: 8 }], modifier: 0 });
    expect(parseDice('3d4+3')).toEqual({ dice: [{ count: 3, sides: 4 }], modifier: 3 });
    expect(parseDice('d6-1').modifier).toBe(-1);
    expect(() => parseDice('2x6')).toThrow();
  });

  it('rolls individual faces', () => {
    const r = roll('2d6+3', seq(f(4, 6), f(6, 6)));
    expect(r).toEqual({ notation: '2d6+3', rolls: [4, 6], total: 13, sides: 6 });
  });

  it('crit doubles dice, not modifiers', () => {
    const r = roll('2d6+3', seq(f(1, 6), f(2, 6), f(3, 6), f(4, 6)), { crit: true });
    expect(r.rolls).toEqual([1, 2, 3, 4]);
    expect(r.total).toBe(13);
    expect(r.notation).toBe('4d6+3');
  });

  it('seeded rng is deterministic and in range', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const x = roll('1d20', a).total;
      expect(x).toBe(roll('1d20', b).total);
      expect(x).toBeGreaterThanOrEqual(1);
      expect(x).toBeLessThanOrEqual(20);
    }
  });

  it('advantage takes highest, disadvantage lowest', () => {
    expect(rollD20(2, seq(f(5), f(17)), 'adv')).toMatchObject({ natural: 17, total: 19 });
    expect(rollD20(2, seq(f(5), f(17)), 'dis')).toMatchObject({ natural: 5, total: 7 });
    expect(rollD20(0, seq(f(5), f(17))).roll.rolls).toEqual([5]);
  });

  it('advantage and disadvantage cancel', () => {
    expect(resolveAdvantage(true, true)).toBeUndefined();
    expect(resolveAdvantage(true, false)).toBe('adv');
    expect(resolveAdvantage(false, true)).toBe('dis');
  });
});
