// Orchestrates the rules engine, the Phaser scene, audio, dice and the DM agent.
// React reads `view` via subscribe(); the scene is purely presentational.
import {
  attack, castSpell, createCombat, currentCombatant, distance, dodge, endTurn, getCombatant, hasLineOfSight,
  livingCombatants, movableTiles, move, mulberry32, planMonsterTurn, syncHeroFromCombatant, tilesInRadius, usePotion,
  findPath, posKey, samePos, effectiveSpeed, isIncapacitated, heroToCombatant, monsterToCombatant, roll,
  type ActionResult, type Combatant, type GameEvent, type GameState, type Grid, type HeroProgress, type Pos, type Rng,
} from './engine';
import type { Citation, GameContent, Monster, Room, Spell, SrdVersion } from './content/types';
import { getArena, type ArenaMap } from './maps';
import type { DungeonScene, UnitView } from './scenes/DungeonScene';
import { audio, type Track } from './audio';
import type { DiceShow } from '@/components/DiceOverlay';
import type { DmLookup, DmResponse } from '@/app/api/dm/route';

export type Phase = 'title' | 'playing' | 'room-cleared' | 'victory' | 'defeat';
export type Mode = { kind: 'move' } | { kind: 'attack'; index: number } | { kind: 'spell'; slug: string };
/** Exploration (free movement, no turns) vs. a woken lair's turn-based combat. Phase stays 'playing' in both. */
export type PlayMode = 'explore' | 'combat';

export interface Objective {
  lairs: { id: number; cleared: boolean; awake: boolean; monsters: number }[];
  doorOpen: boolean;
  goldFound: number;
  loreFound: number;
  loreTotal: number;
}

/** The object the leader can interact with right now (E / Enter / Interact button). */
export interface Interactable {
  kind: 'lore' | 'chest' | 'gold' | 'door';
  label: string;
  pos: Pos;
}

/** Contract A fields, read defensively so old single-room arenas keep working. */
type LairDef = { id: number; spawns: Pos[]; aggro: number };
type ArenaX = ArenaMap & Partial<{
  title: string; entrance: Pos; lairs: LairDef[]; torches: Pos[]; crates: Pos[]; bones: Pos[]; rubble: Pos[];
  pits: Pos[]; gold: Pos[]; lore: { pos: Pos; title: string; text: string }[];
}>;

/** A lair at runtime: its monsters wait on their spawn tiles until a hero comes near. */
interface LairRt {
  id: number;
  spawns: Pos[];
  aggro: number;
  /** `c` keeps a level-unique id/name so sprites stay stable when the lair wakes */
  monsters: { def: Monster; c: Combatant }[];
  cleared: boolean;
  awake: boolean;
}

export interface ChatMessage {
  id: number;
  /** 'log' = dim engine log line, shown immediately (no AI needed) */
  role: 'dm' | 'player' | 'system' | 'log';
  text: string;
  lookups?: DmLookup[];
  backend?: DmResponse['backend'];
  pending?: boolean;
}

export interface Ruling {
  key: number;
  citation: Citation;
  context: string;
  round?: number;
  room?: string;
}

export interface HoverInfo {
  pos: Pos;
  unit?: { name: string; hp: number; maxHp: number; ac: number; conditions: string[]; side: 'hero' | 'monster'; refSlug: string };
  hint?: string;
}

/** What the UI should currently display for a unit. Lags the engine during playback so HP changes land with their event. */
export interface UnitDisplay {
  hp: number;
  maxHp: number;
  dead: boolean;
  pos: Pos;
  conditions: string[];
}

export interface TurnBanner {
  text: string;
  side: 'hero' | 'monster' | 'round';
  key: number;
}

/** The last engine event played back, with a unique key for effects. */
export type LastEvent = GameEvent & { key: number };

/** Keyboard map (key -> label). '1'..'9' pick entries of `ctrl.hotkeyOptions()` (attacks first, then spells). */
export const HOTKEYS: Record<string, string> = {
  m: 'Move',
  '1-9': 'Attack / spell',
  d: 'Dodge',
  p: 'Potion',
  e: 'End turn',
  Enter: 'End turn',
  Escape: 'Cancel',
  'Arrows / W A S': 'Step one tile',
  Tab: 'Switch leader (exploring)',
};

export type HotkeyOption = { key: string; label: string; mode: Mode; disabled: boolean };

const DM_MIN_GAP = 6000;
/** Pacing (ms). Monster turns aim for ~1.5–2.5s. */
const PACE = {
  monsterBeat: 380,
  roundBanner: 650,
  lostTurn: 900,
  d20Hero: 1150,
  d20Monster: 760,
  dmgHero: 750,
  dmgMonster: 480,
  hit: 230,
  death: 320,
  autoEnd: 350,
};

export interface View {
  phase: Phase;
  roomIndex: number;
  roomCount: number;
  room: Room | null;
  state: GameState | null;
  activeId: string | null;
  isPlayerTurn: boolean;
  busy: boolean;
  mode: Mode;
  chat: ChatMessage[];
  rulings: Ruling[];
  lit: Map<string, number>;
  focus: string | null;
  dice: DiceShow | null;
  hover: HoverInfo | null;
  toast: string | null;
  srdVersion: SrdVersion;
  dmThinking: boolean;
  stats: { rolls: number; crits: number; kills: number; rulesCited: number; lookups: number };
  /** displayed unit values keyed by combatant id; prefer these over state.combatants for hp/dead/pos */
  units: Record<string, UnitDisplay>;
  turnBanner: TurnBanner | null;
  lastEvent: LastEvent | null;
  /** 'explore' between fights; 'combat' while a woken lair fights (turn-based). */
  playMode: PlayMode;
  /** hero moved by clicks / arrows while exploring */
  leaderId: string | null;
  objective: Objective;
  interactable: Interactable | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GameController {
  view: View;
  private listeners = new Set<() => void>();
  private scene: DungeonScene | null = null;
  private rng: Rng = mulberry32(Date.now() & 0xffffffff);
  private arena: ArenaMap | null = null;
  private rooms: Room[];
  private progress: Record<string, HeroProgress> = {};
  private roomStartProgress: Record<string, HeroProgress> = {};
  private openedChests = new Set<string>();
  private pendingBeat: string[] = [];
  private pendingCited = new Set<string>();
  private dmInFlight = false;
  private dmWanted = false;
  private lastDmAt = 0;
  private dmTimer: ReturnType<typeof setTimeout> | null = null;
  private transitioning = false;
  private recoverAttempts = 0;
  private monsterPace = false;
  private lastTurnKey = '';
  private lastRound = 0;
  private seq = 1;
  private litCounter = 1;
  private titles: Record<string, string>;
  // level state (survives combats, reset per level)
  private grid: Grid = { width: 1, height: 1, walls: [false] };
  private lairs: LairRt[] = [];
  private goldTaken = new Set<string>();
  private loreRead = new Set<string>();
  private goldFound = 0;
  private doorOpen = false;
  private walking = false;
  private walkTarget: { to: Pos; interactAt?: Pos } | null = null;
  private party: string[] = [];
  private roomStartGold = 0;

  constructor(readonly content: GameContent) {
    this.rooms = [...content.rooms].sort((a, b) => a.order - b.order);
    this.titles = buildTitles(content);
    this.view = {
      phase: 'title', roomIndex: 0, roomCount: this.rooms.length, room: null, state: null, activeId: null,
      isPlayerTurn: false, busy: false, mode: { kind: 'move' }, chat: [], rulings: [], lit: new Map(), focus: null,
      dice: null, hover: null, toast: null, srdVersion: '2024', dmThinking: false,
      stats: { rolls: 0, crits: 0, kills: 0, rulesCited: 0, lookups: 0 },
      units: {}, turnBanner: null, lastEvent: null,
      playMode: 'explore', leaderId: null, interactable: null,
      objective: { lairs: [], doorOpen: false, goldFound: 0, loreFound: 0, loreTotal: 0 },
    };
  }

  // ---------------- plumbing ----------------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private update(patch: Partial<View> = {}) {
    this.view = { ...this.view, ...patch };
    this.view.objective = this.objectiveNow();
    this.listeners.forEach((l) => l());
  }

  titleOf(id: string) {
    return this.titles[id] ?? id;
  }

  get titleMap() {
    return this.titles;
  }

  /** Optional scene hooks other agents may add. */
  private get sceneX() {
    return this.scene as (DungeonScene & {
      focusUnit?: (id: string | null) => void; highlightUnit?: (id: string | null) => void;
      follow?: (id: string | null) => void; revealAround?: (positions: Pos[], radius: number) => void;
      pickup?: (pos: Pos) => void; setMode?: (mode: PlayMode) => void;
    }) | null;
  }

  attachScene(scene: DungeonScene) {
    this.scene = scene;
    scene.setHandlers((p) => void this.onTileClick(p), (p) => this.onTileHover(p));
  }

  // ---------------- flow ----------------

  async start() {
    if (this.transitioning) return;
    this.transitioning = true;
    try {
      audio.unlock();
      audio.blip('door');
      this.progress = {};
      this.openedChests.clear();
      this.goldFound = 0;
      this.update({
        phase: 'playing', roomIndex: 0, chat: [], rulings: [], lit: new Map(),
        stats: { rolls: 0, crits: 0, kills: 0, rulesCited: 0, lookups: 0 },
      });
      this.say('system', 'Your party descends into the Goblin Warren…');
    } finally {
      this.transitioning = false;
    }
    await this.enterRoom(0);
  }

