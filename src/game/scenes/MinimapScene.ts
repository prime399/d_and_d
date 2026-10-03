// Screen-space minimap, layered over the dungeon scene. It pulls everything it needs from
// DungeonScene.minimapData() each frame and only redraws its tile texture when the fog changes.
import * as Phaser from 'phaser';
import type { Pos } from '../engine/types';

export interface MinimapData {
  enabled: boolean;
  arenaVersion: number;
  fogVersion: number;
  width: number;
  height: number;
  rows: string[];
  /** 0 unseen, 1 explored, 2 visible; index y*width+x */
  seen: Uint8Array;
  door?: Pos;
  heroes: { x: number; y: number; leader: boolean }[];
  monsters: { x: number; y: number }[];
  lairs: { x: number; y: number }[]; // uncleared lairs already seen
  view: { x: number; y: number; w: number; h: number }; // camera view in tiles
}

const PAD = 5;
const MAX_W = 164;
const MAX_H = 112;
const TEX = 'minimap-tiles';

export class MinimapScene extends Phaser.Scene {
  private frame!: Phaser.GameObjects.Graphics;
  private img?: Phaser.GameObjects.Image;
  private dots!: Phaser.GameObjects.Graphics;
  private skulls: Phaser.GameObjects.Image[] = [];
  private arenaVersion = -1;
  private fogVersion = -1;
  private s = 3; // px per tile
  private rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(private provider: () => MinimapData | null) {
    super({ key: 'minimap', active: true });
  }

  create() {
    this.cameras.main.setRoundPixels(true);
    this.frame = this.add.graphics();
    this.dots = this.add.graphics();
    this.scale.on('resize', () => this.layout());
  }

  /** Screen rect of the panel, so the dungeon can ignore clicks on it. */
  get screenRect() {
    return this.frame?.visible ? this.rect : null;
  }

  private layout() {
    const d = this.provider();
    if (!d) return;
    const mw = d.width * this.s;
    const mh = d.height * this.s;
    const w = mw + PAD * 2;
    const h = mh + PAD * 2;
    const x = Math.round(this.scale.width - w - 12);
    const y = 12;
    this.rect = { x, y, w, h };
    const g = this.frame.clear();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(x + 1, y + 2, w, h, 6);
    g.fillStyle(0x0b0710, 0.86).fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(1, 0xf2d48f, 0.5).strokeRoundedRect(x + 0.5, y + 0.5, w - 1, h - 1, 6);
    g.lineStyle(1, 0x000000, 0.6).strokeRoundedRect(x + 1.5, y + 1.5, w - 3, h - 3, 5);
    this.img?.setPosition(x + PAD, y + PAD);
  }

  private rebuild(d: MinimapData) {
    this.s = Math.max(1, Math.floor(Math.min(MAX_W / d.width, MAX_H / d.height)));
    if (this.textures.exists(TEX)) {
      this.img?.destroy();
      this.img = undefined;
      this.textures.remove(TEX);
    }
    this.textures.createCanvas(TEX, d.width * this.s, d.height * this.s);
    this.img = this.add.image(0, 0, TEX).setOrigin(0, 0);
    this.children.bringToTop(this.dots);
    this.layout();
  }

  private paintTiles(d: MinimapData) {
    const tex = this.textures.get(TEX) as Phaser.Textures.CanvasTexture;
    const ctx = tex.getContext();
    const { width: W, height: H, rows, seen, s } = { ...d, s: this.s };
    ctx.clearRect(0, 0, W * s, H * s);
    const solid = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || rows[y][x] === '#' || rows[y][x] === 'D';
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const st = seen[y * W + x];
        if (!st) continue;
        if (solid(x, y)) {
          // Only outline walls that border open ground, so rooms read as shapes.
          const edge = !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1) ||
            !solid(x - 1, y - 1) || !solid(x + 1, y - 1) || !solid(x - 1, y + 1) || !solid(x + 1, y + 1);
          if (!edge) continue;
          ctx.fillStyle = st === 2 ? '#8f8190' : '#5e5262';
        } else {
          const ch = rows[y][x];
          ctx.fillStyle = ch === '~' ? '#07040b' : st === 2 ? '#463a4a' : '#2a2130';
        }
        ctx.fillRect(x * s, y * s, s, s);
      }
    }
    tex.refresh();
  }

  update() {
    const d = this.provider();
    const on = !!d?.enabled;
    this.frame.setVisible(on);
    this.dots.setVisible(on);
    this.img?.setVisible(on);
    if (!d || !on) {
      this.skulls.forEach((k) => k.setVisible(false));
      return;
    }
    if (d.arenaVersion !== this.arenaVersion) {
      this.arenaVersion = d.arenaVersion;
      this.fogVersion = -1;
      this.rebuild(d);
    }
    if (d.fogVersion !== this.fogVersion) {
      this.fogVersion = d.fogVersion;
      this.paintTiles(d);
    }
    const s = this.s;
    const ox = this.rect.x + PAD;
    const oy = this.rect.y + PAD;
    const cx = (p: { x: number }) => ox + (p.x + 0.5) * s;
    const cy = (p: { y: number }) => oy + (p.y + 0.5) * s;
    const g = this.dots.clear();
    const r = Math.max(1.5, s * 0.55);

    // camera viewport
    const v = d.view;
    const vx = Phaser.Math.Clamp(ox + v.x * s, ox, ox + d.width * s);
    const vy = Phaser.Math.Clamp(oy + v.y * s, oy, oy + d.height * s);
    const vw = Math.min(ox + (v.x + v.w) * s, ox + d.width * s) - vx;
    const vh = Math.min(oy + (v.y + v.h) * s, oy + d.height * s) - vy;
    g.lineStyle(1, 0xece3d0, 0.28).strokeRect(Math.round(vx) + 0.5, Math.round(vy) + 0.5, Math.round(vw) - 1, Math.round(vh) - 1);

    if (d.door) {
      const pulse = 0.65 + 0.35 * Math.sin(this.time.now / 300);
      g.fillStyle(0xffd27a, 0.25 * pulse).fillCircle(cx(d.door), cy(d.door), s * 1.6);
      g.fillStyle(0xffd27a, 1).fillRect(ox + d.door.x * s - 1, oy + d.door.y * s - 1, s + 2, s + 2);
    }
    d.monsters.forEach((m) => {
      g.fillStyle(0x07040b, 0.9).fillCircle(cx(m), cy(m), r + 1);
      g.fillStyle(0xff5a6e, 1).fillCircle(cx(m), cy(m), r);
    });
    d.heroes.forEach((h) => {
      g.fillStyle(0x07040b, 0.9).fillCircle(cx(h), cy(h), r + 1);
      g.fillStyle(h.leader ? 0xbfe9ff : 0x5ad1ff, 1).fillCircle(cx(h), cy(h), r);
    });

    while (this.skulls.length < d.lairs.length) this.skulls.push(this.add.image(0, 0, 'miniskull'));
    this.skulls.forEach((k, i) => {
      const l = d.lairs[i];
      k.setVisible(!!l);
      if (l) k.setPosition(Math.round(cx(l)), Math.round(cy(l)));
    });
  }
}
