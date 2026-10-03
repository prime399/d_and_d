// Procedural pixel textures the atlas lacks: light falloff, particles, torches, condition badges, the turn arrow.
import type * as Phaser from 'phaser';

type Bitmap = string[];

/** 5×5 glyphs for condition badges. '#' = lit pixel. */
const ICONS: Record<string, { color: string; rows: Bitmap }> = {
  poisoned: { color: '#7ee05a', rows: ['..#..', '.###.', '#####', '#####', '.###.'] },
  prone: { color: '#e8c27a', rows: ['..#..', '..#..', '#.#.#', '.###.', '..#..'] },
  paralyzed: { color: '#ffe14d', rows: ['..##.', '.##..', '####.', '..##.', '.##..'] },
  stunned: { color: '#ffd23f', rows: ['#.#.#', '.###.', '#####', '.###.', '#.#.#'] },
  restrained: { color: '#c3cad6', rows: ['###..', '#.#..', '#####', '..#.#', '..###'] },
  grappled: { color: '#e9a774', rows: ['#.#.#', '#.#.#', '#####', '#####', '.###.'] },
  frightened: { color: '#c48bff', rows: ['..#..', '..#..', '..#..', '.....', '..#..'] },
  blessed: { color: '#ffd27a', rows: ['..#..', '..#..', '#####', '..#..', '..#..'] },
  unconscious: { color: '#7cc4ff', rows: ['#####', '...#.', '..#..', '.#...', '#####'] },
  blinded: { color: '#cbd5e1', rows: ['#....', '.###.', '#.#.#', '.###.', '....#'] },
  invisible: { color: '#a5f3fc', rows: ['..#..', '.#.#.', '#...#', '.#.#.', '..#..'] },
  dodging: { color: '#5ad1ff', rows: ['#####', '#####', '#####', '.###.', '..#..'] },
  incapacitated: { color: '#ff7a7a', rows: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'] },
  charmed: { color: '#ff7ab8', rows: ['.#.#.', '#####', '#####', '.###.', '..#..'] },
  default: { color: '#ece3d0', rows: ['.....', '.###.', '.###.', '.###.', '.....'] },
};
export const ICON_SIZE = 7;
export const iconFrame = (condition: string) => (condition in ICONS ? `icon-${condition}` : 'icon-default');

const ARROW: Bitmap = ['#######', '.#####.', '..###..', '...#...'];

/** Three flame frames, 6×9. 'y' = yellow core, 'o' = orange, 'r' = deep red tips. */
const FLAMES: Bitmap[] = [
  ['..r...', '..or..', '.ooo..', '.oyor.', 'ooyyo.', 'oyyyo.', 'oyyyo.', '.oyo..', '..o...'],
  ['...r..', '..ro..', '..ooo.', '.royo.', '.oyyoo', '.oyyyo', '.oyyyo', '..oyo.', '...o..'],
  ['......', '..r...', '.ror..', '.oyo..', 'ooyyo.', 'oyyyoo', 'oyyyo.', '.oyo..', '..o...'],
];
const FLAME_COLORS: Record<string, string> = { y: '#fff3a0', o: '#ff9a2e', r: '#c8361e' };

function paint(ctx: CanvasRenderingContext2D, rows: Bitmap, ox: number, oy: number, color: string | ((ch: string) => string | null)) {
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const c = typeof color === 'string' ? color : color(ch);
      if (!c) return;
      ctx.fillStyle = c;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }),
  );
}

/** Paint with a 1px dark outline around lit pixels. */
function paintOutlined(ctx: CanvasRenderingContext2D, rows: Bitmap, ox: number, oy: number, color: string, outline = '#120a14') {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) paint(ctx, rows, ox + dx, oy + dy, outline);
  paint(ctx, rows, ox, oy, color);
}

