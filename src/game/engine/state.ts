// Combat setup: building combatants, initiative, persistent hero resources.
import type { Condition, Hero, Monster, Spell } from '../content/types';
import { abilityMod, rollD20 } from './dice';
import { Ctx, RULES } from './conditions';
import type { Combatant, GameState, Grid, HeroProgress, Pos, Rng } from './types';

export interface CombatContent {
  spells?: Spell[];
  conditions?: Condition[];
}

/** Build a hero combatant. `progress` restores HP/slots/potions from a previous room. */
export function heroToCombatant(hero: Hero, pos: Pos, progress?: HeroProgress): Combatant {
  return {
    id: `hero:${hero.slug}`,
    side: 'hero',
    name: hero.name,
    refSlug: hero.slug,
    spriteKey: hero.spriteKey,
    pos: { ...pos },
    hp: progress ? Math.min(progress.hp, hero.hp) : hero.hp,
    maxHp: hero.hp,
    ac: hero.ac,
    speed: hero.speed,
    abilities: { ...hero.abilities },
    attacks: hero.attacks.map((a) => ({ ...a })),
    conditions: [],
    initiative: 0,
    dead: progress ? progress.hp <= 0 : false,
    slots: { ...(progress?.slots ?? hero.slots) },
    spells: [...hero.spells],
    spellAttack: hero.spellAttack,
    spellDc: hero.spellDc,
    proficiency: hero.proficiency,
    potions: progress?.potions ?? hero.potions,
    movedThisTurn: 0,
    actedThisTurn: false,
  };
}

/** Extract the resources that carry over to the next room. */
export function syncHeroFromCombatant(c: Combatant): HeroProgress {
  return { slug: c.refSlug, hp: c.dead ? 0 : c.hp, slots: { ...(c.slots ?? {}) }, potions: c.potions ?? 0 };
}

export function monsterToCombatant(monster: Monster, pos: Pos, index: number): Combatant {
  return {
    id: `${monster.slug}-${index}`,
    side: 'monster',
    name: index > 0 ? `${monster.name} ${index + 1}` : monster.name,
    refSlug: monster.slug,
    spriteKey: monster.spriteKey,
    pos: { ...pos },
    hp: monster.hp,
    maxHp: monster.hp,
    ac: monster.ac,
    speed: monster.speed,
    abilities: { ...monster.abilities },
    attacks: monster.attacks.map((a) => ({ ...a })),
    conditions: [],
    initiative: 0,
    dead: false,
    movedThisTurn: 0,
    actedThisTurn: false,
  };
}

/**
 * Create a combat: builds combatants, rolls initiative (d20 + DEX mod; ties by
 * DEX score, then heroes first) and starts the first turn. Initiative rolls and
 * the first 'turn' event are in `state.log`.
 */
export function createCombat(
  heroes: Hero[],
  monsters: { monster: Monster; pos: Pos }[],
  heroPositions: Pos[],
  grid: Grid,
  content: CombatContent,
  rng: Rng,
  progress?: Record<string, HeroProgress>,
): GameState {
  const counts = new Map<string, number>();
  const combatants: Combatant[] = [
    ...heroes.map((h, i) => heroToCombatant(h, heroPositions[i] ?? { x: i, y: 0 }, progress?.[h.slug])),
    ...monsters.map(({ monster, pos }) => {
      const n = counts.get(monster.slug) ?? 0;
      counts.set(monster.slug, n + 1);
      return monsterToCombatant(monster, pos, n);
    }),
  ];

  const state: GameState = {
    grid,
    combatants,
    order: [],
    turnIndex: 0,
    round: 1,
    log: [],
    status: 'active',
    spells: Object.fromEntries((content.spells ?? []).map((s) => [s.slug, s])),
    conditionNames: Object.fromEntries((content.conditions ?? []).map((c) => [c.slug, c.name])),
    rng,
    citations: [],
  };

  const ctx = new Ctx(state, rng);
  ctx.citeRule(RULES.initiative);
  for (const c of combatants) {
    const r = rollD20(abilityMod(c.abilities.dex), rng);
    c.initiative = r.total;
    ctx.emit({ type: 'roll', who: c.id, purpose: 'initiative', roll: r.roll });
  }
  state.order = [...combatants]
    .sort((a, b) =>
      b.initiative - a.initiative ||
      b.abilities.dex - a.abilities.dex ||
      (a.side === b.side ? 0 : a.side === 'hero' ? -1 : 1))
    .map((c) => c.id);

  // Start on the first living combatant.
  const first = state.order.findIndex((id) => !getCombatant(state, id)?.dead);
  state.turnIndex = Math.max(0, first);
  startTurn(ctx, currentCombatant(state));
  ctx.done();
  return state;
}

export function getCombatant(state: GameState, id: string): Combatant | undefined {
  return state.combatants.find((c) => c.id === id);
}

export function currentCombatant(state: GameState): Combatant {
  return getCombatant(state, state.order[state.turnIndex])!;
}

export function livingCombatants(state: GameState, side?: 'hero' | 'monster'): Combatant[] {
  return state.combatants.filter((c) => !c.dead && (!side || c.side === side));
}

/** Reset per-turn flags; dodge ends; prone creatures stand up for half their speed. */
export function startTurn(ctx: Ctx, c: Combatant): void {
  c.movedThisTurn = 0;
  c.actedThisTurn = false;
  c.dodging = false;
  ctx.emit({ type: 'turn', who: c.id, round: ctx.state.round });
  const prone = c.conditions.find((x) => x.slug === 'prone');
  if (prone && c.speed > 0) {
    c.conditions = c.conditions.filter((x) => x !== prone);
    c.movedThisTurn = Math.ceil(c.speed / 2);
    ctx.emit({ type: 'condition', target: c.id, slug: 'prone', applied: false });
    ctx.emit({ type: 'info', text: `${c.name} stands up (half movement).` });
    ctx.citeCondition('prone');
  }
}
