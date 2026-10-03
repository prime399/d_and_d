// Hand-authored heroes (level 3, 5e-correct) and dungeon rooms.
import type { Hero, Room } from '../../src/game/content/types';

export const HEROES: Hero[] = [
  {
    _id: 'hero.brakka', slug: 'brakka', name: 'Brakka Ironhide', className: 'Fighter', level: 3,
    ac: 18, hp: 28, speed: 6,
    abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 12, cha: 10 },
    proficiency: 2,
    attacks: [
      { name: 'Longsword', toHit: 5, damage: '1d8+3', damageType: 'slashing', range: 1 },
      { name: 'Javelin', toHit: 5, damage: '1d6+3', damageType: 'piercing', range: 6 },
    ],
    spells: [], slots: {}, spriteKey: 'knight_m', potions: 2,
    blurb: 'Brakka has never met a door, skull or goblin she could not solve with a longsword.',
  },
  {
    _id: 'hero.elowen', slug: 'elowen', name: 'Elowen Vaire', className: 'Wizard', level: 3,
    ac: 12, hp: 17, speed: 6,
    abilities: { str: 8, dex: 14, con: 12, int: 16, wis: 12, cha: 10 },
    proficiency: 2,
    attacks: [{ name: 'Quarterstaff', toHit: 1, damage: '1d6-1', damageType: 'bludgeoning', range: 1 }],
    spells: ['fire-bolt', 'ray-of-frost', 'magic-missile', 'burning-hands', 'thunderwave', 'hold-person', 'sleep', 'shatter'],
    slots: { 1: 4, 2: 2 }, spellAttack: 5, spellDc: 13, spriteKey: 'wizzard_f', potions: 1,
    blurb: 'Elowen footnotes her fireballs and still singes her eyebrows every time.',
  },
  {
    _id: 'hero.tobin', slug: 'tobin', name: 'Tobin Ashmantle', className: 'Cleric', level: 3,
    ac: 18, hp: 24, speed: 5,
    abilities: { str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 12 },
    proficiency: 2,
    attacks: [{ name: 'Mace', toHit: 4, damage: '1d6+2', damageType: 'bludgeoning', range: 1 }],
    spells: ['sacred-flame', 'guiding-bolt', 'cure-wounds', 'healing-word', 'bless', 'shield-of-faith', 'hold-person'],
    slots: { 1: 4, 2: 2 }, spellAttack: 5, spellDc: 13, spriteKey: 'dwarf_m', potions: 1,
    blurb: 'Tobin prays loudly, heals grudgingly, and keeps a tally of every friend he has dragged back from 0 HP.',
  },
];

export const ROOMS: Room[] = [
  {
    _id: 'room.collapsed-gate', slug: 'collapsed-gate', name: 'The Collapsed Gate', order: 1, music: 'combat',
    description: 'Shattered portcullis bars jut from a slope of rubble where the old keep\'s gate gave way. Two goblins crouch behind the fallen stones, giggling as their mangy wolf strains at a fraying rope. Torchlight flickers on fresh scratch marks: someone came through here recently.',
    encounter: [{ monster: 'goblin', count: 2 }, { monster: 'wolf', count: 1 }],
  },
  {
    _id: 'room.fungus-hall', slug: 'fungus-hall', name: 'The Fungus Hall', order: 2, music: 'combat',
    description: 'Pale mushrooms as tall as men glow a sickly green, filling the air with drifting spores. Giant rats squeal between the stalks while a goblin forager hacks at caps with a rusty blade. In the corner, what looks like a puddle of wet stone begins to move.',
    encounter: [{ monster: 'giant-rat', count: 2 }, { monster: 'gray-ooze', count: 1 }, { monster: 'goblin', count: 1 }],
  },
  {
    _id: 'room.bone-crypt', slug: 'bone-crypt', name: 'The Bone Crypt', order: 3, music: 'combat',
    description: 'Niches of yellowed skulls line the walls, and the floor crunches underfoot. Three skeletons pull themselves from their alcoves, a bloated zombie lurching behind them. Something hungrier waits in the dark, licking its claws.',
    encounter: [{ monster: 'skeleton', count: 3 }, { monster: 'zombie', count: 1 }, { monster: 'ghoul', count: 1 }],
  },
  {
    _id: 'room.imp-shrine', slug: 'imp-shrine', name: 'Shrine of the Imp', order: 4, music: 'combat',
    description: 'Black candles ring a cracked altar smeared with soot and wax. Two robed cultists chant over a cage where a grinning imp drums its fingers, while a hobgoblin sergeant watches the door with crossed arms. The chanting stops the moment the heroes enter.',
    encounter: [{ monster: 'imp', count: 1 }, { monster: 'cultist', count: 2 }, { monster: 'hobgoblin', count: 1 }],
  },
  {
    _id: 'room.bugbear-throne', slug: 'bugbear-throne', name: 'Throne of the Bugbear Chief', order: 5, music: 'boss', isBoss: true,
    description: 'A throne of stacked shields and stolen banners dominates the hall, and on it lounges the Bugbear Chief, picking his teeth with a dagger. His goblin guards snap to attention and a hobgoblin champion draws steel. "More snacks," the chief rumbles, reaching out with impossibly long arms.',
    encounter: [{ monster: 'bugbear', count: 1 }, { monster: 'goblin', count: 2 }, { monster: 'hobgoblin', count: 1 }],
  },
];
