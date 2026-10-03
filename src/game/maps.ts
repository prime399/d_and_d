// Hand-made arenas, one per room. Legend:
//  #  wall          .  floor        P  pillar (blocks movement and sight)
//  H  hero spawn    M  monster spawn (filled in encounter order)
//  D  exit door (top wall)          C  chest (potion)
//  S  floor spikes (decor)          B  banner on wall   F  fountain on wall
import type { Pos } from './engine/types';

export interface ArenaMap {
  width: number;
  height: number;
  rows: string[];
  walls: boolean[]; // index y*width+x
  heroSpawns: Pos[];
  monsterSpawns: Pos[];
  door?: Pos;
  chests: Pos[];
  decor: { kind: 'spikes' | 'banner' | 'fountain' | 'pillar'; pos: Pos }[];
}

const RAW: Record<number, string[]> = {
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
  const rows = RAW[order] ?? RAW[1];
  const height = rows.length;
  const width = rows[0].length;
  const walls: boolean[] = new Array(width * height).fill(false);
  const heroSpawns: Pos[] = [];
  const monsterSpawns: Pos[] = [];
  const chests: Pos[] = [];
  const decor: ArenaMap['decor'] = [];
  let door: Pos | undefined;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const pos = { x, y };
      switch (ch) {
        case '#': walls[y * width + x] = true; break;
        case 'P': walls[y * width + x] = true; decor.push({ kind: 'pillar', pos }); break;
        case 'B': decor.push({ kind: 'banner', pos: { x, y: y - 1 } }); break;
        case 'F': decor.push({ kind: 'fountain', pos: { x, y: y - 1 } }); break;
        case 'D': walls[y * width + x] = true; door = pos; break;
        case 'H': heroSpawns.push(pos); break;
        case 'M': monsterSpawns.push(pos); break;
        case 'C': chests.push(pos); walls[y * width + x] = true; break;
        case 'S': decor.push({ kind: 'spikes', pos }); break;
      }
    });
  });
  return { width, height, rows, walls, heroSpawns, monsterSpawns, door, chests, decor };
}
