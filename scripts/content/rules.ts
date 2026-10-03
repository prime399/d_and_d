// Rules: 2024 (SRD 5.2.1) bodies are hand-summarised; 2014 counterparts are extracted from SRD 5.1 JSON.
import type { Rule } from '../../src/game/content/types';
import { clip, rule2014Text } from './srd';

interface RuleDef {
  slug: string;
  title: string;
  section: string;
  /** SRD 5.2.1 summary (2024 version, id rule.<slug>) */
  body: string;
  /** 2014 source: rules index (+ optional #### heading) -> id rule.<slug>.2014 */
  from2014?: [index: string, heading?: string];
  /** related ids: 'rule:x', 'condition:x', 'spell:x' (expanded below) */
  rel?: string[];
}

const DEFS: RuleDef[] = [
  // ---- Combat core -------------------------------------------------------
  { slug: 'initiative', title: 'Initiative', section: 'Combat', from2014: ['initiative'],
    body: 'When combat starts, every participant rolls Initiative: a Dexterity check. The DM ranks combatants from highest to lowest and they act in that order each round. A creature that is Surprised has Disadvantage on its Initiative roll, and an Invisible creature has Advantage. Ties are decided by the DM for monsters and by the players for characters.',
    rel: ['rule:surprise', 'condition:invisible', 'condition:incapacitated', 'rule:d20-tests'] },
  { slug: 'surprise', title: 'Surprise', section: 'Combat', from2014: ['surprise'],
    body: 'If a combatant is caught off guard when combat begins, typically because it failed to notice hidden enemies, it is Surprised. A Surprised creature has Disadvantage on its Initiative roll. Unlike the 2014 rules, surprise no longer costs the creature its first turn.',
    rel: ['rule:initiative', 'rule:hide', 'rule:advantage'] },
  { slug: 'your-turn', title: 'Your Turn', section: 'Combat', from2014: ['your-turn'],
    body: 'On your turn you can move a distance up to your Speed and take one action. You may also take one Bonus Action if a feature grants one, and one Reaction per round, even on other turns. You can split your movement before and after your action, and you can communicate briefly for free.',
    rel: ['rule:attack-action', 'rule:dash', 'rule:dodge', 'rule:magic-action', 'rule:movement'] },
  { slug: 'movement', title: 'Movement and Position', section: 'Combat', from2014: ['breaking-up-your-move'],
    body: 'You can move up to your Speed on your turn and break the move up around your action. You can move through an ally\'s space but not an enemy\'s unless it is two sizes different. Difficult terrain costs 1 extra foot per foot moved. In this game, Speed is measured in 5-foot tiles and diagonals cost one tile.',
    rel: ['rule:difficult-terrain', 'rule:being-prone', 'condition:grappled', 'condition:restrained', 'rule:opportunity-attacks'] },
  { slug: 'difficult-terrain', title: 'Difficult Terrain', section: 'Combat', from2014: ['difficult-terrain'],
    body: 'Every foot of movement in Difficult Terrain costs 1 extra foot. Rubble, undergrowth, steep stairs, snow and shallow bogs are typical examples, and so is a space occupied by another creature, whether friend or foe.',
    rel: ['rule:movement'] },
  { slug: 'being-prone', title: 'Being Prone', section: 'Combat', from2014: ['being-prone'],
    body: 'You can drop Prone without using any movement. Standing up costs movement equal to half your Speed, and you can\'t stand if you lack the movement. While Prone you can only crawl, which costs 1 extra foot per foot moved.',
    rel: ['condition:prone', 'rule:movement', 'rule:shove'] },
  { slug: 'opportunity-attacks', title: 'Opportunity Attacks', section: 'Combat', from2014: ['melee-attacks', 'Opportunity Attacks'],
    body: 'You can make an Opportunity Attack when a creature you can see leaves your reach using its action, Bonus Action, Reaction or movement. You use your Reaction to make one melee attack against it right before it leaves. Taking the Disengage action, or being moved without using your own movement, avoids Opportunity Attacks.',
    rel: ['rule:disengage', 'rule:reactions', 'rule:attack-rolls'] },
  { slug: 'reactions', title: 'Reactions', section: 'Combat', from2014: ['reactions'],
    body: 'A Reaction is an instant response to a trigger, such as an Opportunity Attack or a spell like Shield. You get one Reaction per round and regain it at the start of each of your turns. An Incapacitated creature can\'t take Reactions.',
    rel: ['rule:opportunity-attacks', 'condition:incapacitated'] },
  // ---- Actions -----------------------------------------------------------
  { slug: 'attack-action', title: 'Attack Action', section: 'Actions', from2014: ['attack'],
    body: 'When you take the Attack action, you make one attack roll with a weapon or an Unarmed Strike. Features such as Extra Attack let you make more than one attack with the same action. You can equip or unequip one weapon as part of each attack.',
    rel: ['rule:attack-rolls', 'rule:critical-hits', 'rule:ranged-attacks', 'rule:two-weapon-fighting'] },
  { slug: 'dash', title: 'Dash', section: 'Actions', from2014: ['dash'],
    body: 'When you take the Dash action, you gain extra movement for the current turn equal to your Speed after modifiers. If your Speed is 0, Dash gives you nothing.',
    rel: ['rule:movement', 'rule:your-turn'] },
  { slug: 'disengage', title: 'Disengage', section: 'Actions', from2014: ['disengage'],
    body: 'If you take the Disengage action, your movement doesn\'t provoke Opportunity Attacks for the rest of the current turn.',
    rel: ['rule:opportunity-attacks'] },
  { slug: 'dodge', title: 'Dodge', section: 'Actions', from2014: ['dodge'],
    body: 'Until the start of your next turn, any attack roll made against you has Disadvantage if you can see the attacker, and you make Dexterity saving throws with Advantage. You lose these benefits if you have the Incapacitated condition or your Speed is 0.',
    rel: ['condition:dodging', 'rule:advantage', 'condition:incapacitated'] },
  { slug: 'help', title: 'Help', section: 'Actions', from2014: ['help'],
    body: 'Take the Help action to assist an ally. Assist an ability check: choose a skill or tool you are proficient in and one ally; their next check with it has Advantage. Assist an attack: choose an enemy within 5 feet of you; the next attack roll by one of your allies against it has Advantage. Either benefit expires at the start of your next turn.',
    rel: ['rule:advantage', 'rule:attack-rolls'] },
  { slug: 'hide', title: 'Hide', section: 'Actions', from2014: ['hide'],
    body: 'With the Hide action you make a DC 15 Dexterity (Stealth) check while Heavily Obscured or behind Three-Quarters or Total Cover, out of any enemy\'s line of sight. On a success you gain the Invisible condition, and your check total becomes the DC to find you. It ends if you make noise, attack, cast a spell with a Verbal component, or an enemy finds you.',
    rel: ['condition:invisible', 'rule:cover', 'rule:unseen-attackers', 'rule:surprise'] },
  { slug: 'ready', title: 'Ready', section: 'Actions', from2014: ['ready'],
    body: 'Use the Ready action to prepare to act later. Choose a perceivable trigger and the action you will take in response, then use your Reaction when it occurs. Readying a spell means casting it now, holding its energy with Concentration, and releasing it when triggered.',
    rel: ['rule:reactions', 'rule:concentration'] },
  { slug: 'magic-action', title: 'Magic Action', section: 'Actions', from2014: ['cast-a-spell'],
    body: 'When you take the Magic action you cast a spell with a casting time of an action, or use a feature or magic item that requires a Magic action to activate.',
    rel: ['rule:spell-attack-rolls', 'rule:spell-saving-throws', 'rule:spell-slots', 'rule:concentration'] },
  // ---- Making an attack --------------------------------------------------
  { slug: 'attack-rolls', title: 'Attack Rolls', section: 'Combat', from2014: ['attack-rolls'],
    body: 'To make an attack roll, roll a d20 and add your ability modifier (Strength for melee, Dexterity for ranged, or your spellcasting ability for spells) plus your Proficiency Bonus if proficient. If the total equals or exceeds the target\'s Armor Class, the attack hits. A natural 20 always hits and is a Critical Hit; a natural 1 always misses.',
    rel: ['rule:critical-hits', 'rule:advantage', 'rule:cover', 'rule:d20-tests', 'condition:blinded', 'condition:prone', 'condition:restrained', 'spell:bless', 'spell:shield-of-faith'] },
  { slug: 'critical-hits', title: 'Critical Hits', section: 'Combat', from2014: ['damage-rolls', 'Critical Hits'],
    body: 'When you score a Critical Hit (a natural 20 on the attack roll), roll the attack\'s damage dice twice and add them together, then add any modifiers as normal. Melee attacks against a Paralyzed or Unconscious creature within 5 feet are automatically Critical Hits.',
    rel: ['rule:attack-rolls', 'condition:paralyzed', 'condition:unconscious', 'rule:damage-rolls'] },
  { slug: 'damage-rolls', title: 'Damage Rolls', section: 'Combat', from2014: ['damage-rolls'],
    body: 'Each weapon, spell and harmful monster ability specifies the damage it deals. Roll the damage dice, add modifiers, and subtract the total from the target\'s Hit Points. When a spell or effect damages several targets at once, roll the damage once for all of them.',
    rel: ['rule:critical-hits', 'rule:resistance-and-vulnerability', 'rule:hit-points'] },
  { slug: 'advantage', title: 'Advantage and Disadvantage', section: 'Core Rules', from2014: ['advantage-and-disadvantage'],
    body: 'With Advantage you roll two d20s and use the higher; with Disadvantage you roll two and use the lower. If circumstances give you both, they cancel out and you roll one d20, no matter how many sources of each you have. Advantage and Disadvantage apply to D20 Tests: attack rolls, ability checks and saving throws.',
    rel: ['rule:d20-tests', 'rule:help', 'rule:heroic-inspiration', 'condition:blinded', 'condition:invisible', 'condition:prone', 'condition:restrained', 'condition:poisoned', 'condition:frightened', 'condition:dodging'] },
  { slug: 'ranged-attacks', title: 'Ranged Attacks', section: 'Combat', from2014: ['ranged-attacks'],
    body: 'A ranged attack has a normal and a long range; attacks beyond normal range have Disadvantage, and you can\'t attack beyond long range. You also have Disadvantage on a ranged attack roll if you are within 5 feet of an enemy that can see you and doesn\'t have the Incapacitated condition.',
    rel: ['rule:attack-rolls', 'rule:advantage', 'rule:cover', 'condition:prone'] },
  { slug: 'unseen-attackers', title: 'Unseen Attackers and Targets', section: 'Combat', from2014: ['unseen-attackers-and-targets'],
    body: 'If you attack a target you can\'t see, you have Disadvantage on the roll, and you must guess its location. When a creature can\'t see you, you have Advantage on attack rolls against it. If you are hidden, you give away your location when the attack hits or misses.',
    rel: ['condition:invisible', 'condition:blinded', 'rule:hide', 'rule:advantage'] },
  { slug: 'cover', title: 'Cover', section: 'Combat', from2014: ['cover'],
    body: 'Walls, creatures and obstacles can provide cover. Half Cover gives +2 to AC and Dexterity saving throws; Three-Quarters Cover gives +5; Total Cover means the target can\'t be targeted directly by an attack or spell. Only the most protective degree of cover applies.',
    rel: ['rule:attack-rolls', 'rule:ranged-attacks', 'rule:hide', 'spell:sacred-flame'] },
  { slug: 'two-weapon-fighting', title: 'Two-Weapon Fighting', section: 'Combat', from2014: ['melee-attacks', 'Two-Weapon Fighting'],
    body: 'In the 2024 rules this is handled by the Light weapon property: when you attack with a Light weapon as part of the Attack action, you can make one extra attack as a Bonus Action with a different Light weapon. You don\'t add your ability modifier to that extra attack\'s damage unless the modifier is negative.',
    rel: ['rule:attack-action'] },
  { slug: 'grappling', title: 'Grappling', section: 'Combat', from2014: ['melee-attacks', 'Grappling'],
    body: 'Grappling is an Unarmed Strike option. The target must be no more than one size larger and within reach; instead of an attack roll it makes a Strength or Dexterity saving throw (its choice) against DC 8 + your Strength modifier + Proficiency Bonus. On a failure it has the Grappled condition. It can use its action to escape with an Athletics or Acrobatics check against the same escape DC.',
    rel: ['condition:grappled', 'rule:shove', 'rule:saving-throws'] },
  { slug: 'shove', title: 'Shoving', section: 'Combat', from2014: ['melee-attacks', 'Shoving a Creature'],
    body: 'Shoving is an Unarmed Strike option. A target no more than one size larger makes a Strength or Dexterity saving throw against DC 8 + your Strength modifier + Proficiency Bonus. On a failure you either push it 5 feet away or knock it Prone.',
    rel: ['condition:prone', 'rule:grappling', 'rule:being-prone'] },
  // ---- Damage and healing ------------------------------------------------
  { slug: 'hit-points', title: 'Hit Points', section: 'Damage and Healing', from2014: ['hit-points'],
    body: 'Hit Points represent durability and the will to live. A creature\'s current Hit Points can be any number from its Hit Point maximum down to 0. Damage reduces current Hit Points; healing restores them but never above the maximum.',
    rel: ['rule:dropping-to-0', 'rule:healing', 'rule:temporary-hit-points', 'rule:damage-rolls'] },
  { slug: 'resistance-and-vulnerability', title: 'Resistance and Vulnerability', section: 'Damage and Healing', from2014: ['damage-resistance-and-vulnerability'],
    body: 'If you have Resistance to a damage type, damage of that type is halved (round down). Vulnerability doubles it. Multiple instances of Resistance or Vulnerability to the same type count as one. Apply modifiers first, then Resistance, then Vulnerability.',
    rel: ['rule:damage-rolls', 'condition:petrified'] },
  { slug: 'healing', title: 'Healing', section: 'Damage and Healing', from2014: ['healing'],
    body: 'Spells, potions and rest restore Hit Points up to the Hit Point maximum. A creature that has died can\'t regain Hit Points until magic such as Revivify restores it to life. Any healing restores a creature at 0 Hit Points to consciousness.',
    rel: ['rule:hit-points', 'rule:dropping-to-0', 'spell:cure-wounds', 'spell:healing-word', 'rule:short-rest'] },
  { slug: 'temporary-hit-points', title: 'Temporary Hit Points', section: 'Damage and Healing', from2014: ['temporary-hit-points'],
    body: 'Temporary Hit Points are a buffer that absorbs damage before your real Hit Points. They don\'t stack: if you gain more, you choose whether to keep the old or new amount. Healing can\'t restore them, and they last until depleted or you finish a Long Rest.',
    rel: ['rule:hit-points'] },
  { slug: 'dropping-to-0', title: 'Dropping to 0 Hit Points', section: 'Damage and Healing', from2014: ['dropping-to-0-hit-points'],
    body: 'When damage reduces you to 0 Hit Points, you fall Unconscious and start making Death Saving Throws, unless the damage remaining equals or exceeds your Hit Point maximum, which kills you outright. Most monsters simply die at 0 Hit Points. Any healing brings an Unconscious character back.',
    rel: ['condition:unconscious', 'rule:death-saving-throws', 'rule:knocking-out', 'rule:healing', 'spell:healing-word'] },
  { slug: 'death-saving-throws', title: 'Death Saving Throws', section: 'Damage and Healing',
    body: 'At the start of each turn at 0 Hit Points, roll a d20 with no modifiers: 10 or higher is a success, otherwise a failure. Three successes make you Stable; three failures mean death. A natural 20 restores 1 Hit Point; a natural 1 counts as two failures. Taking damage while at 0 HP causes a failure (two on a Critical Hit).',
    rel: ['rule:dropping-to-0', 'condition:unconscious', 'rule:critical-hits'] },
  { slug: 'knocking-out', title: 'Knocking Out a Creature', section: 'Damage and Healing', from2014: ['knocking-a-creature-out'],
    body: 'When you reduce a creature to 0 Hit Points with a melee attack, you can choose to knock it out instead of killing it. It has the Unconscious condition and is Stable, and it regains 1 Hit Point after a Short Rest.',
    rel: ['rule:dropping-to-0', 'condition:unconscious'] },
  // ---- Core d20 ----------------------------------------------------------
  { slug: 'd20-tests', title: 'D20 Tests', section: 'Core Rules',
    body: 'Ability checks, saving throws and attack rolls are all D20 Tests: roll a d20, add modifiers, and compare to a target number (a DC or an AC). Advantage, Disadvantage, Heroic Inspiration, Bless and Exhaustion all act on D20 Tests in the 2024 rules.',
    rel: ['rule:advantage', 'rule:saving-throws', 'rule:attack-rolls', 'rule:heroic-inspiration', 'condition:exhaustion', 'spell:bless'] },
  { slug: 'saving-throws', title: 'Saving Throws', section: 'Core Rules', from2014: ['saving-throws'],
    body: 'A saving throw represents an attempt to resist a spell, trap or other threat. Roll a d20 and add the relevant ability modifier, plus your Proficiency Bonus if proficient. Meet or beat the DC to succeed. Paralyzed, Stunned, Unconscious and Petrified creatures automatically fail Strength and Dexterity saves.',
    rel: ['rule:d20-tests', 'rule:spell-saving-throws', 'condition:paralyzed', 'condition:stunned', 'condition:unconscious', 'condition:petrified', 'condition:restrained'] },
  { slug: 'heroic-inspiration', title: 'Heroic Inspiration', section: 'Core Rules',
    body: 'New in the 2024 rules. When you have Heroic Inspiration you can expend it to reroll any die immediately after rolling it, and you must use the new roll. You can have it only once at a time. The DM awards it for great roleplay or heroics, and some features (such as the Human\'s Resourceful trait) grant it.',
    rel: ['rule:d20-tests', 'rule:advantage'] },
  // ---- Spellcasting ------------------------------------------------------
  { slug: 'spell-slots', title: 'Spell Slots', section: 'Spellcasting', from2014: ['spell-slots'],
    body: 'Casting a leveled spell expends a spell slot of the spell\'s level or higher; cantrips use no slot. A higher-level slot can upcast many spells for a stronger effect. You regain expended slots when you finish a Long Rest.',
    rel: ['rule:cantrips', 'rule:long-rest', 'rule:magic-action'] },
  { slug: 'cantrips', title: 'Cantrips', section: 'Spellcasting', from2014: ['cantrips'],
    body: 'A cantrip is a level 0 spell you can cast at will without a spell slot. Damaging cantrips grow stronger as you gain levels.',
    rel: ['rule:spell-slots', 'spell:fire-bolt', 'spell:ray-of-frost', 'spell:sacred-flame'] },
  { slug: 'spell-range', title: 'Spell Range', section: 'Spellcasting', from2014: ['spell-range'],
    body: 'A spell\'s target must be within its range. Some spells have a range of Touch, and spells with a range of Self affect you or originate from you, such as a cone or emanation. In this game ranges are converted to 5-foot tiles, and range 0 means a self-centred effect.',
    rel: ['rule:areas-of-effect', 'spell:thunderwave', 'spell:cure-wounds'] },
  { slug: 'areas-of-effect', title: 'Areas of Effect', section: 'Spellcasting', from2014: ['areas-of-effect'],
    body: 'Area spells cover a Cone, Cube, Cylinder, Emanation, Line or Sphere. Each has a point of origin, and a creature is affected if part of its space is in the area and it has no Total Cover from the origin. In this game areas are approximated as a radius of tiles around the point.',
    rel: ['rule:spell-saving-throws', 'rule:cover', 'spell:burning-hands', 'spell:thunderwave', 'spell:shatter', 'spell:sleep'] },
  { slug: 'spell-attack-rolls', title: 'Spell Attack Rolls', section: 'Spellcasting', from2014: ['spell-attack-rolls'],
    body: 'Some spells require an attack roll. Your spell attack modifier equals your spellcasting ability modifier plus your Proficiency Bonus. Spell attacks follow the normal attack rules, including Critical Hits and Disadvantage when making a ranged attack near an enemy.',
    rel: ['rule:attack-rolls', 'rule:critical-hits', 'rule:ranged-attacks', 'spell:fire-bolt', 'spell:guiding-bolt', 'spell:ray-of-frost'] },
  { slug: 'spell-saving-throws', title: 'Spell Saving Throws', section: 'Spellcasting', from2014: ['spell-saving-throws'],
    body: 'Many spells force a target to make a saving throw. Your spell save DC equals 8 + your spellcasting ability modifier + your Proficiency Bonus. The spell says which ability the target uses and what happens on a success or failure.',
    rel: ['rule:saving-throws', 'spell:sacred-flame', 'spell:hold-person', 'spell:sleep', 'spell:shatter', 'spell:burning-hands', 'spell:thunderwave'] },
  { slug: 'concentration', title: 'Concentration', section: 'Spellcasting', from2014: ['duration', 'Concentration'],
    body: 'Some spells require Concentration to keep their magic active. You lose it if you cast another Concentration spell, have the Incapacitated condition, or die. When you take damage, make a Constitution saving throw (DC 10 or half the damage, whichever is higher, up to DC 30) or lose Concentration.',
    rel: ['condition:incapacitated', 'rule:saving-throws', 'spell:bless', 'spell:hold-person', 'spell:sleep', 'spell:shield-of-faith', 'condition:blessed', 'condition:shield-of-faith'] },
  // ---- Resting -----------------------------------------------------------
  { slug: 'short-rest', title: 'Short Rest', section: 'Adventuring', from2014: ['short-rest'],
    body: 'A Short Rest is 1 hour of downtime. You can spend Hit Point Dice to recover Hit Points: roll each die and add your Constitution modifier. In this game, a short breather between rooms lets heroes drink potions and regroup.',
    rel: ['rule:long-rest', 'rule:healing'] },
  { slug: 'long-rest', title: 'Long Rest', section: 'Adventuring', from2014: ['long-rest'],
    body: 'A Long Rest is at least 8 hours of sleep and light activity. You regain all lost Hit Points and spent Hit Point Dice, your spell slots return, and your Exhaustion level drops by 1. You can benefit from only one Long Rest per 24 hours.',
    rel: ['rule:short-rest', 'rule:spell-slots', 'condition:exhaustion'] },
];

