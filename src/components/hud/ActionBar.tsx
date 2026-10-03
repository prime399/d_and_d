'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameController, Mode } from '@/game/controller';
import type { Combatant, GameState } from '@/game/engine';
import { currentCombatant, effectiveSpeed } from '@/game/engine';
import type { Spell } from '@/game/content/types';
import { useView } from '../useView';
import { Portrait, Sprite } from './Sprite';
import { Tip } from './Tip';
import { BootIcon, HourglassIcon, ShieldIcon, SpellGlyph, WeaponIcon } from './Icons';

type Hk = { key: string; label: string; mode: Mode; disabled: boolean };

/** Bottom HUD: party cards, action economy and the action buttons. Also owns the keyboard listener. */
export function ActionBar({ ctrl }: { ctrl: GameController }) {
  const v = useView(ctrl);
  const s = v.state;
  const [spellOpen, setSpellOpen] = useState(false);
  const spellRef = useRef<HTMLDivElement>(null);

  const playing = !!s && v.phase === 'playing';
  const cur = playing ? currentCombatant(s!) : null;
  const my = v.isPlayerTurn && cur?.side === 'hero' ? cur : null;
  const ready = !!my && !v.busy;
  const acted = !!my?.actedThisTurn;
  const speed = my ? effectiveSpeed(my) : 0;
  const moveLeft = my ? Math.max(0, speed - (my.movedThisTurn ?? 0)) : 0;
  // hotkey numbers come from the controller so the badges always match the keyboard
  const opts: Hk[] = useMemo(() => (ready ? ctrl.hotkeyOptions?.() ?? [] : []), [ctrl, ready, v.state, my?.actedThisTurn]); // eslint-disable-line react-hooks/exhaustive-deps
  const keyFor = (m: Mode) => opts.find((o) => sameMode(o.mode, m))?.key;

  // close the spell popover on outside click / when the turn changes
  useEffect(() => {
    if (!spellOpen) return;
    const onDown = (e: PointerEvent) => {
      if (spellRef.current && !spellRef.current.contains(e.target as Node)) setSpellOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [spellOpen]);
  const [lastActive, setLastActive] = useState(v.activeId);
  if (lastActive !== v.activeId) {
    setLastActive(v.activeId);
    setSpellOpen(false);
  }

  // keyboard: Escape closes the popover first, everything else goes to ctrl.hotkey
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat && !e.key.startsWith('Arrow')) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      // let Enter/Space activate a focused button normally
      if ((e.key === 'Enter' || e.key === ' ') && t && /^(BUTTON|A)$/.test(t.tagName)) return;
      if (e.key === 'Escape' && spellOpen) {
        setSpellOpen(false);
        e.preventDefault();
        return;
      }
      if (ctrl.hotkey?.(e.key)) {
        e.preventDefault();
        if (/^[1-9]$/.test(e.key)) setSpellOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctrl, spellOpen]);

  if (!playing || !s) return null;
  const heroes = s.combatants.filter((c) => c.side === 'hero');
  const notMine = !my ? (v.busy ? 'Enemies are acting…' : 'Not your turn') : v.busy ? 'Resolving…' : null;
  const actWhy = notMine ?? (acted ? `${my!.name.split(' ')[0]} already used the action this turn.` : null);
  const potionWhy = actWhy ?? (!(my!.potions ?? 0) ? 'No potions left.' : my!.hp >= my!.maxHp ? 'Already at full HP.' : null);
  const hasSpells = !!my?.spells?.length;
  const castable = hasSpells && my!.spells!.some((slug) => {
    const sp = s.spells[slug];
    return sp && (sp.level === 0 || (my!.slots?.[sp.level] ?? 0) > 0);
  });
  const done = ready && acted && moveLeft === 0;
  const spellMode = v.mode.kind === 'spell' ? s.spells[v.mode.slug] : null;

  return (
    <div className="relative z-20 border-t border-amber-900/40 bg-gradient-to-b from-black/30 to-black/60 px-2 pb-2 pt-1.5">
      <div className="mb-1.5 grid grid-cols-3 gap-1.5" aria-label="Party">
        {heroes.map((h) => (
          <PartyCard key={h.id} ctrl={ctrl} h={h} active={h.id === v.activeId} state={s} />
        ))}
      </div>

      <div className="flex flex-wrap items-stretch gap-1.5 max-sm:gap-1">
        {/* action economy */}
        <div className="flex min-w-[148px] flex-col max-sm:w-full justify-center gap-1.5 rounded-lg bg-black/35 px-2.5 py-1.5 ring-1 ring-white/5" aria-live="polite">
          <div className="truncate font-display text-[15px] leading-none text-amber-200">
            {my ? `${my.name.split(' ')[0]}'s turn` : v.busy ? 'Enemy turn…' : '…'}
          </div>
          <Tip tip={<><b>Action</b>: one attack, spell, Dodge or potion per turn.</>} align="start">
            <span className="flex items-center gap-2 font-pixel text-[11px] text-white/75" tabIndex={0} aria-label={`Action ${my && !acted ? 'available' : 'used'}`}>
              <span className={`hud-pip ${my && !acted ? '' : 'used'}`} />
              Action {my && !acted ? 'ready' : 'used'}
            </span>
          </Tip>
          <Tip tip={<><b>Movement</b>: {moveLeft} of {speed} tiles left. Diagonals cost 1.</>} align="start">
            <span className="flex w-full items-center gap-2" tabIndex={0} aria-label={`Movement ${moveLeft} of ${speed} tiles left`}>
              <BootIcon size={13} />
              <span className="hud-move-track flex-1">
                {Array.from({ length: Math.max(speed, 1) }, (_, i) => (
                  <span key={i} className={`hud-move-seg ${i < moveLeft ? '' : 'spent'}`} />
                ))}
              </span>
              <span className="font-pixel text-[11px] text-sky-200">{moveLeft}</span>
            </span>
          </Tip>
        </div>

        <ActBtn
          label={`Move`}
          icon={<BootIcon size={20} />}
          hk="M"
          active={v.mode.kind === 'move'}
          why={notMine ?? (moveLeft === 0 ? 'No movement left this turn.' : null)}
          tip={<><b>Move</b> up to {moveLeft} more tile{moveLeft === 1 ? '' : 's'}. Click a lit tile, or use the arrow keys.</>}
          onClick={() => ctrl.setMode({ kind: 'move' })}
        />

        {my?.attacks.map((a, i) => {
          const m: Mode = { kind: 'attack', index: i };
          return (
            <ActBtn
              key={a.name}
              label={a.name}
              icon={<WeaponIcon name={a.name} range={a.range} />}
              hk={keyFor(m)}
              active={v.mode.kind === 'attack' && v.mode.index === i}
              why={actWhy}
              tip={
                <>
                  <b>{a.name}</b>
                  <br />+{a.toHit} to hit · {a.damage} {a.damageType}
                  <br />Range {a.range <= 1 ? 'melee (adjacent)' : `${a.range} tiles`}
                  {a.inflicts && <><br />On hit: {ctrl.titleOf(`condition.${a.inflicts}`)}</>}
                </>
              }
              onClick={() => ctrl.setMode(m)}
            />
          );
        })}

        {hasSpells && (
          <div className="relative" ref={spellRef}>
            <ActBtn
              label={spellMode ? spellMode.name : 'Spells'}
              icon={<SpellGlyph iconKey={spellMode?.iconKey ?? 'arcane'} size={20} />}
              active={v.mode.kind === 'spell' || spellOpen}
              why={actWhy ?? (!castable ? 'No spell slots left.' : null)}
              tip={spellOpen ? null : <><b>Spells</b>: open the spellbook, or press its number key.</>}
              ariaExpanded={spellOpen}
              ariaHaspopup
              onClick={() => setSpellOpen((o) => !o)}
            />
            {spellOpen && ready && !acted && (
              <SpellPopover
                ctrl={ctrl}
                me={my!}
                state={s}
                activeSlug={v.mode.kind === 'spell' ? v.mode.slug : null}
                keyFor={(slug) => keyFor({ kind: 'spell', slug })}
                onPick={(slug) => {
                  setSpellOpen(false);
                  ctrl.setMode({ kind: 'spell', slug });
                }}
              />
            )}
          </div>
        )}

        <ActBtn
          label="Dodge"
          icon={<ShieldIcon size={20} />}
          hk="D"
          why={actWhy}
          tip={<><b>Dodge</b>: attacks against you have disadvantage until your next turn. Uses your action.</>}
          onClick={() => void ctrl.dodge()}
        />
        <ActBtn
          label={`Potion ×${my?.potions ?? 0}`}
          icon={<Sprite frame="flask_big_red" size={20} />}
          hk="P"
          why={my ? potionWhy : notMine}
          tip={<><b>Potion of Healing</b>: regain 2d4+2 HP. Uses your action.</>}
          onClick={() => void ctrl.potion()}
        />

        <div className="ml-auto flex items-stretch gap-1.5">
          <Tip tip={done ? <>Nothing left to do. End the turn.</> : <>End {my ? `${my.name.split(' ')[0]}'s` : 'the'} turn early. <b>E</b> or <b>Enter</b></>} align="end">
            <button
              type="button"
              className={`hud-end ${done ? 'pulse' : ''}`}
              aria-disabled={!ready}
              aria-keyshortcuts="E Enter"
              onClick={() => ready && void ctrl.endTurn()}
            >
              <span className="flex items-center gap-2">
                <HourglassIcon size={16} /> End turn <span className="hud-key static">E</span>
              </span>
            </button>
          </Tip>
        </div>
      </div>
    </div>
  );
}

