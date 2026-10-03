'use client';
// Renders DM text: [[doc-id]] citations become typed chips with a hover preview,
// and "Rules changed:" sentences become a violet 2014 → 2024 callout.
import { Fragment, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GameContent } from '@/game/content/types';
import { KIND_ICON, clip, docKind, findDoc, isLegacy } from './dm/docs';

interface Props {
  text: string;
  titles: Record<string, string>;
  onCite: (id: string) => void;
  content?: GameContent;
}

const CHANGED = /(Rules changed:(?:\[\[[^\]]*\]\]|[^.!?\n]|[.!?](?=\S))*[.!?]?)/;

export function RichText({ text, titles, onCite, content }: Props) {
  const blocks = text.split(CHANGED);
  return (
    <>
      {blocks.map((b, i) => {
        if (!b) return null;
        if (b.startsWith('Rules changed:')) {
          return (
            <span key={i} className="dm-changed">
              <span className="dm-changed-label">⚖ Rules changed (2014 → 2024)</span>
              <Inline text={b.slice('Rules changed:'.length).trim()} titles={titles} onCite={onCite} content={content} />
            </span>
          );
        }
        return <Inline key={i} text={b} titles={titles} onCite={onCite} content={content} />;
      })}
    </>
  );
}

function Inline({ text, titles, onCite, content }: Props) {
  const parts = text.split(/(\[\[[^\]]+\]\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\[\[([^\]]+)\]\]$/);
        if (!m) return <Fragment key={i}>{p}</Fragment>;
        return <CiteChip key={i} id={m[1].trim()} titles={titles} onCite={onCite} content={content} />;
      })}
    </>
  );
}

export function CiteChip({ id, titles, onCite, content }: { id: string; titles: Record<string, string>; onCite: (id: string) => void; content?: GameContent }) {
  const legacy = isLegacy(id);
  const kind = docKind(id);
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const tipId = useId();
  const doc = content ? findDoc(content, id) : null;
  const title = titles[id] ?? doc?.title ?? id;

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const above = r.top > 180;
    const x = Math.min(Math.max(8, r.left), window.innerWidth - 288);
    setPos({ x, y: above ? r.top - 6 : r.bottom + 6, above });
  };
  const hide = () => setPos(null);

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => onCite(id)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(e) => e.key === 'Escape' && hide()}
        aria-describedby={pos ? tipId : undefined}
        aria-label={`${title}${legacy ? ', 2014 rules' : ''}. Open in the Rules Tome`}
        className={`dm-chip ${legacy ? 'dm-chip-legacy' : ''}`}
      >
        <span aria-hidden>{KIND_ICON[kind]}</span>
        <span>{title}</span>
        {legacy && <span className="dm-chip-2014">2014</span>}
      </button>
      {pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            id={tipId}
            role="tooltip"
            className="dm-pop"
            style={{ left: pos.x, top: pos.y, transform: pos.above ? 'translateY(-100%)' : undefined }}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-display text-[13px] leading-tight text-amber-100">
                <span aria-hidden className="mr-1">{KIND_ICON[kind]}</span>
                {doc?.title ?? title}
              </span>
              <span className={`dm-ver ${legacy || doc?.version === '2014' ? 'dm-ver-2014' : ''}`}>SRD {doc?.version ?? (legacy ? '2014' : '2024')}</span>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-[#e6dcc6]/85">{doc ? clip(doc.body) : 'Sanity document'}</p>
            <div className="mt-1.5 flex justify-between font-mono text-[10px] text-white/45">
              <span>{id}</span>
              <span className="text-amber-300/80">click to open in tome →</span>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
