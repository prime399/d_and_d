'use client';
import type { GameController } from '@/game/controller';
import { useView } from '../useView';
import { Portrait } from './Sprite';
import { playMode } from './explore';

/** Vertical initiative rail on the map's left edge (clear of the dice tray and room title, top-centre). */
export function InitiativeStrip({ ctrl }: { ctrl: GameController }) {
  const v = useView(ctrl);
  const s = v.state;
  if (!s || playMode(v) === 'explore') return null;
  const hl = (id: string | null) => ctrl.highlightUnit?.(id);

  return (
    <nav
      className="pointer-events-auto absolute left-2 top-2 z-20 flex max-h-[calc(100%-210px)] w-[64px] flex-col items-center gap-1.5 overflow-y-auto scroll-thin rounded-xl bg-black/45 px-1.5 pb-2 pt-1.5 ring-1 ring-amber-900/40 backdrop-blur-[2px] max-sm:right-2 max-sm:w-auto max-sm:flex-row max-sm:overflow-x-auto max-sm:overflow-y-hidden max-sm:py-1"
      aria-label="Initiative order"
    >
      <div className="text-center leading-none" title="Combat round">
        <div className="font-pixel text-[9px] uppercase tracking-widest text-amber-300/80">Round</div>
        <div key={s.round} className="font-display text-xl text-amber-100 fade-in">{s.round}</div>
      </div>
      <ol className="flex w-full flex-col items-center gap-1.5 max-sm:w-auto max-sm:flex-row">
        {s.order.map((id) => {
          const c = s.combatants.find((x) => x.id === id);
          if (!c) return null;
          const u = v.units?.[id];
          const hp = u?.hp ?? c.hp;
          const maxHp = u?.maxHp ?? c.maxHp;
          const dead = u?.dead ?? c.dead;
          const active = id === v.activeId;
          const pct = Math.max(0, hp / maxHp);
          const size = active ? 40 : 30;
          return (
            <li key={id} className={`hud-init-item w-full max-sm:w-auto ${dead ? 'gone' : ''}`} aria-hidden={dead}>
              <div className="flex justify-center p-1">
                <button
                  type="button"
                  tabIndex={dead ? -1 : 0}
                  className={`hud-init-chip ${c.side} ${active ? 'active' : ''}`}
                  aria-current={active ? 'true' : undefined}
                  aria-label={`${c.name}, initiative ${c.initiative}, ${hp} of ${maxHp} HP${active ? ', acting now' : ''}`}
                  title={`${c.name} · init ${c.initiative} · ${hp}/${maxHp} HP`}
                  onMouseEnter={() => hl(id)}
                  onMouseLeave={() => hl(null)}
                  onFocus={() => hl(id)}
                  onBlur={() => hl(null)}
                >
                  <span className="hud-init-num">{c.initiative}</span>
                  <span
                    className={`grid place-items-center overflow-hidden rounded-md transition-all duration-300 ${c.side === 'hero' ? 'bg-sky-950/60' : 'bg-rose-950/60'}`}
                    style={{ width: size, height: size }}
                  >
                    <Portrait spriteKey={c.spriteKey} size={size} />
                  </span>
                  <span className="hud-hp mini w-full">
                    <i className="ghost" style={{ width: `${pct * 100}%` }} />
                    <i className="fill" style={{ width: `${pct * 100}%`, backgroundColor: c.side === 'hero' ? '#38bdf8' : '#fb7185' }} />
                  </span>
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
