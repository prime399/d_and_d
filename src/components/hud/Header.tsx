'use client';
import { useState } from 'react';
import type { GameContent } from '@/game/content/types';
import type { GameController } from '@/game/controller';
import { useView } from '../useView';
import { audio } from '@/game/audio';

export function Header({ content, ctrl }: { content: GameContent; ctrl: GameController | null }) {
  const [muted, setMuted] = useState(false);
  const v = ctrl ? ctrl.view : null;
  return (
    <header className="flex items-center justify-between gap-3 px-1">
      <div className="flex items-baseline gap-3">
        <h1 className="font-display text-xl text-amber-200 title-glow sm:text-2xl">The Goblin Warren</h1>
        <span className="hidden text-xs text-white/50 sm:inline">An AI Dungeon Master that cites the rules</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`rounded px-2 py-0.5 ring-1 ${content.source === 'sanity' ? 'bg-emerald-950/60 text-emerald-200 ring-emerald-600/40' : 'bg-amber-950/60 text-amber-200 ring-amber-700/40'}`}
          title="Where game content was loaded from"
        >
          {content.source === 'sanity' ? 'Content: Sanity' : 'Content: offline SRD'}
        </span>
        {v && <SrdToggle ctrl={ctrl!} />}
        <button
          type="button"
          className="btn text-xs"
          aria-pressed={muted}
          onClick={() => {
            audio.setMuted(!muted);
            setMuted(!muted);
          }}
        >
          {muted ? '🔇 Sound off' : '🔊 Sound on'}
        </button>
      </div>
    </header>
  );
}

function SrdToggle({ ctrl }: { ctrl: GameController }) {
  const v = useView(ctrl);
  return (
    <div className="flex overflow-hidden rounded ring-1 ring-amber-800/50" role="group" aria-label="Rules version">
      {(['2024', '2014'] as const).map((ver) => (
        <button
          key={ver}
          type="button"
          onClick={() => ctrl.setSrdVersion(ver)}
          aria-pressed={v.srdVersion === ver}
          className={`px-2 py-0.5 font-pixel ${v.srdVersion === ver ? 'bg-amber-700/60 text-amber-50' : 'bg-black/30 text-white/60 hover:text-white'}`}
        >
          {ver} rules
        </button>
      ))}
    </div>
  );
}
