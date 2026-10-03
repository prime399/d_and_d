import {defineField, defineType} from 'sanity'
import {ABILITY_KEYS, slugField, srdVersionField} from './shared'

export const spell = defineType({
  name: 'spell',
  type: 'document',
  fields: [
    defineField({name: 'name', type: 'string', validation: (r) => r.required()}),
    slugField('name'),
    srdVersionField(),
    defineField({name: 'level', description: '0 = cantrip', type: 'number', validation: (r) => r.required().integer().min(0).max(9)}),
    defineField({name: 'school', type: 'string', validation: (r) => r.required()}),
    defineField({name: 'concentration', type: 'boolean', initialValue: false, validation: (r) => r.required()}),
    defineField({name: 'range', description: 'Tiles', type: 'number', validation: (r) => r.required().min(0)}),
    defineField({
      name: 'kind',
      type: 'string',
      options: {list: ['attack', 'save', 'heal', 'buff'], layout: 'radio', direction: 'horizontal'},
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'save',
      type: 'string',
      options: {list: ABILITY_KEYS},
      hidden: ({parent}) => parent?.kind !== 'save',
    }),
    defineField({name: 'dice', description: 'Damage/heal dice, e.g. 3d6', type: 'string'}),
    defineField({name: 'damageType', type: 'string'}),
    defineField({name: 'inflicts', description: 'Condition applied on hit / failed save', type: 'reference', to: [{type: 'condition'}]}),
    defineField({name: 'radius', description: 'AoE radius in tiles (0 = single target)', type: 'number', initialValue: 0}),
    defineField({name: 'iconKey', type: 'string'}),
    defineField({name: 'summary', type: 'text', rows: 3, validation: (r) => r.required()}),
  ],
  orderings: [{title: 'Level', name: 'levelAsc', by: [{field: 'level', direction: 'asc'}, {field: 'name', direction: 'asc'}]}],
  preview: {
    select: {title: 'name', level: 'level', school: 'school', v: 'srdVersion'},
    prepare: ({title, level, school, v}) => ({
      title,
      subtitle: `${level === 0 ? 'Cantrip' : `Level ${level}`} ${school ?? ''} · SRD ${v ?? '?'}`,
    }),
  },
})
