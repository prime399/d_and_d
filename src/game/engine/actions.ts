// Combat actions. MUTATION SEMANTICS: every action mutates `state` in place and
// returns an ActionResult describing what happened (events + citations). Events
// are also appended to `state.log`. A failed action (ok: false) changes nothing.
import type { AbilityKey, Attack, Spell } from '../content/types';
import { abilityMod, resolveAdvantage, roll, rollD20 } from './dice';
import {
  Ctx, RULES, addCondition, attackModifiers, autoCritSlug, effectiveAc, effectiveSpeed,
  hasCondition, incapacitatedBy, removeCondition, saveModifiers,
} from './conditions';
import { distance, findPath, hasLineOfSight, posKey, reachableTiles } from './grid';
import { currentCombatant, getCombatant, livingCombatants, startTurn } from './state';
import type { ActionResult, Combatant, GameState, Pos, Rng, SpellTarget } from './types';

/** Rounds a non-concentration buff lasts (1 minute). */
const BUFF_ROUNDS = 10;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function occupiedBy(state: GameState, exceptId?: string): Set<string> {
  return new Set(livingCombatants(state).filter((c) => c.id !== exceptId).map((c) => posKey(c.pos)));
}

/** Validate that `id` may take an action now. Returns an error string or the combatant. */
function actor(state: GameState, id: string, needsAction: boolean): Combatant | string {
  if (state.status !== 'active') return 'Combat is over';
  const c = getCombatant(state, id);
  if (!c) return `Unknown combatant ${id}`;
  if (c.dead) return `${c.name} is dead`;
  if (currentCombatant(state).id !== id) return `It is not ${c.name}'s turn`;
  if (needsAction) {
    const inc = incapacitatedBy(c);
    if (inc) return `${c.name} is ${inc} and cannot act`;
    if (c.actedThisTurn) return `${c.name} has already acted this turn`;
  }
  return c;
}

function checkEnd(ctx: Ctx): void {
  const s = ctx.state;
  if (s.status !== 'active') return;
  if (livingCombatants(s, 'monster').length === 0) { s.status = 'victory'; ctx.emit({ type: 'victory' }); }
  else if (livingCombatants(s, 'hero').length === 0) { s.status = 'defeat'; ctx.emit({ type: 'defeat' }); }
}

/** Bless: +1d4 to attack rolls and saving throws. */
function blessBonus(ctx: Ctx, c: Combatant, purpose: string): number {
  if (!hasCondition(c, 'blessed')) return 0;
  const r = roll('1d4', ctx.rng);
  ctx.emit({ type: 'roll', who: c.id, purpose: `${purpose} (bless)`, roll: r });
  ctx.citeCondition('blessed');
  return r.total;
}

/** End `c`'s concentration, removing every condition its spell created. */
export function endConcentration(ctx: Ctx, c: Combatant): void {
  const spell = c.concentratingOn;
  if (!spell) return;
  c.concentratingOn = undefined;
  for (const t of ctx.state.combatants) {
    for (const cond of [...t.conditions])
      if (cond.sourceId === c.id && cond.spell === spell) removeCondition(ctx, t, cond.slug);
  }
  ctx.emit({ type: 'info', text: `${c.name} loses concentration on ${ctx.state.spells[spell]?.name ?? spell}.` });
  ctx.citeRule(RULES.concentration);
}

/** Roll a saving throw with condition effects and Bless. */
export function savingThrow(ctx: Ctx, target: Combatant, ability: AbilityKey, dc: number): boolean {
  const mods = saveModifiers(ctx, target, ability);
  if (mods.autoFail) {
    ctx.emit({ type: 'save', target: target.id, ability, dc, total: 0, success: false });
    return false;
  }
  const adv = resolveAdvantage(mods.adv, mods.dis);
  const r = rollD20(abilityMod(target.abilities[ability]), ctx.rng, adv);
  ctx.emit({ type: 'roll', who: target.id, purpose: `${ability.toUpperCase()} save`, roll: r.roll, advantage: adv });
  const total = r.total + blessBonus(ctx, target, 'save');
  const success = total >= dc;
  ctx.emit({ type: 'save', target: target.id, ability, dc, total, success });
  return success;
}

/** Apply damage; handles death and concentration checks. */
export function applyDamage(ctx: Ctx, target: Combatant, amount: number, damageType: string): void {
  if (target.dead || amount <= 0) return;
  target.hp = Math.max(0, target.hp - amount);
  ctx.emit({ type: 'damage', target: target.id, amount, damageType, hpLeft: target.hp });
  if (target.hp === 0) {
    target.dead = true;
    target.conditions = [];
    target.dodging = false;
    ctx.emit({ type: 'death', target: target.id });
    ctx.citeRule(RULES.droppingTo0);
    endConcentration(ctx, target);
    checkEnd(ctx);
    return;
  }
  if (target.concentratingOn) {
    ctx.citeRule(RULES.concentration);
    const dc = Math.max(10, Math.floor(amount / 2));
    if (!savingThrow(ctx, target, 'con', dc)) endConcentration(ctx, target);
  }
}

