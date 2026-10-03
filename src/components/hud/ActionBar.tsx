'use client';
import { useState } from 'react';
import type { GameController } from '@/game/controller';
import { useView } from '../useView';
import { currentCombatant } from '@/game/engine';

export function ActionBar({ ctrl }: { ctrl: GameController }) {
  const v = useView(ctrl);
  const s = v.state;
  const [spellOpen, setSpellOpen] = useState(false);
  if (!s || v.phase !== 'playing') return null;
  const hero = s.combatants.filter((c) => c.side === 'hero');
  const cur = currentCombatant(s);
  const my = v.isPlayerTurn && cur.side === 'hero' ? cur : null;
  const acted = !!my?.actedThisTurn;
  const disabled = !my || v.busy;
  const moveLeft = my ? Math.max(0, (my.speed ?? 0) - (my.movedThisTurn ?? 0)) : 0;

  return (
    <div className="relative z-20 border-t border-amber-900/30 bg-black/40 p-2">
      <div className="mb-2 grid grid-cols-3 gap-2">
        {hero.map((h) => {
          const pct = Math.max(0, h.hp / h.maxHp);
          const active = h.id === v.activeId;
          return (
            <div key={h.id} className={`rounded-md p-1.5 ring-1 ${active ? 'bg-amber-900/40 ring-amber-400/70' : 'bg-black/30 ring-white/5'} ${h.dead ? 'opacity-40' : ''}`}>
              <div className="flex items-center justify-between text-[11px]">
                <span className="truncate font-semibold text-amber-50">{h.name}</span>
                <span className="font-pixel text-white/70">AC {h.ac}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-black/60" role="progressbar" aria-valuenow={h.hp} aria-valuemin={0} aria-valuemax={h.maxHp} aria-label={`${h.name} hit points`}>
                <div className={`h-full transition-all ${pct > 0.5 ? 'bg-emerald-400' : pct > 0.25 ? 'bg-yellow-400' : 'bg-red-500'}`} style={{ width: `${pct * 100}%` }} />
              </div>
              <div className="mt-0.5 flex justify-between font-pixel text-[10px] text-white/60">
                <span>{h.hp}/{h.maxHp} HP</span>
                <span>
                  {h.slots && Object.entries(h.slots).map(([l, n]) => `L${l}:${n}`).join(' ')}
                  {` 🧪${h.potions ?? 0}`}
                </span>
              </div>
              {h.conditions.length > 0 && <div className="truncate text-[10px] text-amber-300">{h.conditions.map((c) => ctrl.titleOf(`condition.${c.slug}`)).join(', ')}</div>}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 min-w-[120px] font-display text-sm text-amber-200">
          {my ? `${my.name}'s turn` : v.busy ? 'Enemies act…' : '…'}
        </span>
        <button className={`btn text-xs ${v.mode.kind === 'move' ? 'btn-active' : ''}`} disabled={disabled} onClick={() => ctrl.setMode({ kind: 'move' })}>
          Move ({moveLeft})
        </button>
        {my?.attacks.map((a, i) => (
          <button
            key={a.name}
            className={`btn text-xs ${v.mode.kind === 'attack' && v.mode.index === i ? 'btn-active' : ''}`}
            disabled={disabled || acted}
            onClick={() => ctrl.setMode({ kind: 'attack', index: i })}
            title={`+${a.toHit} to hit, ${a.damage} ${a.damageType}, range ${a.range}`}
          >
            ⚔ {a.name}
          </button>
        ))}
        {my?.spells && my.spells.length > 0 && (
          <div className="relative">
            <button className={`btn text-xs ${v.mode.kind === 'spell' ? 'btn-active' : ''}`} disabled={disabled || acted} onClick={() => setSpellOpen((o) => !o)} aria-expanded={spellOpen}>
              ✦ {v.mode.kind === 'spell' ? s.spells[v.mode.slug]?.name : 'Spells'} ▾
            </button>
            {spellOpen && !disabled && !acted && (
              <div className="absolute bottom-full left-0 z-30 mb-1 w-72 rounded-md bg-[#1a1220] p-1 ring-1 ring-amber-800/60">
                {my.spells.map((slug) => {
                  const sp = s.spells[slug];
                  if (!sp) return null;
                  const noSlot = sp.level > 0 && (my.slots?.[sp.level] ?? 0) <= 0;
                  return (
                    <button
                      key={slug}
                      disabled={noSlot}
                      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-amber-900/40 disabled:opacity-40"
                      onClick={() => {
                        setSpellOpen(false);
                        ctrl.setMode({ kind: 'spell', slug });
                      }}
                    >
                      <span className="mt-0.5 w-8 shrink-0 font-pixel text-[10px] text-amber-400">{sp.level === 0 ? 'cant' : `L${sp.level}`}</span>
                      <span>
                        <span className="font-semibold text-amber-50">{sp.name}</span>
                        {sp.concentration && <span className="ml-1 text-[10px] text-violet-300">(conc.)</span>}
                        <span className="block text-[10px] leading-snug text-white/55">{sp.summary}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <button className="btn text-xs" disabled={disabled || acted} onClick={() => void ctrl.dodge()}>🛡 Dodge</button>
        <button className="btn text-xs" disabled={disabled || acted || !(my?.potions ?? 0) || my!.hp >= my!.maxHp} onClick={() => void ctrl.potion()}>🧪 Potion</button>
        <button className="btn btn-primary ml-auto text-xs" disabled={disabled} onClick={() => void ctrl.endTurn()}>End turn ⏎</button>
      </div>
    </div>
  );
}
