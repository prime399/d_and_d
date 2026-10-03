import {defineArrayMember, defineField, defineType} from 'sanity'
import {slugField, srdVersionField} from './shared'

export const monster = defineType({
  name: 'monster',
  type: 'document',
  fields: [
    defineField({name: 'name', type: 'string', validation: (r) => r.required()}),
    slugField('name'),
    srdVersionField(),
    defineField({name: 'cr', title: 'Challenge rating', type: 'number', validation: (r) => r.required().min(0)}),
    defineField({name: 'xp', type: 'number', validation: (r) => r.required().min(0)}),
    defineField({name: 'ac', title: 'Armor class', type: 'number', validation: (r) => r.required().min(1)}),
    defineField({name: 'hp', title: 'Hit points', type: 'number', validation: (r) => r.required().min(1)}),
    defineField({name: 'speed', description: 'Tiles per turn', type: 'number', validation: (r) => r.required().min(0)}),
    defineField({name: 'abilities', type: 'abilities', validation: (r) => r.required()}),
    defineField({
      name: 'attacks',
      type: 'array',
      of: [defineArrayMember({type: 'attack'})],
      validation: (r) => r.required().min(1),
    }),
    defineField({name: 'spriteKey', description: 'Key into the sprite registry', type: 'string', validation: (r) => r.required()}),
    defineField({name: 'description', type: 'text', rows: 4}),
  ],
  orderings: [
    {title: 'Challenge rating', name: 'crAsc', by: [{field: 'cr', direction: 'asc'}]},
    {title: 'Name', name: 'nameAsc', by: [{field: 'name', direction: 'asc'}]},
  ],
  preview: {
    select: {title: 'name', cr: 'cr', hp: 'hp', ac: 'ac', v: 'srdVersion'},
    prepare: ({title, cr, hp, ac, v}) => ({title, subtitle: `CR ${cr} · HP ${hp} · AC ${ac} · SRD ${v ?? '?'}`}),
  },
})
