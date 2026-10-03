'use client';
import { useState } from 'react';
import type { GameController, View } from '@/game/controller';
import { Modal } from './Modal';
import { Confetti, Embers } from './Embers';
import { Sprite } from './Sprite';
import { useCountUp } from './useCountUp';

type Top = { id: string; title: string; n: number };

/** Most-cited rules, by citation id, from the rulings log. */
export function topRules(v: View, limit = 5, sinceKey = 0): Top[] {
  const m = new Map<string, Top>();
  for (const r of v.rulings) {
    if (r.key <= sinceKey) continue;
    const t = m.get(r.citation.id) ?? { id: r.citation.id, title: r.citation.title, n: 0 };
    t.n++;
    m.set(r.citation.id, t);
  }
  return [...m.values()].sort((a, b) => b.n - a.n).slice(0, limit);
}

export function RuleChips({ ctrl, rules, label }: { ctrl: GameController; rules: Top[]; label: string }) {
  if (!rules.length) return <p className="text-xs text-white/50">No rules were needed. Clean fighting.</p>;
  return (
    <ul className="flex flex-wrap justify-center gap-1.5" aria-label={label}>
      {rules.map((r) => (
        <li key={r.id}>
          <button className="scr-rule" onClick={() => ctrl.focusDoc(r.id)} title="Show in the rules tome">
            {r.title}{r.n > 1 && <span className="scr-rule-n">×{r.n}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Tile({ label, value, delay, tone }: { label: string; value: number; delay: number; tone: string }) {
  const n = useCountUp(value, 1100, delay);
  return (
    <div className="scr-tile">
      <div className={`font-pixel text-3xl tabular-nums ${tone}`}>{n}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-white/60">{label}</div>
    </div>
  );
}

export function RoomCleared({ ctrl, sinceKey }: { ctrl: GameController; sinceKey: number }) {
  const v = ctrl.view;
  const heroes = v.state?.combatants.filter((c) => c.side === 'hero') ?? [];
  const sorted = [...ctrl.content.rooms].sort((a, b) => a.order - b.order);
  const next = sorted[v.roomIndex + 1];
  const cited = topRules(v, 6, sinceKey);
  const foes = v.state?.combatants.filter((c) => c.side === 'monster').length ?? 0;
  return (
    <Modal label="Level cleared" className="w-full max-w-lg p-6 text-center">
      <div aria-hidden className="mx-auto -mt-1 mb-1 flex justify-center"><Sprite k="chest_full_open" scale={3} anim={false} /></div>
      <p className="font-pixel text-[11px] tracking-[0.3em] text-emerald-300">LEVEL {v.roomIndex + 1} OF {v.roomCount} CLEARED</p>
      <h2 className="mt-1 font-display text-3xl text-amber-200 title-glow">{v.room?.name ?? 'Level cleared'}</h2>
      <p className="mt-1 text-xs text-white/60">{foes} {foes === 1 ? 'foe' : 'foes'} defeated</p>

      <ul className="mt-4 space-y-2 text-left" aria-label="Party status">
        {heroes.map((h) => {
          const pct = Math.max(0, h.hp / h.maxHp);
          const hurt = h.maxHp - h.hp;
          return (
            <li key={h.id} className="flex items-center gap-3">
              <Sprite k={h.spriteKey} scale={1.5} anim={false} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between text-xs">
                  <span className="text-sky-100">{h.name}</span>
                  <span className={`font-pixel ${h.dead ? 'text-rose-300' : hurt ? 'text-amber-200' : 'text-emerald-300'}`}>
                    {h.dead ? 'Down' : hurt ? `−${hurt} HP` : 'Unscathed'} · {Math.max(0, h.hp)}/{h.maxHp}
                  </span>
                </div>
                <div className="scr-bar mt-1"><span style={{ width: `${pct * 100}%` }} className={pct > 0.5 ? 'bg-emerald-400' : pct > 0.25 ? 'bg-amber-400' : 'bg-rose-500'} /></div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4">
        <p className="mb-1.5 font-pixel text-[10px] tracking-[0.2em] text-violet-200">RULES CITED THIS ROOM</p>
        <RuleChips ctrl={ctrl} rules={cited} label="Rules cited this room" />
      </div>

      <p className="mt-4 rounded-md bg-emerald-950/40 px-3 py-2 text-xs text-emerald-100/90 ring-1 ring-emerald-500/25">
        Short rest: each standing hero recovers a third of their HP.
      </p>
      {next && <p className="mt-3 text-xs text-white/60">Ahead lies <span className="font-display text-sm text-amber-100">{next.name}</span>{next.isBoss ? ' (boss)' : ''}</p>}
      <button className="scr-cta scr-cta-sm mt-4" onClick={() => void ctrl.nextRoom()} data-autofocus>Descend deeper →</button>
    </Modal>
  );
}

export function EndScreen({ ctrl, onCredits }: { ctrl: GameController; onCredits: () => void }) {
  const v = ctrl.view;
  const win = v.phase === 'victory';
  const s = v.stats;
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const rules = topRules(v, 5);
  const where = v.room?.name ?? 'the Goblin Warren';
  const share = async () => {
    const text = win
      ? `I cleared The Goblin Warren: ${s.rolls} dice, ${s.crits} crits, ${s.kills} foes slain, ${s.rulesCited} rules cited by an AI DM that never cheats.`
      : `My party fell in ${where} (The Goblin Warren): ${s.rolls} dice, ${s.crits} crits, ${s.rulesCited} rules cited by an AI DM that never cheats.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
    setTimeout(() => setCopied('idle'), 2200);
  };
  return (
    <div className={`absolute inset-0 z-40 ${win ? 'scr-win' : 'scr-lose'}`}>
      {win ? <><Embers tone="gold" count={30} /><Confetti /></> : <Embers tone="blood" count={18} />}
      <Modal label={win ? 'Victory' : 'Defeat'} className={`relative w-full max-w-xl p-6 text-center ${win ? '' : 'scr-card-lose'}`}>
        <div aria-hidden className="mb-2 flex items-end justify-center gap-2">
          {win
            ? (ctrl.content.heroes.map((h, i) => <Sprite key={h.slug} k={h.spriteKey} scale={3} delay={i * 150} />))
            : <><Sprite k="skull" scale={3} anim={false} /><Sprite k="big_demon" scale={2.5} flip /></>}
        </div>
        <p className={`font-pixel text-[11px] tracking-[0.35em] ${win ? 'text-amber-300' : 'text-rose-300'}`}>{win ? 'THE WARREN IS SILENT' : 'YOUR TALE ENDS HERE'}</p>
        <h2 className={`mt-1 font-display text-5xl ${win ? 'scr-title-text' : 'scr-title-lose'}`}>{win ? 'Victory' : 'The party has fallen'}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#ece3d0]/80">
          {win ? 'The Bugbear Chief lies still. Songs will be sung of this day, and every blow was by the book.' : `Defeated in ${where}. The goblins will tell this story for years.`}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Dice rolled" value={s.rolls} delay={150} tone="text-amber-100" />
          <Tile label="Critical hits" value={s.crits} delay={250} tone="text-amber-300" />
          <Tile label="Foes slain" value={s.kills} delay={350} tone="text-rose-200" />
          <Tile label="Rules cited" value={s.rulesCited} delay={450} tone="text-violet-200" />
        </div>
        <div className="mt-4">
          <p className="mb-1.5 font-pixel text-[10px] tracking-[0.2em] text-violet-200">MOST-CITED RULES</p>
          <RuleChips ctrl={ctrl} rules={rules} label="Most-cited rules" />
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          {!win && <button className="scr-cta scr-cta-sm" onClick={() => void ctrl.retryRoom()} data-autofocus>Retry room</button>}
          <button className={win ? 'scr-cta scr-cta-sm' : 'btn px-5 py-2'} onClick={() => ctrl.restart()} data-autofocus={win || undefined}>New run</button>
          <button className="btn px-5 py-2" onClick={() => void share()}>{copied === 'ok' ? 'Copied ✓' : copied === 'fail' ? 'Copy failed' : 'Share'}</button>
          <button className="btn px-4 py-2" onClick={onCredits}>Credits</button>
        </div>
        <p className="sr-only" aria-live="polite">{copied === 'ok' ? 'Summary copied to clipboard' : ''}</p>
      </Modal>
    </div>
  );
}
