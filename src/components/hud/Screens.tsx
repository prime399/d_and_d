'use client';
import { useEffect, useState } from 'react';
import type { GameController } from '@/game/controller';
import { useView } from '../useView';
import { DiceOverlay } from '../DiceOverlay';
import { InitiativeStrip } from './InitiativeStrip';
import { TitleScreen } from '../screens/TitleScreen';
import { EndScreen, RoomCleared } from '../screens/EndScreens';
import { CreditsModal } from '../screens/Credits';
import { CREDITS_EVENT, openCredits } from '../screens/credits';
import { Sprite } from '../screens/Sprite';

export { openCredits, CreditsModal };

export function Overlays({ ctrl }: { ctrl: GameController }) {
  const v = useView(ctrl);
  const [credits, setCredits] = useState(false);
  // Remember the newest ruling key when each room starts so the cleared card can show "rules cited this room".
  const [mark, setMark] = useState({ room: -1, key: 0 });
  if (v.phase === 'playing' && mark.room !== v.roomIndex) {
    setMark({ room: v.roomIndex, key: v.rulings.reduce((m, r) => Math.max(m, r.key), 0) });
  }

  useEffect(() => {
    const on = () => setCredits(true);
    window.addEventListener(CREDITS_EVENT, on);
    return () => window.removeEventListener(CREDITS_EVENT, on);
  }, []);

  return (
    <>
      <DiceOverlay show={v.dice} />
      {v.state && v.phase === 'playing' && <InitiativeStrip ctrl={ctrl} />}
      {v.phase === 'playing' && v.hover?.unit && <HoverCard ctrl={ctrl} unit={v.hover.unit} />}
      <Toasts toast={v.toast} />
      {v.phase === 'title' && <TitleScreen ctrl={ctrl} onCredits={() => setCredits(true)} />}
      {v.phase === 'room-cleared' && <RoomCleared ctrl={ctrl} sinceKey={mark.room === v.roomIndex ? mark.key : 0} />}
      {(v.phase === 'victory' || v.phase === 'defeat') && <EndScreen key={v.phase} ctrl={ctrl} onCredits={() => setCredits(true)} />}
      {credits && <CreditsModal onClose={() => setCredits(false)} />}
    </>
  );
}

type HoverUnit = NonNullable<NonNullable<GameController['view']['hover']>['unit']>;

function HoverCard({ ctrl, unit: u }: { ctrl: GameController; unit: HoverUnit }) {
  const hero = u.side === 'hero';
  const monster = hero ? undefined : ctrl.content.monsters.find((m) => m.slug === u.refSlug);
  const heroData = hero ? ctrl.content.heroes.find((h) => h.slug === u.refSlug) : undefined;
  const sprite = monster?.spriteKey ?? heroData?.spriteKey;
  const pct = Math.max(0, Math.min(1, u.hp / u.maxHp));
  return (
    <div className={`scr-hover pointer-events-none absolute right-3 top-12 z-20 w-60 ${hero ? 'scr-hover-hero' : 'scr-hover-foe'}`} role="status" aria-live="polite">
      <div className="flex items-center gap-2.5">
        {sprite && <div className="scr-hover-portrait"><Sprite k={sprite} scale={2} anim={false} /></div>}
        <div className="min-w-0 flex-1">
          <div className={`truncate font-display text-base leading-tight ${hero ? 'text-sky-100' : 'text-rose-100'}`}>{u.name}</div>
          <div className="text-[10px] uppercase tracking-wider text-white/55">
            {hero ? `${heroData?.className ?? 'Hero'}` : monster ? `CR ${fmtCr(monster.cr)} · ${monster.xp} XP` : 'Monster'}
          </div>
        </div>
        <div className="scr-ac" aria-label={`Armor class ${u.ac}`}><span>AC</span>{u.ac}</div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="scr-bar flex-1"><span style={{ width: `${pct * 100}%` }} className={pct > 0.5 ? 'bg-emerald-400' : pct > 0.25 ? 'bg-amber-400' : 'bg-rose-500'} /></div>
        <span className="font-pixel text-xs tabular-nums text-white/85">{Math.max(0, u.hp)}/{u.maxHp}</span>
      </div>
      {u.conditions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {u.conditions.map((c) => <span key={c} className="scr-cond">{ctrl.titleOf(`condition.${c}`)}</span>)}
        </div>
      )}
      {monster && monster.attacks.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-white/10 pt-1.5 text-[11px]">
          {monster.attacks.map((a) => (
            <li key={a.name} className="flex justify-between gap-2">
              <span className="truncate text-[#ece3d0]/85">{a.name}{a.range > 1 ? <span className="text-white/45"> · {a.range * 5}ft</span> : null}</span>
              <span className="shrink-0 font-pixel text-rose-200">+{a.toHit} · {a.damage}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const fmtCr = (cr: number) => (cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr));

type ToastItem = { id: number; text: string; tone: 'cond' | 'err' | 'loot' | 'info' };

function toneOf(t: string): ToastItem['tone'] {
  if (/finds|potion|recover/i.test(t)) return 'loot';
  if (/out of reach|^pick|not allowed|move next|empty|can't|cannot|no /i.test(t)) return 'err';
  if (/ is .+!$|loses the turn|prone|poisoned|frightened|paralyzed|restrained|charmed|stunned|unconscious|asleep/i.test(t)) return 'cond';
  return 'info';
}

const TOAST_ICON: Record<ToastItem['tone'], string> = { cond: '◆', err: '✕', loot: '✦', info: '•' };

/** Stacks the controller's single `toast` string into a short history so rapid messages don't clobber each other. */
function Toasts({ toast }: { toast: string | null }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [last, setLast] = useState<string | null>(null);
  if (toast !== last) {
    setLast(toast);
    if (toast) setItems((xs) => [...xs.slice(-2), { id: Date.now() + Math.random(), text: toast, tone: toneOf(toast) }]);
  }
  useEffect(() => {
    if (!items.length) return;
    const t = setTimeout(() => setItems((xs) => xs.slice(1)), 3200);
    return () => clearTimeout(t);
  }, [items]);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex flex-col items-center gap-1.5 px-3" aria-live="polite" role="status">
      {items.map((t) => (
        <div key={t.id} className={`scr-toast scr-toast-${t.tone}`}>
          <span aria-hidden className="scr-toast-ic">{TOAST_ICON[t.tone]}</span>
          {t.text}
        </div>
      ))}
    </div>
  );
}