  async enterRoom(index: number) {
    if (this.transitioning) return;
    this.transitioning = true;
    let entered = false;
    try {
      entered = this.setupRoom(index);
    } catch (err) {
      console.error('[game] entering room failed', err);
    } finally {
      this.transitioning = false;
    }
    if (!entered) return this.update({ busy: false });
    await sleep(600);
    // a lair right by the entrance ambushes immediately
    await this.safe('explore', async () => this.checkWake());
  }

  private setupRoom(index: number): boolean {
    const room = this.rooms[index];
    if (!room || !this.scene) return false;
    const arena = getArena(room.order) as ArenaX;
    this.arena = arena;
    // chests, gold and lore are keyed by tile, so they must not carry over between levels
    this.openedChests.clear();
    this.goldTaken.clear();
    this.loreRead.clear();
    this.doorOpen = false;
    this.walkTarget = null;
    this.grid = levelGrid(arena);
    this.lairs = this.buildLairs(room, arena);

    // Fallen heroes are stabilised between levels at 1 HP.
    for (const p of Object.values(this.progress)) if (p.hp <= 0) p.hp = 1;
    this.roomStartProgress = structuredClone(this.progress);
    this.roomStartGold = this.goldFound;

    const spawns = arena.heroSpawns.length ? arena.heroSpawns : [arena.entrance ?? { x: 1, y: 1 }];
    const heroes = this.content.heroes.map((h, i) => heroToCombatant(h, spawns[i] ?? freeTileNear(arena, spawns[0], new Set(spawns.map(posKey))), this.progress[h.slug]));
    const state = this.exploreState(heroes);
    this.party = heroes.map((h) => h.id);

    (this.scene.loadArena as (a: ArenaMap, title?: { index: number; name: string }) => void).call(this.scene, arena, { index, name: room.name });
    this.lastTurnKey = '';
    this.lastRound = 0;
    this.recoverAttempts = 0;
    this.update({
      room, roomIndex: index, state, phase: 'playing', mode: { kind: 'move' }, focus: null,
      busy: false, isPlayerTurn: false, activeId: null, turnBanner: null, lastEvent: null, units: unitsFrom(state),
      playMode: 'explore', leaderId: this.party[0] ?? null,
    });
    this.syncUnits();
    this.enterExploreView();
    audio.play(room.isBoss ? 'boss' : 'explore');

    this.say('system', `Level ${index + 1} of ${this.rooms.length}: ${room.name}${arena.title && arena.title !== room.name ? ` (${arena.title})` : ''}`);
    this.queueBeat([
      `The party enters ${room.name}${arena.title && arena.title !== room.name ? `, ${arena.title}` : ''}. ${room.description}`,
      `They explore freely; ${this.lairs.length} monster lair${this.lairs.length === 1 ? '' : 's'} lurk somewhere in the dark.`,
    ], []);
    this.flushBeat(true);
    return true;
  }

  /** Expand the encounter into monsters and deal them round-robin to the lairs (boss to the last lair). */
  private buildLairs(room: Room, arena: ArenaX): LairRt[] {
    const defs: LairDef[] = (arena.lairs?.length ? arena.lairs : [{ id: 1, spawns: arena.monsterSpawns, aggro: 5 }])
      .map((l) => ({ id: l.id, spawns: l.spawns, aggro: l.aggro ?? 5 }));
    const bySlug = new Map(this.content.monsters.map((m) => [m.slug, m]));
    const buckets: Monster[][] = defs.map(() => []);
    let rr = 0;
    room.encounter.forEach((g, gi) => {
      const m = bySlug.get(g.monster);
      if (!m) return;
      for (let i = 0; i < g.count; i++) {
        if (room.isBoss && gi === 0 && i === 0 && defs.length > 1) buckets[defs.length - 1].push(m);
        else buckets[rr++ % (room.isBoss && defs.length > 1 ? defs.length - 1 : defs.length)].push(m);
      }
    });
    const pool = room.encounter.map((g) => bySlug.get(g.monster)).filter((m): m is Monster => !!m);
    const weakest = [...pool].sort((a, b) => a.cr - b.cr || a.hp - b.hp)[0];
    const counts = new Map<string, number>();
    const occupied = new Set<string>([...arena.heroSpawns].map(posKey));
    return defs.map((d, li) => {
      const list = buckets[li].length ? buckets[li] : weakest ? [weakest] : [];
      const monsters = list.map((m, j) => {
        let pos = d.spawns[j];
        if (!pos || occupied.has(posKey(pos)) || this.grid.walls[pos.y * this.grid.width + pos.x]) {
          pos = freeTileNear(arena, d.spawns[0] ?? arena.monsterSpawns[0] ?? { x: 2, y: 2 }, occupied, this.grid);
        }
        occupied.add(posKey(pos));
        const n = counts.get(m.slug) ?? 0;
        counts.set(m.slug, n + 1);
        return { def: m, c: monsterToCombatant(m, pos, n) };
      });
      return { id: d.id, spawns: d.spawns, aggro: d.aggro, monsters, cleared: !monsters.length, awake: false };
    });
  }

  /** A turn-less state holding just the party, so the HUD and DM keep reading view.state while exploring. */
  private exploreState(heroes: Combatant[]): GameState {
    return {
      grid: this.grid, combatants: heroes, order: heroes.map((h) => h.id), turnIndex: 0, round: 1, log: [],
      status: 'active', spells: Object.fromEntries(this.content.spells.map((x) => [x.slug, x])),
      conditionNames: Object.fromEntries(this.content.conditions.map((x) => [x.slug, x.name])), rng: this.rng, citations: [],
    };
  }

  async nextRoom() {
    if (this.transitioning || this.view.phase !== 'room-cleared') return;
    this.transitioning = true;
    try {
      audio.blip('door');
      await this.scene?.fadeOut();
    } catch (err) {
      console.error('[game] fade failed', err);
    } finally {
      this.transitioning = false;
    }
    await this.enterRoom(this.view.roomIndex + 1);
  }

  async retryRoom() {
    if (this.transitioning || this.view.phase !== 'defeat') return;
    this.transitioning = true;
    try {
      this.progress = structuredClone(this.roomStartProgress);
      this.goldFound = this.roomStartGold;
      await this.scene?.fadeOut();
    } catch (err) {
      console.error('[game] fade failed', err);
    } finally {
      this.transitioning = false;
    }
    await this.enterRoom(this.view.roomIndex);
  }

  restart() {
    this.update({ phase: 'title', turnBanner: null });
    audio.play('title');
  }

