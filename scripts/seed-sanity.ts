/**
 * Seed Sanity from src/game/content/fallback.json.
 *
 *   bun scripts/seed-sanity.ts            # write
 *   bun scripts/seed-sanity.ts --dry-run  # print converted docs, no writes
 *
 * Env: SANITY_PROJECT_ID, SANITY_DATASET (default "production"), SANITY_WRITE_TOKEN.
 *
 * Two passes so strong references never point at missing documents:
 *   1. createOrReplace every document with reference fields stripped
 *   2. patch the reference fields back in
 * Both passes are idempotent, so the script can be re-run safely.
 */
import {existsSync, readFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createClient} from '@sanity/client'
import type {
  Attack,
  Condition,
  GameContent,
  Hero,
  Monster,
  Room,
  Rule,
  Spell,
  SrdVersion,
} from '../src/game/content/types'

export type SanityDoc = {_id: string; _type: string; [key: string]: unknown}

export interface SeedPlan {
  /** Full documents, references included */
  docs: SanityDoc[]
  /** Pass 1: documents with reference fields removed */
  base: SanityDoc[]
  /** Pass 2: per-document `set` patches containing only reference fields */
  refPatches: {id: string; set: Record<string, unknown>}[]
  /** References that could not be resolved and were dropped */
  warnings: string[]
}

/** Fields per type that contain references (stripped in pass 1). */
export const REF_FIELDS: Record<string, string[]> = {
  monster: ['attacks'],
  hero: ['attacks', 'spells'],
  spell: ['inflicts'],
  condition: ['counterpart'],
  rule: ['related'],
  room: ['encounter'],
}

const ref = (id: string) => ({_type: 'reference', _ref: id})
const slug = (current: string) => ({_type: 'slug', current})

/** Stable, readable array keys (Sanity requires `_key` on object items in arrays). */
const keyOf = (prefix: string, i: number, hint?: string) =>
  `${prefix}${i}${hint ? '-' + hint.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) : ''}`

/** Drop undefined/null so Sanity doesn't store empty fields. */
function clean<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null) out[k] = v
  return out as T
}