export function applyHeal(ctx: Ctx, target: Combatant, amount: number): void {
  if (target.dead) return;
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  ctx.emit({ type: 'heal', target: target.id, amount: target.hp - before, hpLeft: target.hp });
}

function inRange(state: GameState, from: Pos, to: Pos, range: number): boolean {
  const d = distance(from, to);
  if (d > Math.max(1, range)) return false;
  return d <= 1 || hasLineOfSight(state.grid, from, to);
}

/** Inflict a condition with an optional save; save-based ones end on a later successful save. */
function inflict(
  ctx: Ctx, source: Combatant, target: Combatant, slug: string,
  save?: { ability: AbilityKey; dc: number }, spell?: string,
): void {
  if (target.dead) return;
  if (save && !spell && savingThrow(ctx, target, save.ability, save.dc)) return;
  const concentration = spell ? ctx.state.spells[spell]?.concentration : false;
  addCondition(ctx, target, {
    slug,
    sourceId: source.id,
    spell,
    saveEnds: save,
    // Prone ends by standing; save-ends and concentration last until removed; others: 1 round.
    rounds: slug === 'prone' || save || concentration ? undefined : spell ? BUFF_ROUNDS : 1,
  });
  ctx.citeCondition(slug);
}

// ---------------------------------------------------------------------------
// Queries (no mutation)
// ---------------------------------------------------------------------------

/** Tiles `id` can still move to this turn. */
export function movableTiles(state: GameState, id: string): Pos[] {
  const c = getCombatant(state, id);
  if (!c || c.dead) return [];
  const left = effectiveSpeed(c) - (c.movedThisTurn ?? 0);
  return reachableTiles(state.grid, c.pos, Math.max(0, left), occupiedBy(state, id)).map((t) => t.pos);
}

/** Whether `attack` can reach `target` from `from` (range + line of sight). */
export function attackInRange(state: GameState, from: Pos, target: Combatant, attack: Attack): boolean {
  return inRange(state, from, target.pos, attack.range);
}

