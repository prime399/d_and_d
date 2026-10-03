// Pure presentation layer. The controller tells it what to draw; it reports tile clicks back.
import * as Phaser from 'phaser';
import type { ArenaMap } from '../maps';
import type { Pos } from '../engine/types';

export const TILE = 16;

export interface UnitView {
  id: string;
  spriteKey: string;
  side: 'hero' | 'monster';
  pos: Pos;
  hp: number;
  maxHp: number;
  name: string;
  dead: boolean;
  conditions: string[];
}

interface UnitSprite {
  view: UnitView;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Graphics;
  ring: Phaser.GameObjects.Ellipse;
  tag: Phaser.GameObjects.Text;
}

/** Sprite keys with separate idle/run animations; everything else uses a single "<key>_anim". */
const SINGLE_ANIM = new Set(['zombie', 'ice_zombie', 'necromancer', 'swampy', 'muddy', 'slug', 'tiny_slug']);
const FLOOR_VARIANTS = ['floor_1', 'floor_1', 'floor_1', 'floor_1', 'floor_2', 'floor_3', 'floor_4', 'floor_5', 'floor_6', 'floor_7', 'floor_8'];

export class DungeonScene extends Phaser.Scene {
  private arena!: ArenaMap;
  private units = new Map<string, UnitSprite>();
  private overlay!: Phaser.GameObjects.Graphics;
  private hoverGfx!: Phaser.GameObjects.Graphics;
  private mapLayer!: Phaser.GameObjects.Container;
  private activeId: string | null = null;
  private onTileClick: (p: Pos) => void = () => {};
  private onTileHover: (p: Pos | null) => void = () => {};
  private readyResolve!: () => void;
  readonly ready = new Promise<void>((r) => (this.readyResolve = r));

  constructor() {
    super('dungeon');
  }

