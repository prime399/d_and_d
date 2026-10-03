import { describe, expect, it } from 'vitest';
import {
  attack, castSpell, createCombat, createGrid, currentCombatant, dodge, endTurn, getCombatant,
  heroToCombatant, move, mulberry32, runMonsterTurn, syncHeroFromCombatant, usePotion,
} from '../index';
import type { GameState, Pos, Rng } from '../types';
import type { Hero, Monster } from '../../content/types';
import { f, fighter, ghoul, goblin, seq, spells, wizard, wolf } from './fixtures';

/** Build a combat and force a specific turn order (initiative is tested separately). */
function setup(heroes: [Hero, Pos][], monsters: [Monster, Pos][], order?: string[], size = 10): GameState {
  const s = createCombat(
    heroes.map((h) => h[0]), monsters.map(([monster, pos]) => ({ monster, pos })), heroes.map((h) => h[1]),
    createGrid(size, size), { spells }, mulberry32(1),
  );
  if (order) s.order = order;
  s.turnIndex = 0;
  s.round = 1;
  for (const c of s.combatants) { c.movedThisTurn = 0; c.actedThisTurn = false; }
  return s;
}
const ids = (r: { citations: { id: string }[] }) => r.citations.map((c) => c.id);
const attackEvent = (r: { events: { type: string }[] }) => r.events.find((e) => e.type === 'attack') as
  { hit: boolean; crit: boolean; toHit: number } | undefined;

describe('initiative', () => {
  it('orders by d20 + DEX mod', () => {
    // fighter dex 12 (+1), goblin dex 14 (+2)
    const s = createCombat([fighter], [{ monster: goblin, pos: { x: 5, y: 5 } }], [{ x: 0, y: 0 }],
      createGrid(8, 8), { spells }, seq(f(3), f(15)));
    expect(getCombatant(s, 'hero:fighter')!.initiative).toBe(4);
    expect(getCombatant(s, 'goblin-0')!.initiative).toBe(17);
    expect(s.order).toEqual(['goblin-0', 'hero:fighter']);
    expect(s.citations.map((c) => c.id)).toContain('rule.initiative');
    expect(s.log.filter((e) => e.type === 'roll')).toHaveLength(2);
  });
});

describe('attacks', () => {
  const base = () => setup([[fighter, { x: 0, y: 0 }]], [[goblin, { x: 1, y: 1 }]], ['hero:fighter', 'goblin-0']);

  it('hits vs AC and deals damage', () => {
    const s = base();
    const r = attack(s, 'hero:fighter', 'goblin-0', 0, seq(f(10), f(4, 8)));
    expect(r.ok).toBe(true);
    expect(attackEvent(r)).toMatchObject({ hit: true, crit: false, toHit: 15 });
    expect(getCombatant(s, 'goblin-0')!.hp).toBe(0); // 4+3 = 7
    expect(ids(r)).toEqual(expect.arrayContaining(['rule.attack-rolls', 'rule.dropping-to-0']));
  });

  it('misses below AC and on natural 1', () => {
    const s = base();
    expect(attackEvent(attack(s, 'hero:fighter', 'goblin-0', 0, seq(f(7))))!.hit).toBe(false);
    const s2 = base();
    getCombatant(s2, 'goblin-0')!.ac = 1;
    expect(attackEvent(attack(s2, 'hero:fighter', 'goblin-0', 0, seq(f(1))))!.hit).toBe(false);
  });

  it('natural 20 crits and doubles dice', () => {
    const s = base();
    getCombatant(s, 'goblin-0')!.hp = 50;
    const r = attack(s, 'hero:fighter', 'goblin-0', 0, seq(f(20), f(2, 8), f(3, 8)));
    expect(attackEvent(r)).toMatchObject({ hit: true, crit: true });
    expect(getCombatant(s, 'goblin-0')!.hp).toBe(50 - 8);
    expect(ids(r)).toContain('rule.critical-hits');
  });

  it('only one action per turn, only on own turn', () => {
    const s = base();
    expect(attack(s, 'hero:fighter', 'goblin-0', 0, seq(f(2))).ok).toBe(true);
    expect(attack(s, 'hero:fighter', 'goblin-0', 0).ok).toBe(false);
    expect(attack(s, 'goblin-0', 'hero:fighter', 0).ok).toBe(false);
  });

  it('melee needs adjacency; ranged needs line of sight', () => {
    const s = setup([[fighter, { x: 0, y: 0 }]], [[goblin, { x: 4, y: 0 }]], ['hero:fighter', 'goblin-0']);
    expect(attack(s, 'hero:fighter', 'goblin-0', 0).ok).toBe(false);
    s.grid.walls[2] = true; // wall at (2,0)
    expect(attack(s, 'hero:fighter', 'goblin-0', 1).ok).toBe(false);
    s.grid.walls[2] = false;
    expect(attack(s, 'hero:fighter', 'goblin-0', 1, seq(f(15), f(1, 8))).ok).toBe(true);
  });
});

