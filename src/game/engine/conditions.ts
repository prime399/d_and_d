// 5e condition effects and the shared action context (events + citations).
import type { Citation } from '../content/types';
import type { ActionResult, ActiveCondition, Combatant, GameEvent, GameState, Rng } from './types';

// ---------------------------------------------------------------------------
// Action context: collects events and de-duplicated citations for one action.
// ---------------------------------------------------------------------------

export const SRC_CONDITIONS = 'SRD 5.2.1 · Conditions';
export const SRC_COMBAT = 'SRD 5.2.1 · Combat';
export const SRC_SPELLS = 'SRD 5.2.1 · Spells';

export const RULES = {
  attackRolls: { id: 'rule.attack-rolls', title: 'Attack Rolls' },
  criticalHits: { id: 'rule.critical-hits', title: 'Critical Hits' },
  advantage: { id: 'rule.advantage', title: 'Advantage and Disadvantage' },
  concentration: { id: 'rule.concentration', title: 'Concentration' },
  droppingTo0: { id: 'rule.dropping-to-0', title: 'Dropping to 0 Hit Points' },
  initiative: { id: 'rule.initiative', title: 'Initiative' },
} as const;

export class Ctx {
  events: GameEvent[] = [];
  citations: Citation[] = [];
  constructor(public state: GameState, public rng: Rng) {}

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  cite(id: string, title: string, source: string): void {
    if (!this.citations.some((c) => c.id === id)) this.citations.push({ id, title, source });
  }

  citeRule(r: { id: string; title: string }): void {
    this.cite(r.id, r.title, SRC_COMBAT);
  }

  citeCondition(slug: string): void {
    this.cite(`condition.${slug}`, conditionName(this.state, slug), SRC_CONDITIONS);
  }

  citeSpell(slug: string): void {
    this.cite(`spell.${slug}`, this.state.spells[slug]?.name ?? titleCase(slug), SRC_SPELLS);
  }

  /** Finish the action: append to the state log and return the result. */
  done(ok = true, error?: string): ActionResult {
    this.state.log.push(...this.events);
    for (const c of this.citations)
      if (!this.state.citations.some((x) => x.id === c.id)) this.state.citations.push(c);
    return { ok, ...(error ? { error } : {}), events: this.events, citations: this.citations };
  }

  fail(error: string): ActionResult {
    return { ok: false, error, events: [], citations: [] };
  }
}

export function titleCase(slug: string): string {
  return slug.split('-').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' ');
}

export function conditionName(state: GameState, slug: string): string {
  return state.conditionNames[slug] ?? titleCase(slug);
}

// ---------------------------------------------------------------------------
// Condition queries
// ---------------------------------------------------------------------------

export function hasCondition(c: Combatant, slug: string): boolean {
  return c.conditions.some((x) => x.slug === slug);
}

const INCAPACITATING = ['incapacitated', 'paralyzed', 'stunned', 'unconscious'];
const SPEED_ZERO = ['grappled', 'restrained', 'paralyzed', 'stunned', 'unconscious'];
const FAIL_STR_DEX = ['paralyzed', 'stunned', 'unconscious'];

/** Slug of the first incapacitating condition, if any. */
export function incapacitatedBy(c: Combatant): string | undefined {
  return c.conditions.find((x) => INCAPACITATING.includes(x.slug))?.slug;
}

export function isIncapacitated(c: Combatant): boolean {
  return incapacitatedBy(c) !== undefined;
}

/** Speed in tiles after conditions. */
export function effectiveSpeed(c: Combatant): number {
  return c.conditions.some((x) => SPEED_ZERO.includes(x.slug)) ? 0 : c.speed;
}

/** AC after buffs (Shield of Faith: +2). */
export function effectiveAc(c: Combatant): number {
  return c.ac + (hasCondition(c, 'shield-of-faith') ? 2 : 0);
}

/** Apply a condition (replaces an existing one with the same slug). */
export function addCondition(ctx: Ctx, target: Combatant, cond: ActiveCondition): void {
  target.conditions = target.conditions.filter((x) => x.slug !== cond.slug);
  target.conditions.push(cond);
  ctx.emit({ type: 'condition', target: target.id, slug: cond.slug, applied: true });
}

export function removeCondition(ctx: Ctx, target: Combatant, slug: string): void {
  if (!hasCondition(target, slug)) return;
  target.conditions = target.conditions.filter((x) => x.slug !== slug);
  ctx.emit({ type: 'condition', target: target.id, slug, applied: false });
}

/**
 * Advantage/disadvantage sources for an attack roll. Cites every condition
 * that contributes.
 */
export function attackModifiers(
  ctx: Ctx, attacker: Combatant, target: Combatant, melee: boolean, dist: number,
): { adv: boolean; dis: boolean } {
  let adv = false;
  let dis = false;
  const use = (slug: string, kind: 'adv' | 'dis') => {
    if (kind === 'adv') adv = true; else dis = true;
    ctx.citeCondition(slug);
  };
  // Attacker's own conditions
  for (const slug of ['blinded', 'frightened', 'poisoned', 'prone', 'restrained'])
    if (hasCondition(attacker, slug)) use(slug, 'dis');
  if (hasCondition(attacker, 'invisible')) use('invisible', 'adv');
  // Target's conditions
  for (const slug of ['blinded', 'paralyzed', 'restrained', 'stunned', 'unconscious'])
    if (hasCondition(target, slug)) use(slug, 'adv');
  if (hasCondition(target, 'prone')) use('prone', melee && dist <= 1 ? 'adv' : 'dis');
  if (hasCondition(target, 'invisible')) use('invisible', 'dis');
  if (target.dodging && !isIncapacitated(target)) use('dodging', 'dis');
  if (adv || dis) ctx.citeRule(RULES.advantage);
  return { adv, dis };
}

/** Melee hits within 1 tile against paralyzed/unconscious targets are crits. */
export function autoCritSlug(target: Combatant, melee: boolean, dist: number): string | undefined {
  if (!melee || dist > 1) return undefined;
  return target.conditions.find((x) => x.slug === 'paralyzed' || x.slug === 'unconscious')?.slug;
}

/** Saving throw modifiers from conditions. */
export function saveModifiers(
  ctx: Ctx, target: Combatant, ability: string,
): { autoFail: boolean; adv: boolean; dis: boolean } {
  let autoFail = false;
  let dis = false;
  if (ability === 'str' || ability === 'dex') {
    const slug = target.conditions.find((x) => FAIL_STR_DEX.includes(x.slug))?.slug;
    if (slug) { autoFail = true; ctx.citeCondition(slug); }
  }
  if (ability === 'dex' && hasCondition(target, 'restrained')) {
    dis = true;
    ctx.citeCondition('restrained');
    ctx.citeRule(RULES.advantage);
  }
  return { autoFail, adv: false, dis };
}