  preload() {
    this.load.atlas('dungeon', '/assets/sprites/dungeon.png', '/assets/sprites/dungeon.json');
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0710');
    this.createAnimations();
    this.mapLayer = this.add.container(0, 0);
    this.overlay = this.add.graphics().setDepth(5);
    this.hoverGfx = this.add.graphics().setDepth(6);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const t = this.worldToTile(p.worldX, p.worldY);
      if (t) this.onTileClick(t);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const t = this.worldToTile(p.worldX, p.worldY);
      this.hoverGfx.clear();
      if (t) {
        this.hoverGfx.lineStyle(1, 0xffe9a8, 0.9).strokeRect(t.x * TILE + 0.5, t.y * TILE + 0.5, TILE - 1, TILE - 1);
      }
      this.onTileHover(t);
    });
    this.scale.on('resize', () => this.fitCamera());
    this.readyResolve();
  }

  setHandlers(click: (p: Pos) => void, hover: (p: Pos | null) => void) {
    this.onTileClick = click;
    this.onTileHover = hover;
  }

  private worldToTile(wx: number, wy: number): Pos | null {
    if (!this.arena) return null;
    const x = Math.floor(wx / TILE);
    const y = Math.floor(wy / TILE);
    if (x < 0 || y < 0 || x >= this.arena.width || y >= this.arena.height) return null;
    return { x, y };
  }

  private createAnimations() {
    const frames = this.textures.get('dungeon').getFrameNames();
    const has = (n: string) => frames.includes(n);
    const make = (key: string, prefix: string, rate = 8) => {
      if (this.anims.exists(key)) return;
      const list = [0, 1, 2, 3].map((i) => `${prefix}_f${i}`).filter(has);
      if (!list.length) return;
      this.anims.create({ key, frames: list.map((frame) => ({ key: 'dungeon', frame })), frameRate: rate, repeat: -1 });
    };
    const bases = new Set(frames.map((f) => f.replace(/_(idle|run|hit)_anim_f\d$|_anim_f\d$/, '')));
    bases.forEach((b) => {
      if (SINGLE_ANIM.has(b)) {
        make(`${b}-idle`, `${b}_anim`);
        make(`${b}-run`, `${b}_anim`, 14);
      } else {
        make(`${b}-idle`, `${b}_idle_anim`);
        make(`${b}-run`, `${b}_run_anim`, 14);
      }
    });
    make('spikes', 'floor_spikes_anim', 4);
    make('fountain-red', 'wall_fountain_mid_red_anim', 6);
    make('basin-red', 'wall_fountain_basin_red_anim', 6);
    make('coin', 'coin_anim', 10);
  }

  /** Draw a fresh room. */
  loadArena(arena: ArenaMap) {
    this.arena = arena;
    this.mapLayer.removeAll(true);
    this.units.forEach((u) => u.container.destroy());
    this.units.clear();
    this.overlay.clear();

    const add = (frame: string, x: number, y: number, depth = 0) => {
      const img = this.add.image(x * TILE, y * TILE, 'dungeon', frame).setOrigin(0, 0).setDepth(depth);
      this.mapLayer.add(img);
      return img;
    };
    // deterministic floor noise
    let seed = arena.width * 31 + arena.rows.join('').length;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

    for (let y = 0; y < arena.height; y++) {
      for (let x = 0; x < arena.width; x++) {
        const ch = arena.rows[y][x];
        const below = arena.rows[y + 1]?.[x];
        if (ch !== '#' && ch !== 'D') {
          add(FLOOR_VARIANTS[Math.floor(rand() * FLOOR_VARIANTS.length)], x, y);
          continue;
        }
        // wall: front face if there's floor below, otherwise wall top
        const floorBelow = below !== undefined && below !== '#' && below !== 'D';
        if (ch === 'D') {
          add('wall_mid', x, y);
          add('doors_leaf_closed', x, y - 1).setOrigin(0, 0).setDisplaySize(TILE * 2, TILE * 2).setPosition((x - 0.5) * TILE, (y - 1) * TILE + 2);
          continue;
        }
        if (floorBelow) {
          add('wall_mid', x, y);
          add('wall_top_mid', x, y - 1, 1);
        } else if (y === arena.height - 1 || !arena.rows[y - 1] || arena.rows[y - 1][x] !== '#') {
          add('wall_top_mid', x, y, 1);
        } else {
          // interior solid block
          const r = this.add.rectangle(x * TILE, y * TILE, TILE, TILE, 0x14101c).setOrigin(0, 0);
          this.mapLayer.add(r);
        }
      }
    }
    arena.decor.forEach((d) => {
      if (d.kind === 'pillar') {
        const img = this.add.image(d.pos.x * TILE, (d.pos.y + 1) * TILE, 'dungeon', 'column').setOrigin(0, 1).setDepth(2 + d.pos.y * 0.01);
        this.mapLayer.add(img);
      } else if (d.kind === 'spikes') {
        const s = this.add.sprite(d.pos.x * TILE, d.pos.y * TILE, 'dungeon', 'floor_spikes_anim_f0').setOrigin(0, 0).play('spikes');
        this.mapLayer.add(s);
      } else if (d.kind === 'banner') {
        add('wall_banner_red', d.pos.x, d.pos.y + 1, 1);
      } else if (d.kind === 'fountain') {
        add('wall_fountain_top_1', d.pos.x, d.pos.y, 1);
        const m = this.add.sprite(d.pos.x * TILE, (d.pos.y + 1) * TILE, 'dungeon', 'wall_fountain_mid_red_anim_f0').setOrigin(0, 0).play('fountain-red');
        this.mapLayer.add(m);
      }
    });
    arena.chests.forEach((c) => {
      const img = this.add.image(c.x * TILE, c.y * TILE, 'dungeon', 'chest_full_open_anim_f0').setOrigin(0, 0).setDepth(2);
      img.setName(`chest-${c.x}-${c.y}`);
      this.mapLayer.add(img);
    });
    // soft vignette torch-light
    const glow = this.add.graphics().setDepth(20);
    glow.fillStyle(0x000000, 0.35);
    glow.fillRect(0, 0, arena.width * TILE, TILE);
    this.mapLayer.add(glow);

    this.fitCamera();
    this.cameras.main.fadeIn(500, 0, 0, 0);
  }

  openChest(p: Pos) {
    const img = this.mapLayer.getByName(`chest-${p.x}-${p.y}`) as Phaser.GameObjects.Image | null;
    img?.setFrame('chest_empty_open_anim_f2');
  }

  openDoor() {
    const d = this.arena?.door;
    if (!d) return;
    const flash = this.add.rectangle((d.x + 0.5) * TILE, (d.y - 0.5) * TILE, TILE * 2, TILE * 2, 0xffe08a, 0.5).setDepth(30);
    this.tweens.add({ targets: flash, alpha: 0, scale: 2, duration: 900, onComplete: () => flash.destroy() });
    this.mapLayer.list.forEach((o) => {
      const img = o as Phaser.GameObjects.Image;
      if (img.frame?.name === 'doors_leaf_closed') img.setFrame('doors_leaf_open');
    });
  }

  private fitCamera() {
    if (!this.arena) return;
    const cam = this.cameras.main;
    const w = this.arena.width * TILE;
    const h = (this.arena.height + 1) * TILE;
    const zoom = Math.max(1, Math.floor(Math.min(this.scale.width / w, this.scale.height / h) * 4) / 4);
    cam.setZoom(zoom);
    cam.centerOn(w / 2, h / 2 - TILE / 2);
    cam.roundPixels = true;
  }

  // ---------- units ----------

  setUnits(views: UnitView[]) {
    const seen = new Set<string>();
    views.forEach((v) => {
      seen.add(v.id);
      const u = this.units.get(v.id) ?? this.createUnit(v);
      u.view = v;
      if (!this.tweens.isTweening(u.container)) {
        u.container.setPosition((v.pos.x + 0.5) * TILE, (v.pos.y + 1) * TILE);
      }
      u.container.setDepth(10 + v.pos.y);
      this.drawHp(u);
      u.tag.setText(conditionGlyphs(v.conditions));
      if (v.dead && u.container.alpha === 1 && !u.container.getData('dying')) this.killAnim(u);
    });
    this.units.forEach((u, id) => {
      if (!seen.has(id)) {
        u.container.destroy();
        this.units.delete(id);
      }
    });
    this.refreshRing();
  }

  private createUnit(v: UnitView): UnitSprite {
    const anim = `${v.spriteKey}-idle`;
    const body = this.add.sprite(0, 0, 'dungeon').setOrigin(0.5, 1);
    if (this.anims.exists(anim)) body.play({ key: anim, startFrame: Math.floor(Math.random() * 4) });
    if (v.side === 'monster') body.setFlipX(true);
    const ring = this.add.ellipse(0, -1, 14, 6, v.side === 'hero' ? 0x5ad1ff : 0xff5a5a, 0.0).setStrokeStyle(1, v.side === 'hero' ? 0x5ad1ff : 0xff5a5a, 0.8);
    const hpBar = this.add.graphics();
    const tag = this.add
      .text(0, -body.height - 9, '', { fontFamily: 'monospace', fontSize: '7px', color: '#fff', stroke: '#000', strokeThickness: 2, resolution: 4 })
      .setOrigin(0.5, 1);
    const container = this.add.container(0, 0, [ring, body, hpBar, tag]);
    const u: UnitSprite = { view: v, container, body, hpBar, ring, tag };
    this.units.set(v.id, u);
    container.setPosition((v.pos.x + 0.5) * TILE, (v.pos.y + 1) * TILE);
    return u;
  }

  private drawHp(u: UnitSprite) {
    const g = u.hpBar;
    g.clear();
    if (u.view.dead) return;
    const w = 14;
    const y = -u.body.height - 4;
    const pct = Math.max(0, u.view.hp / u.view.maxHp);
    g.fillStyle(0x000000, 0.7).fillRect(-w / 2 - 1, y - 1, w + 2, 4);
    g.fillStyle(pct > 0.5 ? 0x4ade80 : pct > 0.25 ? 0xfacc15 : 0xef4444, 1).fillRect(-w / 2, y, w * pct, 2);
  }

  setActive(id: string | null) {
    this.activeId = id;
    this.refreshRing();
  }

  private refreshRing() {
    this.units.forEach((u, id) => {
      const on = id === this.activeId && !u.view.dead;
      u.ring.setFillStyle(u.view.side === 'hero' ? 0x5ad1ff : 0xff5a5a, on ? 0.35 : 0);
      u.ring.setStrokeStyle(1, u.view.side === 'hero' ? 0x5ad1ff : 0xff5a5a, on ? 1 : u.view.dead ? 0 : 0.35);
    });
  }

  /** Walk a unit along a path, tile by tile. */
  async moveAlong(id: string, path: Pos[]) {
    const u = this.units.get(id);
    if (!u || !path.length) return;
    const runKey = `${u.view.spriteKey}-run`;
    if (this.anims.exists(runKey)) u.body.play(runKey);
    for (const p of path) {
      const tx = (p.x + 0.5) * TILE;
      if (tx !== u.container.x) u.body.setFlipX(tx < u.container.x);
      await new Promise<void>((resolve) =>
        this.tweens.add({ targets: u.container, x: tx, y: (p.y + 1) * TILE, duration: 110, onComplete: () => resolve() }),
      );
      u.container.setDepth(10 + p.y);
    }
    const idleKey = `${u.view.spriteKey}-idle`;
    if (this.anims.exists(idleKey)) u.body.play(idleKey);
  }

  /** Lunge toward target (melee) or fire a bolt (ranged/spell). */
  async attackAnim(attackerId: string, targetId: string, style: 'melee' | 'ranged' | 'spell', color = 0xffa040) {
    const a = this.units.get(attackerId);
    const t = this.units.get(targetId);
    if (!a || !t) return;
    a.body.setFlipX(t.container.x < a.container.x);
    if (style === 'melee') {
      const dx = (t.container.x - a.container.x) * 0.4;
      const dy = (t.container.y - a.container.y) * 0.4;
      await new Promise<void>((r) =>
        this.tweens.add({ targets: a.container, x: a.container.x + dx, y: a.container.y + dy, duration: 90, yoyo: true, ease: 'Quad.easeOut', onComplete: () => r() }),
      );
    } else {
      const bolt = this.add.circle(a.container.x, a.container.y - 10, style === 'spell' ? 3 : 1.5, color).setDepth(40);
      const trail = this.add.particles(0, 0, 'dungeon', {
        frame: 'coin_anim_f0', follow: bolt, lifespan: 250, scale: { start: 0.6, end: 0 }, alpha: { start: 0.8, end: 0 }, tint: color, frequency: 15, blendMode: 'ADD',
      }).setDepth(39);
      await new Promise<void>((r) =>
        this.tweens.add({ targets: bolt, x: t.container.x, y: t.container.y - 10, duration: 260, ease: 'Quad.easeIn', onComplete: () => r() }),
      );
      bolt.destroy();
      this.time.delayedCall(260, () => trail.destroy());
    }
  }

  burst(at: Pos, radius: number, color: number) {
    const c = this.add.circle((at.x + 0.5) * TILE, (at.y + 0.5) * TILE, 4, color, 0.6).setDepth(41).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: c, radius: (radius + 0.5) * TILE, alpha: 0, duration: 450, onComplete: () => c.destroy() });
    this.cameras.main.shake(160, 0.004);
  }

  hitFx(targetId: string, amount: number, crit: boolean, kind: 'damage' | 'heal' | 'miss') {
    const u = this.units.get(targetId);
    if (!u) return;
    const color = kind === 'heal' ? '#4ade80' : kind === 'miss' ? '#cbd5e1' : crit ? '#ffd23f' : '#ff4d4d';
    const label = kind === 'miss' ? 'MISS' : `${kind === 'heal' ? '+' : '-'}${amount}${crit ? '!' : ''}`;
    const txt = this.add
      .text(u.container.x, u.container.y - u.body.height - 6, label, {
        fontFamily: 'monospace', fontSize: crit ? '11px' : '8px', color, stroke: '#000', strokeThickness: 3, fontStyle: 'bold', resolution: 4,
      })
      .setOrigin(0.5)
      .setDepth(50);
    this.tweens.add({ targets: txt, y: txt.y - 14, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => txt.destroy() });
    if (kind === 'damage') {
      u.body.setTint(0xff3030).setTintMode(Phaser.TintModes.FILL);
      this.time.delayedCall(120, () => u.body.clearTint());
      this.tweens.add({ targets: u.body, x: { from: -1.5, to: 1.5 }, duration: 40, yoyo: true, repeat: 2, onComplete: () => u.body.setX(0) });
      if (crit) this.cameras.main.shake(200, 0.008);
    } else if (kind === 'heal') {
      u.body.setTint(0x6bff9a).setTintMode(Phaser.TintModes.FILL);
      this.time.delayedCall(160, () => u.body.clearTint());
    }
  }

  private killAnim(u: UnitSprite) {
    u.container.setData('dying', true);
    u.body.stop();
    this.tweens.add({ targets: u.body, angle: u.view.side === 'monster' ? 90 : -90, y: -2, duration: 300 });
    this.tweens.add({ targets: u.container, alpha: 0.25, duration: 600, delay: 300 });
    u.hpBar.clear();
    u.tag.setText('');
    const skull = this.add.image(u.container.x, u.container.y - 8, 'dungeon', 'skull').setDepth(9).setAlpha(0);
    this.tweens.add({ targets: skull, alpha: 0.9, duration: 400, delay: 500 });
    this.mapLayer.add(skull);
  }

  // ---------- overlays ----------

  showOverlay(opts: { reach?: Pos[]; targets?: Pos[]; aoe?: Pos[]; path?: Pos[] }) {
    const g = this.overlay;
    g.clear();
    opts.reach?.forEach((p) => g.fillStyle(0x5ad1ff, 0.16).fillRect(p.x * TILE, p.y * TILE, TILE, TILE));
    opts.path?.forEach((p) => g.fillStyle(0x5ad1ff, 0.35).fillRect(p.x * TILE + 5, p.y * TILE + 5, TILE - 10, TILE - 10));
    opts.targets?.forEach((p) => g.lineStyle(1, 0xff5a5a, 1).strokeRect(p.x * TILE + 1, p.y * TILE + 1, TILE - 2, TILE - 2));
    opts.aoe?.forEach((p) => g.fillStyle(0xff8a3d, 0.3).fillRect(p.x * TILE, p.y * TILE, TILE, TILE));
  }

  clearOverlay() {
    this.overlay.clear();
  }

  fadeOut(): Promise<void> {
    return new Promise((r) => {
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => r());
    });
  }
}

const GLYPH: Record<string, string> = {
  prone: '⤓', paralyzed: '✱', poisoned: '☠', restrained: '⛓', grappled: '✊', frightened: '!', blessed: '✚',
  stunned: '✷', unconscious: 'z', blinded: '◌', invisible: '◇', dodging: '⛨', incapacitated: '×', charmed: '♥',
};
function conditionGlyphs(list: string[]) {
  return list.map((c) => GLYPH[c] ?? '•').join('');
}
