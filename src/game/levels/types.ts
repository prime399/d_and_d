// Raw level data: ASCII rows plus lore text. Lore entries map to `L` glyphs
// in row-major order (top-to-bottom, left-to-right).
export interface LevelDef {
  title: string;
  rows: string[];
  lore: { title: string; text: string }[];
  /** Optional per-lair aggro radius override, keyed by lair id. */
  aggro?: Record<number, number>;
}