export function buildSceneTextures(scene: Phaser.Scene) {
  const tm = scene.textures;
  const canvas = (key: string, w: number, h: number) => {
    if (tm.exists(key)) return null;
    return tm.createCanvas(key, w, h);
  };

  // Soft radial falloff used both to erase darkness and as an additive glow.
  const light = canvas('light', 128, 128);
  if (light) {
    const ctx = light.getContext();
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    light.refresh();
  }

  // Particle sprites: 1px, 2px, and a 3px plus-shaped spark.
  const fx = canvas('fx', 16, 4);
  if (fx) {
    const ctx = fx.getContext();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillRect(4, 0, 2, 2);
    paint(ctx, ['.#.', '###', '.#.'], 8, 0, '#fff');
    paint(ctx, ['#.#', '.#.', '#.#'], 12, 0, '#fff');
    fx.refresh();
    fx.add('dot', 0, 0, 0, 1, 1);
    fx.add('px2', 0, 4, 0, 2, 2);
    fx.add('spark', 0, 8, 0, 3, 3);
    fx.add('cross', 0, 12, 0, 3, 3);
  }

  // Condition badges.
  const names = Object.keys(ICONS);
  const icons = canvas('icons', names.length * ICON_SIZE, ICON_SIZE);
  if (icons) {
    const ctx = icons.getContext();
    names.forEach((n, i) => {
      const ox = i * ICON_SIZE;
      ctx.fillStyle = '#140c18';
      ctx.fillRect(ox + 1, 0, ICON_SIZE - 2, ICON_SIZE);
      ctx.fillRect(ox, 1, ICON_SIZE, ICON_SIZE - 2);
      paint(ctx, ICONS[n].rows, ox + 1, 1, ICONS[n].color);
    });
    icons.refresh();
    names.forEach((n, i) => icons.add(`icon-${n}`, 0, i * ICON_SIZE, 0, ICON_SIZE, ICON_SIZE));
  }

  // Active-unit arrow (with outline) in amber.
  const arrow = canvas('arrow', 9, 6);
  if (arrow) {
    paintOutlined(arrow.getContext(), ARROW, 1, 1, '#ffd27a');
    arrow.refresh();
  }

  // Wall torch: iron sconce + three flame frames.
  const torch = canvas('torch', 8 * 3, 14);
  if (torch) {
    const ctx = torch.getContext();
    FLAMES.forEach((rows, i) => {
      const ox = i * 8;
      paint(ctx, rows, ox + 1, 0, (ch) => FLAME_COLORS[ch] ?? null);
      // sconce cup and bracket
      ctx.fillStyle = '#1b1416';
      ctx.fillRect(ox + 1, 9, 6, 2);
      ctx.fillStyle = '#5a4a44';
      ctx.fillRect(ox + 2, 9, 4, 1);
      ctx.fillStyle = '#1b1416';
      ctx.fillRect(ox + 3, 11, 2, 3);
    });
    torch.refresh();
    FLAMES.forEach((_, i) => torch.add(`torch_f${i}`, 0, i * 8, 0, 8, 14));
  }
  // Floor clutter: bone bits (2 variants) and rubble (3 variants), 16×16 each, drawn under everything.
  const clutter = canvas('clutter', 16 * 5, 16);
  if (clutter) {
    const ctx = clutter.getContext();
    const bone = '#d9d0bd';
    const boneDim = '#9a8f7c';
    // variant 0: crossed long bones
    paintOutlined(ctx, ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'], 4, 5, bone, '#2a2024');
    paint(ctx, ['#.....#', '.......', '.......', '.......', '.......', '.......', '#.....#'], 4, 5, boneDim);
    // variant 1: a rib arc and a knuckle
    paintOutlined(ctx, ['.####.', '#....#', '#.##.#', '..##..'], 16 + 3, 4, bone, '#2a2024');
    paintOutlined(ctx, ['##', '##'], 16 + 11, 11, boneDim, '#2a2024');
    paintOutlined(ctx, ['###'], 16 + 4, 12, bone, '#2a2024');
    // rubble variants: pebbles of the wall stone with a lit top edge
    const stones: [number, number, number, number][][] = [
      [[2, 9, 4, 3], [7, 11, 3, 2], [10, 6, 4, 3], [5, 4, 2, 2], [12, 12, 2, 2]],
      [[3, 3, 5, 4], [9, 9, 4, 3], [2, 11, 2, 2], [12, 4, 2, 2], [7, 13, 3, 2]],
      [[5, 6, 6, 4], [2, 12, 3, 2], [12, 11, 3, 3], [10, 2, 2, 2]],
    ];
    stones.forEach((list, v) => {
      const ox = 32 + v * 16;
      list.forEach(([x, y, w, h]) => {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(ox + x, y + 1, w + 1, h);
        ctx.fillStyle = '#4a3f45';
        ctx.fillRect(ox + x, y, w, h);
        ctx.fillStyle = '#6e6068';
        ctx.fillRect(ox + x, y, w, 1);
        ctx.fillStyle = '#2c2429';
        ctx.fillRect(ox + x + w - 1, y + 1, 1, h - 1);
      });
    });
    clutter.refresh();
    for (let i = 0; i < 5; i++) clutter.add(i < 2 ? `bones_${i}` : `rubble_${i - 2}`, 0, i * 16, 0, 16, 16);
  }

  // Lore stone: a carved slab (16×22) and its glowing rune overlay, drawn additively and pulsed.
  const SLAB: Bitmap = [
    '...######...', '..#aaaaaa#..', '.#aaaaaaaa#.', '.#abbbbbba#.', '#abbbbbbbba#', '#abbbbbbbbb#', '#abbbbbbbbb#',
    '#abbbbbbbbb#', '#abbbbbbbbb#', '#abbbbbbbbb#', '#abbbbbbbbb#', '#abbbbbbbbb#', '#abbbbbbbbb#', '#abbbbbbbbb#',
    '#cbbbbbbbbc#', '#cccccccccc#', '############',
  ];
  const RUNES: Bitmap = ['..#..', '.###.', '#.#.#', '..#..', '.#.#.', '#...#', '.....', '.#.#.', '..#..', '.#.#.'];
  const stone = canvas('runestone', 16 * 2, 22);
  if (stone) {
    const ctx = stone.getContext();
    // plinth
    ctx.fillStyle = '#1b1416';
    ctx.fillRect(1, 17, 14, 5);
    ctx.fillStyle = '#3d3238';
    ctx.fillRect(2, 17, 12, 1);
    ctx.fillStyle = '#2a2227';
    ctx.fillRect(2, 18, 12, 3);
    paint(ctx, SLAB, 2, 1, (ch) => ({ '#': '#120a14', a: '#8a7c86', b: '#5a4c56', c: '#3a2f36' })[ch] ?? null);
    // carved (dark) runes on the slab
    paint(ctx, RUNES, 5, 5, '#2a1f28');
    // glow frame: just the rune pixels, bright
    paint(ctx, RUNES, 16 + 5, 5, '#ffffff');
    stone.refresh();
    stone.add('slab', 0, 0, 0, 16, 22);
    stone.add('runes', 0, 16, 0, 16, 22);
  }

  // Minimap skull marker (5×5) for an uncleared lair.
  const mskull = canvas('miniskull', 7, 7);
  if (mskull) {
    paintOutlined(mskull.getContext(), ['.###.', '#####', '#.#.#', '#####', '.#.#.'], 1, 1, '#ff5a6e');
    mskull.refresh();
  }
}
