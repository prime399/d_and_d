'use client';
// "How the DM ruled": the agent's Sanity lookups, step by step.
import { useState } from 'react';
import type { GameContent } from '@/game/content/types';
import type { ChatMessage } from '@/game/controller';
import type { DmLookup } from '@/app/api/dm/route';
import { CiteChip } from '../RichText';

const VIA_LABEL: Record<DmLookup['via'], string> = {
  'sanity-context': 'Sanity Context MCP',
  'knowledge-base': 'Sanity Knowledge Base',
  local: 'Local rules index (offline)',
};

export function backendLabel(b: ChatMessage['backend']) {
  if (b === 'sanity-context') return 'Sanity Context';
  if (b === 'local') return 'Local rules index';
  return 'Offline rules index';
}

function toolIcon(tool: string) {
  const t = tool.toLowerCase();
  if (t.includes('groq') || t.includes('query')) return '⌕';
  if (t.includes('kb') || t.includes('knowledge')) return '📚';
  if (t.includes('schema')) return '🧩';
  if (t.includes('search')) return '🔎';
  return '⚙';
}

/** Pull a GROQ string out of the tool input if one is present, else pretty JSON. */
function formatInput(input: string): { groq?: string; rest?: string } {
  try {
    const obj = JSON.parse(input) as unknown;
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const o = { ...(obj as Record<string, unknown>) };
      const q = typeof o.query === 'string' ? o.query : typeof o.groq === 'string' ? o.groq : undefined;
      const isGroq = q !== undefined && /\*\[|_type|->|\{/.test(q);
      if (isGroq) {
        delete o.query;
        delete o.groq;
        const rest = Object.keys(o).length ? JSON.stringify(o, null, 2) : undefined;
        return { groq: prettyGroq(q!), rest };
      }
    }
    return { rest: JSON.stringify(obj, null, 2) };
  } catch {
    return /\*\[/.test(input) ? { groq: prettyGroq(input) } : { rest: input };
  }
}

function prettyGroq(q: string) {
  return q.replace(/\s*\{\s*/, ' {\n  ').replace(/\s*,\s*(?![^[]*\])/g, ',\n  ').replace(/\s*\}\s*$/, '\n}');
}

export function ToolTrace({ msg, titles, onCite, content }: { msg: ChatMessage; titles: Record<string, string>; onCite: (id: string) => void; content: GameContent }) {
  const [open, setOpen] = useState(false);
  const lookups = msg.lookups ?? [];
  if (!lookups.length) return null;
  const docs = new Set(lookups.flatMap((l) => l.ids));
  const vias = [...new Set(lookups.map((l) => l.via))];
  const sourceLabel = vias.includes('sanity-context') || vias.includes('knowledge-base') ? 'Sanity' + (vias.includes('knowledge-base') && !vias.includes('sanity-context') ? ' KB' : ' Context') : 'local index';
  return (
    <div className="dm-trace">
      <button type="button" className="dm-trace-sum" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden className={`dm-caret ${open ? 'dm-caret-open' : ''}`}>▸</span>
        <span className="font-semibold text-amber-200/90">How the DM ruled</span>
        <span className="text-white/50">
          🔎 {lookups.length} lookup{lookups.length > 1 ? 's' : ''} · {docs.size} doc{docs.size === 1 ? '' : 's'} · {sourceLabel}
        </span>
      </button>
      {open && (
        <ol className="dm-steps">
          {lookups.map((l, i) => {
            const f = formatInput(l.input);
            return (
              <li key={i} className="dm-step">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="dm-step-n">{i + 1}</span>
                  <span aria-hidden className="text-[13px]">{toolIcon(l.tool)}</span>
                  <code className="font-mono text-[11px] font-semibold text-amber-100">{l.tool}</code>
                  <span className={`dm-badge dm-badge-${l.via}`}>{VIA_LABEL[l.via]}</span>
                </div>
                {f.groq && (
                  <pre className="dm-code" aria-label="GROQ query">
                    <span className="dm-code-lang">GROQ</span>
                    {f.groq}
                  </pre>
                )}
                {f.rest && (
                  <pre className="dm-code" aria-label="Tool input">
                    <span className="dm-code-lang">{f.groq ? 'params' : 'input'}</span>
                    {f.rest}
                  </pre>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-y-1 text-[10.5px] text-white/50">
                  <span className="mr-1">→ {l.ids.length ? `${l.ids.length} doc${l.ids.length > 1 ? 's' : ''}` : 'no docs'}</span>
                  {l.ids.slice(0, 8).map((id) => (
                    <CiteChip key={id} id={id} titles={titles} onCite={onCite} content={content} />
                  ))}
                  {l.ids.length > 8 && <span className="ml-1">+{l.ids.length - 8} more</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function Consulting() {
  return (
    <div className="dm-consult" role="status">
      <span className="dm-book" aria-hidden>
        <span className="dm-book-page" />
        <span className="dm-book-page" />
        <span className="dm-book-page" />
      </span>
      <span className="dm-quill" aria-hidden>✒</span>
      <span className="italic text-[#e8dcc0]/70">The DM consults the tome…</span>
    </div>
  );
}
