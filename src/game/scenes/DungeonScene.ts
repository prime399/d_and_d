// Pure presentation layer. The controller tells it what to draw; it reports tile clicks back.
import * as Phaser from 'phaser';
import type { ArenaMap } from '../maps';
import type { Pos } from '../engine/types';
import { buildSceneTextures, iconFrame, ICON_SIZE } from './sceneTextures';

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
  /** World-space body: shadow, ring and sprite. Sits under the darkness layer. */
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Sprite;
  ring: Phaser.GameObjects.Ellipse;
  /** Readable chrome (HP, conditions, name, arrow). Follows the body above the darkness. */
  hud: Phaser.GameObjects.Container;
  hpBar: Phaser.GameObjects.Graphics;
  icons: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  arrow: Phaser.GameObjects.Image;
  hpShown: number;
  iconKey: string;
}

interface Light {
  x: number;
  y: number;
  radius: number; // in tiles
  strength: number; // 0..1 how much darkness it removes
  flicker: number; // 0..1
  phase: number;
  glow?: Phaser.GameObjects.Image;
  glowAlpha?: number;
}

type OverlayOpts = { reach?: Pos[]; targets?: Pos[]; aoe?: Pos[]; path?: Pos[] };

/** Sprite keys with a single "<key>_anim"; everything else has separate idle/run animations. */
const SINGLE_ANIM = new Set(['zombie', 'ice_zombie', 'necromancer', 'swampy', 'muddy', 'slug', 'tiny_slug']);
const FLOOR_CRACKS = ['floor_2', 'floor_3', 'floor_4', 'floor_5', 'floor_6', 'floor_7', 'floor_8'];

// Depth bands.
const D = {
  floor: 0, floorShade: 1, wall: 2, wallDecor: 3, cap: 4, unit: 10, darkness: 100, glow: 101, dust: 102,
  overlay: 103, hover: 104, hud: 106, fx: 110, text: 120, title: 200,
} as const;

const AMBIENT = 0.42; // darkness alpha outside any light
const HERO_BLUE = 0x5ad1ff;
const ENEMY_ROSE = 0xff5a6e;
const AMBER = 0xffd27a;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function cssFont(varName: string, fallback: string) {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

function roman(n: number) {
  const map: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of map) while (n >= v) { s += r; n -= v; }
  return s;
}

export class DungeonScene extends Phaser.Scene {
  private arena!: ArenaMap;
  private units = new Map<string, UnitSprite>();
  private overlay!: Phaser.GameObjects.Graphics;
  private overlayOpts: OverlayOpts | null = null;
  private hoverGfx!: Phaser.GameObjects.Graphics;
  private hoverTile: Pos | null = null;
  private mapLayer!: Phaser.GameObjects.Container;
  private fxLayer: Phaser.GameObjects.GameObject[] = [];
  private darkness!: Phaser.GameObjects.RenderTexture;
  private torchLights: Light[] = [];
  private dust?: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private activeId: string | null = null;
  private hoverUnitId: string | null = null;
  private lastAttacker: string | null = null;
  private baseZoom = 1;
  private baseCenter = { x: 0, y: 0 };
  private bounds = { x: 0, y: 0, w: 0, h: 0 };
  private pixelFont = 'monospace';
  private titleFont = 'serif';
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
    this.cameras.main.roundPixels = true;
    buildSceneTextures(this);
    this.createAnimations();
    this.pixelFont = cssFont('--font-pixelify', 'monospace');
    this.titleFont = cssFont('--font-medieval', 'Georgia, serif');
    // Make sure canvas text can use the web fonts once they arrive.
    void document.fonts?.ready.then(() => {
      this.pixelFont = cssFont('--font-pixelify', 'monospace');
      this.titleFont = cssFont('--font-medieval', 'Georgia, serif');
      this.units.forEach((u) => u.label.setFontFamily(this.pixelFont));
    });

    this.mapLayer = this.add.container(0, 0);
    this.overlay = this.add.graphics().setDepth(D.overlay);
    this.hoverGfx = this.add.graphics().setDepth(D.hover);
    this.darkness = this.add.renderTexture(0, 0, 8, 8).setOrigin(0, 0).setDepth(D.darkness);

    // Shared one-shot spark emitter for hits, deaths, heals and dust bursts.
    this.sparks = this.add.particles(0, 0, 'fx', {
      frame: 'px2', emitting: false, lifespan: { min: 300, max: 650 }, speed: { min: 20, max: 70 },
      scale: { start: 1, end: 0 }, alpha: { start: 1, end: 0 }, gravityY: 60,
    }).setDepth(D.fx);

