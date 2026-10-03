// Graph model for the Rules Tome: nodes are Sanity documents, links are real Sanity references.
import type { GameContent } from '@/game/content/types';

export type NodeType = 'rule' | 'condition' | 'spell' | 'monster' | 'hero';
export interface GNode {
  id: string;
  label: string;
  type: NodeType;
  legacy: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}
export type LinkKind = 'related' | 'changed' | 'inflicts' | 'requires' | 'knows';
export interface GLink {
  source: string | GNode;
  target: string | GNode;
  kind: LinkKind;
}

export const TYPES: NodeType[] = ['rule', 'condition', 'spell', 'monster', 'hero'];

export const COLOR: Record<NodeType, string> = {
  rule: '#f2c46b',
  condition: '#f59e5b',
  spell: '#5fd4c4',
  monster: '#ff6b81',
  hero: '#7ab8ff',
};
export const LEGACY = '#b794ff';

/** text-presentation glyph drawn inside each node */
export const GLYPH: Record<NodeType, string> = {
  rule: '§',
  condition: '!',
  spell: '✦',
  monster: '☠︎',
  hero: '♛︎',
};

export const TYPE_LABEL: Record<NodeType, string> = {
  rule: 'Rules',
  condition: 'Conditions',
  spell: 'Spells',
  monster: 'Monsters',
  hero: 'Heroes',
};

/** cluster anchors in graph units: rules in the middle, the rest around it */
export const CENTER: Record<NodeType, { x: number; y: number }> = {
  rule: { x: 0, y: 0 },
  condition: { x: 250, y: 10 },
  spell: { x: -235, y: 95 },
  monster: { x: -225, y: -110 },
  hero: { x: -345, y: 150 },
};

export const idOf = (e: string | GNode) => (typeof e === 'string' ? e : e.id);

/** cheap deterministic hash so the initial layout is stable between reloads */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

export interface Graph {
  nodes: GNode[];
  links: GLink[];
  byId: Map<string, GNode>;
  /** undirected adjacency */
  neighbors: Map<string, Set<string>>;
  /** "a|b" (sorted) -> link */
  linkIndex: Map<string, GLink>;
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function buildGraph(c: GameContent): Graph {
  const nodes: GNode[] = [];
  const links: GLink[] = [];
  const byId = new Map<string, GNode>();
  const add = (n: GNode) => {
    if (byId.has(n.id)) return;
    const a = CENTER[n.type];
    const spread = n.type === 'rule' ? 110 : 60;
    const ang = hash(n.id) * Math.PI * 2;
    const rad = Math.sqrt(hash(n.id + '#')) * spread;
    n.x = a.x + Math.cos(ang) * rad;
    n.y = a.y + Math.sin(ang) * rad;
    byId.set(n.id, n);
    nodes.push(n);
  };
  c.rules.forEach((r) => add({ id: r._id, label: r.title, type: 'rule', legacy: r.srdVersion === '2014' }));
  c.conditions.forEach((r) => add({ id: r._id, label: r.name, type: 'condition', legacy: r.srdVersion === '2014' }));
  c.spells.forEach((r) => add({ id: r._id, label: r.name, type: 'spell', legacy: r.srdVersion === '2014' }));
  c.monsters.forEach((r) => add({ id: r._id, label: r.name, type: 'monster', legacy: false }));
  c.heroes.forEach((r) => add({ id: r._id, label: r.name, type: 'hero', legacy: false }));

  const linkIndex = new Map<string, GLink>();
  const neighbors = new Map<string, Set<string>>();
  const link = (a: string, b: string, kind: LinkKind) => {
    if (!byId.has(a) || !byId.has(b) || a === b) return;
    const k = pairKey(a, b);
    const existing = linkIndex.get(k);
    if (existing) {
      // a counterpart pairing wins over a plain "related" reference
      if (kind === 'changed') existing.kind = 'changed';
      return;
    }
    const l: GLink = { source: a, target: b, kind };
    linkIndex.set(k, l);
    links.push(l);
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    if (!neighbors.has(b)) neighbors.set(b, new Set());
    neighbors.get(a)!.add(b);
    neighbors.get(b)!.add(a);
  };
  c.rules.forEach((r) => {
    r.related?.forEach((t) => link(r._id, t, 'related'));
    if (r.srdVersion === '2014') link(r._id.replace(/\.2014$/, ''), r._id, 'changed');
  });
  c.conditions.forEach((r) => r.counterpartId && link(r._id, r.counterpartId, 'changed'));
  c.spells.forEach((s) => {
    if (s.inflicts) link(s._id, `condition.${s.inflicts}`, 'inflicts');
    if (s.concentration) link(s._id, 'rule.concentration', 'requires');
  });
  c.monsters.forEach((m) => m.attacks.forEach((a) => a.inflicts && link(m._id, `condition.${a.inflicts}`, 'inflicts')));
  c.heroes.forEach((h) => h.spells.forEach((s) => link(h._id, `spell.${s}`, 'knows')));
  return { nodes, links, byId, neighbors, linkIndex };
}

/** d3 force pulling each node toward its type's cluster anchor */
export function clusterForce(strength: number) {
  let nodes: GNode[] = [];
  const force = (alpha: number) => {
    for (const n of nodes) {
      const c = CENTER[n.type];
      const k = strength * alpha * (n.type === 'rule' ? 0.6 : 1);
      n.vx = (n.vx ?? 0) + (c.x - (n.x ?? 0)) * k;
      n.vy = (n.vy ?? 0) + (c.y - (n.y ?? 0)) * k;
    }
  };
  force.initialize = (ns: GNode[]) => {
    nodes = ns;
  };
  return force;
}
