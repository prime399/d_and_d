// Helpers for reading the raw 5e-bits SRD JSON dumps in data/srd/.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Raw = Record<string, any>;

const ROOT = join(__dirname, '..', '..', 'data', 'srd');
const cache = new Map<string, Map<string, Raw>>();

export function srd(version: '2014' | '2024', kind: 'Monsters' | 'Spells' | 'Conditions' | 'Rules'): Map<string, Raw> {
  const key = `${version}/${kind}`;
  let m = cache.get(key);
  if (!m) {
    const rows = JSON.parse(readFileSync(join(ROOT, version, `5e-SRD-${kind}.json`), 'utf8')) as Raw[];
    m = new Map(rows.map((r) => [r.index as string, r]));
    cache.set(key, m);
  }
  return m;
}

export function get(version: '2014' | '2024', kind: 'Monsters' | 'Spells' | 'Conditions' | 'Rules', index: string): Raw {
  const r = srd(version, kind).get(index);
  if (!r) throw new Error(`SRD ${version} ${kind} missing: ${index}`);
  return r;
}

/** Strip markdown (headings, tables, emphasis) to plain prose. */
export function plain(md: string): string {
  return md
    .split('\n')
    .filter((l) => !/^\s*\|/.test(l) && !/^#+\s/.test(l))
    .join('\n')
    .replace(/\*\*\*?([^*]+)\*\*\*?/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
}

/** Text of a 2014 rule section, optionally only the `#### heading` sub-part. */
export function rule2014Text(index: string, heading?: string): string {
  const desc: string = get('2014', 'Rules', index).desc ?? '';
  if (!heading) return plain(desc);
  const lines = desc.split('\n');
  const start = lines.findIndex((l) => /^#+\s/.test(l) && l.replace(/^#+\s*/, '').trim() === heading);
  if (start < 0) throw new Error(`Heading "${heading}" not found in ${index}`);
  const level = lines[start].match(/^#+/)![0].length;
  const out: string[] = [];
  for (const l of lines.slice(start + 1)) {
    const h = l.match(/^(#+)\s/);
    if (h && h[1].length <= level) break;
    out.push(l);
  }
  return plain(out.join('\n'));
}

/** Cut text to at most `max` chars at a sentence boundary. */
export function clip(text: string, max = 1000): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
  return (end > 200 ? cut.slice(0, end + 1) : cut.slice(0, max - 1) + '…').trim();
}

/** "30 ft." → tiles (ft/5), capped. */
export function feetToTiles(ft: string | number | undefined, cap: number): number {
  const n = typeof ft === 'number' ? ft : parseInt(String(ft ?? '0'), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(cap, Math.max(1, Math.floor(n / 5)));
}
