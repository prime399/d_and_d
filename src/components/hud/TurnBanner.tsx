'use client';
import { useEffect, useState } from 'react';
import type { GameController } from '@/game/controller';
import { useView } from '../useView';

/** Slides "Round N" / "<name>'s turn" across the map for ~1s whenever view.turnBanner changes. */
export function TurnBanner({ ctrl }: { ctrl: GameController }) {
  const v = useView(ctrl);
  const b = v.turnBanner;
  const [gone, setGone] = useState<number | null>(null);
  useEffect(() => {
    if (!b) return;
    const t = setTimeout(() => setGone(b.key), 1200);
    return () => clearTimeout(t);
  }, [b]);
  if (!b || gone === b.key || v.phase !== 'playing') return null;
  const round = (b.side as string) === 'round' || /^Round /.test(b.text);
  const kind = round ? 'round' : b.side;
  const text = round ? b.text : b.side === 'hero' ? `Your turn: ${b.text.replace(/'s turn$/, '')}` : `Enemy turn: ${b.text.replace(/'s turn$/, '')}`;
  return (
    <div key={b.key} className={`hud-banner ${kind}`} role="status" aria-live="polite">
      <div>{text}</div>
    </div>
  );
}
