'use client';
// Knowledge graph of the Sanity content references. Nodes the DM/engine touched light up and the
// path between consecutive lookups is animated, so you can watch the agent traverse the graph.
//
// Perf note: every prop handed to ForceGraph2D is referentially stable. Live state (lit, focus,
// hover, filters, traversal) is read from refs inside the canvas callbacks, and animation uses
// performance.now() with autoPauseRedraw={false}. Re-rendering this component therefore never
// makes force-graph re-digest its accessors.
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import { CENTER, COLOR, GLYPH, LEGACY, TYPES, TYPE_LABEL, clusterForce, idOf, pairKey } from './rules/graphModel';
import type { GLink, GNode, Graph, NodeType } from './rules/graphModel';
import { buildTraversal } from './rules/traversal';
import type { Traversal } from './rules/traversal';
import { GraphSearch } from './rules/GraphSearch';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

const GOLD = '#ffd27a';
const IDLE_MS = 5000;
const HOP_MS = 380; // per edge travelled by the pulse

type FG = ForceGraphMethods<GNode, GLink>;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function baseRadius(n: GNode) {
  return n.type === 'rule' ? 6.5 : n.type === 'hero' ? 6 : n.type === 'monster' ? 5.5 : 5;
}

export function RulesGraph({
  graph,
  lit,
  focus,
  onSelect,
  onClear,
}: {
  graph: Graph;
  /** id -> recency (higher = more recent) */
  lit: Map<string, number>;
  focus: string | null;
  onSelect: (id: string) => void;
  onClear: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<FG | undefined>(undefined);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hidden, setHidden] = useState<Set<NodeType>>(() => new Set());

  // ---- live state mirrored into refs for the canvas callbacks ----
  const traversal = useMemo(() => buildTraversal(graph, lit), [graph, lit]);
  const maxLit = useMemo(() => Math.max(0, ...lit.values()), [lit]);
  const litRef = useRef({ lit, max: maxLit });
  const focusRef = useRef(focus);
  const travRef = useRef<Traversal>(traversal);
  const hiddenRef = useRef(hidden);
  const hoverRef = useRef<{ id: string; nb: Set<string> } | null>(null);
  const hopStart = useRef(0);
  const lastInteract = useRef(0);
  const selfSelect = useRef(0);
  const fitted = useRef(false);
  const fonts = useRef({ body: 'ui-sans-serif, system-ui, sans-serif', display: 'Georgia, serif' });
  const halos = useRef<{ frame: number; list: { t: NodeType; x: number; y: number; r: number }[] }>({ frame: 0, list: [] });

  useEffect(() => {
    litRef.current = { lit, max: maxLit };
    focusRef.current = focus;
    hiddenRef.current = hidden;
  }, [lit, maxLit, focus, hidden]);

  useEffect(() => {
    const prev = travRef.current;
    travRef.current = traversal;
    const prevLast = prev.trail[prev.trail.length - 1];
    const last = traversal.trail[traversal.trail.length - 1];
    if (last && last !== prevLast) hopStart.current = performance.now();
  }, [traversal]);

  // resolve the next/font families once so canvas text matches the UI
  useEffect(() => {
    const probe = document.createElement('span');
    probe.className = 'font-display';
    document.body.appendChild(probe);
    fonts.current = { body: getComputedStyle(document.body).fontFamily || fonts.current.body, display: getComputedStyle(probe).fontFamily || fonts.current.display };
    probe.remove();
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.floor(e.contentRect.width);
      const h = Math.floor(e.contentRect.height);
      // a hidden tab reports 0x0: keep the last size so the graph is not torn down
      if (w > 0 && h > 0) setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    const mark = () => (lastInteract.current = performance.now());
    el.addEventListener('pointerdown', mark);
    el.addEventListener('wheel', mark, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('pointerdown', mark);
      el.removeEventListener('wheel', mark);
    };
  }, []);

  // ---- forces: cluster by type, short counterpart links, weak cross-cluster links ----
  const configure = useCallback((inst: FG) => {
    const typeOf = (e: string | GNode) => graph.byId.get(idOf(e))?.type;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const link = inst.d3Force('link') as any;
    link
      ?.distance((l: GLink) => (l.kind === 'changed' ? 14 : typeOf(l.source) === typeOf(l.target) ? 34 : 90))
      .strength((l: GLink) => (l.kind === 'changed' ? 0.9 : typeOf(l.source) === typeOf(l.target) ? 0.12 : 0.015));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (inst.d3Force('charge') as any)?.strength(-38).distanceMax(140);
    inst.d3Force('center', null);
    inst.d3Force('cluster', clusterForce(0.06));
    inst.d3ReheatSimulation();
  }, [graph]);

  const setFg = useCallback((inst: FG | null) => {
    if (inst && inst !== fg.current) {
      fg.current = inst;
      configure(inst);
    }
  }, [configure]);

  const fit = useCallback((ms = 500) => {
    const inst = fg.current;
    if (!inst) return;
    const hid = hiddenRef.current;
    inst.zoomToFit(ms, 28, (n) => !hid.has((n as GNode).type));
  }, []);

  // initial zoom-to-fit, before the engine has fully cooled so the first impression is framed
  useEffect(() => {
    if (!size.w) return;
    const t = setTimeout(() => {
      if (performance.now() - lastInteract.current > IDLE_MS) fit(fitted.current ? 300 : 0);
    }, fitted.current ? 150 : 350);
    return () => clearTimeout(t);
  }, [size.w, size.h, fit]);

  // ---- auto camera: follow new lookups, center focused docs; never fight the user ----
  const prevFocus = useRef<string | null>(null);
  const prevLast = useRef<string | undefined>(undefined);
  useEffect(() => {
    const inst = fg.current;
    const last = traversal.trail[traversal.trail.length - 1];
    const focusChanged = focus !== prevFocus.current;
    const litChanged = last !== prevLast.current;
    prevFocus.current = focus;
    prevLast.current = last;
    if (!inst || !size.h) return;
    const now = performance.now();
    const idle = now - lastInteract.current > IDLE_MS;
    const mine = now - selfSelect.current < 1500;
    const ms = reducedMotion() ? 0 : 650;
    const k = inst.zoom();
    if (focusChanged && focus && (idle || mine)) {
      const n = graph.byId.get(focus);
      if (n?.x === undefined || n.y === undefined) return;
      const z = Math.max(k, 1.6);
      // the doc card covers the lower part of the panel: keep the node in the top band
      inst.centerAt(n.x, n.y + (size.h * 0.26) / z, ms);
      if (z !== k) inst.zoom(z, ms);
    } else if (litChanged && last && idle) {
      const n = graph.byId.get(last);
      if (n?.x === undefined || n.y === undefined) return;
      // only pan when the newest lookup is near the edge or off-screen; keep the current zoom
      const p = inst.graph2ScreenCoords(n.x, n.y);
      const mx = size.w * 0.18;
      const my = size.h * 0.22;
      if (p.x < mx || p.x > size.w - mx || p.y < my || p.y > size.h - my) {
        const c = inst.centerAt();
        inst.centerAt(c.x + (n.x - c.x) * 0.7, c.y + (n.y - c.y) * 0.7, ms);
      }
    }
  }, [focus, traversal, graph, size.w, size.h]);

  const select = useCallback((id: string) => {
    selfSelect.current = performance.now();
    onSelect(id);
  }, [onSelect]);

  // ---- canvas callbacks (stable) ----
  const recencyOf = (id: string) => {
    const { lit: l, max } = litRef.current;
    const v = l.get(id);
    if (v === undefined) return 0;
    return Math.max(0.18, Math.exp(-(max - v) / 7));
  };

  const radiusOf = (n: GNode, k: number) => {
    const r = Math.max(baseRadius(n), 3.2 / k);
    return recencyOf(n.id) > 0 ? r * 1.2 : r;
  };

  const nodeCanvasObject = useCallback((obj: object, ctx: CanvasRenderingContext2D, k: number) => {
    const n = obj as GNode;
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    const rec = recencyOf(n.id);
    const isFocus = n.id === focusRef.current;
    const hov = hoverRef.current;
    const isHover = hov?.id === n.id;
    const inHood = !hov || isHover || hov.nb.has(n.id);
    const r = radiusOf(n, k);
    const now = performance.now();
    const color = n.legacy ? LEGACY : COLOR[n.type];
    const alpha = !inHood ? 0.1 : rec ? 0.55 + 0.45 * rec : hov ? 0.95 : 0.6;

    // glow + pulse for lit nodes, strongest for the most recent lookups
    if (rec && inHood) {
      ctx.beginPath();
      ctx.arc(x, y, r + 6 / k + 4 * rec, 0, Math.PI * 2);
      ctx.fillStyle = hexA(GOLD, 0.1 + 0.22 * rec);
      ctx.fill();
      if (rec > 0.6 && !reducedMotion()) {
        const p = ((now / 1600 + (x + y) * 0.01) % 1 + 1) % 1;
        ctx.beginPath();
        ctx.arc(x, y, r + p * 16 / k + 2, 0, Math.PI * 2);
        ctx.strokeStyle = hexA(GOLD, (1 - p) * 0.55 * rec);
        ctx.lineWidth = 1.4 / k;
        ctx.stroke();
      }
    }

    ctx.beginPath();
    if (n.legacy) {
      const d = r * 1.18;
      ctx.moveTo(x, y - d);
      ctx.lineTo(x + d, y);
      ctx.lineTo(x, y + d);
      ctx.lineTo(x - d, y);
      ctx.closePath();
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fillStyle = hexA(color, alpha);
    ctx.fill();
    ctx.lineWidth = (rec || isFocus ? 1.6 : 0.9) / k;
    ctx.strokeStyle = rec ? hexA('#fff3d6', 0.9 * alpha) : hexA('#120c14', 0.8);
    ctx.stroke();

    // glyph, only when it would be legible
    if (r * k >= 7 && inHood) {
      ctx.font = `700 ${r * 1.15}px ${fonts.current.body}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = hexA('#140c12', Math.min(1, alpha + 0.2));
      ctx.fillText(n.legacy ? '’14' : GLYPH[n.type], x, y + r * 0.06, r * 1.7);
    }

    if (isFocus) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r + 4 / k, 0, Math.PI * 2);
      ctx.setLineDash([4 / k, 3 / k]);
      ctx.lineDashOffset = reducedMotion() ? 0 : -now / 120 / k;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 / k;
      ctx.stroke();
      ctx.restore();
    }

    // labels: lit (recent), focused, hovered neighbourhood, or everything when zoomed in
    const showLabel = isFocus || isHover || (hov && inHood) || (!hov && rec > 0.3) || k > 2.4;
    if (showLabel) {
      const fs = (isFocus || isHover ? 12 : 10.5) / k;
      ctx.font = `${rec || isFocus || isHover ? 600 : 500} ${fs}px ${fonts.current.body}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const text = n.label + (n.legacy ? ' (2014)' : '');
      const ty = y + r * (n.legacy ? 1.2 : 1) + 3 / k;
      ctx.lineWidth = 3 / k;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(12,8,16,0.92)';
      ctx.strokeText(text, x, ty);
      ctx.fillStyle = isFocus || isHover ? '#ffffff' : rec ? hexA('#fff3d6', 0.6 + 0.4 * rec) : 'rgba(236,227,208,0.78)';
      ctx.fillText(text, x, ty);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nodePointerAreaPaint = useCallback((obj: object, paint: string, ctx: CanvasRenderingContext2D, k: number) => {
    const n = obj as GNode;
    ctx.beginPath();
    ctx.arc(n.x ?? 0, n.y ?? 0, radiusOf(n, k) + 2 / k, 0, Math.PI * 2);
    ctx.fillStyle = paint;
    ctx.fill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linkColor = useCallback((obj: object) => {
    const l = obj as GLink;
    const s = idOf(l.source);
    const t = idOf(l.target);
    const hov = hoverRef.current;
    if (hov) {
      if (s === hov.id || t === hov.id) return l.kind === 'changed' ? hexA(LEGACY, 0.95) : hexA(COLOR[graph.byId.get(hov.id)!.type], 0.85);
      return 'rgba(236,227,208,0.025)';
    }
    if (travRef.current.pathLinks.has(pairKey(s, t))) return hexA(GOLD, 0.75);
    if (l.kind === 'changed') return hexA(LEGACY, 0.55);
    if (litRef.current.lit.has(s) && litRef.current.lit.has(t)) return hexA(GOLD, 0.28);
    return 'rgba(236,227,208,0.075)';
  }, [graph]);

  const linkWidth = useCallback((obj: object) => {
    const l = obj as GLink;
    const s = idOf(l.source);
    const t = idOf(l.target);
    const hov = hoverRef.current;
    if (hov && (s === hov.id || t === hov.id)) return 1.6;
    if (travRef.current.pathLinks.has(pairKey(s, t))) return 2.2;
    return l.kind === 'changed' ? 1.3 : 0.6;
  }, []);

  const linkLineDash = useCallback((obj: object) => ((obj as GLink).kind === 'changed' ? [3, 2.5] : null), []);
  const nodeVisibility = useCallback((obj: object) => !hiddenRef.current.has((obj as GNode).type), []);
  const linkVisibility = useCallback((obj: object) => {
    const l = obj as GLink;
    const h = hiddenRef.current;
    if (!h.size) return true;
    const a = graph.byId.get(idOf(l.source));
    const b = graph.byId.get(idOf(l.target));
    return !!a && !!b && !h.has(a.type) && !h.has(b.type);
  }, [graph]);

  const onNodeHover = useCallback((obj: object | null) => {
    const n = obj as GNode | null;
    hoverRef.current = n ? { id: n.id, nb: graph.neighbors.get(n.id) ?? new Set() } : null;
    if (wrap.current) wrap.current.style.cursor = n ? 'pointer' : 'grab';
  }, [graph]);

  const onNodeClick = useCallback((obj: object) => select((obj as GNode).id), [select]);

  const onEngineStop = useCallback(() => {
    if (!fitted.current) {
      fitted.current = true;
      if (performance.now() - lastInteract.current > IDLE_MS) fit(600);
    }
  }, [fit]);

  // faint labelled cluster halos behind everything
  const onRenderFramePre = useCallback((ctx: CanvasRenderingContext2D, k: number) => {
    const h = halos.current;
    if (h.frame++ % 20 === 0) {
      h.list = TYPES.map((t) => {
        const ns = graph.nodes.filter((n) => n.type === t && n.x !== undefined);
        if (!ns.length) return { t, x: CENTER[t].x, y: CENTER[t].y, r: 0 };
        const cx = ns.reduce((a, n) => a + n.x!, 0) / ns.length;
        const cy = ns.reduce((a, n) => a + n.y!, 0) / ns.length;
        const d = ns.map((n) => Math.hypot(n.x! - cx, n.y! - cy)).sort((a, b) => a - b);
        return { t, x: cx, y: cy, r: d[Math.floor(d.length * 0.9)] + 16 };
      });
    }
    for (const c of h.list) {
      if (!c.r || hiddenRef.current.has(c.t)) continue;
      const g = ctx.createRadialGradient(c.x, c.y, c.r * 0.2, c.x, c.y, c.r);
      g.addColorStop(0, hexA(COLOR[c.t], 0.07));
      g.addColorStop(1, hexA(COLOR[c.t], 0.015));
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 1 / k;
      ctx.strokeStyle = hexA(COLOR[c.t], 0.18);
      ctx.stroke();
      const fs = 12 / k;
      ctx.font = `${fs}px ${fonts.current.display}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = hexA(COLOR[c.t], 0.8);
      ctx.fillText(TYPE_LABEL[c.t].toUpperCase(), c.x, c.y - c.r - 3 / k);
    }
  }, [graph]);

  // the DM's path: particles walking each hop, plus a comet along the newest one
  const onRenderFramePost = useCallback((ctx: CanvasRenderingContext2D, k: number) => {
    const tr = travRef.current;
    if (!tr.hops.length) return;
    const now = performance.now();
    const still = reducedMotion();
    const pos = (id: string) => {
      const n = graph.byId.get(id);
      return n && n.x !== undefined && n.y !== undefined ? { x: n.x, y: n.y } : null;
    };
    tr.hops.forEach((hop, i) => {
      const age = (i + 1) / tr.hops.length;
      const pts = hop.via.map(pos);
      if (pts.some((p) => !p)) return;
      const P = pts as { x: number; y: number }[];
      if (hop.jump) {
        // not linked by a reference: draw a faint arc so the sequence still reads
        const a = P[0];
        const b = P[P.length - 1];
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([2 / k, 4 / k]);
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo((a.x + b.x) / 2 + (b.y - a.y) * 0.2, (a.y + b.y) / 2 - (b.x - a.x) * 0.2, b.x, b.y);
        ctx.strokeStyle = hexA(GOLD, 0.25 * age + 0.1);
        ctx.lineWidth = 1.2 / k;
        ctx.stroke();
        ctx.restore();
        return;
      }
      if (still) return;
      for (let s = 1; s < P.length; s++) {
        const a = P[s - 1];
        const b = P[s];
        for (let j = 0; j < 2; j++) {
          const t = (now / 1300 + j / 2 + s * 0.17) % 1;
          ctx.beginPath();
          ctx.arc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, (1.6 + age) / k + 0.4, 0, Math.PI * 2);
          ctx.fillStyle = hexA(GOLD, 0.35 + 0.6 * age);
          ctx.fill();
        }
      }
    });

    const last = tr.hops[tr.hops.length - 1];
    const P = last.via.map(pos);
    if (P.some((p) => !p)) return;
    const pts = P as { x: number; y: number }[];
    const segs = pts.length - 1;
    const dur = still ? 0 : HOP_MS * segs;
    const el = now - hopStart.current;
    if (el < dur) {
      const f = el / dur;
      const sf = f * segs;
      const si = Math.min(segs - 1, Math.floor(sf));
      const a = pts[si];
      const b = pts[si + 1];
      const t = sf - si;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      ctx.beginPath();
      ctx.arc(x, y, 9 / k, 0, Math.PI * 2);
      ctx.fillStyle = hexA(GOLD, 0.25);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 3.5 / k, 0, Math.PI * 2);
      ctx.fillStyle = '#fff6dc';
      ctx.fill();
    } else if (!still && el < dur + 800) {
      const f = (el - dur) / 800;
      const b = pts[pts.length - 1];
      ctx.beginPath();
      ctx.arc(b.x, b.y, 6 + (28 * f) / k, 0, Math.PI * 2);
      ctx.strokeStyle = hexA(GOLD, 0.8 * (1 - f));
      ctx.lineWidth = 2 / k;
      ctx.stroke();
    }
  }, [graph]);

  const onBackgroundClick = useCallback(() => {
    if (focusRef.current) onClear();
  }, [onClear]);

  const toggleType = (t: NodeType) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const resetView = () => {
    lastInteract.current = 0;
    hiddenRef.current = new Set();
    setHidden(new Set());
    fit(500);
  };

  const crumbs = traversal.trail.slice(size.w < 420 ? -3 : -4).map((id) => graph.byId.get(id)!).filter(Boolean);

  return (
    <div className="rules-graph relative h-full w-full overflow-hidden">
      <div ref={wrap} className="absolute inset-0" style={{ cursor: 'grab' }} aria-label="Knowledge graph of rules, conditions, spells, monsters and heroes" role="img">
        {size.w > 0 && (
          <ForceGraph2D
            ref={setFg as never}
            width={size.w}
            height={size.h}
            graphData={graph as never}
            backgroundColor="rgba(0,0,0,0)"
            autoPauseRedraw={false}
            cooldownTicks={220}
            d3VelocityDecay={0.35}
            minZoom={0.25}
            maxZoom={8}
            nodeLabel={() => ''}
            nodeCanvasObject={nodeCanvasObject}
            nodePointerAreaPaint={nodePointerAreaPaint}
            nodeVisibility={nodeVisibility}
            linkVisibility={linkVisibility}
            linkColor={linkColor}
            linkWidth={linkWidth}
            linkLineDash={linkLineDash}
            onNodeHover={onNodeHover}
            onNodeClick={onNodeClick}
            onBackgroundClick={onBackgroundClick}
            onEngineStop={onEngineStop}
            onRenderFramePre={onRenderFramePre}
            onRenderFramePost={onRenderFramePost}
          />
        )}
      </div>

      {/* top: search + reset, then the traversal breadcrumb */}
      <div className="pointer-events-none absolute inset-x-2 top-2 z-[5] flex flex-col gap-1.5">
        <div className="flex items-start gap-1.5">
          <GraphSearch graph={graph} onPick={select} />
          <button type="button" className="rg-iconbtn pointer-events-auto" onClick={resetView} aria-label="Reset view" title="Reset view">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2.5 8a5.5 5.5 0 1 0 1.7-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M2 2.2v3.3h3.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
        {crumbs.length > 0 && (
          <nav aria-label="Last lookups" className="rg-crumbs pointer-events-auto" key={crumbs[crumbs.length - 1].id}>
            <span className="rg-crumbs-label">Last lookup</span>
            {crumbs.map((n, i) => (
              <span key={n.id} className="rg-crumb-wrap flex items-center gap-1">
                {i > 0 && <span aria-hidden="true" className="text-amber-300/60">→</span>}
                <button type="button" onClick={() => select(n.id)} className={`rg-crumb ${i === crumbs.length - 1 ? 'rg-crumb-new' : ''}`} style={{ ['--c' as string]: n.legacy ? LEGACY : COLOR[n.type] }}>
                  {n.label}
                  {n.legacy ? ' ’14' : ''}
                </button>
              </span>
            ))}
          </nav>
        )}
      </div>

      {/* bottom: legend doubles as type filter */}
      <div className="absolute inset-x-2 bottom-1.5 z-[5] flex flex-wrap items-center gap-1" role="group" aria-label="Filter by type">
        {TYPES.map((t) => (
          <button key={t} type="button" aria-pressed={!hidden.has(t)} onClick={() => toggleType(t)} className="rg-chip" style={{ ['--c' as string]: COLOR[t] }}>
            <span className="rg-dot" aria-hidden="true">{GLYPH[t]}</span>
            {TYPE_LABEL[t]}
          </button>
        ))}
        <span className="rg-legend" title="2014 SRD documents, linked to their 2024 counterpart by a dashed line">
          <span className="rg-diamond" aria-hidden="true" />
          2014
          <svg width="16" height="6" aria-hidden="true"><line x1="0" y1="3" x2="16" y2="3" stroke={LEGACY} strokeWidth="1.5" strokeDasharray="3 2" /></svg>
        </span>
        <span className="rg-legend" title="Path the DM walked between lookups">
          <svg width="16" height="6" aria-hidden="true"><line x1="0" y1="3" x2="16" y2="3" stroke={GOLD} strokeWidth="2" /><circle cx="10" cy="3" r="2" fill="#fff6dc" /></svg>
          path
        </span>
      </div>
    </div>
  );
}