describe('conditions', () => {
  const base = () => setup([[fighter, { x: 0, y: 0 }]], [[goblin, { x: 1, y: 0 }]], ['hero:fighter', 'goblin-0']);

  it('prone target: melee advantage, ranged disadvantage', () => {
    const s = base();
    getCombatant(s, 'goblin-0')!.conditions.push({ slug: 'prone' });
    const r = attack(s, 'hero:fighter', 'goblin-0', 0, seq(f(2), f(18), f(1, 8)));
    expect(r.events.find((e) => e.type === 'roll')).toMatchObject({ advantage: 'adv' });
    expect(ids(r)).toEqual(expect.arrayContaining(['condition.prone', 'rule.advantage']));

    const s2 = setup([[fighter, { x: 0, y: 0 }]], [[goblin, { x: 5, y: 0 }]], ['hero:fighter', 'goblin-0']);
    getCombatant(s2, 'goblin-0')!.conditions.push({ slug: 'prone' });
    const r2 = attack(s2, 'hero:fighter', 'goblin-0', 1, seq(f(18), f(2)));
    expect(r2.events.find((e) => e.type === 'roll')).toMatchObject({ advantage: 'dis' });
    expect(attackEvent(r2)!.hit).toBe(false);
  });

  it('paralyzed: advantage and melee auto-crit', () => {
    const s = base();
    const g = getCombatant(s, 'goblin-0')!;
    g.hp = 50;
    g.conditions.push({ slug: 'paralyzed' });
    const r = attack(s, 'hero:fighter', 'goblin-0', 0, seq(f(3), f(10), f(1, 8), f(1, 8)));
    expect(attackEvent(r)).toMatchObject({ hit: true, crit: true });
    expect(g.hp).toBe(50 - 5);
    expect(ids(r)).toEqual(expect.arrayContaining(['condition.paralyzed', 'rule.critical-hits', 'rule.advantage']));
  });

  it('poisoned attacker has disadvantage; adv + dis cancel', () => {
    const s = base();
    getCombatant(s, 'hero:fighter')!.conditions.push({ slug: 'poisoned' });
    const r = attack(s, 'hero:fighter', 'goblin-0', 0, seq(f(18), f(3)));
    expect(r.events.find((e) => e.type === 'roll')).toMatchObject({ advantage: 'dis' });
    expect(attackEvent(r)!.hit).toBe(false);
    expect(ids(r)).toContain('condition.poisoned');

    const s2 = base();
    getCombatant(s2, 'hero:fighter')!.conditions.push({ slug: 'poisoned' });
    getCombatant(s2, 'goblin-0')!.conditions.push({ slug: 'prone' });
    const r2 = attack(s2, 'hero:fighter', 'goblin-0', 0, seq(f(18), f(1, 8)));
    const roll = r2.events.find((e) => e.type === 'roll') as { advantage?: string; roll: { rolls: number[] } };
    expect(roll.advantage).toBeUndefined();
    expect(roll.roll.rolls).toHaveLength(1);
  });

  it('dodge gives disadvantage to attackers until its next turn', () => {
    const s = setup([[fighter, { x: 0, y: 0 }]], [[goblin, { x: 1, y: 0 }]], ['goblin-0', 'hero:fighter']);
    expect(dodge(s, 'goblin-0').ok).toBe(true);
    endTurn(s);
    const r = attack(s, 'hero:fighter', 'goblin-0', 0, seq(f(19), f(2)));
    expect(r.events.find((e) => e.type === 'roll')).toMatchObject({ advantage: 'dis' });
    endTurn(s);
    expect(getCombatant(s, 'goblin-0')!.dodging).toBe(false);
  });

  it('grappled/restrained cannot move', () => {
    const s = base();
    getCombatant(s, 'hero:fighter')!.conditions.push({ slug: 'grappled' });
    const r = move(s, 'hero:fighter', { x: 0, y: 3 });
    expect(r.ok).toBe(false);
    expect(ids(r)).toContain('condition.grappled');
  });

  it('inflicted condition with save; save ends at end of affected turn', () => {
    const s = setup([[fighter, { x: 0, y: 0 }]], [[ghoul, { x: 1, y: 0 }]], ['ghoul-0', 'hero:fighter']);
    // hit (15), damage 2d4 (1,1), CON save fails (2) → paralyzed
    const r = attack(s, 'ghoul-0', 'hero:fighter', 0, seq(f(15), f(1, 4), f(1, 4), f(2)));
    const hero = getCombatant(s, 'hero:fighter')!;
    expect(hero.conditions.map((c) => c.slug)).toEqual(['paralyzed']);
    expect(ids(r)).toContain('condition.paralyzed');
    endTurn(s);
    expect(attack(s, 'hero:fighter', 'ghoul-0', 0).ok).toBe(false); // incapacitated
    endTurn(s, seq(f(5))); // CON save 5 < 10 → stays
    expect(hero.conditions).toHaveLength(1);
    endTurn(s); // ghoul's turn
    endTurn(s, seq(f(15))); // save succeeds
    expect(hero.conditions).toHaveLength(0);
  });

  it('prone creature stands up at turn start for half speed', () => {
    const s = setup([[fighter, { x: 0, y: 0 }]], [[wolf, { x: 1, y: 0 }]], ['wolf-0', 'hero:fighter']);
    attack(s, 'wolf-0', 'hero:fighter', 0, seq(f(15), f(1, 4), f(1, 4), f(2)));
    expect(getCombatant(s, 'hero:fighter')!.conditions[0].slug).toBe('prone');
    endTurn(s);
    const h = getCombatant(s, 'hero:fighter')!;
    expect(h.conditions).toHaveLength(0);
    expect(h.movedThisTurn).toBe(3);
    expect(move(s, h.id, { x: 0, y: 4 }).ok).toBe(false);
    expect(move(s, h.id, { x: 0, y: 3 }).ok).toBe(true);
  });
});

