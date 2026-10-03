// Doc lookup helpers for DM citations: kind, icon and a short preview from game content.
import type { GameContent } from '@/game/content/types';

export type DocKind = 'rule' | 'condition' | 'spell' | 'monster' | 'hero' | 'doc';

export const KIND_ICON: Record<DocKind, string> = {
  rule: '📜',
  condition: '☠',
  spell: '✦',
  monster: '👹',
  hero: '🛡',
  doc: '📜',
};

export function docKind(id: string): DocKind {
  const p = id.split('.')[0];
  return p === 'rule' || p === 'condition' || p === 'spell' || p === 'monster' || p === 'hero' ? p : 'doc';
}

export const isLegacy = (id: string) => id.endsWith('.2014');

export interface DocPreview {
  title: string;
  body: string;
  version: string;
  kind: DocKind;
}

const cache = new WeakMap<GameContent, Map<string, DocPreview | null>>();

export function findDoc(c: GameContent, id: string): DocPreview | null {
  let m = cache.get(c);
  if (!m) cache.set(c, (m = new Map()));
  if (m.has(id)) return m.get(id)!;
  const doc = lookup(c, id);
  m.set(id, doc);
  return doc;
}

function lookup(c: GameContent, id: string): DocPreview | null {
  const kind = docKind(id);
  const r = c.rules.find((x) => x._id === id);
  if (r) return { title: r.title, body: r.body, version: r.srdVersion, kind };
  const k = c.conditions.find((x) => x._id === id);
  if (k) return { title: k.name, body: k.effects.join(' • '), version: k.srdVersion, kind };
  const s = c.spells.find((x) => x._id === id);
  if (s) return { title: `${s.name} (${s.level === 0 ? 'cantrip' : `level ${s.level}`} ${s.school})`, body: s.summary, version: s.srdVersion, kind };
  const mo = c.monsters.find((x) => x._id === id);
  if (mo) return { title: `${mo.name} (CR ${mo.cr})`, body: `AC ${mo.ac}, HP ${mo.hp}. ${mo.attacks.map((a) => `${a.name} +${a.toHit}, ${a.damage} ${a.damageType}`).join('; ')}. ${mo.description ?? ''}`, version: mo.srdVersion, kind };
  const h = c.heroes.find((x) => x._id === id);
  if (h) return { title: `${h.name}, ${h.className} ${h.level}`, body: h.blurb, version: '2024', kind };
  return null;
}

export function clip(s: string, n = 200) {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n).trimEnd()}…` : t;
}

/** DM text with citations replaced by their titles, for screen readers. */
export function plainText(text: string, titles: Record<string, string>) {
  return text.replace(/\[\[([^\]]+)\]\]/g, (_, id: string) => ` (${titles[id.trim()] ?? id.trim()})`).replace(/\s+/g, ' ').trim();
}
