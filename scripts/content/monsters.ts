// Monster curation: SRD stat blocks -> Monster[] (prefers 2024 data).
import type { AbilityKey, Attack, Monster, SrdVersion } from '../../src/game/content/types';
import { feetToTiles, get, type Raw } from './srd';

interface Pick {
  slug: string;
  source: SrdVersion;
  index: string;
  name?: string;
  spriteKey: string;
  description: string;
  /** action names to keep (default: all with attack_bonus) */
  only?: string[];
  /** extra fields per attack name */
  inflicts?: Record<string, Pick['inflictsEntry']>;
  inflictsEntry?: { slug: string; ability: AbilityKey; dc: number };
}

const PICKS: Pick[] = [
  { slug: 'goblin', source: '2024', index: 'goblin-warrior', name: 'Goblin', spriteKey: 'goblin',
    description: 'A wiry, cackling raider that fights dirty and flees the moment the odds turn. Goblins love ambushes and hate fair fights.' },
  { slug: 'hobgoblin', source: '2024', index: 'hobgoblin-warrior', name: 'Hobgoblin', spriteKey: 'masked_orc',
    description: 'A disciplined goblinoid soldier in lacquered armour. Hobgoblins hold the line and bark orders at their smaller kin.' },
  { slug: 'orc', source: '2014', index: 'orc', spriteKey: 'orc_warrior',
    description: 'A tusked brute hefting a greataxe, fuelled by rage and the promise of plunder.' },
  { slug: 'cultist', source: '2024', index: 'cultist', spriteKey: 'orc_shaman',
    description: 'A hooded zealot clutching a ritual sickle, muttering prayers to something that should stay asleep.' },
  { slug: 'skeleton', source: '2024', index: 'skeleton', spriteKey: 'skelet',
    description: 'Rattling bones bound together by old necromancy. It remembers how to use a sword and nothing else.' },
  { slug: 'zombie', source: '2024', index: 'zombie', spriteKey: 'zombie',
    description: 'A shambling corpse that keeps coming no matter how many pieces it loses.' },
  { slug: 'ogre', source: '2024', index: 'ogre', spriteKey: 'ogre',
    description: 'A hulking, dim-witted giant swinging a tree-trunk club. One good hit can flatten an adventurer.' },
  { slug: 'imp', source: '2024', index: 'imp', spriteKey: 'imp', only: ['Sting'],
    description: 'A tiny, sneering fiend with a venomous tail, always whispering bad advice to its master.' },
  { slug: 'giant-rat', source: '2024', index: 'giant-rat', spriteKey: 'tiny_zombie',
    description: 'A dog-sized, mangy rat with yellow teeth. Alone it is a nuisance; in a pack it is a problem.' },
  { slug: 'bugbear', source: '2024', index: 'bugbear-warrior', name: 'Bugbear', spriteKey: 'big_zombie',
    description: 'The self-crowned Bugbear Chief: a shaggy, long-armed brute who grabs prey from surprising reach and pounds it with a hammer.',
    inflicts: { Grab: { slug: 'grappled', ability: 'str', dc: 12 } } },
  { slug: 'lizardfolk', source: '2014', index: 'lizardfolk', spriteKey: 'lizard_m', only: ['Bite', 'Heavy Club', 'Javelin'],
    description: 'A cold-eyed reptilian hunter that sees other creatures mostly as meat.' },
  { slug: 'ghoul', source: '2024', index: 'ghoul', spriteKey: 'ice_zombie',
    description: 'A gaunt, grave-robbing undead whose filthy claws can lock a victim\'s muscles rigid.',
    inflicts: { Claw: { slug: 'paralyzed', ability: 'con', dc: 10 } } },
  { slug: 'gray-ooze', source: '2024', index: 'gray-ooze', spriteKey: 'swampy',
    description: 'A slick puddle of corrosive slime that looks like wet stone until it lashes out.' },
  { slug: 'wolf', source: '2024', index: 'wolf', spriteKey: 'wogol',
    description: 'A lean grey wolf that circles, waits, and drags its prey to the ground.',
    inflicts: { Bite: { slug: 'prone', ability: 'str', dc: 11 } } },
  { slug: 'giant-spider', source: '2024', index: 'giant-spider', spriteKey: 'chort', only: ['Bite'],
    description: 'A horse-sized spider with venom-slick fangs, lurking above webbed doorways.' },
];

function attackFrom(a: Raw): Attack | null {
  if (typeof a.attack_bonus !== 'number' || !a.damage?.length) return null;
  const d = a.damage[0];
  const dice: string | undefined = d.damage_dice ?? d.from?.options?.[0]?.damage_dice;
  const type: string | undefined = d.damage_type?.name ?? d.from?.options?.[0]?.damage_type?.name;
  if (!dice || !type) return null;
  const desc: string = a.desc ?? '';
  let range = 1;
  const ranged = desc.match(/range (\d+)\/\d+ ?ft/i);
  if (/ranged/i.test(desc.split(':')[0] ?? '') && ranged) range = feetToTiles(ranged[1], 12);
  return { name: a.name, toHit: a.attack_bonus, damage: dice.replace(/\s+/g, ''), damageType: type.toLowerCase(), range };
}

function ac(raw: Raw): number {
  return Math.max(...(raw.armor_class as Raw[]).map((x) => x.value as number));
}

export function buildMonsters(): Monster[] {
  return PICKS.map((p) => {
    const raw = get(p.source, 'Monsters', p.index);
    const attacks: Attack[] = [];
    for (const a of raw.actions as Raw[]) {
      if (a.name === 'Multiattack') continue;
      if (p.only && !p.only.includes(a.name)) continue;
      const atk = attackFrom(a);
      if (!atk) continue;
      const inf = p.inflicts?.[a.name];
      if (inf) {
        atk.inflicts = inf.slug;
        atk.inflictsSave = { ability: inf.ability, dc: inf.dc };
      }
      attacks.push(atk);
    }
    if (!attacks.length) throw new Error(`No attacks parsed for ${p.slug}`);
    const m: Monster = {
      _id: `monster.${p.slug}`,
      slug: p.slug,
      name: p.name ?? raw.name,
      cr: raw.challenge_rating,
      xp: raw.xp,
      ac: ac(raw),
      hp: raw.hit_points,
      speed: Math.min(8, feetToTiles(raw.speed?.walk ?? '30 ft.', 8)),
      abilities: {
        str: raw.strength, dex: raw.dexterity, con: raw.constitution,
        int: raw.intelligence, wis: raw.wisdom, cha: raw.charisma,
      },
      attacks,
      spriteKey: p.spriteKey,
      description: p.description,
      srdVersion: p.source,
    };
    return m;
  });
}
