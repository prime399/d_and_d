import type {StructureResolver} from 'sanity/structure'

const VERSIONS = [
  {id: '2024', title: 'SRD 5.2.1 (2024)'},
  {id: '2014', title: 'SRD 5.1 (2014)'},
]

/** Desk: grouped by type; conditions and rules split by SRD version. */
export const structure: StructureResolver = (S) => {
  const byVersion = (type: string, title: string, ordering: {field: string; direction: 'asc' | 'desc'}[]) =>
    S.listItem()
      .title(title)
      .schemaType(type)
      .child(
        S.list()
          .title(title)
          .items([
            ...VERSIONS.map((v) =>
              S.listItem()
                .id(`${type}-${v.id}`)
                .title(v.title)
                .schemaType(type)
                .child(
                  S.documentTypeList(type)
                    .title(`${title} · ${v.title}`)
                    .filter('_type == $type && srdVersion == $v')
                    .params({type, v: v.id})
                    .defaultOrdering(ordering),
                ),
            ),
            S.divider(),
            S.listItem().id(`${type}-all`).title(`All ${title.toLowerCase()}`).schemaType(type).child(S.documentTypeList(type).title(title).defaultOrdering(ordering)),
          ]),
      )

  return S.list()
    .title('Content')
    .items([
      S.listItem().title('Rooms').schemaType('room').child(S.documentTypeList('room').title('Rooms').defaultOrdering([{field: 'order', direction: 'asc'}])),
      S.listItem().title('Monsters').schemaType('monster').child(S.documentTypeList('monster').title('Monsters').defaultOrdering([{field: 'cr', direction: 'asc'}])),
      S.listItem().title('Heroes').schemaType('hero').child(S.documentTypeList('hero').title('Heroes')),
      S.listItem().title('Spells').schemaType('spell').child(S.documentTypeList('spell').title('Spells').defaultOrdering([{field: 'level', direction: 'asc'}])),
      S.divider(),
      byVersion('condition', 'Conditions', [{field: 'name', direction: 'asc'}]),
      byVersion('rule', 'Rules', [{field: 'section', direction: 'asc'}]),
    ])
}