    try {
      // Screen-space vignette for mood. Optional: skipped if filters are unavailable.
      this.cameras.main.filters?.external.addVignette(0.5, 0.5, 0.9, 0.45, 0x05020a);
    } catch {
      /* no-op */
    }

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const t = this.worldToTile(p.worldX, p.worldY);
      if (t) this.onTileClick(t);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const t = this.worldToTile(p.worldX, p.worldY);
      if (t?.x !== this.hoverTile?.x || t?.y !== this.hoverTile?.y) {
        this.hoverTile = t;
        this.updateHoverUnit();
        this.onTileHover(t);
      }
    });
    this.input.on('pointerout', () => {
      this.hoverTile = null;
      this.updateHoverUnit();
      this.onTileHover(null);
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
    const bases = new Set(frames.map((f) => f.replace(/_(idle|run|hit)_anim_f\d+$|_anim_f\d+$/, '')));
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
    if (!this.anims.exists('torch')) {
      this.anims.create({ key: 'torch', frames: [0, 1, 2].map((i) => ({ key: 'torch', frame: `torch_f${i}` })), frameRate: 9, repeat: -1 });
    }
  }

  // ---------- room ----------

  /** Draw a fresh room. `info` (optional) shows the room title card. */
  loadArena(arena: ArenaMap, info?: { index: number; name: string }) {
    this.arena = arena;
    this.mapLayer.removeAll(true);
    this.units.forEach((u) => { u.container.destroy(); u.hud.destroy(); });
    this.units.clear();
    this.fxLayer.forEach((o) => o.destroy());
    this.fxLayer = [];
    this.torchLights.forEach((l) => l.glow?.destroy());
    this.torchLights = [];
    this.overlay.clear();
    this.overlayOpts = null;
    this.activeId = null;
    this.cameras.main.resetFX?.();

    this.drawRoom();
    this.setupDarkness();
    this.setupDust();

    this.fitCamera();
    this.cameras.main.fadeIn(reducedMotion() ? 200 : 650, 0, 0, 0);
    if (info) this.titleCard(info.index, info.name);
  }

  private drawRoom() {
    const a = this.arena;
    const { width: W, height: H } = a;
    const ch = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? '#' : a.rows[y][x]);
    const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
    const isWall = (x: number, y: number) => ch(x, y) === '#' || ch(x, y) === 'D';
    const isFloor = (x: number, y: number) => inB(x, y) && !isWall(x, y);
    // Bottom outer corners are the front of the side walls, not a face.
    const isCornerFront = (x: number, y: number) => y === H - 1 && (x === 0 || x === W - 1);
    const isFace = (x: number, y: number) => inB(x, y) && isWall(x, y) && !isCornerFront(x, y) && (isFloor(x, y + 1) || y === H - 1);
    const isMass = (x: number, y: number) => inB(x, y) && isWall(x, y) && !isFace(x, y) && !isCornerFront(x, y);

    let seed = W * 7919 + a.rows.join('').split('').reduce((s, c) => s + c.charCodeAt(0), 0);
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

    const add = (frame: string, x: number, y: number, depth: number = D.wall) => {
      const img = this.add.image(x * TILE, y * TILE, 'dungeon', frame).setOrigin(0, 0).setDepth(depth);
      this.mapLayer.add(img);
      return img;
    };
    const shade = this.add.graphics().setDepth(D.floorShade);
    this.mapLayer.add(shade);

    const decorAt = new Map(a.decor.map((d) => [`${d.pos.x},${d.pos.y}`, d.kind]));

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (isFloor(x, y)) {
          const r = rand();
          add(r < 0.1 ? FLOOR_CRACKS[Math.floor(rand() * FLOOR_CRACKS.length)] : 'floor_1', x, y, D.floor);
          // Pixel-banded contact shadows under walls give the room depth.
          const px = x * TILE;
          const py = y * TILE;
          if (isFace(x, y - 1) || isWall(x, y - 1)) {
            shade.fillStyle(0x000000, 0.42).fillRect(px, py, TILE, 2);
            shade.fillStyle(0x000000, 0.24).fillRect(px, py + 2, TILE, 2);
            shade.fillStyle(0x000000, 0.1).fillRect(px, py + 4, TILE, 3);
          }
          if (isWall(x - 1, y)) {
            shade.fillStyle(0x000000, 0.3).fillRect(px, py, 2, TILE);
            shade.fillStyle(0x000000, 0.12).fillRect(px + 2, py, 2, TILE);
          }
          if (isWall(x + 1, y)) shade.fillStyle(0x000000, 0.18).fillRect(px + TILE - 2, py, 2, TILE);
          continue;
        }
        if (isCornerFront(x, y)) {
          add(x === 0 ? 'wall_outer_front_left' : 'wall_outer_front_right', x, y);
          continue;
        }
        if (isFace(x, y)) {
          const leftEnd = !isFace(x - 1, y);
          const rightEnd = !isFace(x + 1, y);
          const holey = !leftEnd && !rightEnd && rand() < 0.06;
          add(holey ? (rand() < 0.5 ? 'wall_hole_1' : 'wall_hole_2') : leftEnd ? 'wall_left' : rightEnd ? 'wall_right' : 'wall_mid', x, y);
          // cap on the cell above unless that cell is a side stripe joining the cap
          if (!isMass(x, y - 1) || !this.sideStripe(isMass, x, y - 1)) {
            add(leftEnd && !isMass(x - 1, y) ? 'wall_top_left' : rightEnd && !isMass(x + 1, y) ? 'wall_top_right' : 'wall_top_mid', x, y - 1, D.cap);
          }
          continue;
        }
        // Solid wall mass: dark fill + light stripes along any edge that touches the room.
        const r = this.add.rectangle(x * TILE, y * TILE, TILE, TILE, 0x1c1719).setOrigin(0, 0).setDepth(D.wall);
        this.mapLayer.add(r);
        const left = !isMass(x - 1, y) && inB(x - 1, y) && !isCornerFront(x - 1, y);
        const right = !isMass(x + 1, y) && inB(x + 1, y) && !isCornerFront(x + 1, y);
        const faceBelow = isFace(x, y + 1);
        if (right) add(faceBelow && !isWall(x + 1, y) ? 'wall_edge_bottom_right' : 'wall_outer_mid_left', x, y, D.cap);
        if (left) add(faceBelow && !isWall(x - 1, y) ? 'wall_edge_bottom_left' : 'wall_outer_mid_right', x, y, D.cap);
        // stripe corner where a side stripe meets the cap row above
        if ((left || right) && !isMass(x, y - 1) && !isFace(x, y - 1)) {
          add(right ? 'wall_outer_top_left' : 'wall_outer_top_right', x, y - 1, D.cap);
        }
        // the top of a free-standing block: cap overlapping the floor above
        if (isFloor(x, y - 1)) add(left ? 'wall_top_left' : right ? 'wall_top_right' : 'wall_top_mid', x, y - 1, D.cap);
      }
    }

    // Door: arched frame + leaf, centred on the door tile, with a warm spill of light.
    if (a.door) {
      const dx = (a.door.x + 0.5) * TILE;
      const dy = (a.door.y + 1) * TILE;
      const leaf = this.add.image(dx, dy, 'dungeon', 'doors_leaf_closed').setOrigin(0.5, 1).setDepth(D.wallDecor).setName('door-leaf');
      const top = this.add.image(dx, dy - 32, 'dungeon', 'doors_frame_top').setOrigin(0.5, 1).setDepth(D.wallDecor);
      this.mapLayer.add([leaf, top]);
    }

    // Wall decor.
    a.decor.forEach((d) => {
      const { x, y } = d.pos;
      if (d.kind === 'pillar') {
        const sh = this.add.ellipse((x + 0.6) * TILE, (y + 1) * TILE - 2, 18, 7, 0x000000, 0.4).setDepth(D.floorShade);
        const img = this.add.image(x * TILE, (y + 1) * TILE, 'dungeon', 'column').setOrigin(0, 1).setDepth(D.unit + y + 0.6);
        this.mapLayer.add([sh, img]);
      } else if (d.kind === 'spikes') {
        const s = this.add.sprite(x * TILE, y * TILE, 'dungeon', 'floor_spikes_anim_f0').setOrigin(0, 0).setDepth(D.floor + 0.5).play('spikes');
        this.mapLayer.add(s);
      } else if (d.kind === 'banner') {
        if (isFace(x, y)) add(['wall_banner_red', 'wall_banner_blue', 'wall_banner_green', 'wall_banner_yellow'][(x + y) % 2 ? 0 : 1], x, y, D.wallDecor);
        else add('wall_banner_red', x, y + 1, D.wallDecor);
      } else if (d.kind === 'fountain') {
        add('wall_fountain_top_1', x, y - 1, D.cap + 0.1);
        const m = this.add.sprite(x * TILE, y * TILE, 'dungeon', 'wall_fountain_mid_red_anim_f0').setOrigin(0, 0).setDepth(D.wallDecor).play('fountain-red');
        const b = this.add.sprite(x * TILE, (y + 1) * TILE, 'dungeon', 'wall_fountain_basin_red_anim_f0').setOrigin(0, 0).setDepth(D.floor + 0.5).play('basin-red');
        this.mapLayer.add([m, b]);
        this.addLight((x + 0.5) * TILE, (y + 1.2) * TILE, 2.2, 0.55, 0.15, 0xff5030, 0.18);
      }
    });

    // Wall torches along the top face, skipping door/banners/fountains.
    const topY = a.rows.findIndex((_, yy) => isFace(1, yy));
    if (topY >= 0) {
      for (let x = 3; x < W - 2; x += 5) {
        let tx = x;
        const blocked = (xx: number) => !isFace(xx, topY) || decorAt.has(`${xx},${topY}`) || (a.door && Math.abs(a.door.x - xx) <= 1);
        if (blocked(tx)) tx = [x + 1, x - 1, x + 2].find((xx) => !blocked(xx)) ?? -1;
        if (tx < 0) continue;
        const t = this.add.sprite((tx + 0.5) * TILE, topY * TILE + 13, 'torch', 'torch_f0').setOrigin(0.5, 1).setDepth(D.wallDecor + 0.2);
        t.play({ key: 'torch', randomFrame: true });
        this.mapLayer.add(t);
        this.addLight((tx + 0.5) * TILE, topY * TILE + 6, 4.2, 0.85, 0.5, 0xff9a3c, 0.22);
        this.emitEmbers((tx + 0.5) * TILE, topY * TILE + 3);
      }
    }

    a.chests.forEach((c) => {
      const sh = this.add.ellipse((c.x + 0.5) * TILE, (c.y + 1) * TILE - 2, 14, 4, 0x000000, 0.35).setDepth(D.floorShade);
      const img = this.add.sprite(c.x * TILE, c.y * TILE, 'dungeon', 'chest_full_open_anim_f0').setOrigin(0, 0).setDepth(D.unit + c.y - 0.1);
      img.setName(`chest-${c.x}-${c.y}`);
      this.mapLayer.add([sh, img]);
      this.addLight((c.x + 0.5) * TILE, (c.y + 0.5) * TILE, 1.4, 0.35, 0.1, AMBER, 0.12);
    });
  }

  /** Does this mass cell draw a side stripe? (cells next to the room on the left or right) */
  private sideStripe(isMass: (x: number, y: number) => boolean, x: number, y: number) {
    const W = this.arena.width;
    return (x > 0 && !isMass(x - 1, y)) || (x < W - 1 && !isMass(x + 1, y));
  }

  private emitEmbers(x: number, y: number) {
    if (reducedMotion()) return;
    const e = this.add.particles(x, y, 'fx', {
      frame: 'dot', lifespan: { min: 600, max: 1300 }, frequency: 220, speedY: { min: -18, max: -8 }, speedX: { min: -5, max: 5 },
      alpha: { start: 1, end: 0 }, tint: [0xffd27a, 0xff9a3c, 0xff6a2a], blendMode: 'ADD',
    }).setDepth(D.dust);
    this.fxLayer.push(e);
  }

  // ---------- lighting ----------

  private addLight(x: number, y: number, radius: number, strength: number, flicker: number, glowColor?: number, glowAlpha = 0.2): Light {
    const l: Light = { x, y, radius, strength, flicker, phase: Math.random() * 100 };
    if (glowColor !== undefined) {
      l.glow = this.add.image(x, y, 'light').setDepth(D.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(glowColor).setAlpha(glowAlpha);
      l.glowAlpha = glowAlpha;
    }
    this.torchLights.push(l);
    return l;
  }

  private setupDarkness() {
    const { x, y, w, h } = this.roomBounds();
    this.darkness.setPosition(x, y);
    this.darkness.resize(w, h);
  }

  private renderDarkness(time: number) {
    if (!this.arena) return;
    const rt = this.darkness;
    const ox = rt.x;
    const oy = rt.y;
    rt.clear();
    rt.fill(0x06030b, AMBIENT);
    const t = time / 1000;
    const stamp = (x: number, y: number, radiusTiles: number, alpha: number) => {
      rt.stamp('light', undefined, x - ox, y - oy, { scale: (radiusTiles * TILE * 2) / 128, alpha, blendMode: Phaser.BlendModes.ERASE });
    };
    for (const l of this.torchLights) {
      const f = 1 - l.flicker * 0.12 * (Math.sin(t * 9 + l.phase) * 0.5 + Math.sin(t * 23 + l.phase * 2) * 0.3 + Math.sin(t * 3.7 + l.phase) * 0.2 + 0.5);
      stamp(l.x, l.y, l.radius * f, l.strength);
      if (l.glow) l.glow.setScale((l.radius * TILE * 1.6 * f) / 128).setAlpha((l.glowAlpha ?? 0.2) * (0.8 + 0.2 * f));
    }
    this.units.forEach((u, id) => {
      if (u.view.dead) return;
      const ux = u.container.x;
      const uy = u.container.y - 8;
      if (u.view.side === 'hero') {
        const f = 1 - 0.06 * (Math.sin(t * 7 + ux) * 0.5 + 0.5);
        stamp(ux, uy, 5.2 * f, 0.85);
      } else {
        stamp(ux, uy, 2.4, 0.6); // monsters stay readable, just moodier
      }
      if (id === this.activeId) stamp(ux, uy, 2.4, 0.6);
    });
    rt.render();
  }

  private setupDust() {
    this.dust?.destroy();
    this.dust = undefined;
    if (reducedMotion()) return;
    const { width: W, height: H } = this.arena;
    this.dust = this.add.particles(0, 0, 'fx', {
      frame: 'dot', lifespan: { min: 4000, max: 8000 }, frequency: 180, quantity: 1,
      speedX: { min: -3, max: 3 }, speedY: { min: -5, max: -1 },
      alpha: { values: [0, 0.55, 0.4, 0] } as unknown as number, tint: [0xece3d0, 0xffd27a, 0xbfa8ff],
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(TILE, TILE, (W - 2) * TILE, (H - 2) * TILE) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
      blendMode: 'ADD',
    }).setDepth(D.dust);
    this.dust.fastForward?.(6000);
  }

  // ---------- camera ----------

  /** World rect that must be visible (minimal) and the nicer framing we'd like when space allows. */
  private roomBounds() {
    const { width: W, height: H } = this.arena;
    const top = this.arena.door ? -2 : -1;
    return { x: 0, y: top * TILE, w: W * TILE, h: (H - top) * TILE };
  }

  private fitCamera() {
    if (!this.arena) return;
    const cam = this.cameras.main;
    const vw = this.scale.width;
    const vh = this.scale.height;
    const nice = this.roomBounds();
    const { width: W, height: H } = this.arena;
    // Must-see box: everything but the outer half of the side walls and the door arch.
    const must = { x: TILE * 0.6, y: -6, w: (W - 1.2) * TILE, h: H * TILE + 6 };
    // Snap zoom to half-steps: integer where it fits, else x.5 (texels alternate 2/3px, still crisp).
    const fitMust = Math.min(vw / must.w, vh / must.h);
    const zoom = Math.max(1, Math.floor(fitMust * 2) / 2);
    this.baseZoom = zoom;
    // Centre on the nice framing, then shift so the must-see box stays fully on screen.
    const halfW = vw / zoom / 2;
    const halfH = vh / zoom / 2;
    const clampC = (c: number, lo: number, hi: number, half: number) => (hi - lo <= half * 2 ? Phaser.Math.Clamp(c, hi - half, lo + half) : (lo + hi) / 2);
    const cx = clampC(nice.x + nice.w / 2, must.x, must.x + must.w, halfW);
    const cy = clampC(nice.y + nice.h / 2, must.y, must.y + must.h, halfH);
    this.baseCenter = { x: Math.round(cx), y: Math.round(cy) };
    this.bounds = must;
    cam.setZoom(zoom);
    cam.centerOn(this.baseCenter.x, this.baseCenter.y);
    cam.roundPixels = true;
  }

  /** Gently drift the camera toward a unit (enemy turns). `null` returns to the full-room framing. */
  focusUnit(id: string | null) {
    if (!this.arena) return;
    const cam = this.cameras.main;
    const u = id ? this.units.get(id) : undefined;
    if (!u || reducedMotion()) {
      cam.pan(this.baseCenter.x, this.baseCenter.y, 450, 'Sine.easeInOut', true);
      cam.zoomTo(this.baseZoom, 450, 'Sine.easeInOut', true);
      return;
    }
    // Stay at the base zoom (so the room never crops) and drift a third of the way toward the unit,
    // limited to the slack around the must-see box.
    const b = this.bounds;
    const z = this.baseZoom;
    const slackX = Math.max(0, this.scale.width / z / 2 - b.w / 2 - Math.abs(this.baseCenter.x - (b.x + b.w / 2)));
    const slackY = Math.max(0, this.scale.height / z / 2 - b.h / 2 - Math.abs(this.baseCenter.y - (b.y + b.h / 2)));
    const mx = Math.min(slackX, 14);
    const my = Math.min(slackY, 10);
    const tx = this.baseCenter.x + Phaser.Math.Clamp((u.container.x - this.baseCenter.x) * 0.33, -mx, mx);
    const ty = this.baseCenter.y + Phaser.Math.Clamp((u.container.y - this.baseCenter.y) * 0.33, -my, my);
    cam.pan(tx, ty, 500, 'Sine.easeInOut', true);
    cam.zoomTo(z, 500, 'Sine.easeInOut', true);
  }

  private titleCard(index: number, name: string) {
    const cx = this.baseCenter.x;
    const cy = this.baseCenter.y - TILE * 1.5;
    const res = Math.max(2, Math.ceil(this.baseZoom * 2));
    const band = this.add.graphics().setDepth(D.title);
    const bw = this.arena.width * TILE;
    for (let i = 0; i < 6; i++) band.fillStyle(0x07040b, 0.12 + i * 0.1).fillRect(cx - bw / 2 + i * 10, cy - 15, bw - i * 20, 30);
    band.fillStyle(0xf2d48f, 0.5).fillRect(cx - 60, cy - 15, 120, 1).fillRect(cx - 60, cy + 14, 120, 1);
    const title = this.add.text(cx, cy, `${roman(index + 1)} \u00b7 ${name}`, {
      fontFamily: this.titleFont, fontSize: '14px', color: '#ece3d0', stroke: '#07040b', strokeThickness: 3, resolution: res,
    }).setOrigin(0.5).setDepth(D.title);
    title.setShadow(0, 1, '#000', 0, true, true);
    const parts = [band, title];
    parts.forEach((p) => p.setAlpha(0));
    this.tweens.add({ targets: parts, alpha: 1, duration: 350, delay: 250, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: title, y: { from: cy + 4, to: cy }, duration: 450, delay: 250, ease: 'Back.easeOut' });
    this.tweens.add({ targets: parts, alpha: 0, duration: 450, delay: 1750, onComplete: () => parts.forEach((p) => p.destroy()) });
  }

  // ---------- doors & chests ----------

  openChest(p: Pos) {
    const img = this.mapLayer.getByName(`chest-${p.x}-${p.y}`) as Phaser.GameObjects.Sprite | null;
    if (!img) return;
    ['chest_full_open_anim_f1', 'chest_full_open_anim_f2', 'chest_empty_open_anim_f2'].forEach((f, i) =>
      this.time.delayedCall(i * 110, () => img.setFrame(f)),
    );
    const x = (p.x + 0.5) * TILE;
    const y = (p.y + 0.4) * TILE;
    this.sparks.explode(14, x, y);
    this.sparkle(x, y, [0xffd27a, 0xfff3a0], 10);
  }

  openDoor() {
    const d = this.arena?.door;
    if (!d) return;
    const x = (d.x + 0.5) * TILE;
    const y = d.y * TILE;
    const leaf = this.mapLayer.getByName('door-leaf') as Phaser.GameObjects.Image | null;
    leaf?.setFrame('doors_leaf_open');
    const glow = this.add.image(x, y, 'light').setTint(0xffd27a).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.glow).setScale(0.2).setAlpha(0.9);
    this.tweens.add({ targets: glow, scale: 0.9, alpha: 0.35, duration: 700, ease: 'Cubic.easeOut' });
    this.fxLayer.push(glow);
    const l = this.addLight(x, y + 6, 0.5, 0.9, 0.25);
    this.tweens.add({ targets: l, radius: 3.4, duration: 700, ease: 'Cubic.easeOut' });
    // dust puff along the threshold
    for (let i = 0; i < 18; i++) {
      this.time.delayedCall(i * 12, () => {
        this.sparks.setParticleTint(0xbfae98);
        this.sparks.explode(1, x + (Math.random() - 0.5) * 26, y + 14);
      });
    }
    if (!reducedMotion()) this.cameras.main.shake(180, 0.003);
  }

  // ---------- units ----------

  setUnits(views: UnitView[]) {
    const seen = new Set<string>();
    views.forEach((v) => {
      seen.add(v.id);
      const u = this.units.get(v.id) ?? this.createUnit(v);
      const prev = u.view;
      u.view = v;
      if (!this.tweens.isTweening(u.container)) {
        u.container.setPosition((v.pos.x + 0.5) * TILE, (v.pos.y + 1) * TILE);
      }
      u.container.setDepth(D.unit + v.pos.y);
      if (prev.hp !== v.hp) this.tweens.addCounter({ from: u.hpShown, to: v.hp, duration: 350, ease: 'Cubic.easeOut', onUpdate: (tw) => { u.hpShown = tw.getValue() ?? v.hp; this.drawHp(u); } });
      this.drawHp(u);
      this.drawConditions(u);
      if (v.dead && !u.container.getData('dying')) this.killAnim(u);
    });
    this.units.forEach((u, id) => {
      if (!seen.has(id)) {
        u.container.destroy();
        u.hud.destroy();
        this.units.delete(id);
      }
    });
    this.refreshActive();
  }

  private createUnit(v: UnitView): UnitSprite {
    const anim = `${v.spriteKey}-idle`;
    const body = this.add.sprite(0, 0, 'dungeon', 'skull').setOrigin(0.5, 1);
    if (this.anims.exists(anim)) body.play({ key: anim, randomFrame: true });
    if (v.side === 'monster') body.setFlipX(true);
    const color = v.side === 'hero' ? HERO_BLUE : ENEMY_ROSE;
    const shadow = this.add.ellipse(0, -1, Math.max(10, body.width * 0.8), 4, 0x000000, 0.45);
    const ring = this.add.ellipse(0, -1, 15, 6, color, 0).setStrokeStyle(1, color, 0.5);
    const container = this.add.container(0, 0, [shadow, ring, body]);

    const top = -body.height;
    const hpBar = this.add.graphics();
    const icons = this.add.container(0, top - 7);
    const label = this.add.text(0, top - 9, v.name, {
      fontFamily: this.pixelFont, fontSize: '7px', color: v.side === 'hero' ? '#bfe9ff' : '#ffd0d6', stroke: '#07040b', strokeThickness: 2, resolution: 6,
    }).setOrigin(0.5, 1).setAlpha(0);
    const arrow = this.add.image(0, top - 12, 'arrow').setOrigin(0.5, 1).setVisible(false);
    const hud = this.add.container(0, 0, [hpBar, icons, label, arrow]).setDepth(D.hud);
    this.tweens.add({ targets: arrow, y: top - 15, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const u: UnitSprite = { view: v, container, body, ring, hud, hpBar, icons, label, arrow, hpShown: v.hp, iconKey: '' };
    this.units.set(v.id, u);
    container.setPosition((v.pos.x + 0.5) * TILE, (v.pos.y + 1) * TILE);
    hud.setPosition(container.x, container.y);
    return u;
  }

  private drawHp(u: UnitSprite) {
    const g = u.hpBar;
    g.clear();
    if (u.view.dead) return;
    const w = 14;
    const y = -u.body.height - 4;
    const pct = Phaser.Math.Clamp(u.view.hp / u.view.maxHp, 0, 1);
    const shown = Phaser.Math.Clamp(u.hpShown / u.view.maxHp, 0, 1);
    g.fillStyle(0x07040b, 0.85).fillRect(-w / 2 - 1, y - 1, w + 2, 4);
    g.fillStyle(0x3a2030, 1).fillRect(-w / 2, y, w, 2);
    if (shown > pct) g.fillStyle(0xfff3c4, 0.9).fillRect(-w / 2 + w * pct, y, w * (shown - pct), 2);
    const col = u.view.side === 'monster' ? (pct > 0.5 ? 0xe2445c : pct > 0.25 ? 0xf08a3c : 0xff3030) : pct > 0.5 ? 0x4ade80 : pct > 0.25 ? 0xfacc15 : 0xef4444;
    g.fillStyle(col, 1).fillRect(-w / 2, y, Math.round(w * pct), 2);
    g.fillStyle(0xffffff, 0.35).fillRect(-w / 2, y, Math.round(w * pct), 1);
  }

  private drawConditions(u: UnitSprite) {
    const list = u.view.dead ? [] : u.view.conditions;
    const key = list.join(',');
    if (key === u.iconKey) return;
    u.iconKey = key;
    u.icons.removeAll(true);
    const n = list.length;
    list.forEach((c, i) => {
      const img = this.add.image((i - (n - 1) / 2) * (ICON_SIZE + 1), 0, 'icons', iconFrame(c)).setOrigin(0.5, 1);
      u.icons.add(img);
    });
    u.label.setY(-u.body.height - (n ? 15 : 8));
  }

  setActive(id: string | null) {
    this.activeId = id;
    this.refreshActive();
  }

  private refreshActive() {
    this.units.forEach((u, id) => {
      const on = id === this.activeId && !u.view.dead;
      const color = u.view.side === 'hero' ? HERO_BLUE : ENEMY_ROSE;
      const wasOn = u.arrow.visible;
      u.arrow.setVisible(on).setTint(u.view.side === 'hero' ? 0xffffff : 0xffb0b8);
      u.ring.setFillStyle(color, on ? 0.28 : 0);
      u.ring.setStrokeStyle(1, color, on ? 1 : u.view.dead ? 0 : 0.4);
      if (on && !wasOn) {
        this.tweens.killTweensOf(u.ring);
        u.ring.setScale(1);
        this.tweens.add({ targets: u.ring, scaleX: 1.25, scaleY: 1.25, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else if (!on && wasOn) {
        this.tweens.killTweensOf(u.ring);
        u.ring.setScale(1);
      }
    });
    this.updateLabels();
  }

  private updateHoverUnit() {
    const t = this.hoverTile;
    let found: string | null = null;
    if (t) this.units.forEach((u, id) => { if (!u.view.dead && u.view.pos.x === t.x && u.view.pos.y === t.y) found = id; });
    this.hoverUnitId = found;
    this.updateLabels();
  }

  private updateLabels() {
    this.units.forEach((u, id) => {
      const show = !u.view.dead && (id === this.hoverUnitId || (id === this.activeId && u.view.side === 'monster'));
      u.label.setText(u.view.name);
      if (show !== u.label.getData('shown')) {
        u.label.setData('shown', show);
        this.tweens.killTweensOf(u.label);
        this.tweens.add({ targets: u.label, alpha: show ? 1 : 0, duration: 150 });
      }
      u.arrow.setAlpha(show ? 0 : 1);
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
        this.tweens.add({ targets: u.container, x: tx, y: (p.y + 1) * TILE, duration: 120, ease: 'Linear', onComplete: () => resolve() }),
      );
      u.container.setDepth(D.unit + p.y);
      if (!reducedMotion() && Math.random() < 0.5) {
        this.sparks.setParticleTint(0x8a7a6a);
        this.sparks.explode(1, u.container.x + (Math.random() - 0.5) * 6, u.container.y - 1);
      }
    }
    const idleKey = `${u.view.spriteKey}-idle`;
    if (this.anims.exists(idleKey)) u.body.play({ key: idleKey, randomFrame: true });
  }

  /** Lunge toward target (melee) or fire a bolt (ranged/spell). */
  async attackAnim(attackerId: string, targetId: string, style: 'melee' | 'ranged' | 'spell', color = 0xffa040) {
    const a = this.units.get(attackerId);
    const t = this.units.get(targetId);
    if (!a || !t) return;
    this.lastAttacker = attackerId;
    const ax = a.container.x;
    const ay = a.container.y - 8;
    if (a === t) {
      // Self-target = spell flourish before an area effect.
      this.sparkle(ax, ay, [color, 0xffffff], 12);
      const g = this.add.image(ax, ay, 'light').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.fx).setScale(0.05);
      await new Promise<void>((r) => this.tweens.add({ targets: g, scale: 0.4, alpha: 0, duration: 320, ease: 'Cubic.easeOut', onComplete: () => { g.destroy(); r(); } }));
      return;
    }
    const tx = t.container.x;
    const ty = t.container.y - 8;
    a.body.setFlipX(tx < ax);
    if (style === 'melee') {
      const dx = (tx - ax) * 0.4;
      const dy = (t.container.y - a.container.y) * 0.4;
      const bx = a.container.x;
      const by = a.container.y;
      // wind-up, lunge, slash
      await new Promise<void>((r) => this.tweens.add({ targets: a.container, x: bx - dx * 0.15, y: by - dy * 0.15, duration: 70, ease: 'Quad.easeOut', onComplete: () => r() }));
      await new Promise<void>((r) => this.tweens.add({ targets: a.container, x: bx + dx, y: by + dy, duration: 70, ease: 'Quad.easeIn', onComplete: () => r() }));
      this.slash(tx, ty, Math.atan2(ty - ay, tx - ax));
      await new Promise<void>((r) => this.tweens.add({ targets: a.container, x: bx, y: by, duration: 140, ease: 'Quad.easeOut', onComplete: () => r() }));
      return;
    }
    const isSpell = style === 'spell';
    const bolt = this.add.image(ax, ay, isSpell ? 'light' : 'fx', isSpell ? undefined : 'px2')
      .setDepth(D.fx).setBlendMode(Phaser.BlendModes.ADD).setTint(isSpell ? color : 0xfff3c4).setScale(isSpell ? 0.12 : 1.5);
    const core = this.add.image(ax, ay, 'fx', 'spark').setDepth(D.fx + 1).setTint(0xffffff);
    const trail = this.add.particles(0, 0, 'fx', {
      frame: isSpell ? 'px2' : 'dot', follow: bolt, lifespan: isSpell ? 380 : 180, frequency: isSpell ? 10 : 14, speed: { min: 0, max: isSpell ? 14 : 2 },
      scale: { start: 1, end: 0 }, alpha: { start: 0.9, end: 0 }, tint: isSpell ? [color, 0xffffff, color] : 0xd8c8a8, blendMode: 'ADD',
    }).setDepth(D.fx - 1);
    const dist = Phaser.Math.Distance.Between(ax, ay, tx, ty);
    const duration = Phaser.Math.Clamp(dist * (isSpell ? 2.4 : 1.6), 160, 420);
    // slight arc for spells
    const arc = isSpell ? -Math.min(18, dist * 0.18) : 0;
    await new Promise<void>((r) =>
      this.tweens.addCounter({
        from: 0, to: 1, duration, ease: isSpell ? 'Sine.easeIn' : 'Linear',
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          const x = ax + (tx - ax) * k;
          const y = ay + (ty - ay) * k + arc * Math.sin(Math.PI * k);
          bolt.setPosition(x, y);
          core.setPosition(x, y);
          bolt.setAngle(k * 360);
        },
        onComplete: () => r(),
      }),
    );
    bolt.destroy();
    core.destroy();
    trail.stop();
    this.time.delayedCall(400, () => trail.destroy());
    if (isSpell) {
      this.sparks.setParticleTint(color);
      this.sparks.explode(12, tx, ty);
      const flash = this.add.image(tx, ty, 'light').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.fx).setScale(0.15);
      this.tweens.add({ targets: flash, scale: 0.5, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
    }
  }

  private slash(x: number, y: number, angle: number) {
    const g = this.add.graphics().setDepth(D.fx).setPosition(x, y).setRotation(angle).setBlendMode(Phaser.BlendModes.ADD);
    const draw = (k: number) => {
      g.clear();
      const start = -1.2 + k * 0.5;
      const end = start + 2.0 * Math.min(1, k * 1.8);
      g.lineStyle(2, 0xffffff, 1 - k).beginPath().arc(-3, 0, 8, start, end).strokePath();
      g.lineStyle(1, 0xffd27a, 0.8 * (1 - k)).beginPath().arc(-3, 0, 10, start + 0.2, end + 0.1).strokePath();
    };
    this.tweens.addCounter({ from: 0, to: 1, duration: 220, ease: 'Cubic.easeOut', onUpdate: (tw) => draw(tw.getValue() ?? 1), onComplete: () => g.destroy() });
  }

  burst(at: Pos, radius: number, color: number) {
    const x = (at.x + 0.5) * TILE;
    const y = (at.y + 0.5) * TILE;
    const R = (radius + 0.5) * TILE;
    const g = this.add.graphics().setDepth(D.fx).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.addCounter({
      from: 0, to: 1, duration: 520, ease: 'Cubic.easeOut',
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 1;
        g.clear();
        g.fillStyle(color, 0.35 * (1 - k)).fillCircle(x, y, R * k);
        g.lineStyle(3 * (1 - k) + 1, color, 1 - k).strokeCircle(x, y, R * k);
        g.lineStyle(1, 0xffffff, 0.8 * (1 - k)).strokeCircle(x, y, R * k * 0.82);
      },
      onComplete: () => g.destroy(),
    });
    const glow = this.add.image(x, y, 'light').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.glow).setScale((R * 2.4) / 128).setAlpha(0.9);
    this.tweens.add({ targets: glow, alpha: 0, duration: 700, onComplete: () => glow.destroy() });
    const l = this.addLight(x, y, radius + 2, 0.9, 0);
    this.tweens.add({ targets: l, strength: 0, duration: 700, onComplete: () => (this.torchLights = this.torchLights.filter((o) => o !== l)) });
    this.sparks.setParticleTint(color);
    this.sparks.explode(28, x, y);
    if (!reducedMotion()) this.cameras.main.shake(200, 0.005);
  }

  private sparkle(x: number, y: number, tints: number[], count: number) {
    const e = this.add.particles(x, y, 'fx', {
      frame: ['cross', 'spark', 'dot'], emitting: false, lifespan: { min: 500, max: 900 }, speedY: { min: -30, max: -10 }, speedX: { min: -12, max: 12 },
      scale: { start: 1, end: 0.4 }, alpha: { start: 1, end: 0 }, tint: tints, blendMode: 'ADD',
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-6, -10, 12, 14) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
    }).setDepth(D.fx);
    e.explode(count);
    this.time.delayedCall(1000, () => e.destroy());
  }

  hitFx(targetId: string, amount: number, crit: boolean, kind: 'damage' | 'heal' | 'miss') {
    const u = this.units.get(targetId);
    if (!u) return;
    const x = u.container.x;
    const topY = u.container.y - u.body.height - 4;
    const color = kind === 'heal' ? '#5df59a' : kind === 'miss' ? '#d6dbe4' : crit ? '#ffd23f' : '#ff5a5a';
    const label = kind === 'miss' ? 'miss' : `${kind === 'heal' ? '+' : '-'}${amount}${crit ? '!' : ''}`;
    this.floatText(x, topY, label, color, crit ? 13 : kind === 'miss' ? 8 : 10, kind === 'miss');

    const att = this.lastAttacker ? this.units.get(this.lastAttacker) : undefined;
    const dir = att && att !== u ? Math.sign(x - att.container.x) || 1 : 1;
    if (kind === 'damage') {
      u.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      this.time.delayedCall(60, () => u.body.setTint(0xff3040));
      this.time.delayedCall(150, () => u.body.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
      this.tweens.killTweensOf(u.body);
      u.body.setPosition(0, 0);
      this.tweens.add({ targets: u.body, x: dir * (crit ? 4 : 2.5), duration: 60, yoyo: true, ease: 'Quad.easeOut', onComplete: () => u.body.setPosition(0, 0) });
      this.sparks.setParticleTint(crit ? 0xffd23f : 0xff4050);
      this.sparks.explode(crit ? 16 : 8, x, u.container.y - u.body.height / 2);
      if (crit) this.hitStop();
    } else if (kind === 'heal') {
      u.body.setTint(0x6bff9a).setTintMode(Phaser.TintModes.FILL);
      this.time.delayedCall(180, () => u.body.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
      this.sparkle(x, u.container.y - 4, [0x5df59a, 0xb8ffd0, 0xffffff], 16);
    } else {
      // whiff: the target sidesteps and a grey streak passes by
      this.tweens.add({ targets: u.body, x: -dir * 3, duration: 90, yoyo: true, ease: 'Quad.easeOut', onComplete: () => u.body.setX(0) });
      const g = this.add.graphics().setDepth(D.fx);
      const y = u.container.y - u.body.height / 2;
      this.tweens.addCounter({
        from: 0, to: 1, duration: 220,
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 1;
          g.clear().lineStyle(1, 0xe6e9ef, 0.8 * (1 - k));
          for (let i = -1; i <= 1; i++) g.lineBetween(x - dir * (10 - 20 * k), y + i * 3, x - dir * (2 - 20 * k), y + i * 3);
        },
        onComplete: () => g.destroy(),
      });
    }
  }

  private hitStop() {
    if (reducedMotion()) return;
    this.cameras.main.shake(220, 0.009);
    this.cameras.main.flash(90, 255, 230, 160, false);
    this.tweens.timeScale = 0.08;
    this.anims.globalTimeScale = 0.08;
    window.setTimeout(() => {
      this.tweens.timeScale = 1;
      this.anims.globalTimeScale = 1;
    }, 70);
  }

  private floatText(x: number, y: number, label: string, color: string, size: number, italic = false) {
    const res = Math.max(4, Math.ceil(this.cameras.main.zoom * 2));
    const txt = this.add.text(x, y, label, {
      fontFamily: this.pixelFont, fontSize: `${size}px`, color, stroke: '#140810', strokeThickness: 3, fontStyle: italic ? 'italic' : 'bold', resolution: res,
    }).setOrigin(0.5, 1).setDepth(D.text).setScale(0.2);
    txt.setShadow(0, 1, '#000000', 0, true, false);
    const drift = (Math.random() - 0.5) * 8;
    this.tweens.add({ targets: txt, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: txt, y: y - 10, x: x + drift, duration: 300, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: txt, y: y - 6, duration: 240, delay: 300, ease: 'Bounce.easeOut' });
    this.tweens.add({ targets: txt, alpha: 0, y: y - 14, duration: 350, delay: 800, ease: 'Quad.easeIn', onComplete: () => txt.destroy() });
  }

  private killAnim(u: UnitSprite) {
    u.container.setData('dying', true);
    u.body.stop();
    u.hpBar.clear();
    u.icons.removeAll(true);
    u.arrow.setVisible(false);
    const x = u.container.x;
    const y = u.container.y;
    u.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.time.delayedCall(100, () => u.body.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
    this.tweens.add({ targets: u.body, angle: u.view.side === 'monster' ? 90 : -90, y: -2, duration: 260, delay: 80, ease: 'Quad.easeIn' });
    this.tweens.add({ targets: u.container, alpha: u.view.side === 'hero' ? 0.45 : 0, duration: 650, delay: 380 });
    this.time.delayedCall(380, () => {
      this.sparks.setParticleTint(u.view.side === 'monster' ? 0x6a2a3a : 0x8aa0c0);
      this.sparks.explode(18, x, y - 6);
      const smoke = this.add.particles(x, y - 4, 'fx', {
        frame: 'px2', emitting: false, lifespan: 900, speedY: { min: -14, max: -4 }, speedX: { min: -8, max: 8 },
        alpha: { start: 0.6, end: 0 }, scale: { start: 1.5, end: 0.5 }, tint: 0x9a8aa0,
      }).setDepth(D.fx);
      smoke.explode(10);
      this.time.delayedCall(1000, () => smoke.destroy());
    });
    if (u.view.side === 'monster') {
      const skull = this.add.image(x, y - 1, 'dungeon', 'skull').setOrigin(0.5, 1).setDepth(D.floorShade + 0.5).setAlpha(0);
      this.tweens.add({ targets: skull, alpha: 0.85, duration: 400, delay: 700 });
      this.mapLayer.add(skull);
    }
  }

  // ---------- overlays ----------

  showOverlay(opts: OverlayOpts) {
    this.overlayOpts = opts;
    this.drawOverlay(this.time.now);
  }

  clearOverlay() {
    this.overlayOpts = null;
    this.overlay.clear();
  }

  private drawOverlay(time: number) {
    const g = this.overlay;
    g.clear();
    const o = this.overlayOpts;
    if (!o) return;
    const t = time / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    const key = (p: Pos) => p.y * 1000 + p.x;

    // Reach: soft rounded tiles + a border tracing the region outline.
    if (o.reach?.length) {
      const set = new Set(o.reach.map(key));
      o.reach.forEach((p) => {
        g.fillStyle(HERO_BLUE, 0.1).fillRoundedRect(p.x * TILE + 1, p.y * TILE + 1, TILE - 2, TILE - 2, 3);
        g.fillStyle(HERO_BLUE, 0.06).fillRoundedRect(p.x * TILE + 3, p.y * TILE + 3, TILE - 6, TILE - 6, 2);
      });
      g.lineStyle(1, HERO_BLUE, 0.45 + 0.3 * pulse);
      o.reach.forEach((p) => {
        const x = p.x * TILE;
        const y = p.y * TILE;
        if (!set.has(key({ x: p.x, y: p.y - 1 }))) g.lineBetween(x, y + 0.5, x + TILE, y + 0.5);
        if (!set.has(key({ x: p.x, y: p.y + 1 }))) g.lineBetween(x, y + TILE - 0.5, x + TILE, y + TILE - 0.5);
        if (!set.has(key({ x: p.x - 1, y: p.y }))) g.lineBetween(x + 0.5, y, x + 0.5, y + TILE);
        if (!set.has(key({ x: p.x + 1, y: p.y }))) g.lineBetween(x + TILE - 0.5, y, x + TILE - 0.5, y + TILE);
      });
    }

    // AoE: pulsing fill and outline.
    if (o.aoe?.length) {
      const set = new Set(o.aoe.map(key));
      o.aoe.forEach((p) => g.fillStyle(0xff8a3d, 0.18 + 0.16 * pulse).fillRect(p.x * TILE, p.y * TILE, TILE, TILE));
      g.lineStyle(1, 0xffb36b, 0.9);
      o.aoe.forEach((p) => {
        const x = p.x * TILE;
        const y = p.y * TILE;
        if (!set.has(key({ x: p.x, y: p.y - 1 }))) g.lineBetween(x, y + 0.5, x + TILE, y + 0.5);
        if (!set.has(key({ x: p.x, y: p.y + 1 }))) g.lineBetween(x, y + TILE - 0.5, x + TILE, y + TILE - 0.5);
        if (!set.has(key({ x: p.x - 1, y: p.y }))) g.lineBetween(x + 0.5, y, x + 0.5, y + TILE);
        if (!set.has(key({ x: p.x + 1, y: p.y }))) g.lineBetween(x + TILE - 0.5, y, x + TILE - 0.5, y + TILE);
      });
    }

    // Path: dots, with a ring on the destination.
    if (o.path?.length) {
      o.path.forEach((p, i) => {
        const cx = (p.x + 0.5) * TILE;
        const cy = (p.y + 0.5) * TILE;
        const last = i === o.path!.length - 1;
        if (last) {
          g.lineStyle(1, 0xe8f7ff, 0.9).strokeCircle(cx, cy, 4 + pulse);
          g.fillStyle(0xe8f7ff, 1).fillCircle(cx, cy, 1.5);
        } else {
          const bob = Math.sin(t * 6 - i * 0.8) > 0.6 ? 1 : 0;
          g.fillStyle(0x07040b, 0.6).fillCircle(cx, cy + 1, 1.5);
          g.fillStyle(0xbfe9ff, 0.95).fillCircle(cx, cy - bob * 0.5, 1.5);
        }
      });
    }

    // Targets: animated corner brackets.
    o.targets?.forEach((p) => {
      const inset = 1 + Math.round(pulse * 1.5);
      const x0 = p.x * TILE + inset;
      const y0 = p.y * TILE + inset - 4;
      const s = TILE - inset * 2;
      const L = 4;
      g.fillStyle(ENEMY_ROSE, 0.12 + 0.1 * pulse).fillRect(p.x * TILE + 2, p.y * TILE + 2, TILE - 4, TILE - 4);
      g.lineStyle(1, 0x07040b, 0.7);
      this.brackets(g, x0 + 0.5, y0 + 1.5, s, L);
      g.lineStyle(1, 0xff8090, 1);
      this.brackets(g, x0 + 0.5, y0 + 0.5, s, L);
    });
  }

  private brackets(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, L: number) {
    const r = x + s - 1;
    const b = y + s - 1;
    g.beginPath();
    g.moveTo(x, y + L); g.lineTo(x, y); g.lineTo(x + L, y);
    g.moveTo(r - L, y); g.lineTo(r, y); g.lineTo(r, y + L);
    g.moveTo(r, b - L); g.lineTo(r, b); g.lineTo(r - L, b);
    g.moveTo(x + L, b); g.lineTo(x, b); g.lineTo(x, b - L);
    g.strokePath();
  }

  private drawHover(time: number) {
    const g = this.hoverGfx;
    g.clear();
    const t = this.hoverTile;
    const o = this.overlayOpts;
    const canvas = this.game.canvas;
    if (!t) {
      if (canvas) canvas.style.cursor = 'default';
      return;
    }
    const match = (list?: Pos[]) => !!list?.some((p) => p.x === t.x && p.y === t.y);
    const onTarget = match(o?.targets);
    const onReach = match(o?.reach) || match(o?.aoe);
    if (canvas) canvas.style.cursor = onTarget ? 'crosshair' : onReach ? 'pointer' : 'default';
    const a = 0.65 + 0.3 * Math.sin(time / 160);
    const col = onTarget ? 0xff8090 : 0xffe9a8;
    g.lineStyle(1, col, a).strokeRect(t.x * TILE + 0.5, t.y * TILE + 0.5, TILE - 1, TILE - 1);
    g.fillStyle(col, 0.08).fillRect(t.x * TILE + 1, t.y * TILE + 1, TILE - 2, TILE - 2);
  }

  update(time: number) {
    if (!this.arena) return;
    this.units.forEach((u) => {
      u.hud.setPosition(u.container.x + u.body.x, u.container.y);
      u.hud.setAlpha(u.container.getData('dying') ? 0 : 1);
    });
    this.renderDarkness(time);
    if (this.overlayOpts) this.drawOverlay(time);
    this.drawHover(time);
  }

  fadeOut(): Promise<void> {
    return new Promise((r) => {
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => r());
    });
  }
}
