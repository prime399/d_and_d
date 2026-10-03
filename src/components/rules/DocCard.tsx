'use client';
// Parchment card for the focused Sanity document, with a 2014 ↔ 2024 edition diff for docs that changed.
import { useEffect, useRef, useState } from 'react';
import type { GameContent } from '@/game/content/types';
import { COLOR, GLYPH, LEGACY, TYPE_LABEL } from './graphModel';
import type { Graph } from './graphModel';
import { findDoc, linesOf } from './docs';
import { alignLines, diffWords } from './diff';
import type { Seg } from './diff';

export function DocCard({ content, graph, id, onSelect, onClose }: { content: GameContent; graph: Graph; id: string; onSelect: (id: string) => void; onClose: () => void }) {
  const doc = findDoc(content, graph, id);
  const [compare, setCompare] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && !t.closest('.rg-card')) return;
      if (compare) setCompare(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compare, onClose]);

  if (!doc) return null;
  const color = doc.version === '2014' ? LEGACY : COLOR[doc.type];

  return (
    <div className={`rg-card fade-in ${compare ? 'rg-card-full' : ''}`} role="dialog" aria-label={`${doc.title} (${TYPE_LABEL[doc.type].replace(/s$/, '')})`} style={{ ['--c' as string]: color }}>
      <header className="flex items-start gap-2">
        <span className="rg-card-glyph" aria-hidden="true">
          {GLYPH[doc.type]}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[15px] leading-tight text-[#2a1708]">{doc.title}</h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <span className="rg-badge">{TYPE_LABEL[doc.type].replace(/s$/, '')}</span>
            <span className={`rg-badge ${doc.version === '2014' ? 'rg-badge-2014' : 'rg-badge-2024'}`}>SRD {doc.version === '2014' ? '5.1 · 2014' : '5.2.1 · 2024'}</span>
            {doc.subtitle && doc.subtitle !== 'Condition' && <span className="truncate text-[10.5px] text-[#5a3d22]">{doc.subtitle}</span>}
          </div>
        </div>
        <button ref={closeBtn} type="button" className="rg-close" onClick={onClose} aria-label="Close document">
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.5 3.5l9 9m0-9-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </header>

      {compare && doc.counterpart ? (
        <CompareView content={content} a={doc.version === '2014' ? doc.id : doc.counterpart} b={doc.version === '2014' ? doc.counterpart : doc.id} onBack={() => setCompare(false)} />
      ) : (
        <>
          {doc.stats && doc.stats.length > 0 && (
            <dl className="mt-1.5 flex flex-wrap gap-1">
              {doc.stats.map((s) => (
                <div key={s.k} className="rg-stat">
                  <dt>{s.k}</dt>
                  <dd>{s.v}</dd>
                </div>
              ))}
            </dl>
          )}
          {doc.body && <p className="mt-1.5 leading-relaxed text-[#2e2014]">{doc.body}</p>}
          {doc.effects && (
            <ul className="mt-1.5 space-y-1">
              {doc.effects.map((e, i) => (
                <li key={i} className="rg-effect">
                  <Effect text={e} />
                </li>
              ))}
            </ul>
          )}
          {doc.counterpart && (
            <button type="button" className="rg-compare-btn" onClick={() => setCompare(true)}>
              <span aria-hidden="true">⇄</span> Compare 2014 ↔ 2024
              <span className="text-[10px] font-normal opacity-80">see what changed</span>
            </button>
          )}
          {doc.related.length > 0 && (
            <div className="mt-2">
              <div className="rg-card-section">Linked in Sanity</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {doc.related.map((r) => (
                  <button key={r.id + r.kind} type="button" className="rg-rel" onClick={() => onSelect(r.id)} style={{ ['--c' as string]: r.legacy ? LEGACY : COLOR[r.type] }} title={`${r.kind}: ${r.id}`}>
                    <span className="rg-rel-kind">{r.kind}</span>
                    {r.label}
                    {r.legacy ? ' ’14' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-2 font-mono text-[9.5px] text-[#6b5034]">_id: {doc.id}</div>
        </>
      )}
    </div>
  );
}

/** "Speed 0: Your Speed is 0" → bold lead-in */
function Effect({ text }: { text: string }) {
  const m = text.match(/^([A-Z][\w' ,-]{1,40}):\s(.*)$/);
  if (!m) return <>{text}</>;
  return (
    <>
      <b className="text-[#3b1f08]">{m[1]}.</b> {m[2]}
    </>
  );
}

function Segs({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((s, i) =>
        s.op === 'same' ? <span key={i}>{s.t}</span> : s.op === 'add' ? <ins key={i} className="rg-ins">{s.t}</ins> : <del key={i} className="rg-del">{s.t}</del>,
      )}
    </>
  );
}

function CompareView({ content, a, b, onBack }: { content: GameContent; a: string; b: string; onBack: () => void }) {
  const rows = alignLines(linesOf(content, a), linesOf(content, b));
  const added = rows.filter((r) => r.neu && !r.old).length;
  const removed = rows.filter((r) => r.old && !r.neu).length;
  const changed = rows.filter((r) => r.old && r.neu && r.old !== r.neu).length;
  return (
    <div className="rg-compare mt-2 flex min-h-0 flex-1 flex-col">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-[#4a3018]">
        <span className="rg-sum rg-sum-add">+{added} new</span>
        <span className="rg-sum rg-sum-del">−{removed} dropped</span>
        <span className="rg-sum">{changed} reworded</span>
        <span className="flex-1" />
        <button type="button" className="rg-back" onClick={onBack}>
          ← Back
        </button>
      </div>
      <div className="rg-diff-head" aria-hidden="true">
        <span className="text-[#5b3aa8]">2014 · SRD 5.1</span>
        <span className="text-[#7a4a0c]">2024 · SRD 5.2.1</span>
      </div>
      <ol className="rg-diff scroll-thin" aria-label="Side-by-side differences between the 2014 and 2024 editions">
        {rows.map((r, i) => {
          const d = r.old && r.neu ? diffWords(r.old, r.neu) : null;
          return (
            <li key={i} className="rg-diff-row">
              <div className={`rg-diff-cell ${r.old && !r.neu ? 'rg-cell-del' : ''} ${!r.old ? 'rg-cell-empty' : ''}`}>
                {r.old ? d ? <Segs segs={d.left} /> : <del className="rg-del">{r.old}</del> : <span className="sr-only">not in 2014</span>}
              </div>
              <div className={`rg-diff-cell ${r.neu && !r.old ? 'rg-cell-add' : ''} ${!r.neu ? 'rg-cell-empty' : ''}`}>
                {r.neu ? d ? <Segs segs={d.right} /> : <ins className="rg-ins">{r.neu}</ins> : <span className="sr-only">removed in 2024</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