describe('spells', () => {
  const base = (monsters: [Monster, Pos][] = [[goblin, { x: 3, y: 0 }]]) =>
    setup([[wizard, { x: 0, y: 0 }], [fighter, { x: 0, y: 1 }]], monsters,
      ['hero:wizard', ...monsters.map((_, i) => `goblin-${i}`), 'hero:fighter']);

  it('cantrip spell attack is free', () => {
    const s = base();
    const r = castSpell(s, 'hero:wizard', 'fire-bolt', 'goblin-0', seq(f(15), f(7, 10)));
    expect(r.ok).toBe(true);
    expect(getCombatant(s, 'goblin-0')!.hp).toBe(0);
    expect(getCombatant(s, 'hero:wizard')!.slots).toEqual({ 1: 1, 2: 2 });
    expect(ids(r)).toContain('spell.fire-bolt');
  });

  it('consumes slots and refuses when empty', () => {
    const s = base();
    expect(castSpell(s, 'hero:wizard', 'cure-wounds', 'hero:fighter').ok).toBe(true);
    expect(getCombatant(s, 'hero:wizard')!.slots![1]).toBe(0);
    s.combatants.find((c) => c.id === 'hero:wizard')!.actedThisTurn = false;
    const r = castSpell(s, 'hero:wizard', 'cure-wounds', 'hero:fighter');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/slot/);
  });

  it('AoE hits multiple, half damage on success', () => {
    const s = base([[goblin, { x: 3, y: 0 }], [goblin, { x: 3, y: 1 }]]);
    s.combatants.forEach((c) => (c.hp = 30));
    // damage 3d6 = 4+4+4 = 12; goblin-0 fails (2), goblin-1 succeeds (19)
    const r = castSpell(s, 'hero:wizard', 'burning-hands', { x: 3, y: 0 },
      seq(f(4, 6), f(4, 6), f(4, 6), f(2), f(19)));
    expect(r.ok).toBe(true);
    expect(getCombatant(s, 'goblin-0')!.hp).toBe(18);
    expect(getCombatant(s, 'goblin-1')!.hp).toBe(24);
    expect(getCombatant(s, 'hero:fighter')!.hp).toBe(30); // out of radius
  });

  it('concentration: new spell replaces old; damage can break it', () => {
    const s = base();
    const wiz = getCombatant(s, 'hero:wizard')!;
    const gob = getCombatant(s, 'goblin-0')!;
    castSpell(s, 'hero:wizard', 'hold-person', 'goblin-0', seq(f(2)));
    expect(gob.conditions.map((c) => c.slug)).toEqual(['paralyzed']);
    expect(wiz.concentratingOn).toBe('hold-person');

    wiz.actedThisTurn = false;
    const r = castSpell(s, 'hero:wizard', 'bless', 'hero:wizard');
    expect(r.ok).toBe(true);
    expect(gob.conditions).toHaveLength(0);
    expect(getCombatant(s, 'hero:fighter')!.conditions.map((c) => c.slug)).toEqual(['blessed']);
    expect(wiz.concentratingOn).toBe('bless');

    // Goblin hits the wizard for damage; CON save fails → bless ends.
    s.turnIndex = 1;
    gob.pos = { x: 1, y: 0 };
    wiz.hp = 16;
    const hit = attack(s, 'goblin-0', 'hero:wizard', 0, seq(f(15), f(3, 6), f(2)));
    expect(ids(hit)).toContain('rule.concentration');
    expect(wiz.concentratingOn).toBeUndefined();
    expect(getCombatant(s, 'hero:fighter')!.conditions).toHaveLength(0);
  });

  it('bless adds 1d4 to attack rolls', () => {
    const s = base();
    getCombatant(s, 'hero:wizard')!.conditions.push({ slug: 'blessed' });
    // natural 7 + 5 = 12 < 13, +1d4 (2) = 14 hits
    const r = castSpell(s, 'hero:wizard', 'fire-bolt', 'goblin-0', seq(f(7), f(2, 4), f(1, 10)));
    expect(attackEvent(r)).toMatchObject({ hit: true, toHit: 14 });
    expect(ids(r)).toContain('condition.blessed');
  });

  it('shield of faith adds +2 AC', () => {
    const s = base();
    castSpell(s, 'hero:wizard', 'shield-of-faith', 'hero:fighter');
    const fig = getCombatant(s, 'hero:fighter')!;
    expect(fig.conditions[0].slug).toBe('shield-of-faith');
    s.turnIndex = 1;
    getCombatant(s, 'goblin-0')!.pos = { x: 1, y: 1 };
    const r = attack(s, 'goblin-0', 'hero:fighter', 0, seq(f(13)));
    expect(attackEvent(r)).toMatchObject({ hit: false });
    expect((r.events.find((e) => e.type === 'attack') as { ac: number }).ac).toBe(18);
  });
});