  /** Runs fn; on a thrown error logs it and gets the game moving again instead of soft-locking. */
  private async safe(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      this.recoverAttempts = 0;
    } catch (err) {
      console.error(`[game] ${label} failed`, err);
      this.monsterPace = false;
      await this.recover();
    }
  }

  private async recover() {
    const s = this.view.state;
    try {
      this.scene?.clearOverlay();
      if (s) this.update({ units: unitsFrom(s) });
      this.syncUnits();
    } catch {
      /* scene may be gone */
    }
    if (!s || this.view.phase !== 'playing' || this.view.playMode === 'explore') return this.update({ busy: false });
    if (++this.recoverAttempts > 6) {
      // give up gracefully: hand control to whoever's turn it is
      this.update({ busy: false, isPlayerTurn: s.status === 'active' && currentCombatant(s).side === 'hero' });
      return this.toast('The dungeon shudders. Something went wrong; try ending the turn.');
    }
    if (s.status !== 'active') return this.safe('onCombatEnd', () => this.onCombatEnd());
    const cur = currentCombatant(s);
    if (cur.side === 'hero' && !cur.dead && !isIncapacitated(cur)) {
      this.update({ activeId: cur.id, isPlayerTurn: true, busy: false, mode: { kind: 'move' } });
      this.scene?.setActive(cur.id);
      this.refreshOverlay();
      return;
    }
    try {
      endTurn(s, this.rng);
    } catch (err) {
      console.error('[game] could not skip turn', err);
    }
    await this.safe('runTurns', () => this.runTurns());
  }

  /** Shows "Round N" when the round changes, then "<name>'s turn". */
  private async announceTurn(cur: Combatant) {
    const s = this.view.state!;
    const key = `${s.round}:${s.turnIndex}`;
    if (key === this.lastTurnKey) return;
    this.lastTurnKey = key;
    if (s.round !== this.lastRound) {
      this.lastRound = s.round;
      this.update({ turnBanner: { text: `Round ${s.round}`, side: 'round', key: this.seq++ } });
      await sleep(PACE.roundBanner);
    }
    const name = cur.side === 'hero' ? cur.name.split(' ')[0] : cur.name;
    this.scene?.setActive(cur.id);
    // enemy turns: camera follows the monster; hero turns return to the full-room view
    this.sceneX?.focusUnit?.(cur.side === 'monster' ? cur.id : null);
    this.sceneX?.follow?.(cur.id);
    this.update({ turnBanner: { text: `${name}'s turn`, side: cur.side, key: this.seq++ }, activeId: cur.id });
  }

  /** Runs monster turns until it's a hero's turn or combat ends. */
  private async runTurns() {
    const state = this.view.state;
    if (!state) return;
    while (state.status === 'active') {
      const cur = currentCombatant(state);
      if (cur.side === 'hero') {
        if (isIncapacitated(cur) || cur.dead) {
          this.update({ activeId: cur.id, isPlayerTurn: false, busy: true });
          await this.announceTurn(cur);
          this.toast(`${cur.name} is ${cur.conditions.map((c) => this.titleOf(`condition.${c.slug}`)).join(', ') || 'down'} and loses the turn.`);
          await sleep(PACE.lostTurn);
          await this.play(endTurn(state, this.rng));
          continue;
        }
        await this.announceTurn(cur);
        // one DM call per hero turn: narrates the previous hero turn + monster segment
        this.flushBeat();
        this.update({ activeId: cur.id, isPlayerTurn: true, busy: false, mode: { kind: 'move' } });
        this.refreshOverlay();
        return;
      }
      this.update({ activeId: cur.id, isPlayerTurn: false, busy: true });
      this.scene?.clearOverlay();
      await this.announceTurn(cur);
      await sleep(PACE.monsterBeat);
      await this.runMonster(cur.id);
    }
    await this.onCombatEnd();
  }

  /** Plans and plays a monster's turn one step at a time so each outcome lands with its animation. */
  private async runMonster(id: string) {
    const state = this.view.state!;
    const turnKey = `${state.round}:${state.turnIndex}`;
    this.monsterPace = true;
    try {
      for (const step of planMonsterTurn(state, id, this.rng)) {
        if (state.status !== 'active') break;
        const r = step.kind === 'move' ? move(state, id, step.to, this.rng)
          : step.kind === 'attack' ? attack(state, id, step.targetId, step.attackIndex, this.rng)
            : endTurn(state, this.rng);
        await this.play(r);
      }
      // a failed step must never leave the monster holding the turn
      if (state.status === 'active' && `${state.round}:${state.turnIndex}` === turnKey) await this.play(endTurn(state, this.rng));
    } finally {
      this.monsterPace = false;
    }
  }

  private async onCombatEnd() {
    const state = this.view.state!;
    state.combatants.filter((c) => c.side === 'hero').forEach((c) => (this.progress[c.refSlug] = syncHeroFromCombatant(c)));
    this.scene?.clearOverlay();
    this.update({ turnBanner: null });
    if (state.status !== 'victory') {
      this.flushBeat(true);
      this.update({ phase: 'defeat', busy: false, isPlayerTurn: false });
      return;
    }
    const woken = this.lairs.filter((l) => l.awake && !l.cleared);
    woken.forEach((l) => { l.cleared = true; l.awake = false; });
    // short rest: fallen heroes are stabilised at 1 HP, the rest recover a third of their HP
    const downed = new Set<string>();
    state.combatants.filter((c) => c.side === 'hero').forEach((c) => {
      const p = this.progress[c.refSlug];
      if (p.hp <= 0) {
        p.hp = 1;
        downed.add(c.id);
      } else p.hp = Math.min(c.maxHp, p.hp + Math.ceil(c.maxHp / 3));
    });
    const left = this.lairs.filter((l) => !l.cleared).length;
    this.queueBeat([
      `The lair falls silent. The party catches its breath${downed.size ? ' and drags its fallen back to their feet' : ''}.`,
      left ? `${left} lair${left === 1 ? '' : 's'} still lurk in the dark.` : 'No monster lair remains on this level.',
    ]);
    this.flushBeat(true);
    this.returnToExplore(state, downed);
    if (!left) {
      if (this.view.roomIndex >= this.rooms.length - 1) {
        audio.play('victory');
        this.update({ phase: 'victory', busy: false, isPlayerTurn: false });
        return;
      }
      this.openExit();
      return;
    }
    await sleep(400);
    // the fight may have dragged the party into another lair's range
    await this.checkWake();
  }

  /** Back to free exploration with the heroes where the fight left them. */
  private returnToExplore(state: GameState, downed = new Set<string>()) {
    const at = new Map(state.combatants.filter((c) => c.side === 'hero').map((c) => [c.refSlug, c.pos]));
    const heroes = this.content.heroes.map((h, i) => heroToCombatant(h, at.get(h.slug) ?? this.arena!.heroSpawns[i] ?? { x: 1, y: 1 }, this.progress[h.slug]));
    const s = this.exploreState(heroes);
    const leader = heroes.find((h) => h.id === this.view.leaderId && !h.dead) ?? heroes.find((h) => !h.dead);
    this.update({
      state: s, playMode: 'explore', units: unitsFrom(s), busy: false, isPlayerTurn: false, mode: { kind: 'move' },
      leaderId: leader?.id ?? null, activeId: leader?.id ?? null, turnBanner: null,
    });
    // revived heroes need fresh sprites (their old ones played the death animation)
    if (downed.size) this.syncUnits(downed);
    this.syncUnits();
    if (!this.rooms[this.view.roomIndex]?.isBoss) audio.play('explore');
    this.enterExploreView();
  }

  private enterExploreView() {
    const id = this.view.leaderId;
    this.sceneX?.setMode?.('explore');
    this.scene?.setActive(id);
    this.sceneX?.focusUnit?.(null);
    this.sceneX?.follow?.(id);
    this.scene?.clearOverlay();
    this.reveal();
    this.refreshInteract();
  }

  // ---------------- exploration ----------------

  private leader(): Combatant | null {
    const s = this.view.state;
    if (!s || this.view.playMode !== 'explore') return null;
    return s.combatants.find((c) => c.id === this.view.leaderId && !c.dead) ?? s.combatants.find((c) => c.side === 'hero' && !c.dead) ?? null;
  }

  private partyAlive(): Combatant[] {
    return (this.view.state?.combatants ?? []).filter((c) => c.side === 'hero' && !c.dead);
  }

  /** Tiles held by sleeping monsters of lairs not yet cleared or awake. */
  private sleeperTiles(): Set<string> {
    const out = new Set<string>();
    for (const l of this.lairs) if (!l.cleared && !l.awake) l.monsters.forEach((m) => out.add(posKey(m.c.pos)));
    return out;
  }

  private reveal() {
    this.sceneX?.revealAround?.(this.partyAlive().map((c) => ({ ...c.pos })), 7);
  }

  /** Explore mode: pick the hero moved by clicks and arrows. */
  setLeader(heroId: string) {
    if (this.view.playMode !== 'explore' || this.view.phase !== 'playing') return;
    const h = this.view.state?.combatants.find((c) => c.id === heroId && c.side === 'hero' && !c.dead);
    if (!h || h.id === this.view.leaderId) return;
    audio.blip('ui');
    this.walkTarget = null;
    this.update({ leaderId: h.id, activeId: h.id });
    this.scene?.setActive(h.id);
    this.sceneX?.follow?.(h.id);
    this.refreshInteract();
  }

  private async exploreClick(p: Pos) {
    const s = this.view.state;
    const L = this.leader();
    if (!s || !L || this.view.busy || this.view.phase !== 'playing') return;
    const hero = s.combatants.find((h) => !h.dead && samePos(h.pos, p));
    if (hero) {
      if (hero.id !== L.id) this.setLeader(hero.id);
      return;
    }
    const obj = this.objectAt(p);
    if (obj) {
      if (obj.kind === 'gold') return this.walkTo(p);
      if (distance(L.pos, p) <= 1) return this.doInteract(obj);
      const adj = this.approachTile(L.pos, p);
      if (!adj) return this.toast('There is no way to reach that.');
      return this.walkTo(adj, p);
    }
    const door = this.arena?.door;
    if (door && samePos(door, p)) {
      const left = this.lairs.filter((l) => !l.cleared).length;
      return this.toast(`The exit is sealed. Clear ${left} more lair${left === 1 ? '' : 's'} to open it.`);
    }
    if (this.sleeperTiles().has(posKey(p))) {
      const adj = this.approachTile(L.pos, p);
      return adj ? this.walkTo(adj) : undefined;
    }
    if (this.grid.walls[p.y * this.grid.width + p.x]) return;
    return this.walkTo(p);
  }

  /** The free tile next to `target` that is quickest to reach from `from`. */
  private approachTile(from: Pos, target: Pos): Pos | null {
    const occ = this.sleeperTiles();
    let best: { pos: Pos; len: number } | null = null;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const t = { x: target.x + dx, y: target.y + dy };
      if (samePos(t, from)) return t;
      const path = findPath(this.grid, from, t, occ);
      if (path && (!best || path.length < best.len)) best = { pos: t, len: path.length };
    }
    return best?.pos ?? null;
  }

  /** Walk the leader toward `to` one tile at a time (new clicks retarget the walk), followers in tow. */
  private async walkTo(to: Pos, interactAt?: Pos) {
    this.walkTarget = { to, interactAt };
    if (this.walking) return;
    this.walking = true;
    try {
      for (let guard = 0; guard < 300 && this.walkTarget; guard++) {
        if (this.view.playMode !== 'explore' || this.view.phase !== 'playing') break;
        const L = this.leader();
        const tgt = this.walkTarget;
        if (!L) break;
        if (samePos(L.pos, tgt.to)) {
          this.walkTarget = null;
          const obj = tgt.interactAt && this.objectAt(tgt.interactAt);
          if (obj) await this.doInteract(obj);
          break;
        }
        // followers are not obstacles: the leader swaps places with them
        const path = findPath(this.grid, L.pos, tgt.to, this.sleeperTiles());
        if (!path?.length) {
          this.walkTarget = null;
          this.toast('There is no way through.');
          break;
        }
        await this.stepParty(path[0]);
        if (await this.afterStep()) break;
      }
    } catch (err) {
      console.error('[game] walk failed', err);
    } finally {
      this.walking = false;
      if (this.view.playMode === 'explore') this.walkTarget = null;
    }
  }

  /** Leader steps to `next`; each follower closes up on the hero ahead of it. */
  private async stepParty(next: Pos) {
    const L = this.leader()!;
    const followers = this.partyAlive().filter((c) => c.id !== L.id).sort((a, b) => this.party.indexOf(a.id) - this.party.indexOf(b.id));
    const old = new Map([L, ...followers].map((c) => [c.id, { ...c.pos }]));
    const moves: { id: string; to: Pos }[] = [];
    const sleepers = this.sleeperTiles();
    const swapped = followers.find((f) => samePos(f.pos, next));
    if (swapped) {
      swapped.pos = { ...old.get(L.id)! };
      moves.push({ id: swapped.id, to: swapped.pos });
    }
    L.pos = { ...next };
    moves.push({ id: L.id, to: L.pos });
    let pred: Combatant = L;
    for (const f of followers) {
      if (f !== swapped && distance(f.pos, pred.pos) > 1) {
        const occ = new Set([...sleepers, ...this.partyAlive().filter((c) => c !== f).map((c) => posKey(c.pos))]);
        const path = findPath(this.grid, f.pos, old.get(pred.id)!, occ) ?? findPath(this.grid, f.pos, pred.pos, occ, true);
        const step = path?.[0];
        if (step && !occ.has(posKey(step))) {
          f.pos = { ...step };
          moves.push({ id: f.id, to: f.pos });
        }
      }
      pred = f;
    }
    await Promise.all(moves.map((m) => this.scene?.moveAlong(m.id, [m.to])));
    const units = { ...this.view.units };
    for (const m of moves) if (units[m.id]) units[m.id] = { ...units[m.id], pos: { ...m.to } };
    this.update({ units });
    this.syncUnits();
  }

  /** Post-step checks. Returns true when the walk must stop (combat or level exit). */
  private async afterStep(): Promise<boolean> {
    this.reveal();
    const L = this.leader();
    if (!L) return true;
    const gold = this.arena?.gold?.find((g) => samePos(g, L.pos) && !this.goldTaken.has(posKey(g)));
    if (gold) this.takeGold(gold);
    this.refreshInteract();
    const door = this.arena?.door;
    if (this.doorOpen && door && distance(L.pos, door) <= 1) {
      this.finishLevel();
      return true;
    }
    return this.checkWake();
  }

  /** Wakes any lair a hero can see within its aggro radius; starts combat. */
  private async checkWake(): Promise<boolean> {
    if (this.view.playMode !== 'explore' || this.view.phase !== 'playing') return false;
    const heroes = this.partyAlive();
    const tiles = (l: LairRt) => [...l.monsters.map((m) => m.c.pos), ...l.spawns];
    const near = (l: LairRt, los: boolean) => tiles(l).some((t) => heroes.some((h) => distance(h.pos, t) <= l.aggro && (!los || hasLineOfSight(this.grid, h.pos, t))));
    const first = this.lairs.find((l) => !l.cleared && near(l, true));
    if (!first) return false;
    const woken = this.lairs.filter((l) => !l.cleared && (l === first || near(l, false)));
    this.walkTarget = null;
    await this.startCombat(woken);
    return true;
  }

  private async startCombat(woken: LairRt[]) {
    const prev = this.view.state!;
    const heroes = prev.combatants.filter((c) => c.side === 'hero');
    heroes.forEach((c) => (this.progress[c.refSlug] = syncHeroFromCombatant(c)));
    woken.forEach((l) => (l.awake = true));
    const list = woken.flatMap((l) => l.monsters);
    // sleeping monsters of other lairs stand their ground as obstacles
    const grid: Grid = { width: this.grid.width, height: this.grid.height, walls: [...this.grid.walls] };
    for (const l of this.lairs) if (!l.cleared && !l.awake) l.monsters.forEach((m) => (grid.walls[m.c.pos.y * grid.width + m.c.pos.x] = true));
    const at = new Map(heroes.map((h) => [h.refSlug, h.pos]));
    const heroPos = this.content.heroes.map((h, i) => ({ ...(at.get(h.slug) ?? heroes[i]?.pos ?? { x: 1, y: 1 }) }));
    const state = createCombat(
      this.content.heroes, list.map((m) => ({ monster: m.def, pos: { ...m.c.pos } })), heroPos, grid,
      { spells: this.content.spells, conditions: this.content.conditions }, this.rng, structuredClone(this.progress),
    );
    // keep the level-unique monster ids/names so sprites and the objective tracker stay stable
    const nH = this.content.heroes.length;
    const idOf = new Map(list.map((m, j) => [state.combatants[nH + j].id, m.c.id]));
    state.order = state.order.map((id) => idOf.get(id) ?? id);
    list.forEach((m, j) => {
      state.combatants[nH + j].id = m.c.id;
      state.combatants[nH + j].name = m.c.name;
    });

    this.lastTurnKey = '';
    this.lastRound = 0;
    this.recoverAttempts = 0;
    this.scene?.clearOverlay();
    this.update({
      state, playMode: 'combat', units: unitsFrom(state), busy: true, isPlayerTurn: false, mode: { kind: 'move' },
      interactable: null, activeId: null, turnBanner: { text: 'Ambush!', side: 'monster', key: this.seq++ },
    });
    this.syncUnits();
    this.sceneX?.setMode?.('combat');
    audio.blip('ambush');
    audio.play(this.rooms[this.view.roomIndex]?.isBoss ? 'boss' : 'combat');
    this.toast('Ambush!');
    const names = list.map((m) => m.c.name).join(', ');
    this.say('system', `Ambush! ${names} attack${list.length === 1 ? 's' : ''}.`);
    this.addCitations(state.citations, 'Initiative is rolled');
    const order = state.order.map((id) => getCombatant(state, id)!).map((c) => `${c.name} ${c.initiative}`).join(', ');
    this.queueBeat([`Ambush! A monster lair wakes: ${names} burst from the dark and attack the party.`, `Initiative order: ${order}.`], []);
    this.flushBeat(true);
    await sleep(900);
    await this.safe('runTurns', () => this.runTurns());
  }

  /** Lore stone, unopened chest, gold or open door at a tile. */
  private objectAt(p: Pos): Interactable | null {
    const a = this.arena;
    if (!a) return null;
    const k = posKey(p);
    const lore = a.lore?.find((l) => posKey(l.pos) === k);
    if (lore) return this.loreRead.has(k) ? null : { kind: 'lore', label: `Read "${lore.title}"`, pos: p };
    if (a.chests.some((c) => posKey(c) === k)) return this.openedChests.has(k) ? null : { kind: 'chest', label: 'Open chest', pos: p };
    if (a.gold?.some((g) => posKey(g) === k) && !this.goldTaken.has(k)) return { kind: 'gold', label: 'Pick up gold', pos: p };
    if (a.door && this.doorOpen && posKey(a.door) === k) return { kind: 'door', label: 'Leave level', pos: p };
    return null;
  }

  private refreshInteract() {
    const L = this.leader();
    let best: Interactable | null = null;
    if (L) {
      const rank = { door: 0, lore: 1, chest: 2, gold: 3 };
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const o = this.objectAt({ x: L.pos.x + dx, y: L.pos.y + dy });
        if (o && (!best || rank[o.kind] < rank[best.kind])) best = o;
      }
    }
    const cur = this.view.interactable;
    if (cur?.kind !== best?.kind || (cur && best && !samePos(cur.pos, best.pos)) || cur?.label !== best?.label) this.update({ interactable: best });
  }

  /** Explore mode: use the object next to the leader (E / Enter / Interact button). */
  async interact() {
    if (this.view.playMode !== 'explore' || this.view.busy) return;
    const it = this.view.interactable;
    if (!it) return this.toast('Nothing to interact with here.');
    await this.doInteract(it);
  }

  private async doInteract(it: Interactable) {
    const L = this.leader();
    const a = this.arena;
    if (!L || !a || distance(L.pos, it.pos) > 1) return;
    const k = posKey(it.pos);
    if (it.kind === 'gold') {
      this.takeGold(it.pos);
    } else if (it.kind === 'chest') {
      if (this.openedChests.has(k)) return;
      this.openedChests.add(k);
      L.potions = (L.potions ?? 0) + 1;
      this.scene?.openChest(it.pos);
      audio.blip('chest');
      this.toast(`${L.name} finds a Potion of Healing!`);
      this.queueBeat([`${L.name} pries open a chest and finds a Potion of Healing.`]);
      this.flushBeat();
      this.log(`${L.name} finds a Potion of Healing.`);
    } else if (it.kind === 'lore') {
      const lore = a.lore?.find((l) => posKey(l.pos) === k);
      if (!lore || this.loreRead.has(k)) return;
      this.loreRead.add(k);
      audio.blip('spell');
      this.toast(`Lore stone: ${lore.title}`);
      this.log(`${L.name} reads the lore stone "${lore.title}": ${lore.text}`);
      this.queueBeat([`The party reads the lore stone "${lore.title}": ${lore.text}`]);
      this.flushBeat(true);
    } else if (it.kind === 'door') {
      this.finishLevel();
      return;
    }
    this.update();
    this.refreshInteract();
  }

  private takeGold(p: Pos) {
    const k = posKey(p);
    if (this.goldTaken.has(k)) return;
    this.goldTaken.add(k);
    const amount = roll('3d6', this.rng).total;
    this.goldFound += amount;
    this.sceneX?.pickup?.(p);
    audio.blip('gold');
    this.toast(`+${amount} gold`);
    this.log(`The party scoops up ${amount} gold pieces (${this.goldFound} gp total).`);
    this.queueBeat([`The party scoops up ${amount} gold pieces from the floor.`]);
    this.update();
  }

  private openExit() {
    if (this.doorOpen) return;
    this.doorOpen = true;
    const room = this.view.room;
    if (!this.arena?.door) {
      this.update();
      return this.finishLevel();
    }
    this.scene?.openDoor();
    audio.blip('door');
    this.toast('Every lair is cleared. The exit door grinds open.');
    this.queueBeat([`With every lair in ${room?.name ?? 'the level'} cleared, the exit door grinds open.`]);
    this.flushBeat(true);
    this.update();
    this.refreshInteract();
    const L = this.leader();
    if (L && distance(L.pos, this.arena.door) <= 1) this.finishLevel();
  }

  private finishLevel() {
    if (this.view.phase !== 'playing') return;
    this.walkTarget = null;
    this.partyAlive().forEach((c) => (this.progress[c.refSlug] = syncHeroFromCombatant(c)));
    audio.blip('chest');
    if (this.view.roomIndex >= this.rooms.length - 1) {
      audio.play('victory');
      this.update({ phase: 'victory', busy: false, isPlayerTurn: false, interactable: null });
    } else {
      this.update({ phase: 'room-cleared', busy: false, isPlayerTurn: false, interactable: null });
    }
  }

  private async explorePotion() {
    const c = this.leader();
    if (!c || this.view.busy) return;
    const first = c.name.split(' ')[0];
    if (!(c.potions ?? 0)) return this.toast('No potions left.');
    if (c.hp >= c.maxHp) return this.toast(`${first} is at full HP.`);
    this.update({ busy: true });
    try {
      c.potions = (c.potions ?? 0) - 1;
      const h = roll('2d4+2', this.rng);
      await this.showDice({
        label: `${c.name} · Potion of Healing`, sides: h.sides, faces: h.rolls, total: h.total,
        modifier: h.total - h.rolls.reduce((x, y) => x + y, 0), outcome: 'none', side: 'hero', kind: 'heal',
      }, PACE.dmgHero);
      const before = c.hp;
      c.hp = Math.min(c.maxHp, c.hp + h.total);
      this.scene?.hitFx(c.id, c.hp - before, false, 'heal');
      audio.blip('heal');
      this.update({ units: unitsFrom(this.view.state!) });
      this.syncUnits();
      this.log(`${c.name} drinks a Potion of Healing and regains ${c.hp - before} HP.`);
      this.queueBeat([`${c.name} drinks a Potion of Healing and regains ${c.hp - before} HP.`]);
    } finally {
      this.update({ busy: false });
    }
  }

  private objectiveNow(): Objective {
    const s = this.view.state;
    const inFight = this.view.playMode === 'combat' && s;
    return {
      lairs: this.lairs.map((l) => ({
        id: l.id, cleared: l.cleared, awake: l.awake,
        monsters: l.cleared ? 0 : l.monsters.filter((m) => !(inFight && l.awake && (getCombatant(s, m.c.id)?.dead ?? false))).length,
      })),
      doorOpen: this.doorOpen, goldFound: this.goldFound, loreFound: this.loreRead.size, loreTotal: this.arena ? ((this.arena as ArenaX).lore?.length ?? 0) : 0,
    };
  }

  // ---------------- debug (playtest agents) ----------------

  /** Marks a lair cleared (explore mode). Opens the exit when it was the last one. */
  debugClearLair(id: number) {
    const l = this.lairs.find((x) => x.id === id);
    if (!l || l.cleared || this.view.playMode !== 'explore') return false;
    l.cleared = true;
    this.update();
    this.syncUnits();
    if (this.lairs.every((x) => x.cleared)) {
      if (this.view.roomIndex >= this.rooms.length - 1) this.finishLevel();
      else this.openExit();
    }
    return true;
  }

  /** Puts the leader on `pos` (explore mode) with the party bunched behind. Does not wake lairs by itself. */
  debugTeleport(pos: Pos) {
    const L = this.leader();
    if (!L || this.grid.walls[pos.y * this.grid.width + pos.x]) return false;
    this.walkTarget = null;
    L.pos = { ...pos };
    const taken = new Set([posKey(pos), ...this.sleeperTiles()]);
    for (const f of this.partyAlive().filter((c) => c !== L)) {
      f.pos = freeTileNear(this.arena!, pos, taken, this.grid);
      taken.add(posKey(f.pos));
    }
    this.update({ units: unitsFrom(this.view.state!) });
    this.syncUnits();
    this.reveal();
    this.refreshInteract();
    return true;
  }

  /** Lair layout for tests: ids, spawn tiles, monster tiles. */
  debugLairs() {
    return this.lairs.map((l) => ({ id: l.id, aggro: l.aggro, cleared: l.cleared, spawns: l.spawns, monsters: l.monsters.map((m) => ({ ...m.c.pos })) }));
  }

  // ---------------- player input ----------------

  setMode(mode: Mode) {
    if (!this.view.isPlayerTurn || this.view.busy) return;
    audio.blip('ui');
    this.update({ mode });
    this.refreshOverlay();
  }

  private actor(): Combatant | null {
    const s = this.view.state;
    if (!s || !this.view.isPlayerTurn || this.view.busy) return null;
    const c = currentCombatant(s);
    return c.side === 'hero' ? c : null;
  }

  async onTileClick(p: Pos) {
    if (this.view.playMode === 'explore') return this.exploreClick(p);
    const c = this.actor();
    const s = this.view.state;
    if (!c || !s) return;
    const unit = s.combatants.find((u) => !u.dead && u.pos.x === p.x && u.pos.y === p.y);
    const mode = this.view.mode;

    // chests: adjacent click opens
    const chestKey = posKey(p);
    if (this.arena?.chests.some((ch) => posKey(ch) === chestKey)) {
      if (this.openedChests.has(chestKey)) return this.toast('The chest is empty.');
      if (distance(c.pos, p) > 1) return this.toast('Move next to the chest to open it.');
      this.openedChests.add(chestKey);
      c.potions = (c.potions ?? 0) + 1;
      this.scene?.openChest(p);
      audio.blip('chest');
      this.toast(`${c.name} finds a Potion of Healing!`);
      this.queueBeat([`${c.name} pries open a chest and finds a Potion of Healing.`]);
      this.log(`${c.name} finds a Potion of Healing.`);
      this.update();
      return;
    }

    if (mode.kind === 'move') {
      if (unit && unit.side !== c.side && !c.actedThisTurn) {
        // convenience: clicking an enemy attacks with the first attack that reaches
        const idx = c.attacks.findIndex((_, i) => this.targetIds(c, { kind: 'attack', index: i }).includes(unit.id));
        if (idx >= 0) return this.doAction(() => attack(s, c.id, unit.id, idx, this.rng), { attacker: c.id, target: unit.id, style: c.attacks[idx].range > 1 ? 'ranged' : 'melee' });
        return this.toast(`${unit.name} is out of reach. Move closer first.`);
      }
      if (unit) return;
      return this.doAction(() => move(s, c.id, p, this.rng));
    }
    if (mode.kind === 'attack') {
      if (!unit || unit.side === c.side) return this.toast('Pick an enemy to attack.');
      const atk = c.attacks[mode.index];
      if (!this.targetIds(c, mode).includes(unit.id)) return this.toast(`${unit.name} is out of reach for ${atk.name}.`);
      return this.doAction(() => attack(s, c.id, unit.id, mode.index, this.rng), { attacker: c.id, target: unit.id, style: atk.range > 1 ? 'ranged' : 'melee' });
    }
    if (mode.kind === 'spell') {
      const spell = s.spells[mode.slug];
      if (!spell) return;
      const radius = spell.radius ?? 0;
      if (radius > 0) {
        // range-0 areas (thunderwave) burst from the caster wherever you click
        const at = spell.range === 0 ? { ...c.pos } : p;
        return this.doAction(() => castSpell(s, c.id, spell.slug, at, this.rng), { attacker: c.id, at, spell });
      }
      const valid = this.targetIds(c, mode);
      if (!unit) return this.toast(`Pick a creature for ${spell.name}.`);
      if (!valid.includes(unit.id)) {
        const ally = spell.kind === 'heal' || spell.kind === 'buff';
        return this.toast(ally && unit.side !== c.side ? `${spell.name} targets an ally.` : !ally && unit.side === c.side ? `${spell.name} targets an enemy.` : `${unit.name} is out of range for ${spell.name}.`);
      }
      return this.doAction(() => castSpell(s, c.id, spell.slug, unit.id, this.rng), {
        attacker: c.id, target: unit.id, at: p, spell,
      });
    }
  }

  onTileHover(p: Pos | null) {
    const s = this.view.state;
    if (!p || !s) {
      if (this.view.hover) this.update({ hover: null });
      return;
    }
    if (this.view.playMode === 'explore') return this.exploreHover(p);
    const u = s.combatants.find((x) => !x.dead && x.pos.x === p.x && x.pos.y === p.y);
    const hover: HoverInfo = { pos: p };
    if (u) {
      const d = this.view.units[u.id];
      hover.unit = { name: u.name, hp: d?.hp ?? u.hp, maxHp: u.maxHp, ac: u.ac, conditions: d?.conditions ?? u.conditions.map((x) => x.slug), side: u.side, refSlug: u.refSlug };
    }
    const canDraw = this.view.isPlayerTurn && !this.view.busy;
    if (canDraw && this.view.mode.kind === 'spell') {
      const spell = s.spells[this.view.mode.slug];
      if (spell && (spell.radius ?? 0) > 0) {
        const at = spell.range === 0 ? currentCombatant(s).pos : p;
        this.scene?.showOverlay({ ...this.overlayFor(), aoe: tilesInRadius(s.grid, at, spell.radius!) });
      }
    } else if (canDraw && this.view.mode.kind === 'move' && !u) {
      const c = currentCombatant(s);
      const reach = movableTiles(s, c.id);
      if (reach.some((r) => r.x === p.x && r.y === p.y)) {
        const occ = new Set(s.combatants.filter((x) => !x.dead && x.id !== c.id).map((x) => posKey(x.pos)));
        const path = findPath(s.grid, c.pos, p, occ) ?? [];
        this.scene?.showOverlay({ ...this.overlayFor(), path });
      } else {
        this.scene?.showOverlay(this.overlayFor());
      }
    }
    if (hover.unit?.name !== this.view.hover?.unit?.name || hover.unit?.hp !== this.view.hover?.unit?.hp) this.update({ hover });
  }

  private exploreHover(p: Pos) {
    const L = this.leader();
    const k = posKey(p);
    const sleeper = this.lairs.flatMap((l) => (l.cleared || l.awake ? [] : l.monsters)).find((m) => posKey(m.c.pos) === k);
    const hover: HoverInfo = { pos: p };
    if (sleeper) {
      const c = sleeper.c;
      hover.unit = { name: c.name, hp: c.hp, maxHp: c.maxHp, ac: c.ac, conditions: [], side: 'monster', refSlug: c.refSlug };
    }
    const obj = this.objectAt(p);
    if (obj) hover.hint = obj.label;
    if (L && !this.view.busy && !this.walking && !this.grid.walls[p.y * this.grid.width + p.x] && !sleeper) {
      const path = findPath(this.grid, L.pos, p, this.sleeperTiles());
      if (path) this.scene?.showOverlay({ path });
      else this.scene?.clearOverlay();
    } else this.scene?.clearOverlay();
    if (hover.unit?.name !== this.view.hover?.unit?.name || hover.hint !== this.view.hover?.hint || !this.view.hover) this.update({ hover });
  }

  async dodge() {
    const c = this.actor();
    if (c && this.view.state) await this.doAction(() => dodge(this.view.state!, c.id, this.rng));
  }

  async potion() {
    if (this.view.playMode === 'explore') return this.explorePotion();
    const c = this.actor();
    if (c && this.view.state) await this.doAction(() => usePotion(this.view.state!, c.id, this.rng), { target: c.id });
  }

  async endTurn() {
    if (!this.actor()) return;
    await this.finishTurn();
  }

  /** Ends the current hero's turn without the actor() check (used while busy by the auto-end). */
  private async finishTurn() {
    const s = this.view.state;
    if (!s || s.status !== 'active' || currentCombatant(s).side !== 'hero') return;
    audio.blip('ui');
    this.update({ busy: true, isPlayerTurn: false });
    this.scene?.clearOverlay();
    await this.safe('endTurn', async () => {
      await this.play(endTurn(s, this.rng));
      await this.runTurns();
    });
  }

  /** Attack/spell options in the stable order used by hotkeys '1'..'9'. */
  hotkeyOptions(): HotkeyOption[] {
    const s = this.view.state;
    if (!s || s.status !== 'active') return [];
    const c = currentCombatant(s);
    if (c.side !== 'hero') return [];
    const opts: HotkeyOption[] = c.attacks.map((a, i) => ({ key: '', label: a.name, mode: { kind: 'attack', index: i } as Mode, disabled: !!c.actedThisTurn }));
    for (const slug of c.spells ?? []) {
      const sp = s.spells[slug];
      if (!sp) continue;
      opts.push({ key: '', label: sp.name, mode: { kind: 'spell', slug }, disabled: !!c.actedThisTurn || (sp.level > 0 && (c.slots?.[sp.level] ?? 0) <= 0) });
    }
    return opts.slice(0, 9).map((o, i) => ({ ...o, key: String(i + 1) }));
  }

  /** Keyboard input; returns true if the key was handled. See HOTKEYS. */
  hotkey(key: string): boolean {
    if (this.view.playMode === 'explore') return this.exploreHotkey(key);
    const c = this.actor();
    const s = this.view.state;
    if (!c || !s) return false;
    const k = key.length === 1 ? key.toLowerCase() : key;
    const steps: Record<string, Pos> = {
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 },
    };
    if (steps[k]) {
      const to = { x: c.pos.x + steps[k].x, y: c.pos.y + steps[k].y };
      void this.doAction(() => move(s, c.id, to, this.rng));
      return true;
    }
    if (/^[1-9]$/.test(k)) {
      const o = this.hotkeyOptions()[Number(k) - 1];
      if (!o) return false;
      if (o.disabled) {
        this.toast(c.actedThisTurn ? `${c.name} already used the action this turn.` : `No spell slots left for ${o.label}.`);
        return true;
      }
      this.setMode(o.mode);
      return true;
    }
    switch (k) {
      case 'm': case 'Escape': this.setMode({ kind: 'move' }); return true;
      case 'd': void this.dodge(); return true;
      case 'p': void this.potion(); return true;
      case 'e': case 'Enter': void this.endTurn(); return true;
    }
    return false;
  }

  /** Explore keys: arrows/WASD step the leader, E/Enter interact, P potion. Tab is handled by the HUD (focus-aware). */
  private exploreHotkey(key: string): boolean {
    if (this.view.phase !== 'playing') return false;
    const L = this.leader();
    if (!L) return false;
    const k = key.length === 1 ? key.toLowerCase() : key;
    const steps: Record<string, Pos> = {
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
    };
    if (steps[k]) {
      if (!this.view.busy && !this.walking) {
        const to = { x: L.pos.x + steps[k].x, y: L.pos.y + steps[k].y };
        const obj = this.objectAt(to);
        if (obj && obj.kind !== 'gold') void this.doInteract(obj);
        else if (!this.grid.walls[to.y * this.grid.width + to.x] && !this.sleeperTiles().has(posKey(to))) void this.walkTo(to);
      }
      return true;
    }
    switch (k) {
      case 'e': case 'Enter':
        if (!this.view.interactable) return false;
        void this.interact();
        return true;
      case 'p': void this.potion(); return true;
      case 'Escape': this.walkTarget = null; return true;
    }
    return false;
  }

  private async doAction(
    fn: () => ActionResult,
    fx?: { attacker?: string; target?: string; at?: Pos; style?: 'melee' | 'ranged'; spell?: Spell },
  ) {
    const s = this.view.state;
    if (!s || this.view.busy) return;
    let r: ActionResult;
    try {
      r = fn();
    } catch (err) {
      console.error('[game] action failed', err);
      return this.toast('That did not work.');
    }
    if (!r.ok) {
      if (r.citations.length) this.addCitations(r.citations, r.error ?? '');
      return this.toast(r.error ?? 'Not allowed');
    }
    this.update({ busy: true });
    this.scene?.clearOverlay();
    let autoEnd = false;
    await this.safe('action', async () => {
      await this.play(r, fx);
      if (s.status !== 'active') {
        this.update({ busy: false });
        return this.onCombatEnd();
      }
      const c = currentCombatant(s);
      // auto-end the turn once nothing useful is left; stay busy so no input sneaks in
      const canMove = effectiveSpeed(c) - (c.movedThisTurn ?? 0) > 0;
      if (c.side === 'hero' && c.actedThisTurn && !canMove) {
        autoEnd = true;
        return;
      }
      this.update({ busy: false, mode: { kind: 'move' } });
      this.refreshOverlay();
    });
    if (autoEnd) {
      await sleep(PACE.autoEnd);
      await this.finishTurn();
    }
  }

  // ---------------- event playback ----------------

  private async play(r: ActionResult, fx?: { attacker?: string; target?: string; at?: Pos; style?: 'melee' | 'ranged'; spell?: Spell }) {
    const s = this.view.state!;
    const ev = r.events;
    const lines: string[] = [];
    let lastCrit = false;
    const mon = this.monsterPace;
    const units = { ...this.view.units };
    const show = (id: string, patch: Partial<UnitDisplay>) => {
      const cur = units[id];
      if (!cur) return;
      units[id] = { ...cur, ...patch };
      this.update({ units: { ...units } });
      this.syncUnits();
    };
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      this.update({ lastEvent: { ...e, key: this.seq++ } as LastEvent });
      switch (e.type) {
        case 'move': {
          const path: Pos[] = [e.to];
          while (ev[i + 1]?.type === 'move' && (ev[i + 1] as Extract<GameEvent, { type: 'move' }>).who === e.who) {
            path.push((ev[++i] as Extract<GameEvent, { type: 'move' }>).to);
          }
          await this.scene?.moveAlong(e.who, path);
          show(e.who, { pos: path[path.length - 1] });
          lines.push(`${this.nameOf(e.who)} moves.`);
          break;
        }
        case 'roll': {
          if (e.purpose === 'initiative') break;
          const isD20 = e.roll.sides === 20;
          const next = ev.slice(i + 1).find((x) => x.type === 'attack' || x.type === 'save');
          if (isD20 && /attack$/.test(e.purpose)) {
            const a = next?.type === 'attack' ? next : undefined;
            if (a) {
              const style = fx?.spell ? 'spell' : a.attacker === fx?.attacker ? (fx?.style ?? 'melee') : guessStyle(s, a.attacker, a.target);
              await this.scene?.attackAnim(a.attacker, a.target, style, spellColor(fx?.spell));
            }
          }
          let outcome: DiceShow['outcome'] = 'none';
          let kept: number | undefined;
          if (isD20 && next) {
            kept = e.advantage === 'adv' ? Math.max(...e.roll.rolls) : e.advantage === 'dis' ? Math.min(...e.roll.rolls) : e.roll.rolls[0];
            if (next.type === 'attack') outcome = next.crit ? 'crit' : kept === 1 ? 'fumble' : next.hit ? 'hit' : 'miss';
            else outcome = next.success ? 'save' : 'fail';
          }
          await this.showDice({
            label: `${this.nameOf(e.who)} · ${e.purpose}`, sides: e.roll.sides, faces: e.roll.rolls,
            total: e.roll.total, modifier: e.roll.total - (isD20 ? (kept ?? e.roll.rolls[0]) : e.roll.rolls.reduce((a, b) => a + b, 0)),
            kept, advantage: e.advantage, outcome,
            vs: isD20 && next ? (next.type === 'attack' ? { label: 'AC', value: next.ac } : { label: 'DC', value: next.dc }) : undefined,
            side: getCombatant(s, e.who)?.side === 'monster' ? 'enemy' : 'hero',
            kind: isD20 ? (next?.type === 'save' ? 'save' : /attack$/.test(e.purpose) ? 'attack' : 'check') : /heal/i.test(e.purpose) ? 'heal' : 'damage',
          }, isD20 ? (mon ? PACE.d20Monster : PACE.d20Hero) : (mon ? PACE.dmgMonster : PACE.dmgHero));
          break;
        }
        case 'attack':
          lastCrit = e.crit;
          if (e.crit) this.bumpStat('crits');
          if (!e.hit) {
            this.scene?.hitFx(e.target, 0, false, 'miss');
            audio.blip('miss');
          }
          lines.push(`${this.nameOf(e.attacker)} attacks ${this.nameOf(e.target)} with ${e.attackName}: ${e.toHit} vs AC ${e.ac}, ${e.crit ? 'CRITICAL HIT' : e.hit ? 'hit' : 'miss'}.`);
          break;
        case 'spell': {
          const spell = s.spells[e.spell];
          audio.blip('spell');
          if (spell && fx) {
            if ((spell.radius ?? 0) > 0 && fx.at) {
              const caster = getCombatant(s, e.caster);
              const at = spell.range === 0 && caster ? caster.pos : fx.at;
              if (spell.range > 0 && fx.attacker) await this.scene?.attackAnim(fx.attacker, fx.attacker, 'spell');
              this.scene?.burst(at, spell.radius!, spellColor(spell));
              await sleep(300);
            } else if (fx.target && fx.attacker && spell.kind !== 'attack') {
              await this.scene?.attackAnim(fx.attacker, fx.target, 'spell', spellColor(spell));
            }
          }
          lines.push(`${this.nameOf(e.caster)} casts ${spell?.name ?? e.spell}${e.slotLevel ? ` (level ${e.slotLevel} slot)` : ''}.`);
          break;
        }
        case 'damage':
          this.scene?.hitFx(e.target, e.amount, lastCrit, 'damage');
          audio.blip(lastCrit ? 'crit' : 'hit');
          show(e.target, { hp: e.hpLeft });
          lines.push(`${this.nameOf(e.target)} takes ${e.amount} ${e.damageType} damage (${e.hpLeft} HP left).`);
          await sleep(PACE.hit);
          break;
        case 'heal':
          this.scene?.hitFx(e.target, e.amount, false, 'heal');
          audio.blip('heal');
          show(e.target, { hp: e.hpLeft });
          lines.push(`${this.nameOf(e.target)} regains ${e.amount} HP (${e.hpLeft} HP).`);
          await sleep(PACE.hit);
          break;
        case 'save':
          lines.push(`${this.nameOf(e.target)} makes a ${e.ability.toUpperCase()} save: ${e.total} vs DC ${e.dc}, ${e.success ? 'success' : 'failure'}.`);
          break;
        case 'condition': {
          const name = this.titleOf(`condition.${e.slug}`);
          const had = units[e.target]?.conditions ?? [];
          show(e.target, { conditions: e.applied ? [...new Set([...had, e.slug])] : had.filter((x) => x !== e.slug) });
          if (e.applied) this.toast(`${this.nameOf(e.target)} is ${name}!`);
          lines.push(`${this.nameOf(e.target)} ${e.applied ? 'is now' : 'is no longer'} ${name}.`);
          break;
        }
        case 'death': {
          const c = getCombatant(s, e.target);
          if (c?.side === 'monster') this.bumpStat('kills');
          audio.blip('death');
          show(e.target, { dead: true, hp: 0 });
          lines.push(`${this.nameOf(e.target)} ${c?.side === 'hero' ? 'falls unconscious, out of the fight' : 'is slain'}.`);
          await sleep(PACE.death);
          break;
        }
        case 'turn':
          break;
        case 'info':
          lines.push(e.text);
          break;
        case 'victory':
          lines.push('All foes in the room are defeated.');
          break;
        case 'defeat':
          lines.push('The whole party has fallen.');
          break;
      }
    }
    // playback done: displayed values catch up with the engine (e.g. dodging, concentration)
    this.update({ units: unitsFrom(s) });
    this.syncUnits();
    if (r.citations.length) this.addCitations(r.citations, lines.find((l) => !l.endsWith('moves.')) ?? lines[0] ?? '');
    const meaningful = lines.filter((l) => !l.endsWith('moves.'));
    if (meaningful.length) {
      this.log(meaningful.join(' '));
      this.queueBeat(lines.filter((l, i, a) => !l.endsWith('moves.') || a[i + 1] === undefined), r.citations.map((c) => c.id));
    }
    this.update();
  }

  private async showDice(d: Omit<DiceShow, 'key'>, hold: number) {
    this.bumpStat('rolls');
    audio.dice(d.sides, d.faces.length);
    this.update({ dice: { ...d, key: this.seq++ } });
    await sleep(hold);
  }

  // ---------------- views ----------------

  private nameOf(id: string) {
    return this.view.state ? (getCombatant(this.view.state, id)?.name ?? id) : id;
  }

  /** Pushes unit views to the scene. Sleeping lair monsters show while exploring. `drop` ids get their sprites rebuilt. */
  private syncUnits(drop?: Set<string>) {
    const s = this.view.state;
    if (!s || !this.scene) return;
    const views: UnitView[] = s.combatants.map((c) => {
      const d = this.view.units[c.id] ?? displayOf(c);
      return { id: c.id, spriteKey: c.spriteKey, side: c.side, pos: d.pos, hp: d.hp, maxHp: c.maxHp, name: c.name, dead: d.dead, conditions: d.conditions };
    });
    const have = new Set(views.map((v) => v.id));
    for (const l of this.lairs) {
      if (l.cleared) continue;
      for (const m of l.monsters) {
        if (have.has(m.c.id)) continue;
        views.push({ id: m.c.id, spriteKey: m.c.spriteKey, side: 'monster', pos: { ...m.c.pos }, hp: m.c.hp, maxHp: m.c.maxHp, name: m.c.name, dead: false, conditions: [] });
      }
    }
    if (drop?.size) this.scene.setUnits(views.filter((v) => !drop.has(v.id)));
    this.scene.setUnits(views);
  }

  private targetIds(c: Combatant, mode: Mode): string[] {
    const s = this.view.state!;
    const inReach = (t: Combatant, range: number) => distance(c.pos, t.pos) <= range && (range <= 1 || hasLineOfSight(s.grid, c.pos, t.pos));
    if (mode.kind === 'attack') {
      const atk = c.attacks[mode.index];
      return livingCombatants(s, 'monster').filter((t) => inReach(t, atk.range)).map((t) => t.id);
    }
    if (mode.kind === 'spell') {
      const sp = s.spells[mode.slug];
      if (!sp) return [];
      const allies = sp.kind === 'heal' || sp.kind === 'buff';
      // range-0 single-target spells affect the caster only
      if ((sp.radius ?? 0) === 0 && sp.range === 0) return [c.id];
      return livingCombatants(s, allies ? c.side : c.side === 'hero' ? 'monster' : 'hero').filter((t) => inReach(t, sp.range)).map((t) => t.id);
    }
    return [];
  }

  private overlayFor() {
    const s = this.view.state!;
    const c = currentCombatant(s);
    const mode = this.view.mode;
    if (mode.kind === 'move') return { reach: movableTiles(s, c.id) };
    const ids = this.targetIds(c, mode);
    return { targets: ids.map((id) => getCombatant(s, id)!.pos) };
  }

  private refreshOverlay() {
    const s = this.view.state;
    if (!s || !this.view.isPlayerTurn) return this.scene?.clearOverlay();
    this.scene?.showOverlay(this.overlayFor());
  }

  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  toast(msg: string) {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.update({ toast: msg });
    this.toastTimer = setTimeout(() => this.update({ toast: null }), 2600);
  }

  private bumpStat(k: keyof View['stats'], n = 1) {
    this.view.stats = { ...this.view.stats, [k]: this.view.stats[k] + n };
  }

  // ---------------- rulings + knowledge graph ----------------

  private addCitations(cits: Citation[], context: string) {
    if (!cits.length) return;
    const lit = new Map(this.view.lit);
    const rulings = [...this.view.rulings];
    for (const c of cits) {
      lit.set(c.id, this.litCounter++);
      rulings.unshift({ key: this.seq++, citation: { ...c, title: this.titles[c.id] ?? c.title }, context, round: this.view.state?.round, room: this.view.room?.name });
    }
    this.bumpStat('rulesCited', cits.length);
    this.update({ lit, rulings: rulings.slice(0, 40) });
  }

  private lightIds(ids: string[]) {
    if (!ids.length) return;
    const lit = new Map(this.view.lit);
    ids.forEach((id) => lit.set(id, this.litCounter++));
    this.update({ lit });
  }

  clearFocus() {
    this.update({ focus: null });
  }

  /** Initiative-chip hover: the scene pulses that unit (null clears). No-op if the scene lacks it. */
  highlightUnit(id: string | null) {
    this.sceneX?.highlightUnit?.(id);
  }

  focusDoc(id: string) {
    this.lightIds([id]);
    this.update({ focus: id });
  }

  setSrdVersion(v: SrdVersion) {
    this.update({ srdVersion: v });
  }

  // ---------------- DM agent ----------------

  private say(role: ChatMessage['role'], text: string, extra: Partial<ChatMessage> = {}) {
    const msg: ChatMessage = { id: this.seq++, role, text, ...extra };
    this.update({ chat: [...this.view.chat, msg].slice(-120) });
    return msg.id;
  }

  private patchMsg(id: number, patch: Partial<ChatMessage>) {
    this.update({ chat: this.view.chat.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  }

  /** Dim engine log line in chat, shown immediately so the chat lives without an AI key. */
  private log(text: string) {
    this.say('log', text);
  }

  /** Queue engine events for narration. Flushed at hero-turn start and combat end (see flushBeat). */
  private queueBeat(lines: string[], cited: string[] = []) {
    this.pendingBeat.push(...lines);
    cited.forEach((c) => this.pendingCited.add(c));
  }

  /** Sends pending lines to the DM: one call at a time, at most one per DM_MIN_GAP unless forced. */
  private flushBeat(force = false) {
    if (!this.pendingBeat.length) return;
    if (this.dmInFlight) {
      this.dmWanted = true;
      return;
    }
    const wait = this.lastDmAt + DM_MIN_GAP - Date.now();
    if (!force && wait > 0) {
      if (!this.dmTimer) this.dmTimer = setTimeout(() => { this.dmTimer = null; this.flushBeat(); }, wait);
      return;
    }
    if (this.dmTimer) clearTimeout(this.dmTimer);
    this.dmTimer = null;
    this.lastDmAt = Date.now();
    const events = this.pendingBeat.splice(0).slice(-40);
    const cited = [...this.pendingCited].slice(0, 30);
    this.pendingCited.clear();
    void this.callDm({ mode: 'narrate', events, cited });
  }

  async ask(question: string) {
    const q = question.trim();
    if (!q) return;
    this.say('player', q);
    await this.callDm({ mode: 'ask', question: q, events: [], cited: [] });
  }

  private partySummary() {
    const s = this.view.state;
    if (!s) return { party: [], foes: [] };
    const fmt = (c: Combatant) => `${c.name} (${c.side === 'hero' ? this.content.heroes.find((h) => h.slug === c.refSlug)?.className : 'foe'}) ${c.hp}/${c.maxHp} HP${c.conditions.length ? `, ${c.conditions.map((x) => x.slug).join(', ')}` : ''}${c.dead ? ', down' : ''}`;
    return { party: s.combatants.filter((c) => c.side === 'hero').map(fmt), foes: s.combatants.filter((c) => c.side === 'monster' && !c.dead).map(fmt) };
  }

  private async callDm(req: { mode: 'narrate' | 'ask'; events: string[]; cited: string[]; question?: string }) {
    const isAsk = req.mode === 'ask';
    if (!isAsk) this.dmInFlight = true;
    const msgId = this.say('dm', '', { pending: true });
    this.update({ dmThinking: true });
    try {
      const res = await fetch('/api/dm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...req,
          ...this.partySummary(),
          room: this.view.room ? { name: this.view.room.name, description: this.view.room.description } : undefined,
          srdVersion: this.view.srdVersion,
        }),
      });
      const data = (await res.json()) as DmResponse & { error?: string };
      if (data.error) throw new Error(data.error);
      this.patchMsg(msgId, { text: data.text, lookups: data.lookups, backend: data.backend, pending: false });
      this.lightIds(data.ids);
      if (data.lookups.length) this.bumpStat('lookups', data.lookups.length);
    } catch (err) {
      this.patchMsg(msgId, { text: `*The DM's voice is lost in the dark* (${(err as Error).message})`, pending: false });
    } finally {
      if (!isAsk) this.dmInFlight = false;
      this.update({ dmThinking: false });
      if (!isAsk && this.dmWanted) {
        this.dmWanted = false;
        this.flushBeat();
      }
    }
  }
}

