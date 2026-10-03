/**
 * Rules engine public API. All functions are deterministic given an Rng.
 * MUTATION: actions mutate `state` in place and return ActionResult
 * { ok, error?, events, citations }; events are also appended to state.log
 * and citations to state.citations. ok:false means nothing changed.
 *
 * Setup
 *   createCombat(heroes, monsters:{monster,pos}[], heroPositions, grid, {spells,conditions}, rng, progress?) → GameState
 *   heroToCombatant(hero, pos, progress?) → Combatant      syncHeroFromCombatant(c) → HeroProgress
 *   currentCombatant(state) → Combatant   getCombatant(state, id)   livingCombatants(state, side?)
 * Actions (only valid on the acting combatant's turn; one action per turn + movement)
 *   move(state, id, to)                         → ActionResult  (speed in tiles, diagonals cost 1)
 *   attack(state, attackerId, targetId, i=0)    → ActionResult
 *   castSpell(state, casterId, slug, idOrPos)   → ActionResult
 *   dodge(state, id) / usePotion(state, id)     → ActionResult
 *   endTurn(state)                              → ActionResult  (ticks conditions, save-ends, next turn, victory/defeat)
 * Queries
 *   movableTiles(state, id) → Pos[]   attackTargets(state, id, i=0) → string[]
 *   effectiveSpeed(c), effectiveAc(c), isIncapacitated(c), hasCondition(c, slug)
 * Monster AI
 *   planMonsterTurn(state, id) → PlannedAction[]   runMonsterTurn(state, id, rng?) → ActionResult[] (ends the turn)
 * Grid / dice
 *   createGrid(w, h, walls?), gridFromAscii(rows), distance, hasLineOfSight, findPath, reachableTiles, tilesInRadius
 *   roll(notation, rng, {crit?}) → DiceRoll   rollD20(mod, rng, 'adv'|'dis'?)   parseDice   mulberry32(seed) → Rng
 */
export * from './types';
export * from './dice';
export * from './grid';
export {
  hasCondition, isIncapacitated, incapacitatedBy, effectiveSpeed, effectiveAc, RULES,
  SRC_COMBAT, SRC_CONDITIONS, SRC_SPELLS,
} from './conditions';
export * from './state';
export {
  move, attack, castSpell, dodge, usePotion, endTurn, movableTiles, attackTargets, attackInRange,
} from './actions';
export * from './ai';
