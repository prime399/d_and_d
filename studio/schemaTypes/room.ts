import {defineArrayMember, defineField, defineType} from 'sanity'
import {slugField} from './shared'

export const room = defineType({
  name: 'room',
  type: 'document',
  fields: [
    defineField({name: 'name', type: 'string', validation: (r) => r.required()}),
    slugField('name'),
    defineField({name: 'order', description: 'Position in the dungeon run', type: 'number', validation: (r) => r.required().integer().min(0)}),
    defineField({name: 'description', description: 'Narrative seed for the DM', type: 'text', rows: 5, validation: (r) => r.required()}),
    defineField({
      name: 'encounter',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'encounterGroup',
          fields: [
            defineField({name: 'monster', type: 'reference', to: [{type: 'monster'}], validation: (r) => r.required()}),
            defineField({name: 'count', type: 'number', initialValue: 1, validation: (r) => r.required().integer().min(1)}),
          ],
          preview: {
            select: {name: 'monster.name', count: 'count'},
            prepare: ({name, count}) => ({title: `${count ?? 1} × ${name ?? 'Unknown monster'}`}),
          },
        }),
      ],
    }),
    defineField({name: 'isBoss', type: 'boolean', initialValue: false}),
    defineField({name: 'music', description: 'Music track key', type: 'string'}),
  ],
  orderings: [{title: 'Dungeon order', name: 'orderAsc', by: [{field: 'order', direction: 'asc'}]}],
  preview: {
    select: {title: 'name', order: 'order', isBoss: 'isBoss'},
    prepare: ({title, order, isBoss}) => ({title: `${order}. ${title}`, subtitle: isBoss ? 'Boss room' : undefined}),
  },
})
