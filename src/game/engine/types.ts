// Engine contract. The engine is pure and deterministic given an RNG.
import type { Abilities, Attack, Citation, Spell } from '../content/types';

export interface Pos { x: number; y: number }

export interface ActiveCondition {
  slug: string;
  /** rounds remaining; undefined = until removed */
  rounds?: number;
  saveEnds?: { ability: keyof Abilities; dc: number };
  sourceId?: string;
  /** spell slug that created this condition (used to end it with concentration) */
  spell?: string;
}

export interface Combatant {
  id: string;
  side: 'hero' | 'monster';
  name: string;
  refSlug: string; // hero or monster slug
  spriteKey: string;
  pos: Pos;
  hp: number;
  maxHp: number;
  ac: number;
  speed: number;
  abilities: Abilities;
  attacks: Attack[];
  conditions: ActiveCondition[];
  initiative: number;
  dead: boolean;
  // hero-only
  slots?: Record<number, number>;
  spells?: string[];
  spellAttack?: number;
  spellDc?: number;
  proficiency?: number;
  potions?: number;
  concentratingOn?: string;
  dodging?: boolean;
  movedThisTurn?: number;
  actedThisTurn?: boolean;
}

export interface DiceRoll {
  notation: string;
  /** individual die faces, for the 3D dice visual */
  rolls: number[];
  total: number;
  /** die size of primary dice, e.g. 20 */
  sides: number;
}

/** Everything the engine did, for the UI, sfx, dice and the DM narrator. */
export type GameEvent =
  | { type: 'roll'; who: string; purpose: string; roll: DiceRoll; advantage?: 'adv' | 'dis' }
  | { type: 'attack'; attacker: string; target: string; attackName: string; hit: boolean; crit: boolean; toHit: number; ac: number }
  | { type: 'damage'; target: string; amount: number; damageType: string; hpLeft: number }
  | { type: 'heal'; target: string; amount: number; hpLeft: number }
  | { type: 'save'; target: string; ability: string; dc: number; total: number; success: boolean }
  | { type: 'condition'; target: string; slug: string; applied: boolean }
  | { type: 'death'; target: string }
  | { type: 'turn'; who: string; round: number }
  | { type: 'move'; who: string; to: Pos }
  | { type: 'spell'; caster: string; spell: string; slotLevel: number }
  | { type: 'info'; text: string }
  | { type: 'victory' }
  | { type: 'defeat' };

export interface ActionResult {
  ok: boolean;
  error?: string;
  events: GameEvent[];
  /** rule citations the engine relied on (condition/rule ids) */
  citations: Citation[];
}

// ---------------------------------------------------------------------------
// Engine additions (rules engine runtime types)
// ---------------------------------------------------------------------------

/** Random source returning a float in [0, 1). Inject a seeded one for determinism. */
export type Rng = () => number;

export type AdvState = 'adv' | 'dis' | undefined;

/** Grid of tiles; walls[y * width + x] = true means blocked. */
export interface Grid {
  width: number;
  height: number;
  walls: boolean[];
}

export type CombatStatus = 'active' | 'victory' | 'defeat';

export interface GameState {
  grid: Grid;
  combatants: Combatant[];
  /** combatant ids in initiative order */
  order: string[];
  turnIndex: number;
  round: number;
  /** every event emitted since combat started */
  log: GameEvent[];
  status: CombatStatus;
  /** spells available to the engine, keyed by slug */
  spells: Record<string, Spell>;
  /** condition display names keyed by slug (for citations) */
  conditionNames: Record<string, string>;
  /** RNG used by actions unless one is passed explicitly */
  rng: Rng;
  /** every citation used so far this combat (de-duplicated) */
  citations: Citation[];
}

/** Hero resources that persist between rooms. */
export interface HeroProgress {
  slug: string;
  hp: number;
  slots: Record<number, number>;
  potions: number;
}

/** Spell target: a combatant id, or a tile for AoE. */
export type SpellTarget = string | Pos;

/** One step of a monster's plan. */
export type PlannedAction =
  | { kind: 'move'; to: Pos }
  | { kind: 'attack'; targetId: string; attackIndex: number }
  | { kind: 'endTurn' };