export function toSanityDocs(content: Omit<GameContent, 'source'> & {source?: string}): SeedPlan {
  const warnings: string[] = []

  // Lookups: slug → id. Conditions exist per SRD version, so key by version too.
  const conditionIds = new Map<string, string>()
  const conditionAny = new Map<string, string>()
  for (const c of content.conditions) {
    conditionIds.set(`${c.slug}@${c.srdVersion}`, c._id)
    // Prefer the 2024 doc as the version-agnostic default.
    if (!conditionAny.has(c.slug) || c.srdVersion === '2024') conditionAny.set(c.slug, c._id)
  }
  const spellIds = new Map(content.spells.map((s) => [s.slug, s._id]))
  const monsterIds = new Map(content.monsters.map((m) => [m.slug, m._id]))
  const allIds = new Set<string>(
    [content.monsters, content.spells, content.conditions, content.rules, content.heroes, content.rooms]
      .flat()
      .map((d) => d._id),
  )

  const conditionRef = (s: string, v: SrdVersion | undefined, where: string) => {
    const id = (v && conditionIds.get(`${s}@${v}`)) ?? conditionAny.get(s)
    if (!id) warnings.push(`${where}: unknown condition "${s}" (dropped)`)
    return id ? ref(id) : undefined
  }

  const attacks = (list: Attack[] | undefined, v: SrdVersion | undefined, owner: string) =>
    (list ?? []).map((a, i) =>
      clean({
        _key: keyOf('atk', i, a.name),
        _type: 'attack',
        name: a.name,
        toHit: a.toHit,
        damage: a.damage,
        damageType: a.damageType,
        range: a.range,
        inflicts: a.inflicts ? conditionRef(a.inflicts, v, `${owner}.attacks[${i}]`) : undefined,
        inflictsSave: a.inflictsSave ? {ability: a.inflictsSave.ability, dc: a.inflictsSave.dc} : undefined,
      }),
    )

  const docs: SanityDoc[] = []

  for (const m of content.monsters as Monster[]) {
    docs.push(
      clean({
        _id: m._id,
        _type: 'monster',
        name: m.name,
        slug: slug(m.slug),
        srdVersion: m.srdVersion,
        cr: m.cr,
        xp: m.xp,
        ac: m.ac,
        hp: m.hp,
        speed: m.speed,
        abilities: {_type: 'abilities', ...m.abilities},
        attacks: attacks(m.attacks, m.srdVersion, m._id),
        spriteKey: m.spriteKey,
        description: m.description,
      }),
    )
  }

  for (const s of content.spells as Spell[]) {
    docs.push(
      clean({
        _id: s._id,
        _type: 'spell',
        name: s.name,
        slug: slug(s.slug),
        srdVersion: s.srdVersion,
        level: s.level,
        school: s.school,
        concentration: s.concentration,
        range: s.range,
        kind: s.kind,
        save: s.save,
        dice: s.dice,
        damageType: s.damageType,
        inflicts: s.inflicts ? conditionRef(s.inflicts, s.srdVersion, s._id) : undefined,
        radius: s.radius,
        iconKey: s.iconKey,
        summary: s.summary,
      }),
    )
  }

  for (const c of content.conditions as Condition[]) {
    let counterpart: ReturnType<typeof ref> | undefined
    if (c.counterpartId) {
      if (allIds.has(c.counterpartId)) counterpart = ref(c.counterpartId)
      else warnings.push(`${c._id}: unknown counterpart "${c.counterpartId}" (dropped)`)
    }
    docs.push(
      clean({
        _id: c._id,
        _type: 'condition',
        name: c.name,
        slug: slug(c.slug),
        srdVersion: c.srdVersion,
        effects: [...c.effects],
        counterpart,
      }),
    )
  }

  for (const r of content.rules as Rule[]) {
    const related = (r.related ?? []).flatMap((id, i) => {
      if (!allIds.has(id)) {
        warnings.push(`${r._id}.related: unknown id "${id}" (dropped)`)
        return []
      }
      return [{_key: keyOf('rel', i), ...ref(id)}]
    })
    docs.push(
      clean({
        _id: r._id,
        _type: 'rule',
        title: r.title,
        slug: slug(r.slug),
        srdVersion: r.srdVersion,
        section: r.section,
        body: r.body,
        related: related.length ? related : undefined,
      }),
    )
  }

  for (const h of content.heroes as Hero[]) {
    const spells = (h.spells ?? []).flatMap((s, i) => {
      const id = spellIds.get(s)
      if (!id) {
        warnings.push(`${h._id}.spells: unknown spell "${s}" (dropped)`)
        return []
      }
      return [{_key: keyOf('sp', i, s), ...ref(id)}]
    })
    const slots = Object.entries(h.slots ?? {})
      .map(([level, count]) => ({level: Number(level), count: Number(count)}))
      .sort((a, b) => a.level - b.level)
      .map((s) => ({_key: `lvl${s.level}`, _type: 'slot', ...s}))
    docs.push(
      clean({
        _id: h._id,
        _type: 'hero',
        name: h.name,
        slug: slug(h.slug),
        className: h.className,
        level: h.level,
        ac: h.ac,
        hp: h.hp,
        speed: h.speed,
        abilities: {_type: 'abilities', ...h.abilities},
        proficiency: h.proficiency,
        // Heroes carry no srdVersion; resolve inflicted conditions to the 2024 doc.
        attacks: attacks(h.attacks, undefined, h._id),
        spells,
        slots,
        spellAttack: h.spellAttack,
        spellDc: h.spellDc,
        spriteKey: h.spriteKey,
        potions: h.potions,
        blurb: h.blurb,
      }),
    )
  }

  for (const r of content.rooms as Room[]) {
    const encounter = (r.encounter ?? []).flatMap((g, i) => {
      const id = monsterIds.get(g.monster)
      if (!id) {
        warnings.push(`${r._id}.encounter: unknown monster "${g.monster}" (dropped)`)
        return []
      }
      return [{_key: keyOf('enc', i, g.monster), _type: 'encounterGroup', monster: ref(id), count: g.count}]
    })
    docs.push(
      clean({
        _id: r._id,
        _type: 'room',
        name: r.name,
        slug: slug(r.slug),
        order: r.order,
        description: r.description,
        encounter,
        isBoss: r.isBoss,
        music: r.music,
      }),
    )
  }

  // Split into pass-1 base docs and pass-2 reference patches.
  const base: SanityDoc[] = []
  const refPatches: SeedPlan['refPatches'] = []
  for (const doc of docs) {
    const fields = REF_FIELDS[doc._type] ?? []
    const stripped: SanityDoc = {...doc}
    const set: Record<string, unknown> = {}
    for (const f of fields) {
      const value = doc[f]
      if (value === undefined) continue
      if (f === 'attacks') {
        // Keep attacks in pass 1 minus their `inflicts` refs; patch the full array in pass 2.
        const list = value as Record<string, unknown>[]
        stripped.attacks = list.map(({inflicts: _drop, ...rest}) => rest)
        if (list.some((a) => a.inflicts)) set.attacks = list
      } else {
        delete stripped[f]
        set[f] = value
      }
    }
    base.push(stripped)
    if (Object.keys(set).length) refPatches.push({id: doc._id, set})
  }

  return {docs, base, refPatches, warnings}
}