/** Living enemies that attack `attackIndex` of `id` can hit right now. */
export function attackTargets(state: GameState, id: string, attackIndex = 0): string[] {
  const c = getCombatant(state, id);
  const a = c?.attacks[attackIndex];
  if (!c || !a) return [];
  return livingCombatants(state).filter((t) => t.side !== c.side && attackInRange(state, c.pos, t, a)).map((t) => t.id);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Move along the shortest path; costs 1 movement per tile (diagonals included). */
export function move(state: GameState, id: string, to: Pos, rng: Rng = state.rng): ActionResult {
  const c = actor(state, id, false);
  if (typeof c === 'string') return { ok: false, error: c, events: [], citations: [] };
  const ctx = new Ctx(state, rng);
  const speed = effectiveSpeed(c);
  if (speed === 0) {
    const slug = c.conditions.find((x) => ['grappled', 'restrained', 'paralyzed', 'stunned', 'unconscious'].includes(x.slug))?.slug;
    if (slug) ctx.citeCondition(slug);
    return { ok: false, error: `${c.name} cannot move${slug ? ` (${slug})` : ''}`, events: [], citations: ctx.citations };
  }
  const path = findPath(state.grid, c.pos, to, occupiedBy(state, id));
  if (!path) return ctx.fail('No path to that tile');
  const left = speed - (c.movedThisTurn ?? 0);
  if (path.length > left) return ctx.fail(`Too far: needs ${path.length}, ${left} movement left`);
  for (const step of path) {
    c.pos = { ...step };
    ctx.emit({ type: 'move', who: c.id, to: { ...step } });
  }
  c.movedThisTurn = (c.movedThisTurn ?? 0) + path.length;
  return ctx.done();
}

/** Weapon attack with attack `attackIndex`. Uses the combatant's action. */
export function attack(
  state: GameState, attackerId: string, targetId: string, attackIndex = 0, rng: Rng = state.rng,
): ActionResult {
  const a = actor(state, attackerId, true);
  if (typeof a === 'string') return { ok: false, error: a, events: [], citations: [] };
  const ctx = new Ctx(state, rng);
  const t = getCombatant(state, targetId);
  if (!t || t.dead) return ctx.fail('Invalid target');
  const atk = a.attacks[attackIndex];
  if (!atk) return ctx.fail('Unknown attack');
  if (!attackInRange(state, a.pos, t, atk)) return ctx.fail(`${t.name} is out of range or not visible`);

  a.actedThisTurn = true;
  const melee = atk.range <= 1;
  const dist = distance(a.pos, t.pos);
  const crit = resolveAttack(ctx, a, t, atk.name, atk.toHit, melee, dist);
  if (crit !== null) {
    const dmg = roll(atk.damage, rng, { crit });
    ctx.emit({ type: 'roll', who: a.id, purpose: `${atk.name} damage`, roll: dmg });
    applyDamage(ctx, t, dmg.total, atk.damageType);
    if (atk.inflicts && !t.dead) inflict(ctx, a, t, atk.inflicts, atk.inflictsSave);
  }
  return ctx.done();
}

/**
 * Roll to hit. Returns null on miss, otherwise whether it is a critical hit.
 * Nat 1 always misses, nat 20 always hits and crits.
 */
function resolveAttack(
  ctx: Ctx, a: Combatant, t: Combatant, name: string, toHit: number, melee: boolean, dist: number,
): boolean | null {
  ctx.citeRule(RULES.attackRolls);
  const m = attackModifiers(ctx, a, t, melee, dist);
  const adv = resolveAdvantage(m.adv, m.dis);
  const r = rollD20(toHit, ctx.rng, adv);
  ctx.emit({ type: 'roll', who: a.id, purpose: `${name} attack`, roll: r.roll, advantage: adv });
  const total = r.total + blessBonus(ctx, a, 'attack');
  const ac = effectiveAc(t);
  if (ac !== t.ac) ctx.citeSpell('shield-of-faith');
  let hit = r.natural === 20 || (r.natural !== 1 && total >= ac);
  let crit = r.natural === 20;
  if (hit && !crit) {
    const slug = autoCritSlug(t, melee, dist);
    if (slug) { crit = true; ctx.citeCondition(slug); }
  }
  if (crit) ctx.citeRule(RULES.criticalHits);
  if (r.natural === 1) hit = false;
  ctx.emit({ type: 'attack', attacker: a.id, target: t.id, attackName: name, hit, crit, toHit: total, ac });
  return hit ? crit : null;
}

/**
 * Cast a spell. `target` is a combatant id, or a tile for area spells.
 * Range 0 spells target the caster. Leveled spells consume a slot of exactly
 * `spell.level`. Save spells with radius > 0 hit every living creature in the
 * area except the caster (friendly fire, per 5e); success halves damage for
 * area spells and negates it for single-target spells. Buffs with a radius
 * apply to the caster's allies in the area.
 */
export function castSpell(
  state: GameState, casterId: string, spellSlug: string, target: SpellTarget, rng: Rng = state.rng,
): ActionResult {
  const c = actor(state, casterId, true);
  if (typeof c === 'string') return { ok: false, error: c, events: [], citations: [] };
  const ctx = new Ctx(state, rng);
  const spell: Spell | undefined = state.spells[spellSlug];
  if (!spell) return ctx.fail(`Unknown spell ${spellSlug}`);
  if (c.spells && !c.spells.includes(spellSlug)) return ctx.fail(`${c.name} does not know ${spell.name}`);
  if (spell.level > 0 && (c.slots?.[spell.level] ?? 0) <= 0)
    return ctx.fail(`No level ${spell.level} spell slots left`);

  // Resolve the target point / creature.
  const targetC = typeof target === 'string' ? getCombatant(state, target) : undefined;
  if (typeof target === 'string' && (!targetC || targetC.dead)) return ctx.fail('Invalid target');
  const point: Pos = spell.range === 0 ? c.pos : targetC ? targetC.pos : (target as Pos);
  if (spell.range > 0 && !inRange(state, c.pos, point, spell.range))
    return ctx.fail('Target is out of range or not visible');
  const radius = spell.radius ?? 0;
  if (radius === 0 && !targetC && spell.range > 0) return ctx.fail('This spell needs a creature target');

  // Commit: spend action and slot, handle concentration.
  c.actedThisTurn = true;
  if (spell.level > 0) c.slots![spell.level] -= 1;
  ctx.emit({ type: 'spell', caster: c.id, spell: spell.slug, slotLevel: spell.level });
  ctx.citeSpell(spell.slug);
  if (spell.concentration) {
    if (c.concentratingOn) endConcentration(ctx, c);
    c.concentratingOn = spell.slug;
    ctx.citeRule(RULES.concentration);
  }

  const inArea = (t: Combatant) => !t.dead && distance(t.pos, point) <= radius;
  const single = spell.range === 0 && radius === 0 ? c : targetC;

  switch (spell.kind) {
    case 'attack': {
      if (!targetC) return ctx.done();
      const crit = resolveAttack(ctx, c, targetC, spell.name, c.spellAttack ?? 0, spell.range <= 1, distance(c.pos, targetC.pos));
      if (crit !== null) {
        if (spell.dice) {
          const dmg = roll(spell.dice, rng, { crit });
          ctx.emit({ type: 'roll', who: c.id, purpose: `${spell.name} damage`, roll: dmg });
          applyDamage(ctx, targetC, dmg.total, spell.damageType ?? 'force');
        }
        if (spell.inflicts && !targetC.dead) inflict(ctx, c, targetC, spell.inflicts, undefined, spell.slug);
      }
      break;
    }
    case 'save': {
      const targets = radius > 0 ? state.combatants.filter((t) => t.id !== c.id && inArea(t)) : single ? [single] : [];
      const ability = spell.save ?? 'dex';
      const dc = c.spellDc ?? 10;
      // Roll damage once for the whole area, as in 5e.
      const dmg = spell.dice ? roll(spell.dice, rng) : undefined;
      if (dmg) ctx.emit({ type: 'roll', who: c.id, purpose: `${spell.name} damage`, roll: dmg });
      for (const t of targets) {
        const success = savingThrow(ctx, t, ability, dc);
        if (dmg) {
          const amount = success ? (radius > 0 ? Math.floor(dmg.total / 2) : 0) : dmg.total;
          applyDamage(ctx, t, amount, spell.damageType ?? 'force');
        }
        if (!success && spell.inflicts && !t.dead) {
          inflict(ctx, c, t, spell.inflicts, spell.concentration ? { ability, dc } : undefined, spell.slug);
        }
      }
      break;
    }
    case 'heal': {
      const targets = radius > 0 ? state.combatants.filter((t) => t.side === c.side && inArea(t)) : single ? [single] : [];
      for (const t of targets) {
        if (!spell.dice) break;
        const h = roll(spell.dice, rng);
        ctx.emit({ type: 'roll', who: c.id, purpose: `${spell.name} healing`, roll: h });
        applyHeal(ctx, t, h.total);
      }
      break;
    }
    case 'buff': {
      const targets = radius > 0 ? state.combatants.filter((t) => t.side === c.side && inArea(t)) : single ? [single] : [];
      const slug = spell.inflicts ?? spell.slug;
      for (const t of targets) inflict(ctx, c, t, slug, undefined, spell.slug);
      break;
    }
  }
  checkEnd(ctx);
  return ctx.done();
}

/** Dodge: attacks against `id` have disadvantage until the start of its next turn. */
export function dodge(state: GameState, id: string, rng: Rng = state.rng): ActionResult {
  const c = actor(state, id, true);
  if (typeof c === 'string') return { ok: false, error: c, events: [], citations: [] };
  const ctx = new Ctx(state, rng);
  c.actedThisTurn = true;
  c.dodging = true;
  ctx.emit({ type: 'info', text: `${c.name} takes the Dodge action.` });
  ctx.citeCondition('dodging');
  return ctx.done();
}

/** Drink a Potion of Healing (2d4+2). Uses the action and one potion. */
export function usePotion(state: GameState, id: string, rng: Rng = state.rng): ActionResult {
  const c = actor(state, id, true);
  if (typeof c === 'string') return { ok: false, error: c, events: [], citations: [] };
  const ctx = new Ctx(state, rng);
  if ((c.potions ?? 0) <= 0) return ctx.fail('No potions left');
  c.potions! -= 1;
  c.actedThisTurn = true;
  const h = roll('2d4+2', rng);
  ctx.emit({ type: 'roll', who: c.id, purpose: 'Potion of Healing', roll: h });
  applyHeal(ctx, c, h.total);
  return ctx.done();
}

/**
 * End the current turn: save-ends rolls and duration ticks for the creature
 * whose turn ends, then advance to the next living combatant (new round when
 * the order wraps) and start its turn.
 */
export function endTurn(state: GameState, rng: Rng = state.rng): ActionResult {
  if (state.status !== 'active') return { ok: false, error: 'Combat is over', events: [], citations: [] };
  const ctx = new Ctx(state, rng);
  const cur = currentCombatant(state);
  if (!cur.dead) {
    for (const cond of [...cur.conditions]) {
      if (cond.saveEnds) {
        ctx.citeCondition(cond.slug);
        if (savingThrow(ctx, cur, cond.saveEnds.ability, cond.saveEnds.dc)) removeCondition(ctx, cur, cond.slug);
      } else if (cond.rounds !== undefined) {
        cond.rounds -= 1;
        if (cond.rounds <= 0) removeCondition(ctx, cur, cond.slug);
      }
    }
  }
  checkEnd(ctx);
  if (state.status === 'active') {
    const n = state.order.length;
    for (let i = 1; i <= n; i++) {
      const next = getCombatant(state, state.order[(state.turnIndex + i) % n])!;
      if (next.dead) continue;
      // Crossing the end of the order starts a new round.
      if (state.turnIndex + i >= n) state.round += 1;
      state.turnIndex = (state.turnIndex + i) % n;
      startTurn(ctx, next);
      break;
    }
  }
  return ctx.done();
}
