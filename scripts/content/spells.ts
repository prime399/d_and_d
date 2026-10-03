// Spell curation: game-ready mechanics hand-tuned per spell; name/level/school/concentration from SRD 2024.
import type { Spell } from '../../src/game/content/types';
import { get } from './srd';

type Mech = Omit<Spell, '_id' | 'slug' | 'name' | 'level' | 'school' | 'concentration' | 'srdVersion'> & { concentration?: boolean };

const MECH: Record<string, Mech> = {
  'fire-bolt': { kind: 'attack', range: 12, dice: '1d10', damageType: 'fire', radius: 0, iconKey: 'fire',
    summary: 'Hurl a mote of fire at a creature you can see. On a hit it takes fire damage.' },
  'ray-of-frost': { kind: 'attack', range: 12, dice: '1d8', damageType: 'cold', radius: 0, iconKey: 'frost',
    summary: 'A frigid beam of blue-white light streaks toward a creature, dealing cold damage and slowing it.' },
  'sacred-flame': { kind: 'save', save: 'dex', range: 12, dice: '1d8', damageType: 'radiant', radius: 0, iconKey: 'holy',
    summary: 'Flame-like radiance descends on a creature. It must dodge with a Dexterity save or take radiant damage; cover does not help.' },
  'magic-missile': { kind: 'attack', range: 12, dice: '3d4+3', damageType: 'force', radius: 0, iconKey: 'arcane',
    summary: 'Three glowing darts of force streak out and strike unerringly. In this game they resolve as one powerful force attack.' },
  'burning-hands': { kind: 'save', save: 'dex', range: 3, dice: '3d6', damageType: 'fire', radius: 1, iconKey: 'fire',
    summary: 'A thin sheet of flame shoots from your outstretched fingers. Creatures in the blast make a Dexterity save, taking half damage on a success.' },
  thunderwave: { kind: 'save', save: 'con', range: 0, dice: '2d8', damageType: 'thunder', radius: 1, iconKey: 'thunder',
    summary: 'A wave of thunderous force bursts out from you. Every creature next to you makes a Constitution save or takes the full blast.' },
  'hold-person': { kind: 'save', save: 'wis', range: 12, inflicts: 'paralyzed', radius: 0, iconKey: 'mind', concentration: true,
    summary: 'Choose a humanoid you can see. On a failed Wisdom save it is Paralyzed while you concentrate, repeating the save at the end of each of its turns.' },
  sleep: { kind: 'save', save: 'wis', range: 12, inflicts: 'unconscious', radius: 1, iconKey: 'sleep', concentration: true,
    summary: 'A wave of drowsiness rolls over a small area. Creatures that fail a Wisdom save fall Unconscious until they take damage or the spell ends.' },
  'shield-of-faith': { kind: 'buff', range: 12, radius: 0, iconKey: 'shield', concentration: true,
    summary: 'A shimmering field surrounds an ally, granting it +2 AC while you concentrate.' },
  bless: { kind: 'buff', range: 6, radius: 0, inflicts: 'blessed', iconKey: 'holy', concentration: true,
    summary: 'You bless an ally. Whenever it makes an attack roll or saving throw, it adds 1d4 to the roll.' },
  'cure-wounds': { kind: 'heal', range: 1, dice: '2d8+3', radius: 0, iconKey: 'heal',
    summary: 'A creature you touch regains hit points as warm light knits its wounds.' },
  'healing-word': { kind: 'heal', range: 12, dice: '2d4+3', radius: 0, iconKey: 'heal',
    summary: 'You speak a word of power and an ally you can see regains hit points, even from across the room.' },
  'guiding-bolt': { kind: 'attack', range: 12, dice: '4d6', damageType: 'radiant', radius: 0, iconKey: 'holy',
    summary: 'A flash of light streaks toward a creature, dealing radiant damage and leaving it glowing so the next attack against it has Advantage.' },
  shatter: { kind: 'save', save: 'con', range: 12, dice: '3d8', damageType: 'thunder', radius: 1, iconKey: 'thunder',
    summary: 'A sudden ringing noise erupts at a point you choose. Creatures nearby make a Constitution save, taking half damage on a success.' },
};

export function buildSpells(): Spell[] {
  return Object.entries(MECH).map(([slug, mech]) => {
    const raw = get('2024', 'Spells', slug);
    const { concentration, ...rest } = mech;
    return {
      _id: `spell.${slug}`,
      slug,
      name: raw.name,
      level: raw.level,
      school: raw.school?.name ?? 'Evocation',
      concentration: Boolean(raw.concentration ?? concentration),
      srdVersion: '2024',
      ...rest,
    } satisfies Spell;
  });
}
