'use client';
import type { GameController } from '@/game/controller';
import { useView } from '../useView';
import { Sprite } from './Sprite';
import { objective, playMode } from './explore';

/** Mode chip (top-centre-left) and, while exploring, the objective tracker in the initiative rail's slot. */
export function ExploreHud({ ctrl }: { ctrl: GameController }) {
  const v = useView(ctrl);
  if (v.phase !== 'playing' || !v.state) return null;
  const mode = playMode(v);
  const o = objective(v);
  const lairs = o?.lairs ?? [];
  const cleared = lairs.filter((l) => l.cleared).length;
  const allClear = !!o && (o.doorOpen || (lairs.length > 0 && cleared === lairs.length));

  return (
    <div className={`pointer-events-none absolute top-2 z-20 flex flex-col items-start gap-1.5 ${mode === 'combat' ? 'left-[80px] max-sm:left-2 max-sm:top-[64px]' : 'left-2'}`}>
      <span key={mode} className={`hud-mode ${mode} fade-in`} role="status" aria-live="polite" data-testid="mode-chip">
        <span aria-hidden>{mode === 'explore' ? '⛏' : '⚔'}</span> {mode === 'explore' ? 'Exploring' : 'Combat'}
      </span>
      {mode === 'explore' && o && (
        <section className="hud-obj pointer-events-auto" aria-label="Level objectives" data-testid="objective">
          <Row label="Lairs" value={`${cleared}/${lairs.length}`} done={lairs.length > 0 && cleared === lairs.length}>
            {lairs.map((l) => (
              <span
                key={l.id}
                className={`hud-obj-pip ${l.cleared ? 'done' : l.awake ? 'awake' : ''}`}
                title={l.cleared ? `Lair ${l.id}: cleared` : `Lair ${l.id}: ${l.monsters} foe${l.monsters === 1 ? '' : 's'}`}
              >
                <Sprite frame="skull" size={14} />
              </span>
            ))}
          </Row>
          <Row label="Lore" value={`${o.loreFound}/${o.loreTotal}`} done={o.loreTotal > 0 && o.loreFound >= o.loreTotal}>
            {Array.from({ length: o.loreTotal }, (_, i) => (
              <span key={i} className={`hud-obj-book ${i < o.loreFound ? 'done' : ''}`} aria-hidden>
                <BookIcon />
              </span>
            ))}
          </Row>
          <div className="flex items-center gap-1.5 font-pixel text-[11px] text-amber-100">
            <Sprite frame="coin_anim_f0" size={12} />
            <span className="text-white/60">Gold</span>
            <span className="ml-auto tabular-nums">{o.goldFound}</span>
          </div>
          {allClear && (
            <div className="hud-obj-exit fade-in" role="status">
              <span aria-hidden>➜</span> {o.doorOpen ? 'Find the exit' : 'Lairs cleared'}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Row({ label, value, done, children }: { label: string; value: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`${label} ${value}`}>
      <span className="w-9 font-pixel text-[11px] text-white/60">{label}</span>
      <span className="flex flex-1 items-center gap-0.5">{children}</span>
      <span className={`font-pixel text-[11px] tabular-nums ${done ? 'text-emerald-300' : 'text-amber-100'}`}>{value}</span>
    </div>
  );
}

function BookIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 3.5C2 2.7 2.7 2 3.5 2H8v12H3.5A1.5 1.5 0 0 1 2 12.5v-9Z" fill="currentColor" opacity=".85" />
      <path d="M14 3.5c0-.8-.7-1.5-1.5-1.5H8v12h4.5c.8 0 1.5-.7 1.5-1.5v-9Z" fill="currentColor" />
      <path d="M8 2v12" stroke="#1a1020" strokeWidth="1" />
    </svg>
  );
}