describe('potions and persistence', () => {
  it('potion heals 2d4+2 and is consumed', () => {
    const s = setup([[fighter, { x: 0, y: 0 }]], [[goblin, { x: 5, y: 5 }]], ['hero:fighter', 'goblin-0']);
    const h = getCombatant(s, 'hero:fighter')!;
    h.hp = 10;
    const r = usePotion(s, h.id, seq(f(3, 4), f(4, 4)));
    expect(r.ok).toBe(true);
    expect(h.hp).toBe(19);
    expect(h.potions).toBe(1);
  });

  it('hero resources carry over', () => {
    const c = heroToCombatant(wizard, { x: 0, y: 0 });
    c.hp = 5; c.slots![1] = 0; c.potions = 0;
    const p = syncHeroFromCombatant(c);
    const next = heroToCombatant(wizard, { x: 1, y: 1 }, p);
    expect(next).toMatchObject({ hp: 5, slots: { 1: 0, 2: 2 }, potions: 0, maxHp: 16 });
  });
});

describe('turns', () => {
  it('advances, skips dead, increments round', () => {
    const s = setup([[fighter, { x: 0, y: 0 }]], [[goblin, { x: 5, y: 5 }], [goblin, { x: 6, y: 6 }]],
      ['hero:fighter', 'goblin-0', 'goblin-1']);
    getCombatant(s, 'goblin-0')!.dead = true;
    endTurn(s);
    expect(currentCombatant(s).id).toBe('goblin-1');
    expect(s.round).toBe(1);
    const r = endTurn(s);
    expect(currentCombatant(s).id).toBe('hero:fighter');
    expect(s.round).toBe(2);
    expect(r.events).toContainEqual({ type: 'turn', who: 'hero:fighter', round: 2 });
  });

  it('victory when all monsters die', () => {
    const s = setup([[fighter, { x: 0, y: 0 }]], [[goblin, { x: 1, y: 0 }]], ['hero:fighter', 'goblin-0']);
    const r = attack(s, 'hero:fighter', 'goblin-0', 0, seq(f(20), f(8, 8), f(8, 8)));
    expect(s.status).toBe('victory');
    expect(r.events).toContainEqual({ type: 'victory' });
    expect(endTurn(s).ok).toBe(false);
  });

  it('defeat when all heroes die', () => {
    const s = setup([[fighter, { x: 0, y: 0 }]], [[goblin, { x: 1, y: 0 }]], ['goblin-0', 'hero:fighter']);
    getCombatant(s, 'hero:fighter')!.hp = 1;
    attack(s, 'goblin-0', 'hero:fighter', 0, seq(f(15)));
    expect(s.status).toBe('defeat');
  });
});