function sameMode(a: Mode, b: Mode) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'attack' && b.kind === 'attack') return a.index === b.index;
  if (a.kind === 'spell' && b.kind === 'spell') return a.slug === b.slug;
  return true;
}

function ActBtn({ label, icon, hk, active, why, tip, onClick, ariaExpanded, ariaHaspopup }: {
  label: string;
  icon: React.ReactNode;
  hk?: string;
  active?: boolean;
  why: string | null;
  tip: React.ReactNode;
  onClick: () => void;
  ariaExpanded?: boolean;
  ariaHaspopup?: boolean;
}) {
  const disabled = !!why;
  const body = (
    <button
      type="button"
      className="hud-act"
      data-active={active && !disabled ? 'true' : undefined}
      aria-disabled={disabled}
      aria-pressed={ariaHaspopup ? undefined : !!active}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHaspopup ? 'dialog' : undefined}
      aria-keyshortcuts={hk}
      aria-label={hk ? `${label} (${hk})` : label}
      onClick={() => !disabled && onClick()}
    >
      {hk && <span className="hud-key">{hk}</span>}
      <span className="hud-icon">{icon}</span>
      <span className="lbl">{label}</span>
    </button>
  );
  if (!tip && !why) return body;
  return (
    <Tip tip={<>{tip}{why && <span className="why">{why}</span>}</>}>
      {body}
    </Tip>
  );
}

