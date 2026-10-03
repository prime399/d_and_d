'use client';
import type { GameController } from '@/game/controller';
import { useView } from '../useView';

export function InitiativeStrip({ ctrl }: { ctrl: GameController }) {
  const v = useView(ctrl);
  const s = v.state!;
  return (
    <div className="absolute inset-x-2 top-2 z-20 flex items-center gap-1 overflow-x-auto scroll-thin" aria-label="Initiative order">
      <span className="mr-1 rounded bg-black/70 px-2 py-1 font-pixel text-[10px] text-amber-300">R{s.round}</span>
      {s.order.map((id) => {
        const c = s.combatants.find((x) => x.id === id)!;
        const active = id === v.activeId;
        return (
          <div
            key={id}
            className={`flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] ring-1 transition ${c.dead ? 'opacity-30 line-through' : ''} ${active ? 'bg-amber-600/80 text-white ring-amber-300' : c.side === 'hero' ? 'bg-sky-950/70 text-sky-100 ring-sky-700/40' : 'bg-rose-950/70 text-rose-100 ring-rose-800/40'}`}
          >
            <span className="font-pixel text-[10px] opacity-70">{c.initiative}</span>
            <span className="max-w-[90px] truncate">{c.name}</span>
            <span className="font-pixel text-[10px] opacity-80">{c.hp}</span>
          </div>
        );
      })}
    </div>
  );
}
