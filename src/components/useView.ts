'use client';
import { useSyncExternalStore } from 'react';
import type { GameController } from '@/game/controller';

export function useView(ctrl: GameController) {
  return useSyncExternalStore(ctrl.subscribe, () => ctrl.view, () => ctrl.view);
}
