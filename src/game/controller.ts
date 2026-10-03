// Orchestrates the rules engine, the Phaser scene, audio, dice and the DM agent.
// React reads `view` via subscribe(); the scene is purely presentational.
import {
  attack, castSpell, createCombat, currentCombatant, distance, dodge, endTurn, getCombatant, hasLineOfSight,
  livingCombatants, movableTiles, move, mulberry32, runMonsterTurn, syncHeroFromCombatant, tilesInRadius, usePotion,
  findPath, posKey, effectiveSpeed, isIncapacitated,
  type ActionResult, type Combatant, type GameEvent, type GameState, type HeroProgress, type Pos, type Rng,
} from './engine';
import type { Citation, GameContent, Room, Spell, SrdVersion } from './content/types';
import { getArena, type ArenaMap } from './maps';
import type { DungeonScene, UnitView } from './scenes/DungeonScene';
import { audio } from './audio';
import type { DiceShow } from '@/components/DiceOverlay';
import type { DmLookup, DmResponse } from '@/app/api/dm/route';

export type Phase = 'title' | 'playing' | 'room-cleared' | 'victory' | 'defeat';
export type Mode = { kind: 'move' } | { kind: 'attack'; index: number } | { kind: 'spell'; slug: string };

export interface ChatMessage {
  id: number;
  role: 'dm' | 'player' | 'system';
  text: string;
  lookups?: DmLookup[];
  backend?: DmResponse['backend'];
  pending?: boolean;
}

export interface Ruling {
  key: number;
  citation: Citation;
  context: string;
}

