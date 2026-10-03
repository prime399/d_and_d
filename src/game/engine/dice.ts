// Dice notation parsing and rolling behind an injectable RNG.
import type { AdvState, DiceRoll, Rng } from './types';

export interface DiceTerm {
  count: number;
  sides: number;
}

export interface ParsedDice {
  dice: DiceTerm[];
  modifier: number;
}

/** mulberry32: small seeded PRNG, returns floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rng that replays a fixed list of die faces (for tests); `sides` aware. */
export function scriptedRng(faces: number[], sides = 20): Rng {
  let i = 0;
  return () => {
    const f = faces[i++ % faces.length];
    return (f - 1 + 0.5) / sides;
  };
}

/** Parse "2d6+3", "1d20-1", "d8", "1d4+1d6+2", "5". Throws on invalid notation. */
export function parseDice(notation: string): ParsedDice {
  const s = notation.replace(/\s+/g, '').toLowerCase();
  if (!s || !/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(s)) {
    throw new Error(`Invalid dice notation: ${notation}`);
  }
  const dice: DiceTerm[] = [];
  let modifier = 0;
  for (const m of s.matchAll(/([+-]?)(\d*d\d+|\d+)/g)) {
    const sign = m[1] === '-' ? -1 : 1;
    const term = m[2];
    if (term.includes('d')) {
      const [c, sd] = term.split('d');
      const count = c === '' ? 1 : parseInt(c, 10);
      const sides = parseInt(sd, 10);
      if (sides < 1 || sign < 0) throw new Error(`Invalid dice notation: ${notation}`);
      dice.push({ count, sides });
    } else {
      modifier += sign * parseInt(term, 10);
    }
  }
  return { dice, modifier };
}

export function rollDie(sides: number, rng: Rng): number {
  return Math.floor(rng() * sides) + 1;
}

/**
 * Roll notation. With `crit`, the number of dice is doubled (modifiers are not).
 * `rolls` contains every individual face rolled.
 */
export function roll(notation: string, rng: Rng, opts: { crit?: boolean } = {}): DiceRoll {
  const { dice, modifier } = parseDice(notation);
  const rolls: number[] = [];
  for (const d of dice) {
    const n = opts.crit ? d.count * 2 : d.count;
    for (let i = 0; i < n; i++) rolls.push(rollDie(d.sides, rng));
  }
  const total = rolls.reduce((a, b) => a + b, 0) + modifier;
  return {
    notation: opts.crit ? critNotation(notation) : notation,
    rolls,
    total: Math.max(0, total),
    sides: dice[0]?.sides ?? 0,
  };
}

function critNotation(notation: string): string {
  return notation.replace(/(\d*)d(\d+)/gi, (_, c: string, s: string) => `${(c === '' ? 1 : +c) * 2}d${s}`);
}

/** Combine advantage and disadvantage sources: any of both cancels out. */
export function resolveAdvantage(adv: boolean, dis: boolean): AdvState {
  if (adv && !dis) return 'adv';
  if (dis && !adv) return 'dis';
  return undefined;
}

export interface D20Result {
  roll: DiceRoll;
  /** the face that counts */
  natural: number;
  total: number;
  advantage: AdvState;
}

/** Roll a d20 + modifier, with optional advantage/disadvantage (rolls has 1 or 2 faces). */
export function rollD20(modifier: number, rng: Rng, advantage?: AdvState): D20Result {
  const a = rollDie(20, rng);
  const faces = [a];
  let natural = a;
  if (advantage) {
    const b = rollDie(20, rng);
    faces.push(b);
    natural = advantage === 'adv' ? Math.max(a, b) : Math.min(a, b);
  }
  const total = natural + modifier;
  const sign = modifier >= 0 ? `+${modifier}` : `${modifier}`;
  const notation = `${advantage ? '2d20' + (advantage === 'adv' ? 'kh1' : 'kl1') : '1d20'}${modifier ? sign : ''}`;
  return { roll: { notation, rolls: faces, total, sides: 20 }, natural, total, advantage };
}

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}