export function countByType(docs: SanityDoc[]): Record<string, number> {
  return docs.reduce<Record<string, number>>((acc, d) => {
    acc[d._type] = (acc[d._type] ?? 0) + 1
    return acc
  }, {})
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

const BATCH = 50

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const dryRun = process.argv.includes('--dry-run')

  // Bun loads .env.local automatically; Node needs a nudge.
  for (const f of ['.env.local', '.env']) {
    const p = path.join(root, f)
    if (!process.env.SANITY_PROJECT_ID && existsSync(p)) {
      try {
        process.loadEnvFile(p)
      } catch {
        /* ignore malformed env file */
      }
    }
  }

  const file = path.join(root, 'src/game/content/fallback.json')
  if (!existsSync(file)) {
    console.error(`Missing ${path.relative(root, file)}. Run \`pnpm content:build\` first.`)
    process.exit(1)
  }
  const content = JSON.parse(readFileSync(file, 'utf8')) as GameContent
  const plan = toSanityDocs(content)

  for (const w of plan.warnings) console.warn(`warn: ${w}`)

  if (dryRun) {
    console.log(JSON.stringify(plan.docs, null, 2))
    console.log('\nDry run, nothing written. Counts:', countByType(plan.docs))
    console.log(`Reference patches: ${plan.refPatches.length}`)
    return
  }

  const projectId = process.env.SANITY_PROJECT_ID
  const dataset = process.env.SANITY_DATASET || 'production'
  const token = process.env.SANITY_WRITE_TOKEN
  if (!projectId || !token) {
    console.error('Set SANITY_PROJECT_ID and SANITY_WRITE_TOKEN (and optionally SANITY_DATASET).')
    process.exit(1)
  }

  const client = createClient({projectId, dataset, token, apiVersion: '2025-02-19', useCdn: false})

  console.log(`Seeding ${plan.base.length} documents into ${projectId}/${dataset}`)

  // Pass 1: documents without references.
  for (const [i, batch] of chunk(plan.base, BATCH).entries()) {
    const tx = client.transaction()
    for (const doc of batch) tx.createOrReplace(doc)
    await tx.commit({autoGenerateArrayKeys: false})
    console.log(`  pass 1 batch ${i + 1}: ${batch.length} docs`)
  }

  // Pass 2: reference fields, now that every target exists.
  for (const [i, batch] of chunk(plan.refPatches, BATCH).entries()) {
    const tx = client.transaction()
    for (const p of batch) tx.patch(p.id, (patch) => patch.set(p.set))
    await tx.commit({autoGenerateArrayKeys: false})
    console.log(`  pass 2 batch ${i + 1}: ${batch.length} patches`)
  }

  console.log('Done. Documents per type:')
  for (const [type, n] of Object.entries(countByType(plan.docs))) console.log(`  ${type.padEnd(10)} ${n}`)
}

const isEntry =
  (import.meta as ImportMeta & {main?: boolean}).main === true ||
  (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))

if (isEntry) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
