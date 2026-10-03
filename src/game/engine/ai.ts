// Monster AI: approach the best hero target and attack with the first usable attack.
import { attack, attackInRange, endTurn, move } from './actions';
import { effectiveSpeed, isIncapacitated } from './conditions';
import { distance, findPath, hasLineOfSight, posKey, reachableTiles } from './grid';
import { getCombatant, livingCombatants } from './state';
import type { ActionResult, Combatant, GameState, PlannedAction, Pos, Rng } from './types';

/** Nearest living hero, preferring visible ones, then lowest HP on ties. */
function pickTarget(state: GameState, m: Combatant): Combatant | undefined {
  const heroes = livingCombatants(state).filter((c) => c.side !== m.side);
  const score = (h: Combatant) => [
    hasLineOfSight(state.grid, m.pos, h.pos) ? 0 : 1,
    distance(m.pos, h.pos),
    h.hp,
  ];
  return heroes.sort((a, b) => {
    const sa = score(a), sb = score(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i];
    return 0;
  })[0];
}

/**
 * Plan a monster's turn: optional move, optional attack, then endTurn.
 * Pure: does not mutate state. `rng` is reserved for future tie-breaking.
 */
export function planMonsterTurn(state: GameState, monsterId: string, _rng?: Rng): PlannedAction[] {
  const m = getCombatant(state, monsterId);
  if (!m || m.dead || isIncapacitated(m) || state.status !== 'active') return [{ kind: 'endTurn' }];
  const target = pickTarget(state, m);
  if (!target) return [{ kind: 'endTurn' }];

  const attackFrom = (p: Pos) => m.attacks.findIndex((a) => attackInRange(state, p, target, a));
  const plan: PlannedAction[] = [];
  const ranged = m.attacks.some((a) => a.range > 1);

  let idx = attackFrom(m.pos);
  const adjacent = distance(m.pos, target.pos) <= 1;
  const left = effectiveSpeed(m) - (m.movedThisTurn ?? 0);
  const occupied = new Set(livingCombatants(state).filter((c) => c.id !== m.id).map((c) => posKey(c.pos)));

  // Ranged monsters step out of melee if they can still shoot from the new tile.
  const wantsMove = idx < 0 || (ranged && adjacent && m.attacks[idx].range > 1);
  if (wantsMove && left > 0) {
    const tiles = reachableTiles(state.grid, m.pos, left, occupied);
    let best: { pos: Pos; cost: number; idx: number; dist: number } | undefined;
    for (const t of tiles) {
      const i = attackFrom(t.pos);
      if (i < 0) continue;
      const d = distance(t.pos, target.pos);
      if (ranged && m.attacks[i].range > 1 && d <= 1) continue;
      // Melee: cheapest tile. Ranged: farthest tile still in range, then cheapest.
      const better = !best || (ranged
        ? d > best.dist || (d === best.dist && t.cost < best.cost)
        : t.cost < best.cost);
      if (better) best = { ...t, idx: i, dist: d };
    }
    if (best) {
      plan.push({ kind: 'move', to: best.pos });
      idx = best.idx;
    } else if (idx < 0) {
      // Can't reach attack range: advance along the path as far as possible.
      const path = findPath(state.grid, m.pos, target.pos, occupied, true);
      if (path && path.length > 1) {
        const stop = path.slice(0, Math.min(left, path.length - 1));
        if (stop.length) plan.push({ kind: 'move', to: stop[stop.length - 1] });
      }
    }
  }
  if (idx >= 0) plan.push({ kind: 'attack', targetId: target.id, attackIndex: idx });
  plan.push({ kind: 'endTurn' });
  return plan;
}

/** Plan and execute a monster's whole turn (including endTurn). */
export function runMonsterTurn(state: GameState, id: string, rng: Rng = state.rng): ActionResult[] {
  const results: ActionResult[] = [];
  for (const step of planMonsterTurn(state, id, rng)) {
    if (state.status !== 'active') break;
    if (step.kind === 'move') results.push(move(state, id, step.to, rng));
    else if (step.kind === 'attack') results.push(attack(state, id, step.targetId, step.attackIndex, rng));
    else results.push(endTurn(state, rng));
  }
  return results;
}