// ---------------- helpers ----------------

function buildTitles(c: GameContent): Record<string, string> {
  const t: Record<string, string> = {};
  c.rules.forEach((r) => (t[r._id] = r.title));
  c.conditions.forEach((r) => (t[r._id] = r.name));
  c.spells.forEach((r) => (t[r._id] = r.name));
  c.monsters.forEach((r) => (t[r._id] = r.name));
  c.heroes.forEach((r) => (t[r._id] = r.name));
  return t;
}

function displayOf(c: Combatant): UnitDisplay {
  return {
    hp: c.hp, maxHp: c.maxHp, dead: c.dead, pos: { ...c.pos },
    conditions: [...c.conditions.map((x) => x.slug), ...(c.dodging ? ['dodging'] : [])],
  };
}

function unitsFrom(s: GameState): Record<string, UnitDisplay> {
  return Object.fromEntries(s.combatants.map((c) => [c.id, displayOf(c)]));
}

/** The engine grid for a level: walls plus pits, crates, lore stones and chests all block. */
function levelGrid(a: ArenaX): Grid {
  const walls = [...a.walls];
  const block = (p: Pos) => { if (p.x >= 0 && p.y >= 0 && p.x < a.width && p.y < a.height) walls[p.y * a.width + p.x] = true; };
  [...(a.pits ?? []), ...(a.crates ?? []), ...a.chests, ...(a.lore ?? []).map((l) => l.pos)].forEach(block);
  if (a.door) block(a.door);
  return { width: a.width, height: a.height, walls };
}

