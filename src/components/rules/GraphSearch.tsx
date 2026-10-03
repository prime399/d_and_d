'use client';
// Type-ahead search over every document in the graph; picking a result focuses it.
import { useId, useMemo, useState } from 'react';
import { COLOR, GLYPH, LEGACY, TYPE_LABEL } from './graphModel';
import type { Graph } from './graphModel';

export function GraphSearch({ graph, onPick }: { graph: Graph; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return graph.nodes
      .map((n) => {
        const l = n.label.toLowerCase();
        const score = l === s ? 0 : l.startsWith(s) ? 1 : l.includes(s) ? 2 : n.id.includes(s) ? 3 : -1;
        return { n, score };
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => a.score - b.score || Number(a.n.legacy) - Number(b.n.legacy) || a.n.label.localeCompare(b.n.label))
      .slice(0, 7)
      .map((r) => r.n);
  }, [q, graph]);

  const pick = (id: string) => {
    onPick(id);
    // hand the keyboard back to the page so Escape closes the card
    (document.activeElement as HTMLElement | null)?.blur();
    setQ('');
    setOpen(false);
  };

  return (
    <div className="pointer-events-auto relative min-w-0 flex-1">
      <svg className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-amber-200/60" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={q}
        placeholder="Search the tome…"
        aria-label="Search rules, conditions, spells, monsters and heroes"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        className="rg-search"
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            pick(results[active].id);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            setQ('');
            setOpen(false);
          }
        }}
      />
      {open && results.length > 0 && (
        <ul id={listId} role="listbox" className="rg-results scroll-thin">
          {results.map((n, i) => (
            <li
              key={n.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`rg-result ${i === active ? 'rg-result-active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(n.id);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="rg-dot" style={{ ['--c' as string]: n.legacy ? LEGACY : COLOR[n.type] }} aria-hidden="true">
                {GLYPH[n.type]}
              </span>
              <span className="min-w-0 flex-1 truncate">{n.label}</span>
              <span className="text-[10px] text-white/50">
                {TYPE_LABEL[n.type].replace(/s$/, '')}
                {n.legacy ? ' · 2014' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
