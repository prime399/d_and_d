'use client';
import { useState } from 'react';
import type { GameContent } from '@/game/content/types';
import type { GameController } from '@/game/controller';
import { useView } from '../useView';
import { audio } from '@/game/audio';
import { openCredits } from './Screens';
import { Tip } from './Tip';
import { HelpPopover } from './HelpPopover';

export function Header({ content, ctrl }: { content: GameContent; ctrl: GameController | null }) {
  const [muted, setMuted] = useState(() => audio.muted);
  const sanity = content.source === 'sanity';
  return (
    <header className="flex min-h-[40px] flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-1">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="font-display text-xl leading-none text-amber-200 title-glow sm:text-2xl">The Goblin Warren</h1>
        <span className="hidden truncate text-xs text-white/55 md:inline">An AI Dungeon Master that cites the rules</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Tip
          side="bottom"
          align="end"
          tip={
            sanity ? (
              <>Monsters, spells, rooms and every rule the DM cites are loaded live from <b>Sanity</b>. The DM searches them through Sanity Context.</>
            ) : (
              <>Sanity is unreachable, so the game runs on a bundled <b>offline SRD</b> snapshot. Gameplay and citations still work.</>
            )
          }
        >
          <span
            tabIndex={0}
            className={`hud-badge ring-1 ${sanity ? 'bg-emerald-950/60 text-emerald-200 ring-emerald-600/40' : 'bg-amber-950/60 text-amber-200 ring-amber-700/40'}`}
          >
            <span className="hud-dot" />
            {sanity ? 'Content: Sanity' : 'Content: offline SRD'}
          </span>
        </Tip>
        {ctrl && <SrdToggle ctrl={ctrl} />}
        <button
          type="button"
          className="hud-small-btn"
          aria-pressed={muted}
          aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          title={muted ? 'Sound off' : 'Sound on'}
          onClick={() => {
            audio.setMuted(!muted);
            setMuted(!muted);
          }}
        >
          <SpeakerIcon muted={muted} />
        </button>
        <button type="button" className="hud-small-btn px-2.5 text-[11px]" onClick={() => openCredits()}>
          Credits
        </button>
        <HelpPopover />
      </div>
    </header>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width="17" height="17" fill="none" stroke="#fbecc9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 6h2.5L8.5 3v10L5 10H2.5z" fill="#fbecc933" />
      {muted ? <path d="m11 6 3.5 4M14.5 6 11 10" stroke="#fda4af" /> : <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.6a6 6 0 0 1 0 8.8" />}
    </svg>
  );
}

function SrdToggle({ ctrl }: { ctrl: GameController }) {
  const v = useView(ctrl);
  return (
    <Tip side="bottom" align="end" tip={<>The DM rules by this edition. Where 2014 and 2024 differ, the citation is flagged.</>}>
      <div className="flex h-[36px] overflow-hidden rounded-lg ring-1 ring-amber-800/50" role="group" aria-label="SRD rules edition">
        {(['2024', '2014'] as const).map((ver) => {
          const on = v.srdVersion === ver;
          return (
            <button
              key={ver}
              type="button"
              onClick={() => ctrl.setSrdVersion(ver)}
              aria-pressed={on}
              className={`px-2.5 font-pixel text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-amber-300 ${
                on ? (ver === '2014' ? 'bg-violet-800/70 text-violet-50' : 'bg-amber-700/70 text-amber-50') : 'bg-black/30 text-white/65 hover:text-white'
              }`}
            >
              SRD {ver}
            </button>
          );
        })}
      </div>
    </Tip>
  );
}
