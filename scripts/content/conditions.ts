// Conditions: 2014 (SRD 5.1) and 2024 (SRD 5.2.1) versions, linked as counterparts.
import type { Condition } from '../../src/game/content/types';
import { get } from './srd';

export const CONDITION_SLUGS = [
  'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed',
  'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious', 'exhaustion',
] as const;

/** 2014: each "- ..." bullet (or whole paragraph) becomes one effect line. */
function effects2014(slug: string): string[] {
  const desc: string[] = get('2014', 'Conditions', slug).desc;
  return desc.map((l) => l.replace(/^-\s*/, '').trim()).filter(Boolean);
}

/** 2024: each "**Heading.** text" line becomes "Heading: text". */
function effects2024(slug: string): string[] {
  const text: string = get('2024', 'Conditions', slug).description;
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\*\*(.+?)\.\*\*\s*(.*)$/);
    if (m) out.push(`${m[1]}: ${m[2].trim()}`);
    else if (out.length && line.trim() && !/^While you have/.test(line)) out[out.length - 1] += ` ${line.trim()}`;
  }
  if (!out.length) throw new Error(`No 2024 effects parsed for ${slug}`);
  return out;
}

const GAME_BUFFS: Condition[] = [
  { _id: 'condition.blessed', slug: 'blessed', name: 'Blessed', srdVersion: '2024',
    effects: ['Roll Bonus: Add 1d4 to attack rolls and saving throws while the Bless spell lasts.',
      'Concentration: Ends early if the caster loses concentration on Bless.'] },
  { _id: 'condition.dodging', slug: 'dodging', name: 'Dodging', srdVersion: '2024',
    effects: ['Attacks Affected: Attack rolls against you have Disadvantage if you can see the attacker.',
      'Saves Improved: You have Advantage on Dexterity saving throws.',
      'Duration: Lasts until the start of your next turn; ends early if you are Incapacitated or your Speed is 0.'] },
  { _id: 'condition.shield-of-faith', slug: 'shield-of-faith', name: 'Shield of Faith', srdVersion: '2024',
    effects: ['AC Bonus: +2 bonus to Armor Class while the spell lasts.',
      'Concentration: Ends early if the caster loses concentration on Shield of Faith.'] },
];

export function buildConditions(): Condition[] {
  const out: Condition[] = [];
  for (const slug of CONDITION_SLUGS) {
    const r24 = get('2024', 'Conditions', slug);
    const r14 = get('2014', 'Conditions', slug);
    out.push({
      _id: `condition.${slug}`, slug, name: r24.name, effects: effects2024(slug), srdVersion: '2024',
      counterpartId: `condition.${slug}.2014`,
    });
    out.push({
      _id: `condition.${slug}.2014`, slug, name: r14.name, effects: effects2014(slug), srdVersion: '2014',
      counterpartId: `condition.${slug}`,
    });
  }
  return [...out, ...GAME_BUFFS];
}
