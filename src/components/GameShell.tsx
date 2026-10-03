'use client';
import { useEffect, useRef, useState } from 'react';
import type { GameContent } from '@/game/content/types';
import type { GameController } from '@/game/controller';
import { Header } from './hud/Header';
import { Overlays } from './hud/Screens';
import { ActionBar } from './hud/ActionBar';
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

  return (
    <main className="flex h-dvh flex-col gap-2 p-2 lg:p-3">
      <Header content={content} ctrl={ctrl} />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="panel relative flex min-h-[360px] flex-col overflow-hidden">
          <div ref={host} className="relative min-h-0 flex-1" aria-label="Dungeon map" />
          {ctrl && <Overlays ctrl={ctrl} />}
          {ctrl && <ActionBar ctrl={ctrl} />}
          {!ctrl && <div className="absolute inset-0 grid place-items-center font-display text-amber-200/70">Lighting the torches…</div>}
        </section>
        <aside className="grid min-h-0 grid-rows-[minmax(0,1.25fr)_minmax(0,1fr)] gap-2">
          {ctrl ? <DmPanel ctrl={ctrl} /> : <div className="panel" />}
          {ctrl ? <RulesPanel ctrl={ctrl} content={content} /> : <div className="panel" />}
        </aside>
      </div>
    </main>
  );
}