export interface HoverInfo {
  pos: Pos;
  unit?: { name: string; hp: number; maxHp: number; ac: number; conditions: string[]; side: 'hero' | 'monster'; refSlug: string };
  hint?: string;
}

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
  private seq = 1;
  private litCounter = 1;
  private titles: Record<string, string>;

  constructor(readonly content: GameContent) {
    this.rooms = [...content.rooms].sort((a, b) => a.order - b.order);
    this.titles = buildTitles(content);
    this.view = {
      phase: 'title', roomIndex: 0, roomCount: this.rooms.length, room: null, state: null, activeId: null,
      isPlayerTurn: false, busy: false, mode: { kind: 'move' }, chat: [], rulings: [], lit: new Map(), focus: null,
      dice: null, hover: null, toast: null, srdVersion: '2024', dmThinking: false,
      stats: { rolls: 0, crits: 0, kills: 0, rulesCited: 0, lookups: 0 },
    };
  }

  // ---------------- plumbing ----------------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private update(patch: Partial<View> = {}) {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((l) => l());
  }

  titleOf(id: string) {
    return this.titles[id] ?? id;
  }

  get titleMap() {
    return this.titles;
  }

  attachScene(scene: DungeonScene) {
    this.scene = scene;
    scene.setHandlers((p) => void this.onTileClick(p), (p) => this.onTileHover(p));
  }

  // ---------------- flow ----------------

  async start() {
    audio.unlock();
    audio.blip('door');
    this.progress = {};
    this.openedChests.clear();
    this.update({
      phase: 'playing', roomIndex: 0, chat: [], rulings: [], lit: new Map(),
      stats: { rolls: 0, crits: 0, kills: 0, rulesCited: 0, lookups: 0 },
    });
    this.say('system', 'Your party descends into the Goblin Warren…');
    await this.enterRoom(0);
  }

  async enterRoom(index: number) {
    const room = this.rooms[index];
    if (!room || !this.scene) return;
    const arena = getArena(room.order);
    this.arena = arena;
    const bySlug = new Map(this.content.monsters.map((m) => [m.slug, m]));
    const occupied = new Set<string>();
    const monsters: { monster: GameContent['monsters'][number]; pos: Pos }[] = [];
    let spawnIdx = 0;
    for (const g of room.encounter) {
      const m = bySlug.get(g.monster);
      if (!m) continue;
      for (let i = 0; i < g.count; i++) {
        let pos = arena.monsterSpawns[spawnIdx++];
        if (!pos || occupied.has(posKey(pos))) pos = freeTileNear(arena, arena.monsterSpawns[0] ?? { x: 10, y: 2 }, occupied);
        occupied.add(posKey(pos));
        monsters.push({ monster: m, pos });
      }
    }
    // Fallen heroes are stabilised between rooms at 1 HP.
    for (const p of Object.values(this.progress)) if (p.hp <= 0) p.hp = 1;
    this.roomStartProgress = structuredClone(this.progress);

    const grid = { width: arena.width, height: arena.height, walls: [...arena.walls] };
    const state = createCombat(
      this.content.heroes, monsters, arena.heroSpawns, grid,
      { spells: this.content.spells, conditions: this.content.conditions }, this.rng,
      Object.keys(this.progress).length ? this.progress : undefined,
    );

    this.scene.loadArena(arena);
    this.update({ room, roomIndex: index, state, phase: 'playing', mode: { kind: 'move' }, focus: null });
    this.syncUnits();
    audio.play(room.isBoss ? 'boss' : index === 0 ? 'combat' : index % 2 ? 'explore' : 'combat');

    this.say('system', `Room ${index + 1} of ${this.rooms.length}: ${room.name}`);
    this.addCitations(state.citations, 'Initiative is rolled');
    const order = state.order.map((id) => getCombatant(state, id)!).map((c) => `${c.name} ${c.initiative}`).join(', ');
    this.queueBeat([`The party enters ${room.name}.`, `Initiative order: ${order}.`], [], true);
    await sleep(600);
    await this.runTurns();
  }

  async nextRoom() {
    audio.blip('door');
    await this.scene?.fadeOut();
    await this.enterRoom(this.view.roomIndex + 1);
  }

  async retryRoom() {
    this.progress = structuredClone(this.roomStartProgress);
    await this.scene?.fadeOut();
    await this.enterRoom(this.view.roomIndex);
  }

  restart() {
    this.update({ phase: 'title' });
    audio.play('title');
  }

  /** Runs monster turns until it's a hero's turn or combat ends. */
  private async runTurns() {
    const state = this.view.state;
    if (!state) return;
    while (state.status === 'active') {
      const cur = currentCombatant(state);
      this.scene?.setActive(cur.id);
      if (cur.side === 'hero') {
        if (isIncapacitated(cur)) {
          this.toast(`${cur.name} is ${cur.conditions.map((c) => c.slug).join(', ')} and loses the turn.`);
          await sleep(900);
          const r = endTurn(state);
          await this.play(r);
          continue;
        }
        this.update({ activeId: cur.id, isPlayerTurn: true, busy: false, mode: { kind: 'move' } });
        this.refreshOverlay();
        return;
      }
      this.update({ activeId: cur.id, isPlayerTurn: false, busy: true });
      this.scene?.clearOverlay();
      await sleep(350);
      const results = runMonsterTurn(state, cur.id, this.rng);
      for (const r of results) await this.play(r);
    }
    await this.onCombatEnd();
  }

  private async onCombatEnd() {
    const state = this.view.state!;
    state.combatants.filter((c) => c.side === 'hero').forEach((c) => (this.progress[c.refSlug] = syncHeroFromCombatant(c)));
    this.scene?.clearOverlay();
    if (state.status === 'victory') {
      const last = this.view.roomIndex >= this.rooms.length - 1;
      // short rest: each hero recovers a third of their HP
      state.combatants.filter((c) => c.side === 'hero' && !c.dead).forEach((c) => {
        const p = this.progress[c.refSlug];
        p.hp = Math.min(c.maxHp, p.hp + Math.ceil(c.maxHp / 3));
      });
      this.flushBeat(true);
      if (last) {
        audio.play('victory');
        this.update({ phase: 'victory', busy: false, isPlayerTurn: false });
      } else {
        this.scene?.openDoor();
        audio.blip('chest');
        this.update({ phase: 'room-cleared', busy: false, isPlayerTurn: false });
      }
    } else {
      this.flushBeat(true);
      this.update({ phase: 'defeat', busy: false, isPlayerTurn: false });
    }
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
      return this.doAction(() => attack(s, c.id, unit.id, mode.index, this.rng), { attacker: c.id, target: unit.id, style: atk.range > 1 ? 'ranged' : 'melee' });
    }
    if (mode.kind === 'spell') {
      const spell = s.spells[mode.slug];
      if (!spell) return;
      const target = (spell.radius ?? 0) > 0 ? p : unit?.id;
      if (!target) return this.toast(`Pick a creature for ${spell.name}.`);
      return this.doAction(() => castSpell(s, c.id, spell.slug, target, this.rng), {
        attacker: c.id, target: typeof target === 'string' ? target : undefined, at: p, spell,
      });
    }
  }

  onTileHover(p: Pos | null) {
    const s = this.view.state;
    if (!p || !s) {
      if (this.view.hover) this.update({ hover: null });
      return;
    }
    const u = s.combatants.find((x) => !x.dead && x.pos.x === p.x && x.pos.y === p.y);
    const hover: HoverInfo = { pos: p };
    if (u) hover.unit = { name: u.name, hp: u.hp, maxHp: u.maxHp, ac: u.ac, conditions: u.conditions.map((x) => x.slug), side: u.side, refSlug: u.refSlug };
    if (this.view.mode.kind === 'spell' && this.view.isPlayerTurn) {
      const spell = s.spells[this.view.mode.slug];
      if (spell && (spell.radius ?? 0) > 0) this.scene?.showOverlay({ ...this.overlayFor(), aoe: tilesInRadius(s.grid, p, spell.radius!) });
    } else if (this.view.mode.kind === 'move' && this.view.isPlayerTurn && !u) {
      const c = currentCombatant(s);
      const reach = movableTiles(s, c.id);
      if (reach.some((r) => r.x === p.x && r.y === p.y)) {
        const occ = new Set(s.combatants.filter((x) => !x.dead && x.id !== c.id).map((x) => posKey(x.pos)));
        const path = findPath(s.grid, c.pos, p, occ) ?? [];
        this.scene?.showOverlay({ ...this.overlayFor(), path });
      }
    }
    if (hover.unit?.name !== this.view.hover?.unit?.name || hover.unit?.hp !== this.view.hover?.unit?.hp) this.update({ hover });
  }

  async dodge() {
    const c = this.actor();
    if (c && this.view.state) await this.doAction(() => dodge(this.view.state!, c.id, this.rng));
  }

  async potion() {
    const c = this.actor();
    if (c && this.view.state) await this.doAction(() => usePotion(this.view.state!, c.id, this.rng), { target: c.id });
  }

  async endTurn() {
    const c = this.actor();
    const s = this.view.state;
    if (!c || !s) return;
    audio.blip('ui');
    this.update({ busy: true, isPlayerTurn: false });
    this.scene?.clearOverlay();
    await this.play(endTurn(s, this.rng));
    await this.runTurns();
  }

  private async doAction(
    fn: () => ActionResult,
    fx?: { attacker?: string; target?: string; at?: Pos; style?: 'melee' | 'ranged'; spell?: Spell },
  ) {
    const s = this.view.state;
    if (!s) return;
    const r = fn();
    if (!r.ok) {
      if (r.citations.length) this.addCitations(r.citations, r.error ?? '');
      return this.toast(r.error ?? 'Not allowed');
    }
    this.update({ busy: true });
    this.scene?.clearOverlay();
    await this.play(r, fx);
    if (s.status !== 'active') {
      this.update({ busy: false });
      return this.onCombatEnd();
    }
    const c = currentCombatant(s);
    // auto-end the turn once nothing useful is left
    const canMove = effectiveSpeed(c) - (c.movedThisTurn ?? 0) > 0;
    this.update({ busy: false, mode: { kind: 'move' } });
    if (c.actedThisTurn && !canMove) {
      await sleep(350);
      return this.endTurn();
    }
    this.refreshOverlay();
  }

  // ---------------- event playback ----------------

  private async play(r: ActionResult, fx?: { attacker?: string; target?: string; at?: Pos; style?: 'melee' | 'ranged'; spell?: Spell }) {
    const s = this.view.state!;
    const ev = r.events;
    const lines: string[] = [];
    let lastCrit = false;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      switch (e.type) {
        case 'move': {
          const path: Pos[] = [e.to];
          while (ev[i + 1]?.type === 'move' && (ev[i + 1] as Extract<GameEvent, { type: 'move' }>).who === e.who) {
            path.push((ev[++i] as Extract<GameEvent, { type: 'move' }>).to);
          }
          await this.scene?.moveAlong(e.who, path);
          this.syncUnits();
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
          }, isD20 ? 1150 : 750);
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
              if (spell.range > 0 && fx.attacker) await this.scene?.attackAnim(fx.attacker, fx.attacker, 'spell');
              this.scene?.burst(fx.at, spell.radius!, spellColor(spell));
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
          this.syncUnits();
          lines.push(`${this.nameOf(e.target)} takes ${e.amount} ${e.damageType} damage (${e.hpLeft} HP left).`);
          await sleep(250);
          break;
        case 'heal':
          this.scene?.hitFx(e.target, e.amount, false, 'heal');
          audio.blip('heal');
          this.syncUnits();
          lines.push(`${this.nameOf(e.target)} regains ${e.amount} HP (${e.hpLeft} HP).`);
          await sleep(250);
          break;
        case 'save':
          lines.push(`${this.nameOf(e.target)} makes a ${e.ability.toUpperCase()} save: ${e.total} vs DC ${e.dc}, ${e.success ? 'success' : 'failure'}.`);
          break;
        case 'condition': {
          const name = this.titleOf(`condition.${e.slug}`);
          this.syncUnits();
          if (e.applied) this.toast(`${this.nameOf(e.target)} is ${name}!`);
          lines.push(`${this.nameOf(e.target)} ${e.applied ? 'is now' : 'is no longer'} ${name}.`);
          break;
        }
        case 'death': {
          const c = getCombatant(s, e.target);
          if (c?.side === 'monster') this.bumpStat('kills');
          audio.blip('death');
          this.syncUnits();
          lines.push(`${this.nameOf(e.target)} ${c?.side === 'hero' ? 'falls unconscious, out of the fight' : 'is slain'}.`);
          await sleep(300);
          break;
        }
        case 'turn':
          this.scene?.setActive(e.who);
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
    this.syncUnits();
    if (r.citations.length) this.addCitations(r.citations, lines.find((l) => !l.endsWith('moves.')) ?? lines[0] ?? '');
    const meaningful = lines.filter((l) => !l.endsWith('moves.'));
    if (meaningful.length) this.queueBeat(lines.filter((l, i, a) => !l.endsWith('moves.') || a[i + 1] === undefined), r.citations.map((c) => c.id));
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

  private syncUnits() {
    const s = this.view.state;
    if (!s || !this.scene) return;
    const views: UnitView[] = s.combatants.map((c) => ({
      id: c.id, spriteKey: c.spriteKey, side: c.side, pos: c.pos, hp: c.hp, maxHp: c.maxHp, name: c.name, dead: c.dead,
      conditions: [...c.conditions.map((x) => x.slug), ...(c.dodging ? ['dodging'] : [])],
    }));
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
      return livingCombatants(s, allies ? 'hero' : 'monster').filter((t) => inReach(t, Math.max(1, sp.range))).map((t) => t.id);
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
      rulings.unshift({ key: this.seq++, citation: { ...c, title: this.titles[c.id] ?? c.title }, context });
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
    this.update({ chat: [...this.view.chat, msg].slice(-80) });
    return msg.id;
  }

  private patchMsg(id: number, patch: Partial<ChatMessage>) {
    this.update({ chat: this.view.chat.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  }

  /** Queue engine events for narration; batches while a DM request is in flight. */
  private queueBeat(lines: string[], cited: string[] = [], immediate = false) {
    this.pendingBeat.push(...lines);
    cited.forEach((c) => this.pendingCited.add(c));
    if (immediate || !this.dmInFlight) this.flushBeat();
  }

  private flushBeat(force = false) {
    if ((this.dmInFlight && !force) || !this.pendingBeat.length) return;
    const events = this.pendingBeat.splice(0).slice(-40);
    const cited = [...this.pendingCited];
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
      if (!isAsk) this.flushBeat();
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

function freeTileNear(arena: ArenaMap, from: Pos, occupied: Set<string>): Pos {
  for (let r = 1; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const p = { x: from.x + dx, y: from.y + dy };
        if (p.x < 1 || p.y < 1 || p.x >= arena.width - 1 || p.y >= arena.height - 1) continue;
        if (arena.walls[p.y * arena.width + p.x] || occupied.has(posKey(p))) continue;
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
