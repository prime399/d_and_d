// Loads GameContent from Sanity (when configured) with a bundled SRD fallback.
import { getSanityClient } from '../../sanity/client';
import fallbackJson from './fallback.json';
import type { Condition, GameContent, Hero, Monster, Room, Rule, Spell } from './types';

export const fallbackContent = fallbackJson as unknown as GameContent;

/** One query for the whole game; projections mirror src/game/content/types.ts. */
export const CONTENT_QUERY = /* groq */ `{
  "monsters": *[_type == "monster"] | order(cr asc, name asc) {
    _id, "slug": slug.current, name, cr, xp, ac, hp, speed, abilities,
    "attacks": attacks[]{
      name, toHit, damage, damageType, range,
      "inflicts": inflicts->slug.current, inflictsSave
    },
    spriteKey, description, srdVersion
  },
  "spells": *[_type == "spell"] | order(level asc, name asc) {
    _id, "slug": slug.current, name, level, school, concentration, range, kind, save,
    dice, damageType, "inflicts": inflicts->slug.current, radius, iconKey, summary, srdVersion
  },
  "conditions": *[_type == "condition"] | order(name asc) {
    _id, "slug": slug.current, name, effects, srdVersion, "counterpartId": counterpart._ref
  },
  "rules": *[_type == "rule"] | order(section asc, title asc) {
    _id, "slug": slug.current, title, section, body, srdVersion, "related": related[]._ref
  },
  "heroes": *[_type == "hero"] | order(name asc) {
    _id, "slug": slug.current, name, className, level, ac, hp, speed, abilities, proficiency,
    "attacks": attacks[]{
      name, toHit, damage, damageType, range,
      "inflicts": inflicts->slug.current, inflictsSave
    },
    "spells": spells[]->slug.current, slots, spellAttack, spellDc, spriteKey, potions, blurb
  },
  "rooms": *[_type == "room"] | order(order asc) {
    _id, "slug": slug.current, name, order, description,
    "encounter": encounter[]{ "monster": monster->slug.current, count },
    isBoss, music
  }
}`;

const TIMEOUT_MS = 4000;

type Raw = Omit<GameContent, 'source'>;

/** GROQ returns null for missing fields; strip them so optional props are undefined. */
function stripNulls<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripNulls) as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== null) out[k] = stripNulls(x);
    return out as T;
  }
  return v;
}

/** Sanity stores slots as an object of strings/numbers; normalise to Record<number, number>. */
function normaliseSlots(slots: unknown): Record<number, number> {
  const out: Record<number, number> = {};
  if (Array.isArray(slots)) {
    for (const s of slots as { level?: number; count?: number }[]) if (s?.level) out[s.level] = s.count ?? 0;
  } else if (slots && typeof slots === 'object') {
    for (const [k, v] of Object.entries(slots)) if (/^\d+$/.test(k)) out[Number(k)] = Number(v);
  }
  return out;
}

function isUsable(c: Partial<Raw> | null | undefined): c is Raw {
  return Boolean(c?.heroes?.length && c?.rooms?.length && c?.monsters?.length);
}

export async function loadContent(): Promise<GameContent> {
  const client = getSanityClient();
  if (!client) return fallbackContent;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let raw: Raw | null;
    try {
      raw = await client.fetch<Raw | null>(CONTENT_QUERY, {}, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!isUsable(raw)) {
      console.warn('[content] Sanity returned incomplete content; using fallback');
      return fallbackContent;
    }
    const c = stripNulls(raw);
    return {
      monsters: c.monsters ?? [],
      spells: c.spells ?? [],
      conditions: c.conditions ?? [],
      rules: (c.rules ?? []).map((r) => ({ ...r, related: r.related ?? [] })),
      heroes: c.heroes.map((h) => ({ ...h, spells: h.spells ?? [], slots: normaliseSlots(h.slots) })),
      rooms: c.rooms.map((r) => ({ ...r, encounter: r.encounter ?? [] })),
      source: 'sanity',
    };
  } catch (err) {
    console.warn('[content] Sanity fetch failed; using fallback:', err instanceof Error ? err.message : err);
    return fallbackContent;
  }
}

export interface ContentIndex {
  monsters: Map<string, Monster>;
  spells: Map<string, Spell>;
  /** 2024 conditions keyed by slug; 2014 versions keyed by `${slug}.2014` */
  conditions: Map<string, Condition>;
  rules: Map<string, Rule>;
  heroes: Map<string, Hero>;
  rooms: Map<string, Room>;
}

export function indexContent(c: GameContent): ContentIndex {
  const bySlug = <T extends { slug: string }>(xs: T[]) => new Map(xs.map((x) => [x.slug, x]));
  return {
    monsters: bySlug(c.monsters),
    spells: bySlug(c.spells),
    conditions: new Map(c.conditions.map((x) => [x.srdVersion === '2014' ? `${x.slug}.2014` : x.slug, x])),
    // rules have both versions under one slug; key 2014 ones like conditions
    rules: new Map(c.rules.map((x) => [x.srdVersion === '2014' && x._id.endsWith('.2014') ? `${x.slug}.2014` : x.slug, x])),
    heroes: bySlug(c.heroes),
    rooms: bySlug(c.rooms),
  };
}
