import {describe, expect, it} from 'vitest'
import {toSanityDocs} from '../../../scripts/seed-sanity'
import type {GameContent} from '../../game/content/types'

const abilities = {str: 10, dex: 14, con: 10, int: 10, wis: 8, cha: 8}

const fixture: GameContent = {
  source: 'fallback',
  conditions: [
    {_id: 'condition.poisoned', slug: 'poisoned', name: 'Poisoned', effects: ['disadvantage on attacks'], srdVersion: '2024'},
    {
      _id: 'condition.exhaustion',
      slug: 'exhaustion',
      name: 'Exhaustion',
      effects: ['-2 per level to d20 tests'],
      srdVersion: '2024',
      counterpartId: 'condition.exhaustion.2014',
    },
    {
      _id: 'condition.exhaustion.2014',
      slug: 'exhaustion',
      name: 'Exhaustion',
      effects: ['six-level track'],
      srdVersion: '2014',
      counterpartId: 'condition.exhaustion',
    },
  ],
  spells: [
    {
      _id: 'spell.ray-of-sickness',
      slug: 'ray-of-sickness',
      name: 'Ray of Sickness',
      level: 1,
      school: 'Necromancy',
      concentration: false,
      range: 12,
      kind: 'attack',
      dice: '2d8',
      damageType: 'poison',
      inflicts: 'poisoned',
      summary: 'A ray of sickening energy.',
      srdVersion: '2024',
    },
  ],
  monsters: [
    {
      _id: 'monster.giant-spider',
      slug: 'giant-spider',
      name: 'Giant Spider',
      cr: 1,
      xp: 200,
      ac: 14,
      hp: 26,
      speed: 6,
      abilities,
      attacks: [
        {name: 'Bite', toHit: 5, damage: '1d8+3', damageType: 'piercing', range: 1, inflicts: 'poisoned', inflictsSave: {ability: 'con', dc: 11}},
        {name: 'Web', toHit: 5, damage: '0', damageType: 'none', range: 6, inflicts: 'nope'},
      ],
      spriteKey: 'spider',
      srdVersion: '2024',
    },
  ],
  rules: [
    {
      _id: 'rule.exhaustion',
      slug: 'exhaustion',
      title: 'Exhaustion',
      section: 'Conditions',
      body: 'Plain text body.',
      srdVersion: '2024',
      related: ['condition.exhaustion', 'condition.missing'],
    },
  ],
  heroes: [
    {
      _id: 'hero.wizard',
      slug: 'wizard',
      name: 'Ilya',
      className: 'Wizard',
      level: 3,
      ac: 12,
      hp: 18,
      speed: 6,
      abilities,
      proficiency: 2,
      attacks: [{name: 'Dagger', toHit: 4, damage: '1d4+2', damageType: 'piercing', range: 1}],
      spells: ['ray-of-sickness'],
      slots: {2: 2, 1: 4},
      spellAttack: 5,
      spellDc: 13,
      spriteKey: 'wizard',
      potions: 2,
      blurb: 'A wizard.',
    },
  ],
  rooms: [
    {
      _id: 'room.lair',
      slug: 'lair',
      name: 'Lair',
      order: 1,
      description: 'Webs everywhere.',
      encounter: [{monster: 'giant-spider', count: 2}],
      isBoss: true,
    },
  ],
}

describe('toSanityDocs', () => {
  const plan = toSanityDocs(fixture)
  const byId = Object.fromEntries(plan.docs.map((d) => [d._id, d]))

  it('keeps ids and converts slugs', () => {
    expect(plan.docs).toHaveLength(8)
    expect(byId['condition.exhaustion.2014']).toMatchObject({_type: 'condition', slug: {_type: 'slug', current: 'exhaustion'}})
  })

  it('converts references and keys array items', () => {
    const spider = byId['monster.giant-spider'] as any
    expect(spider.attacks[0]).toMatchObject({
      _key: expect.any(String),
      inflicts: {_type: 'reference', _ref: 'condition.poisoned'},
      inflictsSave: {ability: 'con', dc: 11},
    })
    expect((byId['spell.ray-of-sickness'] as any).inflicts._ref).toBe('condition.poisoned')
    expect((byId['condition.exhaustion'] as any).counterpart._ref).toBe('condition.exhaustion.2014')
    expect((byId['room.lair'] as any).encounter[0]).toMatchObject({monster: {_ref: 'monster.giant-spider'}, count: 2})
    expect((byId['hero.wizard'] as any).spells[0]._ref).toBe('spell.ray-of-sickness')
    expect((byId['rule.exhaustion'] as any).related.map((r: any) => r._ref)).toEqual(['condition.exhaustion'])
  })

  it('stores hero slots as sorted {level,count} rows', () => {
    expect((byId['hero.wizard'] as any).slots).toEqual([
      {_key: 'lvl1', _type: 'slot', level: 1, count: 4},
      {_key: 'lvl2', _type: 'slot', level: 2, count: 2},
    ])
  })

  it('drops unresolved references with warnings', () => {
    expect((byId['monster.giant-spider'] as any).attacks[1].inflicts).toBeUndefined()
    expect(plan.warnings).toHaveLength(2)
  })

  it('pass 1 contains no references; pass 2 restores them', () => {
    expect(JSON.stringify(plan.base)).not.toContain('"_ref"')
    const patchIds = plan.refPatches.map((p) => p.id).sort()
    expect(patchIds).toEqual(
      ['condition.exhaustion', 'condition.exhaustion.2014', 'hero.wizard', 'monster.giant-spider', 'room.lair', 'rule.exhaustion', 'spell.ray-of-sickness'].sort(),
    )
    // Hero attacks have no refs, so only spells are patched.
    expect(Object.keys(plan.refPatches.find((p) => p.id === 'hero.wizard')!.set)).toEqual(['spells'])
  })
})
