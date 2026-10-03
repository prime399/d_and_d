import {defineArrayMember, defineField, defineType} from 'sanity'
import {slugField} from './shared'

export const hero = defineType({
  name: 'hero',
  type: 'document',
  fields: [
    defineField({name: 'name', type: 'string', validation: (r) => r.required()}),
    slugField('name'),
    defineField({
      name: 'className',
      title: 'Class',
      type: 'string',
      options: {list: ['Fighter', 'Wizard', 'Cleric'], layout: 'radio', direction: 'horizontal'},
      validation: (r) => r.required(),
    }),
    defineField({name: 'level', type: 'number', initialValue: 1, validation: (r) => r.required().integer().min(1).max(20)}),
    defineField({name: 'ac', title: 'Armor class', type: 'number', validation: (r) => r.required()}),
    defineField({name: 'hp', title: 'Hit points', type: 'number', validation: (r) => r.required().min(1)}),
    defineField({name: 'speed', description: 'Tiles per turn', type: 'number', validation: (r) => r.required()}),
    defineField({name: 'abilities', type: 'abilities', validation: (r) => r.required()}),
    defineField({name: 'proficiency', title: 'Proficiency bonus', type: 'number', validation: (r) => r.required()}),
    defineField({name: 'attacks', type: 'array', of: [defineArrayMember({type: 'attack'})]}),
    defineField({
      name: 'spells',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'spell'}]})],
    }),
    defineField({
      name: 'slots',
      title: 'Spell slots',
      description: 'One row per spell level',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'slot',
          fields: [
            defineField({name: 'level', type: 'number', validation: (r) => r.required().integer().min(1).max(9)}),
            defineField({name: 'count', type: 'number', validation: (r) => r.required().integer().min(0)}),
          ],
          preview: {
            select: {level: 'level', count: 'count'},
            prepare: ({level, count}) => ({title: `Level ${level}: ${count} slot(s)`}),
          },
        }),
      ],
    }),
    defineField({name: 'spellAttack', title: 'Spell attack bonus', type: 'number'}),
    defineField({name: 'spellDc', title: 'Spell save DC', type: 'number'}),
    defineField({name: 'spriteKey', type: 'string', validation: (r) => r.required()}),
    defineField({name: 'potions', type: 'number', initialValue: 0, validation: (r) => r.required().min(0)}),
    defineField({name: 'blurb', type: 'text', rows: 3, validation: (r) => r.required()}),
  ],
  preview: {
    select: {title: 'name', className: 'className', level: 'level'},
    prepare: ({title, className, level}) => ({title, subtitle: `Level ${level} ${className ?? ''}`}),
  },
})
