'use client';
import { useState } from 'react';
import type { GameContent } from '@/game/content/types';
import type { GameController } from '@/game/controller';
import { useView } from './useView';
import { RulesGraph } from './RulesGraph';

export function RulesPanel({ ctrl, content }: { ctrl: GameController; content: GameContent }) {
  const v = useView(ctrl);
  const [tab, setTab] = useState<'graph' | 'rulings'>('graph');
  const focusDoc = v.focus ? findDoc(content, v.focus) : null;
  return (
    <section className="panel flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-amber-900/30 px-3 py-1.5">
        <h2 className="panel-title text-base">Rules Tome</h2>
        <div className="flex gap-1" role="tablist">
          {(['graph', 'rulings'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`rounded px-2 py-0.5 text-[11px] ${tab === t ? 'bg-amber-800/50 text-amber-50' : 'text-white/50 hover:text-white'}`} onClick={() => setTab(t)}>
              {t === 'graph' ? 'Knowledge graph' : `Rulings (${v.rulings.length})`}
            </button>
          ))}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {tab === 'graph' ? (
          <RulesGraph content={content} lit={v.lit} focus={v.focus} onSelect={(id) => ctrl.focusDoc(id)} />
        ) : (
          <ul className="scroll-thin h-full space-y-1.5 overflow-y-auto p-2">
            {v.rulings.length === 0 && <li className="text-xs italic text-white/40">Every rule the engine applies will appear here.</li>}
            {v.rulings.map((r) => (
              <li key={r.key}>
                <button type="button" onClick={() => ctrl.focusDoc(r.citation.id)} className="fade-in w-full rounded-md bg-black/30 px-2 py-1.5 text-left ring-1 ring-amber-900/30 hover:ring-amber-600/60">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-amber-100">📜 {r.citation.title}</span>
                    <span className="text-[10px] text-white/40">{r.citation.source}</span>
                  </div>
                  {r.context && <div className="mt-0.5 truncate text-[11px] text-white/55">{r.context}</div>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {focusDoc && (
          <div className="absolute inset-x-2 bottom-2 z-10 max-h-[60%] overflow-y-auto rounded-md bg-[#140e18]/95 p-2.5 text-xs ring-1 ring-amber-700/50 scroll-thin fade-in">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-display text-sm text-amber-100">{focusDoc.title}</div>
                <div className="font-mono text-[10px] text-white/40">{v.focus} · SRD {focusDoc.version}</div>
              </div>
              <button className="text-white/50 hover:text-white" onClick={() => ctrl.focusDoc('')} aria-label="Close">✕</button>
            </div>
            <p className="mt-1 whitespace-pre-line leading-relaxed text-white/75">{focusDoc.body}</p>
            {focusDoc.counterpart && (
              <button className="mt-1.5 text-[11px] text-violet-300 hover:underline" onClick={() => ctrl.focusDoc(focusDoc.counterpart!)}>
                Compare with the {focusDoc.version === '2024' ? '2014' : '2024'} version →
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function findDoc(c: GameContent, id: string): { title: string; body: string; version: string; counterpart?: string } | null {
  if (!id) return null;
  const r = c.rules.find((x) => x._id === id);
  if (r) return { title: r.title, body: r.body, version: r.srdVersion };
  const k = c.conditions.find((x) => x._id === id);
  if (k) return { title: k.name, body: k.effects.map((e) => `• ${e}`).join('\n'), version: k.srdVersion, counterpart: k.counterpartId };
  const s = c.spells.find((x) => x._id === id);
  if (s) return { title: `${s.name} (${s.level === 0 ? 'cantrip' : `level ${s.level}`} ${s.school})`, body: s.summary, version: s.srdVersion };
  const m = c.monsters.find((x) => x._id === id);
  if (m) return { title: `${m.name} (CR ${m.cr})`, body: `AC ${m.ac}, HP ${m.hp}, speed ${m.speed}\n${m.attacks.map((a) => `${a.name}: +${a.toHit}, ${a.damage} ${a.damageType}`).join('\n')}\n${m.description ?? ''}`, version: m.srdVersion };
  const h = c.heroes.find((x) => x._id === id);
  if (h) return { title: `${h.name}, ${h.className} ${h.level}`, body: h.blurb, version: '2024' };
  return null;
}
