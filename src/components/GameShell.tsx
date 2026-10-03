'use client';
import { useEffect, useRef, useState } from 'react';
import type { GameContent } from '@/game/content/types';
import type { GameController } from '@/game/controller';
import { Header } from './hud/Header';
import { Overlays } from './hud/Screens';
import { ActionBar } from './hud/ActionBar';
import { TurnBanner } from './hud/TurnBanner';
import { ExploreHud } from './hud/ExploreHud';
import { DmPanel } from './DmPanel';
import { RulesPanel } from './RulesPanel';

export function GameShell({ content }: { content: GameContent }) {
  const host = useRef<HTMLDivElement>(null);
  const [ctrl, setCtrl] = useState<GameController | null>(null);

  useEffect(() => {
    let destroyed = false;
    let game: { destroy: (b: boolean) => void } | null = null;
    (async () => {
      const [{ createPhaserGame }, { GameController }] = await Promise.all([import('@/game/phaser'), import('@/game/controller')]);
      if (destroyed || !host.current) return;
      const created = createPhaserGame(host.current);
      game = created.game;
      await created.scene.ready;
      const c = new GameController(content);
      c.attachScene(created.scene);
      (window as unknown as { __game: unknown }).__game = c;
      setCtrl(c);
    })();
    return () => {
      destroyed = true;
      game?.destroy(true);
    };
  }, [content]);

  // Desktop (lg+): fixed-height grid, no page scroll. Narrow: map on top, panels stacked below, page scrolls.
  return (
    <main className="flex min-h-dvh flex-col gap-2 overflow-x-clip p-2 lg:h-dvh lg:min-h-0 lg:p-3">
      <Header content={content} ctrl={ctrl} />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="panel relative flex h-[min(88dvh,760px)] min-h-[520px] flex-col overflow-visible lg:h-auto lg:min-h-0">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-t-[10px]">
            <div ref={host} className="absolute inset-0" aria-label="Dungeon map" />
            {ctrl && <ExploreHud ctrl={ctrl} />}
            {ctrl && <TurnBanner ctrl={ctrl} />}
          </div>
          {ctrl && <Overlays ctrl={ctrl} />}
          {ctrl && <ActionBar ctrl={ctrl} />}
          {!ctrl && <div className="absolute inset-0 grid place-items-center font-display text-amber-200/70">Lighting the torches…</div>}
        </section>
        <aside className="grid min-h-0 grid-rows-[minmax(420px,auto)_minmax(360px,auto)] gap-2 lg:grid-rows-[minmax(0,1.25fr)_minmax(0,1fr)]">
          {ctrl ? <DmPanel ctrl={ctrl} /> : <div className="panel" />}
          {ctrl ? <RulesPanel ctrl={ctrl} content={content} /> : <div className="panel" />}
        </aside>
      </div>
    </main>
  );
}
