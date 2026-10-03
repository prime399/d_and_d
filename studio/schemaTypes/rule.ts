import {defineArrayMember, defineField, defineType} from 'sanity'
import {slugField, srdVersionField} from './shared'

export const rule = defineType({
  name: 'rule',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (r) => r.required()}),
    slugField('title'),
    srdVersionField(),
    defineField({name: 'section', description: 'e.g. Combat, Spellcasting', type: 'string', validation: (r) => r.required()}),
    defineField({name: 'body', description: 'Plain text rule body', type: 'text', rows: 10, validation: (r) => r.required()}),
    defineField({
      name: 'related',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'rule'}, {type: 'condition'}, {type: 'spell'}]})],
    }),
  ],
  orderings: [{title: 'Section', name: 'sectionAsc', by: [{field: 'section', direction: 'asc'}, {field: 'title', direction: 'asc'}]}],
  preview: {
    select: {title: 'title', section: 'section', v: 'srdVersion'},
    prepare: ({title, section, v}) => ({title, subtitle: `${section ?? ''} · SRD ${v ?? '?'}`}),
  },
})