/** Conditions whose 2024 docs should point back to rules (added to the condition graph via rules). */
export function buildRules(): Rule[] {
  const known2014 = new Set(DEFS.filter((d) => d.from2014).map((d) => d.slug));
  const expand = (ref: string): string => {
    const [kind, slug] = ref.split(':');
    return `${kind}.${slug}`;
  };
  const out: Rule[] = [];
  for (const d of DEFS) {
    const related = (d.rel ?? []).map(expand);
    const has2014 = Boolean(d.from2014);
    out.push({
      _id: `rule.${d.slug}`, slug: d.slug, title: d.title, section: d.section,
      body: clip(d.body), srdVersion: '2024',
      related: has2014 ? [`rule.${d.slug}.2014`, ...related] : related,
    });
    if (d.from2014) {
      const [index, heading] = d.from2014;
      out.push({
        _id: `rule.${d.slug}.2014`, slug: d.slug, title: d.title, section: d.section,
        body: clip(rule2014Text(index, heading)), srdVersion: '2014',
        // 2014 rules link to their 2024 counterpart plus 2014-era siblings that exist
        related: [`rule.${d.slug}`, ...(d.rel ?? []).filter((r) => r.startsWith('rule:') && known2014.has(r.slice(5))).map((r) => `${expand(r)}.2014`)],
      });
    }
  }
  return out;
}