function SpellPopover({ ctrl, me, state, activeSlug, keyFor, onPick }: {
  ctrl: GameController;
  me: Combatant;
  state: GameState;
  activeSlug: string | null;
  keyFor: (slug: string) => string | undefined;
  onPick: (slug: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const spells = (me.spells ?? []).map((slug) => state.spells[slug]).filter(Boolean) as Spell[];
  const levels = [...new Set(spells.map((sp) => sp.level))].sort((a, b) => a - b);
  const maxSlots = ctrl.content.heroes.find((h) => h.slug === me.refSlug)?.slots ?? {};

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not([aria-disabled="true"])')?.focus();
  }, []);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${me.name}'s spellbook`}
      className="hud-pop bottom-[calc(100%+8px)] left-0 w-[min(560px,calc(100vw-24px))] p-2.5 max-sm:fixed max-sm:inset-x-3 max-sm:bottom-24 max-sm:w-auto"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="panel-title text-sm">Spellbook</span>
        <span className="text-[10px] text-white/50">
          Spell attack <span className="font-pixel text-amber-200">+{me.spellAttack ?? 0}</span> · Save DC <span className="font-pixel text-amber-200">{me.spellDc ?? 0}</span> · <span className="hud-kbd">Esc</span> close
        </span>
      </div>
      <div className="flex max-h-[min(380px,55vh)] flex-col gap-2 overflow-y-auto scroll-thin pr-1">
        {levels.map((lvl) => {
          const left = me.slots?.[lvl] ?? 0;
          const max = Math.max(maxSlots[lvl] ?? left, left);
          return (
            <section key={lvl} aria-label={lvl === 0 ? 'Cantrips' : `Level ${lvl} spells`}>
              <div className="mb-1 flex items-center gap-2 font-pixel text-[10px] uppercase tracking-wider text-amber-300/90">
                <span>{lvl === 0 ? 'Cantrips · at will' : `Level ${lvl}`}</span>
                {lvl > 0 && (
                  <span className="flex items-center gap-1" aria-label={`${left} of ${max} slots left`}>
                    {Array.from({ length: max }, (_, i) => <span key={i} className={`hud-slot ${i < left ? '' : 'spent'}`} />)}
                    <span className="ml-0.5 normal-case text-violet-200/80">{left}/{max} slots</span>
                  </span>
                )}
                <span className="h-px flex-1 bg-amber-800/40" />
              </div>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {spells.filter((sp) => sp.level === lvl).map((sp) => {
                  const noSlot = sp.level > 0 && left <= 0;
                  const k = keyFor(sp.slug);
                  return (
                    <button
                      key={sp.slug}
                      type="button"
                      className="hud-spell"
                      aria-disabled={noSlot}
                      data-active={activeSlug === sp.slug ? 'true' : undefined}
                      aria-keyshortcuts={k}
                      title={noSlot ? `No level ${sp.level} slots left` : undefined}
                      onClick={() => !noSlot && onPick(sp.slug)}
                    >
                      {k && <span className="hud-key">{k}</span>}
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-black/40 ring-1 ring-white/10">
                        <SpellGlyph iconKey={sp.iconKey} size={18} />
                      </span>
                      <span className="min-w-0 pr-4">
                        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className="text-[12.5px] font-semibold text-amber-50">{sp.name}</span>
                          {sp.concentration && <span className="rounded bg-violet-900/50 px-1 text-[9px] uppercase tracking-wide text-violet-200 ring-1 ring-violet-500/30" title="Concentration: casting another concentration spell ends this one">Conc.</span>}
                          <span className="font-pixel text-[9.5px] text-white/50">
                            {sp.level === 0 ? 'no slot' : `1 L${sp.level} slot`} · {sp.range <= 1 ? (sp.range === 0 ? 'self' : 'touch') : `${sp.range} tiles`}
                            {sp.radius ? ` · r${sp.radius}` : ''}
                            {sp.dice ? ` · ${sp.dice}` : ''}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-white/65">{sp.summary}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PartyCard({ ctrl, h, active, state }: { ctrl: GameController; h: Combatant; active: boolean; state: GameState }) {
  const v = ctrl.view;
  const u = v.units?.[h.id];
  const hp = u?.hp ?? h.hp;
  const maxHp = u?.maxHp ?? h.maxHp;
  const dead = u?.dead ?? h.dead;
  const pct = Math.max(0, Math.min(1, hp / maxHp));
  const color = pct > 0.5 ? '#34d399' : pct > 0.25 ? '#facc15' : '#ef4444';
  const maxSlots = ctrl.content.heroes.find((x) => x.slug === h.refSlug)?.slots ?? {};
  const conc = h.concentratingOn ? state.spells[h.concentratingOn] : null;

  return (
    <div className={`hud-card ${active ? 'active' : ''} ${dead ? 'dead' : ''}`} aria-current={active ? 'true' : undefined}>
      <span className="hud-portrait-frame max-sm:hidden">
        <Portrait spriteKey={h.spriteKey} size={40} />
        {dead && <span className="absolute inset-0 grid place-items-center bg-black/40"><Sprite frame="skull" size={20} /></span>}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[12px] font-semibold text-amber-50">{h.name}</span>
          <span className="shrink-0 font-pixel text-[10px] text-white/60" title="Armor Class">AC {h.ac}</span>
        </div>
        <div className="hud-hp mt-1" role="progressbar" aria-valuenow={hp} aria-valuemin={0} aria-valuemax={maxHp} aria-label={`${h.name} hit points`}>
          <i className="ghost" style={{ width: `${pct * 100}%` }} />
          <i className="fill" style={{ width: `${pct * 100}%`, backgroundColor: color }} />
        </div>
        <div className="mt-1 flex items-center gap-2 font-pixel text-[10px] text-white/70">
          <span className="shrink-0">{dead ? 'Down' : `${hp}/${maxHp}`}</span>
          {Object.keys(maxSlots).length > 0 && (
            <span className="flex items-center gap-1.5 max-sm:hidden" aria-label="Spell slots">
              {Object.entries(maxSlots).map(([lvl, max]) => {
                const left = h.slots?.[Number(lvl)] ?? 0;
                return (
                  <span key={lvl} className="flex items-center gap-0.5" title={`Level ${lvl} slots: ${left}/${max}`}>
                    <span className="text-violet-200/70">L{lvl}</span>
                    {Array.from({ length: max }, (_, i) => <span key={i} className={`hud-slot ${i < left ? '' : 'spent'}`} />)}
                  </span>
                );
              })}
            </span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-0.5" title={`${h.potions ?? 0} healing potions`}>
            <Sprite frame="flask_red" size={11} />×{h.potions ?? 0}
          </span>
        </div>
        {(h.conditions.length > 0 || conc || h.dodging) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {conc && (
              <button type="button" className="hud-chip !border-violet-400/40 !bg-violet-900/40 !text-violet-100" onClick={() => ctrl.focusDoc(`rule.concentration`)} title="Concentrating: taking damage forces a Constitution save">
                ◈ {conc.name}
              </button>
            )}
            {h.dodging && <span className="hud-chip !border-emerald-400/40 !bg-emerald-900/40 !text-emerald-100">Dodging</span>}
            {h.conditions.map((c) => (
              <button key={c.slug} type="button" className="hud-chip" onClick={() => ctrl.focusDoc(`condition.${c.slug}`)} title="Open this rule in the Rules Tome">
                {ctrl.titleOf(`condition.${c.slug}`)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
