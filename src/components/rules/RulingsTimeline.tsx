'use client';
// Timeline of every rule the engine/DM applied, newest first, grouped by room and round.
import type { Ruling } from '@/game/controller';
import { COLOR, GLYPH, LEGACY } from './graphModel';
import type { Graph } from './graphModel';

type Tagged = Ruling & { round?: number; room?: string };

export function RulingsTimeline({ rulings, graph, focus, onSelect }: { rulings: Ruling[]; graph: Graph; focus: string | null; onSelect: (id: string) => void }) {
  if (!rulings.length)
    return (
      <div className="grid h-full place-items-center p-4 text-center">
        <p className="max-w-[16rem] text-xs italic text-[#ece3d0]/60">Every rule the engine applies and every page the DM looks up will be logged here, linked back to its Sanity document.</p>
      </div>
    );

  const groups: { label: string; items: Tagged[] }[] = [];
  for (const r of rulings as Tagged[]) {
    const label = r.room || r.round ? [r.room, r.round ? `Round ${r.round}` : ''].filter(Boolean).join(' · ') : 'This session';
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(r);
    else groups.push({ label, items: [r] });
  }

  return (
    <div className="scroll-thin h-full overflow-y-auto px-2 pb-2 pt-1">
      {groups.map((g, gi) => (
        <section key={gi + g.label} aria-label={g.label}>
          <h3 className="rg-tl-group">{g.label}</h3>
          <ol className="rg-tl">
            {g.items.map((r) => {
              const n = graph.byId.get(r.citation.id);
              const type = n?.type ?? 'rule';
              const legacy = n?.legacy ?? r.citation.srdVersion === '2014';
              return (
                <li key={r.key} className="rg-tl-item fade-in" style={{ ['--c' as string]: legacy ? LEGACY : COLOR[type] }}>
                  <span className="rg-tl-dot" aria-hidden="true">
                    {GLYPH[type]}
                  </span>
                  <button type="button" onClick={() => onSelect(r.citation.id)} className={`rg-tl-btn ${focus === r.citation.id ? 'rg-tl-btn-on' : ''}`}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold text-amber-100">{r.citation.title}</span>
                      <span className="shrink-0 text-[10px] text-[#ece3d0]/55">
                        {r.citation.source}
                        {legacy ? ' · 2014' : ''}
                      </span>
                    </span>
                    {r.context && <span className="mt-0.5 block truncate text-[11px] text-[#ece3d0]/70">{r.context}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
