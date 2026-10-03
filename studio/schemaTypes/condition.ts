import {defineArrayMember, defineField, defineType} from 'sanity'
import {slugField, srdVersionField} from './shared'

export const condition = defineType({
  name: 'condition',
  type: 'document',
  fields: [
    defineField({name: 'name', type: 'string', validation: (r) => r.required()}),
    slugField('name'),
    srdVersionField(),
    defineField({
      name: 'effects',
      description: 'Short mechanical effects, one per line',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      validation: (r) => r.required().min(1),
    }),
    defineField({
      name: 'counterpart',
      description: 'Same condition in the other SRD version, if it changed',
      type: 'reference',
      to: [{type: 'condition'}],
      options: {filter: ({document}) => ({filter: 'srdVersion != $v', params: {v: document?.srdVersion ?? ''}})},
    }),
  ],
  orderings: [{title: 'Name', name: 'nameAsc', by: [{field: 'name', direction: 'asc'}]}],
  preview: {
    select: {title: 'name', v: 'srdVersion', counterpart: 'counterpart.srdVersion'},
    prepare: ({title, v, counterpart}) => ({
      title,
      subtitle: `SRD ${v ?? '?'}${counterpart ? ` · changed vs ${counterpart}` : ''}`,
    }),
  },
})
