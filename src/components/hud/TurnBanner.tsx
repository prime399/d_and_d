'use client';
import { useEffect, useState } from 'react';
import type { GameController } from '@/game/controller';
import { useView } from '../useView';
import { playMode } from './explore';

/** Slides "Round N" / "<name>'s turn" across the map for ~1s whenever view.turnBanner changes; a big "AMBUSH!" when exploration flips to combat. */
export function TurnBanner({ ctrl }: { ctrl: GameController }) {
  const v = useView(ctrl);
  const b = v.turnBanner;
  const mode = playMode(v);
  const [gone, setGone] = useState<number | null>(null);
  // Our own ambush trigger, in case core's banner for it gets overwritten by "Round 1" right away.
  const [ambush, setAmbush] = useState(0);
  const [prevMode, setPrevMode] = useState(mode);
  if (prevMode !== mode) {
    setPrevMode(mode);
    if (mode === 'combat' && prevMode === 'explore' && v.phase === 'playing') setAmbush((n) => n + 1);
  }
  useEffect(() => {
    if (!ambush) return;
    const t = setTimeout(() => setAmbush(0), 1700);
    return () => clearTimeout(t);
  }, [ambush]);
  const isAmbush = !!b && ((b.side as string) === 'ambush' || /ambush/i.test(b.text));
  useEffect(() => {
    if (!b) return;
    const t = setTimeout(() => setGone(b.key), isAmbush ? 1700 : 1200);
    return () => clearTimeout(t);
  }, [b, isAmbush]);
  if (v.phase !== 'playing') return null;
  if (ambush || (isAmbush && gone !== b!.key)) {
    return (
      <div key={ambush || b!.key} className="hud-banner ambush" role="status" aria-live="assertive" data-testid="ambush-banner">
        <div>AMBUSH!</div>
      </div>
    );
  }
  if (!b || gone === b.key) return null;
  const round = (b.side as string) === 'round' || /^Round /.test(b.text);
  const kind = round ? 'round' : b.side;
  const text = round ? b.text : b.side === 'hero' ? `Your turn: ${b.text.replace(/'s turn$/, '')}` : `Enemy turn: ${b.text.replace(/'s turn$/, '')}`;
  return (
    <div key={b.key} className={`hud-banner ${kind}`} role="status" aria-live="polite">
      <div>{text}</div>
    </div>
  );
}
