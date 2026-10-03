'use client';
// Knowledge graph of the Sanity content references. Nodes the DM/engine touched light up.
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameContent } from '@/game/content/types';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

type NodeType = 'rule' | 'condition' | 'spell' | 'monster' | 'hero';
interface GNode { id: string; label: string; type: NodeType; legacy: boolean; x?: number; y?: number }
interface GLink { source: string | GNode; target: string | GNode; kind: string }

const COLOR: Record<NodeType, string> = {
  rule: '#f5c46b',
  condition: '#ff7a7a',
  spell: '#7ab8ff',
  monster: '#9be37a',
  hero: '#e8d9ff',
};

export function buildGraph(c: GameContent) {
  const nodes: GNode[] = [];
  const links: GLink[] = [];
  const ids = new Set<string>();
  const add = (n: GNode) => {
    if (!ids.has(n.id)) {
      ids.add(n.id);
      nodes.push(n);
    }
  };
  c.rules.forEach((r) => add({ id: r._id, label: r.title, type: 'rule', legacy: r.srdVersion === '2014' }));
  c.conditions.forEach((r) => add({ id: r._id, label: r.name, type: 'condition', legacy: r.srdVersion === '2014' }));
  c.spells.forEach((r) => add({ id: r._id, label: r.name, type: 'spell', legacy: r.srdVersion === '2014' }));
  c.monsters.forEach((r) => add({ id: r._id, label: r.name, type: 'monster', legacy: false }));
  c.heroes.forEach((r) => add({ id: r._id, label: r.name, type: 'hero', legacy: false }));
  const link = (a: string, b: string, kind: string) => {
    if (ids.has(a) && ids.has(b) && a !== b) links.push({ source: a, target: b, kind });
  };
  c.rules.forEach((r) => r.related?.forEach((t) => link(r._id, t, 'related')));
  c.conditions.forEach((r) => r.counterpartId && r.srdVersion === '2024' && link(r._id, r.counterpartId, 'changed'));
  c.spells.forEach((s) => {
    if (s.inflicts) link(s._id, `condition.${s.inflicts}`, 'inflicts');
    if (s.concentration) link(s._id, 'rule.concentration', 'requires');
  });
  c.monsters.forEach((m) => m.attacks.forEach((a) => a.inflicts && link(m._id, `condition.${a.inflicts}`, 'inflicts')));
  c.heroes.forEach((h) => h.spells.forEach((s) => link(h._id, `spell.${s}`, 'knows')));
  return { nodes, links };
}

export function RulesGraph({
  content,
  lit,
  focus,
  onSelect,
}: {
  content: GameContent;
  /** id -> recency (higher = more recent) */
  lit: Map<string, number>;
  focus: string | null;
  onSelect: (id: string) => void;
}) {
  const data = useMemo(() => buildGraph(content), [content]);
  const wrap = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fg = useRef<any>(null);
  const [size, setSize] = useState({ w: 300, h: 300 });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  // pulse animation for lit nodes
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 120);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!focus || !fg.current) return;
    const n = data.nodes.find((x) => x.id === focus);
    if (n && n.x !== undefined && n.y !== undefined) {
      fg.current.centerAt(n.x, n.y, 600);
      fg.current.zoom(3, 600);
    }
  }, [focus, data.nodes]);

  const max = Math.max(1, ...lit.values());
  const litLinks = (l: GLink) => {
    const s = typeof l.source === 'string' ? l.source : l.source.id;
    const t = typeof l.target === 'string' ? l.target : l.target.id;
    return lit.has(s) && lit.has(t);
  };

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden">
      <ForceGraph2D
        ref={fg}
        width={size.w}
        height={size.h}
        graphData={data}
        backgroundColor="rgba(0,0,0,0)"
        cooldownTicks={120}
        nodeRelSize={3}
        linkColor={(l: object) => (litLinks(l as GLink) ? 'rgba(255,214,120,0.9)' : (l as GLink).kind === 'changed' ? 'rgba(180,140,255,0.35)' : 'rgba(255,255,255,0.07)')}
        linkWidth={(l: object) => (litLinks(l as GLink) ? 1.6 : 0.5)}
        linkLineDash={(l: object) => ((l as GLink).kind === 'changed' ? [2, 2] : null)}
        linkDirectionalParticles={(l: object) => (litLinks(l as GLink) ? 2 : 0)}
        linkDirectionalParticleWidth={1.8}
        onNodeClick={(n: object) => onSelect((n as GNode).id)}
        nodeLabel={(n: object) => `${(n as GNode).label}${(n as GNode).legacy ? ' (2014)' : ''} · ${(n as GNode).id}`}
        nodeCanvasObject={(n: object, ctx: CanvasRenderingContext2D, scale: number) => {
          const node = n as GNode;
          const on = lit.get(node.id);
          const isFocus = node.id === focus;
          const r = (node.type === 'rule' ? 3 : 2.4) + (on ? 1.5 : 0);
          const x = node.x ?? 0;
          const y = node.y ?? 0;
          if (on) {
            const recency = on / max;
            const pulse = 4 + Math.sin(tick / 2 + x) * 1.5;
            ctx.beginPath();
            ctx.arc(x, y, r + pulse * recency + (isFocus ? 3 : 0), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,200,90,${0.15 + 0.25 * recency})`;
            ctx.fill();
          }
          ctx.beginPath();
          if (node.legacy) {
            ctx.rect(x - r, y - r, r * 2, r * 2);
          } else {
            ctx.arc(x, y, r, 0, Math.PI * 2);
          }
          ctx.fillStyle = on ? COLOR[node.type] : `${COLOR[node.type]}55`;
          ctx.fill();
          if (isFocus) {
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#fff';
            ctx.stroke();
          }
          if (on || scale > 2.2) {
            const fs = Math.max(2.5, 10 / scale);
            ctx.font = `${on ? 600 : 400} ${fs}px ui-sans-serif, system-ui`;
            ctx.textAlign = 'center';
            ctx.fillStyle = on ? '#fff3d6' : 'rgba(255,255,255,0.5)';
            ctx.fillText(node.label + (node.legacy ? ' ’14' : ''), x, y + r + fs + 1);
          }
        }}
      />
      <div className="pointer-events-none absolute bottom-1 left-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/60">
        {(Object.keys(COLOR) as NodeType[]).map((t) => (
          <span key={t} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR[t] }} />
            {t}
          </span>
        ))}
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 bg-violet-300" /> 2014 version</span>
      </div>
    </div>
  );
}
