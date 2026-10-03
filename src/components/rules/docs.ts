// Resolves a Sanity document id into what the doc card shows, including its outgoing/incoming references.
import type { GameContent } from '@/game/content/types';
import type { Graph, NodeType } from './graphModel';
import { idOf } from './graphModel';

export interface DocView {
  id: string;
  type: NodeType;
  title: string;
  subtitle?: string;
  version: '2014' | '2024';
  body?: string;
  effects?: string[];
  stats?: { k: string; v: string }[];
  counterpart?: string;
  related: { id: string; label: string; type: NodeType; legacy: boolean; kind: string }[];
}

const KIND_LABEL: Record<string, string> = {
  related: 'related',
  changed: 'other edition',
  inflicts: 'inflicts',
  requires: 'requires',
  knows: 'knows',
};

export function findDoc(c: GameContent, g: Graph, id: string): DocView | null {
  if (!id) return null;
  const related = () => {
    const out: DocView['related'] = [];
    for (const l of g.links) {
      const s = idOf(l.source);
      const t = idOf(l.target);
      if (s !== id && t !== id) continue;
      const other = g.byId.get(s === id ? t : s);
      if (!other) continue;
      const kind = l.kind === 'inflicts' && t === id ? 'inflicted by' : l.kind === 'knows' && t === id ? 'known by' : KIND_LABEL[l.kind];
      out.push({ id: other.id, label: other.label, type: other.type, legacy: other.legacy, kind });
    }
    // outgoing references first, other edition last
    return out.sort((a, b) => Number(a.kind === 'other edition') - Number(b.kind === 'other edition'));
  };

  const r = c.rules.find((x) => x._id === id);
  if (r) {
    const cp = r.srdVersion === '2014' ? r._id.replace(/\.2014$/, '') : `${r._id}.2014`;
    return { id, type: 'rule', title: r.title, subtitle: r.section, version: r.srdVersion, body: r.body, counterpart: g.byId.has(cp) ? cp : undefined, related: related() };
  }
  const k = c.conditions.find((x) => x._id === id);
  if (k) return { id, type: 'condition', title: k.name, subtitle: 'Condition', version: k.srdVersion, effects: k.effects, counterpart: k.counterpartId, related: related() };
  const s = c.spells.find((x) => x._id === id);
  if (s)
    return {
      id,
      type: 'spell',
      title: s.name,
      subtitle: `${s.level === 0 ? 'Cantrip' : `Level ${s.level}`} · ${s.school}${s.concentration ? ' · Concentration' : ''}`,
      version: s.srdVersion,
      body: s.summary,
      stats: [
        { k: 'Range', v: `${s.range * 5} ft` },
        ...(s.dice ? [{ k: s.kind === 'heal' ? 'Heals' : 'Damage', v: `${s.dice}${s.damageType ? ` ${s.damageType}` : ''}` }] : []),
        ...(s.save ? [{ k: 'Save', v: s.save.toUpperCase() }] : []),
        ...(s.radius ? [{ k: 'Area', v: `${s.radius * 5} ft` }] : []),
      ],
      related: related(),
    };
  const m = c.monsters.find((x) => x._id === id);
  if (m)
    return {
      id,
      type: 'monster',
      title: m.name,
      subtitle: `CR ${m.cr < 1 ? `1/${Math.round(1 / m.cr)}` : m.cr} · ${m.xp} XP`,
      version: m.srdVersion,
      body: m.description,
      stats: [
        { k: 'AC', v: String(m.ac) },
        { k: 'HP', v: String(m.hp) },
        { k: 'Speed', v: `${m.speed * 5} ft` },
      ],
      effects: m.attacks.map((a) => `${a.name}: +${a.toHit} to hit, ${a.damage} ${a.damageType}${a.range > 1 ? `, range ${a.range * 5} ft` : ''}${a.inflicts ? `, ${a.inflicts} on hit` : ''}`),
      related: related(),
    };
  const h = c.heroes.find((x) => x._id === id);
  if (h)
    return {
      id,
      type: 'hero',
      title: h.name,
      subtitle: `${h.className} ${h.level}`,
      version: '2024',
      body: h.blurb,
      stats: [
        { k: 'AC', v: String(h.ac) },
        { k: 'HP', v: String(h.hp) },
        { k: 'Speed', v: `${h.speed * 5} ft` },
      ],
      related: related(),
    };
  return null;
}

/** text for a condition/rule in a specific edition, as a list of lines for the diff view */
export function linesOf(c: GameContent, id: string): string[] {
  const k = c.conditions.find((x) => x._id === id);
  if (k) return k.effects;
  const r = c.rules.find((x) => x._id === id);
  if (r) return r.body.split(/(?<=\.)\s+(?=[A-Z])/);
  return [];
}