function freeTileNear(arena: ArenaMap, from: Pos, occupied: Set<string>, grid?: Grid): Pos {
  for (let r = 1; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const p = { x: from.x + dx, y: from.y + dy };
        if (p.x < 1 || p.y < 1 || p.x >= arena.width - 1 || p.y >= arena.height - 1) continue;
        if ((grid ?? arena).walls[p.y * arena.width + p.x] || occupied.has(posKey(p))) continue;
        if (arena.heroSpawns.some((h) => h.x === p.x && h.y === p.y)) continue;
        return p;
      }
    }
  }
  return from;
}

function guessStyle(s: GameState, attacker: string, target: string): 'melee' | 'ranged' {
  const a = getCombatant(s, attacker);
  const t = getCombatant(s, target);
  return a && t && distance(a.pos, t.pos) > 1 ? 'ranged' : 'melee';
}

function spellColor(spell?: Spell): number {
  switch (spell?.damageType) {
    case 'fire': return 0xff7a2a;
    case 'cold': return 0x8be0ff;
    case 'radiant': return 0xfff2a0;
    case 'thunder': return 0xb8a0ff;
    case 'force': return 0xd27aff;
    default: return spell?.kind === 'heal' ? 0x6bff9a : spell?.kind === 'buff' ? 0xffe28a : 0xffa040;
  }
}