describe('monster AI', () => {
  it('approaches and attacks the nearest hero, then ends turn', () => {
    const s = setup([[fighter, { x: 0, y: 0 }], [wizard, { x: 9, y: 9 }]], [[goblin, { x: 4, y: 0 }]],
      ['goblin-0', 'hero:fighter', 'hero:wizard']);
    const rng: Rng = seq(f(15), f(3, 6));
    const results = runMonsterTurn(s, 'goblin-0', rng);
    expect(results.every((r) => r.ok)).toBe(true);
    const gob = getCombatant(s, 'goblin-0')!;
    expect(Math.max(Math.abs(gob.pos.x), Math.abs(gob.pos.y))).toBe(1);
    expect(getCombatant(s, 'hero:fighter')!.hp).toBe(28 - 5);
    expect(currentCombatant(s).id).toBe('hero:fighter');
  });

  it('moves toward a distant hero when it cannot reach', () => {
    const s = setup([[fighter, { x: 0, y: 0 }]], [[goblin, { x: 19, y: 0 }]], ['goblin-0', 'hero:fighter'], 20);
    runMonsterTurn(s, 'goblin-0');
    expect(getCombatant(s, 'goblin-0')!.pos).toEqual({ x: 13, y: 0 });
  });

  it('prefers lowest HP when equidistant', () => {
    const s = setup([[fighter, { x: 0, y: 0 }], [wizard, { x: 2, y: 0 }]], [[goblin, { x: 1, y: 3 }]],
      ['goblin-0', 'hero:fighter', 'hero:wizard']);
    const results = runMonsterTurn(s, 'goblin-0', seq(f(15), f(1, 6)));
    const atk = results.flatMap((r) => r.events).find((e) => e.type === 'attack') as { target: string };
    expect(atk.target).toBe('hero:wizard');
  });

  it('incapacitated monsters skip their turn', () => {
    const s = setup([[fighter, { x: 0, y: 0 }]], [[goblin, { x: 1, y: 0 }]], ['goblin-0', 'hero:fighter']);
    getCombatant(s, 'goblin-0')!.conditions.push({ slug: 'stunned' });
    const results = runMonsterTurn(s, 'goblin-0');
    expect(results).toHaveLength(1);
    expect(getCombatant(s, 'hero:fighter')!.hp).toBe(28);
  });
});
