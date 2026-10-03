import {defineField, defineType} from 'sanity'

export const SRD_VERSIONS = [
  {title: 'SRD 5.1 (2014)', value: '2014'},
  {title: 'SRD 5.2.1 (2024)', value: '2024'},
]

export const ABILITY_KEYS = [
  {title: 'Strength', value: 'str'},
  {title: 'Dexterity', value: 'dex'},
  {title: 'Constitution', value: 'con'},
  {title: 'Intelligence', value: 'int'},
  {title: 'Wisdom', value: 'wis'},
  {title: 'Charisma', value: 'cha'},
]

export const srdVersionField = (required = true) =>
  defineField({
    name: 'srdVersion',
    title: 'SRD version',
    type: 'string',
    options: {list: SRD_VERSIONS, layout: 'radio', direction: 'horizontal'},
    initialValue: '2024',
    validation: (r) => (required ? r.required() : r),
  })

export const slugField = (source: string) =>
  defineField({
    name: 'slug',
    type: 'slug',
    options: {source, maxLength: 96},
    validation: (r) => r.required(),
  })

/** Ability score block {str,dex,con,int,wis,cha} */
export const abilities = defineType({
  name: 'abilities',
  title: 'Ability scores',
  type: 'object',
  options: {columns: 3},
  fields: ABILITY_KEYS.map((a) =>
    defineField({
      name: a.value,
      title: a.title,
      type: 'number',
      validation: (r) => r.required().integer().min(1).max(30),
    }),
  ),
})

/** Melee/ranged attack used by monsters and heroes */
export const attack = defineType({
  name: 'attack',
  title: 'Attack',
  type: 'object',
  fields: [
    defineField({name: 'name', type: 'string', validation: (r) => r.required()}),
    defineField({
      name: 'toHit',
      title: 'Attack bonus',
      type: 'number',
      validation: (r) => r.required().integer(),
    }),
    defineField({
      name: 'damage',
      description: 'Dice notation, e.g. 1d6+2',
      type: 'string',
      validation: (r) => r.required(),
    }),
    defineField({name: 'damageType', type: 'string', validation: (r) => r.required()}),
    defineField({
      name: 'range',
      description: 'Tiles; 1 = melee',
      type: 'number',
      initialValue: 1,
      validation: (r) => r.required().min(1),
    }),
    defineField({
      name: 'inflicts',
      description: 'Condition applied on hit',
      type: 'reference',
      to: [{type: 'condition'}],
    }),
    defineField({
      name: 'inflictsSave',
      title: 'Save vs inflicted condition',
      type: 'object',
      fields: [
        defineField({
          name: 'ability',
          type: 'string',
          options: {list: ABILITY_KEYS},
          validation: (r) => r.required(),
        }),
        defineField({name: 'dc', title: 'DC', type: 'number', validation: (r) => r.required()}),
      ],
    }),
  ],
  preview: {
    select: {title: 'name', toHit: 'toHit', damage: 'damage', damageType: 'damageType'},
    prepare: ({title, toHit, damage, damageType}) => ({
      title,
      subtitle: `${toHit >= 0 ? '+' : ''}${toHit ?? 0} to hit · ${damage ?? ''} ${damageType ?? ''}`,
    }),
  },
})
