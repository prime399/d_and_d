// Hand-made dungeon levels, one per room (data in ./levels). Legend:
//  #  wall          .  floor        P  pillar (blocks movement and sight)
//  H  hero spawn (exactly 3)        E  entrance stairs (floor decor)
//  1-6 lair spawn tiles (digit = lair id); M = legacy, same as lair 1
//  D  exit door (outer wall)        C  chest (blocks; potion)
//  S  floor spikes (decor)          B  banner on wall face   F  fountain on wall face
//  T  torch on wall face            K  crate/barrel (blocks)
//  X  bones (floor decor)           R  rubble (floor decor)  ~  pit (blocks)
//  G  gold pile (floor pickup)      L  lore stone (blocks; interact from adjacent)
// Wall-face glyphs (B, F, T) sit on the floor tile below the wall; the
// decor/torch position is the wall tile above it.
import type { Pos } from './engine/types';
import type { LevelDef } from './levels/types';
import { LEVEL1 } from './levels/level1';
import { LEVEL2 } from './levels/level2';
import { LEVEL3 } from './levels/level3';

export interface Lair { id: number; spawns: Pos[]; aggro: number /* tiles, default 5 */ }
export interface LoreStone { pos: Pos; title: string; text: string }

export interface ArenaMap {
  width: number;
  height: number;
  rows: string[];
  walls: boolean[]; // index y*width+x; true for anything that blocks movement
  heroSpawns: Pos[];
  monsterSpawns: Pos[]; // all lair spawns flattened, in lair order
  door?: Pos;
  chests: Pos[];
  decor: { kind: 'spikes' | 'banner' | 'fountain' | 'pillar'; pos: Pos }[];
  title: string;
  entrance?: Pos;
  lairs: Lair[]; // sorted by id; on the boss level the last lair is the throne
  torches: Pos[]; // wall tiles carrying a torch
  crates: Pos[];
  bones: Pos[];
  rubble: Pos[];
  pits: Pos[];
  gold: Pos[];
  lore: LoreStone[];
}

export const DEFAULT_AGGRO = 5;

const LEVELS: Record<number, LevelDef> = {
  1: LEVEL1,
  2: LEVEL2,
  3: LEVEL3,
};

/** Glyphs that block movement (and are marked in `walls`). */
export const BLOCKING = new Set(['#', 'P', 'D', 'C', 'K', '~', 'L']);

// Legacy single-arena layouts, used only for orders without a hand-made level.
const LEGACY: Record<number, string[]> = {
  1: [
    '##########D#########',
    '#B.......M...M....B#',
    '#..................#',
    '#...P.........P....#',
    '#.......M..........#',
    '#..................#',
    '#........S.........#',
    '#..P..........P....#',
    '#..................#',
    '#.......HHH........#',
    '#..................#',
    '####################',
  ],
  2: [
    '#########D##########',
    '#F......M....M....C#',
    '#..##..........##..#',
    '#..##....M.....##..#',
    '#..................#',
    '#.....P......P.....#',
    '#....S.....M.......#',
    '#..................#',
    '#..##..........##..#',
    '#..##...HHH....##..#',
    '#..................#',
    '####################',
  ],
  3: [
    '##########D#########',
    '#B...M.......M....B#',
    '#..P....P..P....P..#',
    '#.........M........#',
    '#..P....P..P....P..#',
    '#.....M......M.....#',
    '#..................#',
    '#..S............S..#',
    '#..................#',
    '#.......HHH........#',
    '#C.................#',
    '####################',
  ],
  4: [
    '#########D##########',
    '#F.......M........F#',
    '#..................#',
    '#....M.......M.....#',
    '#...###......###...#',
    '#..................#',
    '#........M.........#',
    '#..S............S..#',
    '#..................#',
    '#........HHH.......#',
    '#.................C#',
    '####################',
  ],
  5: [
    '####################',
    '#B.......M........B#',
    '#...P..........P...#',
    '#.....M......M.....#',
    '#..................#',
    '#...P....SS....P...#',
    '#..................#',
    '#....M........M....#',
    '#..................#',
    '#........HHH.......#',
    '#C................C#',
    '####################',
  ],
};

export function getArena(order: number): ArenaMap {
  const def: LevelDef = LEVELS[order] ?? {
    title: `Room ${order}`,
    rows: LEGACY[order] ?? LEGACY[1],
    lore: [],
  };
  return parseLevel(def);
}

export function parseLevel(def: LevelDef): ArenaMap {
  const rows = def.rows;
  const height = rows.length;
  const width = rows[0].length;
  const walls: boolean[] = new Array(width * height).fill(false);
  const heroSpawns: Pos[] = [];
  const chests: Pos[] = [];
  const decor: ArenaMap['decor'] = [];
  const torches: Pos[] = [];
  const crates: Pos[] = [];
  const bones: Pos[] = [];
  const rubble: Pos[] = [];
  const pits: Pos[] = [];
  const gold: Pos[] = [];
  const lorePos: Pos[] = [];
  const lairSpawns = new Map<number, Pos[]>();
  let door: Pos | undefined;
  let entrance: Pos | undefined;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const pos = { x, y };
      if (BLOCKING.has(ch)) walls[y * width + x] = true;
      switch (ch) {
        case 'P': decor.push({ kind: 'pillar', pos }); break;
        case 'B': decor.push({ kind: 'banner', pos: { x, y: y - 1 } }); break;
        case 'F': decor.push({ kind: 'fountain', pos: { x, y: y - 1 } }); break;
        case 'T': torches.push({ x, y: y - 1 }); break;
        case 'D': door = pos; break;
        case 'H': heroSpawns.push(pos); break;
        case 'E': entrance = pos; break;
        case 'C': chests.push(pos); break;
        case 'S': decor.push({ kind: 'spikes', pos }); break;
        case 'K': crates.push(pos); break;
        case 'X': bones.push(pos); break;
        case 'R': rubble.push(pos); break;
        case '~': pits.push(pos); break;
        case 'G': gold.push(pos); break;
        case 'L': lorePos.push(pos); break;
        default:
          if (ch === 'M' || (ch >= '1' && ch <= '6')) {
            const id = ch === 'M' ? 1 : Number(ch);
            const list = lairSpawns.get(id) ?? [];
            list.push(pos);
            lairSpawns.set(id, list);
          }
      }
    });
  });
  const lairs: Lair[] = [...lairSpawns.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, spawns]) => ({ id, spawns, aggro: def.aggro?.[id] ?? DEFAULT_AGGRO }));
  const lore: LoreStone[] = lorePos.map((pos, i) => ({
    pos,
    title: def.lore[i]?.title ?? 'Weathered Stone',
    text: def.lore[i]?.text ?? 'The carving has worn away to nothing.',
  }));
  return {
    width, height, rows, walls, heroSpawns,
    monsterSpawns: lairs.flatMap((l) => l.spawns),
    door, chests, decor,
    title: def.title, entrance, lairs, torches, crates, bones, rubble, pits, gold, lore,
  };
}
