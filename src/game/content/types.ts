// Shared content model. Mirrors the Sanity schema 1:1 so GROQ results drop straight in.

export type SrdVersion = '2014' | '2024';

export interface Citation {
  /** Sanity document _id */
  id: string;
  title: string;
  /** e.g. "SRD 5.2.1 · Conditions" */
  source: string;
  srdVersion?: SrdVersion;
}

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type Abilities = Record<AbilityKey, number>;

export interface Attack {
  name: string;
  /** attack bonus, e.g. 4 for +4 */
  toHit: number;
  /** dice notation, e.g. "1d6+2" */
  damage: string;
  damageType: string;
  /** tiles; 1 = melee */
  range: number;
  /** condition slug applied on hit (optional) */
  inflicts?: string;
  /** DC of save vs inflicted condition */
  inflictsSave?: { ability: AbilityKey; dc: number };
}

export interface Monster {
  _id: string;
  slug: string;
  name: string;
  cr: number;
  xp: number;
  ac: number;
  hp: number;
  /** tiles per turn */
  speed: number;
  abilities: Abilities;
  attacks: Attack[];
  /** key into sprite registry, e.g. "goblin" */
  spriteKey: string;
  description?: string;
  srdVersion: SrdVersion;
}

export interface Spell {
  _id: string;
  slug: string;
  name: string;
  level: number;
  school: string;
  concentration: boolean;
  /** tiles */
  range: number;
  /** 'attack' = spell attack roll, 'save' = target saves, 'heal', 'buff' */
  kind: 'attack' | 'save' | 'heal' | 'buff';
  save?: AbilityKey;
  /** dice notation for damage/heal */
  dice?: string;
  damageType?: string;
  /** condition slug applied (on failed save / hit) */
  inflicts?: string;
  /** radius in tiles for AoE (0 = single target) */
  radius?: number;
  iconKey?: string;
  summary: string;
  srdVersion: SrdVersion;
}

export interface Condition {
  _id: string;
  slug: string;
  name: string;
  /** short mechanical effects used by the engine */
  effects: string[];
  srdVersion: SrdVersion;
  /** id of the counterpart in the other SRD version, if it changed */
  counterpartId?: string;
}

export interface Rule {
  _id: string;
  slug: string;
  title: string;
  section: string;
  body: string;
  srdVersion: SrdVersion;
  related?: string[]; // rule/condition/spell ids
}

export interface Hero {
  _id: string;
  slug: string;
  name: string;
  className: 'Fighter' | 'Wizard' | 'Cleric';
  level: number;
  ac: number;
  hp: number;
  speed: number;
  abilities: Abilities;
  proficiency: number;
  attacks: Attack[];
  /** spell slugs */
  spells: string[];
  /** spell slots by level, e.g. {1: 4, 2: 2} */
  slots: Record<number, number>;
  spellAttack?: number;
  spellDc?: number;
  spriteKey: string;
  potions: number;
  blurb: string;
}

export interface EncounterGroup {
  monster: string; // monster slug
  count: number;
}

export interface Room {
  _id: string;
  slug: string;
  name: string;
  order: number;
  /** narrative seed for the DM */
  description: string;
  encounter: EncounterGroup[];
  isBoss?: boolean;
  /** music track key */
  music?: string;
}

export interface GameContent {
  monsters: Monster[];
  spells: Spell[];
  conditions: Condition[];
  rules: Rule[];
  heroes: Hero[];
  rooms: Room[];
  /** where content came from, shown in UI */
  source: 'sanity' | 'fallback';
}
