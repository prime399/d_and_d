import type { GameController } from '@/game/controller';

/** Defensive readers for the Phase 2 exploration fields (Contract B), so the HUD works before and after core lands them. */
type V = GameController['view'];
type Loose = Record<string, unknown>;

export type PlayMode = 'explore' | 'combat';
export type Objective = {
  lairs: { id: number; cleared: boolean; awake: boolean; monsters: number }[];
  doorOpen: boolean;
  goldFound: number;
  loreFound: number;
  loreTotal: number;
};
export type Interactable = { kind: string; label: string } | null;

export function playMode(v: V): PlayMode {
  const x = v as unknown as Loose;
  for (const k of ['playMode', 'gameMode', 'play', 'explore'] as const) {
    const m = x[k];
    if (m === 'explore' || m === 'combat') return m;
    if (k === 'explore' && typeof m === 'boolean') return m ? 'explore' : 'combat';
  }
  const m = x.mode;
  return m === 'explore' || m === 'combat' ? m : 'combat';
}

export const objective = (v: V): Objective | null => ((v as unknown as Loose).objective as Objective | undefined) ?? null;
export const leaderId = (v: V): string | null => ((v as unknown as Loose).leaderId as string | undefined) ?? null;

const LABEL: Record<string, string> = { lore: 'Read lore stone', chest: 'Open chest', gold: 'Pick up gold', door: 'Leave level' };
export function interactable(v: V): Interactable {
  const it = (v as unknown as Loose).interactable as { kind?: string; label?: string } | null | undefined;
  if (!it?.kind) return null;
  return { kind: it.kind, label: it.label ?? LABEL[it.kind] ?? 'Interact' };
}

type C = GameController & { setLeader?: (id: string) => void; interact?: () => void };
export const setLeader = (ctrl: GameController, id: string) => (ctrl as C).setLeader?.(id);
export const interact = (ctrl: GameController) => (ctrl as C).interact?.();
