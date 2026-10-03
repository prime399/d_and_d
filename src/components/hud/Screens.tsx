'use client';
import type { GameController } from '@/game/controller';
import { useView } from '../useView';
import { DiceOverlay } from '../DiceOverlay';
import { InitiativeStrip } from './InitiativeStrip';

export function Overlays({ ctrl }: { ctrl: GameController }) {
  const v = useView(ctrl);
  return (
    <>
      <DiceOverlay show={v.dice} />
      {v.state && v.phase === 'playing' && <InitiativeStrip ctrl={ctrl} />}
      {v.hover?.unit && (
        <div className="pointer-events-none absolute right-3 top-14 z-20 w-48 rounded-md bg-black/80 p-2 text-xs ring-1 ring-white/10 fade-in">
          <div className={`font-semibold ${v.hover.unit.side === 'hero' ? 'text-sky-200' : 'text-rose-200'}`}>{v.hover.unit.name}</div>
          <div className="text-white/70">HP {v.hover.unit.hp}/{v.hover.unit.maxHp} · AC {v.hover.unit.ac}</div>
          {v.hover.unit.conditions.length > 0 && <div className="mt-1 text-amber-200">{v.hover.unit.conditions.map((c) => ctrl.titleOf(`condition.${c}`)).join(', ')}</div>}
        </div>
      )}
      {v.toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center">
          <div className="fade-in rounded-md bg-black/85 px-4 py-2 text-sm text-amber-100 ring-1 ring-amber-700/50">{v.toast}</div>
        </div>
      )}
      {v.phase === 'title' && <TitleScreen ctrl={ctrl} />}
      {v.phase === 'room-cleared' && (
        <Modal>
          <h2 className="font-display text-3xl text-amber-200 title-glow">Room cleared</h2>
          <p className="mt-2 text-sm text-white/70">The party catches its breath (short rest: each hero recovers a third of their HP). A door grinds open to the north…</p>
          <div className="mt-5 flex justify-center gap-3">
            <button className="btn btn-primary px-5 py-2" onClick={() => void ctrl.nextRoom()} autoFocus>Go deeper →</button>
          </div>
        </Modal>
      )}
      {(v.phase === 'victory' || v.phase === 'defeat') && <EndScreen ctrl={ctrl} />}
    </>
  );
}

function Modal({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/60 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <div className="panel fade-in max-w-md p-6 text-center">{children}</div>
    </div>
  );
}

function TitleScreen({ ctrl }: { ctrl: GameController }) {
  const heroes = ctrl.content.heroes;
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-[radial-gradient(ellipse_at_center,rgba(40,20,30,.85),rgba(5,3,8,.97))]">
      <div className="fade-in max-w-2xl px-6 text-center">
        <p className="font-pixel text-xs tracking-[0.3em] text-amber-500/80">A D&amp;D 5E DUNGEON CRAWL</p>
        <h2 className="mt-2 font-display text-5xl text-amber-200 title-glow sm:text-6xl">The Goblin Warren</h2>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-white/70">
          Five rooms. Three heroes. One Dungeon Master who never makes up a rule: every ruling is looked up in the rules tome and shown with its source.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-3 text-left">
          {heroes.map((h) => (
            <div key={h.slug} className="rounded-md bg-black/40 p-3 ring-1 ring-amber-900/40">
              <div className="font-display text-amber-100">{h.name}</div>
              <div className="text-[11px] text-amber-400/80">Level {h.level} {h.className} · AC {h.ac} · {h.hp} HP</div>
              <p className="mt-1 text-[11px] leading-snug text-white/60">{h.blurb}</p>
            </div>
          ))}
        </div>
        <button className="btn btn-primary mt-8 px-8 py-3 text-lg" onClick={() => void ctrl.start()} autoFocus>
          Enter the dungeon
        </button>
        <p className="mt-3 text-[11px] text-white/40">Click a tile to move · click an enemy to attack · ask the DM any rules question</p>
      </div>
    </div>
  );
}

function EndScreen({ ctrl }: { ctrl: GameController }) {
  const v = useView(ctrl);
  const win = v.phase === 'victory';
  const s = v.stats;
  return (
    <Modal>
      <h2 className={`font-display text-4xl title-glow ${win ? 'text-amber-200' : 'text-rose-300'}`}>{win ? 'Victory!' : 'The party has fallen'}</h2>
      <p className="mt-2 text-sm text-white/70">{win ? 'The Bugbear Chief lies still and the Goblin Warren is silent. Songs will be sung.' : `Defeated in ${v.room?.name ?? 'the dark'}.`}</p>
      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        {[
          ['Dice rolled', s.rolls], ['Crits', s.crits], ['Foes slain', s.kills], ['Rules cited', s.rulesCited],
        ].map(([k, n]) => (
          <div key={k} className="rounded bg-black/40 p-2 ring-1 ring-white/10">
            <div className="font-display text-2xl text-amber-100">{n}</div>
            <div className="text-[10px] uppercase tracking-wide text-white/50">{k}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-center gap-3">
        {!win && <button className="btn btn-primary px-5 py-2" onClick={() => void ctrl.retryRoom()} autoFocus>Retry room</button>}
        <button className="btn px-5 py-2" onClick={() => ctrl.restart()}>New run</button>
      </div>
    </Modal>
  );
}
