import type { Hero, Monster, Spell } from '../../content/types';
import type { Rng } from '../types';

/** Rng value that makes rollDie(sides) return `face`. */
export const f = (face: number, sides = 20) => (face - 0.5) / sides;

/** Rng that returns the given values in order, then falls back to 0.5. */
export function seq(...vals: number[]): Rng {
  let i = 0;
  return () => (i < vals.length ? vals[i++] : 0.5);
}

const abil = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

export const fighter: Hero = {
  _id: 'hero.fighter', slug: 'fighter', name: 'Fighter', className: 'Fighter', level: 3, ac: 16, hp: 28, speed: 6,
  abilities: { ...abil, str: 16, dex: 12, con: 14 }, proficiency: 2,
  attacks: [
    { name: 'Longsword', toHit: 5, damage: '1d8+3', damageType: 'slashing', range: 1 },
    { name: 'Longbow', toHit: 3, damage: '1d8+1', damageType: 'piercing', range: 12 },
  ],
  spells: [], slots: {}, spriteKey: 'fighter', potions: 2, blurb: '',
};

export const wizard: Hero = {
  _id: 'hero.wizard', slug: 'wizard', name: 'Wizard', className: 'Wizard', level: 3, ac: 12, hp: 16, speed: 6,
  abilities: { ...abil, dex: 14, int: 16, con: 12 }, proficiency: 2,
  attacks: [{ name: 'Dagger', toHit: 4, damage: '1d4+2', damageType: 'piercing', range: 1 }],
  spells: ['fire-bolt', 'burning-hands', 'hold-person', 'bless', 'cure-wounds', 'shield-of-faith', 'web'],
  slots: { 1: 1, 2: 2 }, spellAttack: 5, spellDc: 13, spriteKey: 'wizard', potions: 1, blurb: '',
};

export const goblin: Monster = {
  _id: 'monster.goblin', slug: 'goblin', name: 'Goblin', cr: 0.25, xp: 50, ac: 13, hp: 7, speed: 6,
  abilities: { ...abil, dex: 14 },
  attacks: [{ name: 'Scimitar', toHit: 4, damage: '1d6+2', damageType: 'slashing', range: 1 }],
  spriteKey: 'goblin', srdVersion: '2024',
};

export const wolf: Monster = {
  ...goblin, _id: 'monster.wolf', slug: 'wolf', name: 'Wolf', ac: 13, hp: 11,
  attacks: [{
    name: 'Bite', toHit: 4, damage: '2d4+2', damageType: 'piercing', range: 1,
    inflicts: 'prone', inflictsSave: { ability: 'str', dc: 11 },
  }],
};

export const ghoul: Monster = {
  ...goblin, _id: 'monster.ghoul', slug: 'ghoul', name: 'Ghoul', hp: 22,
  attacks: [{
    name: 'Claws', toHit: 4, damage: '2d4+2', damageType: 'slashing', range: 1,
    inflicts: 'paralyzed', inflictsSave: { ability: 'con', dc: 10 },
  }],
};

const sp = (s: Partial<Spell> & Pick<Spell, 'slug' | 'kind' | 'level'>): Spell => ({
  _id: `spell.${s.slug}`, name: s.slug, school: 'evocation', concentration: false, range: 12,
  summary: '', srdVersion: '2024', ...s,
});

export const spells: Spell[] = [
  sp({ slug: 'fire-bolt', name: 'Fire Bolt', kind: 'attack', level: 0, dice: '1d10', damageType: 'fire' }),
  sp({ slug: 'burning-hands', name: 'Burning Hands', kind: 'save', level: 1, save: 'dex', dice: '3d6', damageType: 'fire', radius: 1, range: 3 }),
  sp({ slug: 'hold-person', name: 'Hold Person', kind: 'save', level: 2, save: 'wis', inflicts: 'paralyzed', concentration: true }),
  sp({ slug: 'web', name: 'Web', kind: 'save', level: 2, save: 'dex', inflicts: 'restrained', concentration: true, radius: 1 }),
  sp({ slug: 'bless', name: 'Bless', kind: 'buff', level: 1, inflicts: 'blessed', concentration: true, radius: 2, range: 0 }),
  sp({ slug: 'cure-wounds', name: 'Cure Wounds', kind: 'heal', level: 1, dice: '2d8+3', range: 1 }),
  sp({ slug: 'shield-of-faith', name: 'Shield of Faith', kind: 'buff', level: 1, concentration: true, range: 12 }),
];
