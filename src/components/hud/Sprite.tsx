'use client';
import type { CSSProperties } from 'react';
import { ATLAS_SIZE, FRAMES } from './atlasFrames';

const ATLAS = '/assets/sprites/dungeon.png';

/** Draws one atlas frame, scaled to fit `size` px on its longest side. */
export function Sprite({ frame, size, className = '', style }: { frame: string; size: number; className?: string; style?: CSSProperties }) {
  const f = FRAMES[frame];
  if (!f) return null;
  const [x, y, w, h] = f;
  const s = size / Math.max(w, h);
  return (
    <span
      aria-hidden
      className={`hud-sprite ${className}`}
      style={{
        width: w * s,
        height: h * s,
        backgroundImage: `url(${ATLAS})`,
        backgroundPosition: `${-x * s}px ${-y * s}px`,
        backgroundSize: `${ATLAS_SIZE * s}px ${ATLAS_SIZE * s}px`,
        ...style,
      }}
    />
  );
}

/** Idle frame of a character sprite (some sprites have a single "_anim" set). */
export function idleFrame(spriteKey: string) {
  for (const k of [`${spriteKey}_idle_anim_f0`, `${spriteKey}_anim_f0`, `${spriteKey}_anim_f1`]) if (FRAMES[k]) return k;
  return 'skull';
}

/** Square head-and-shoulders crop of a character's idle frame. */
export function Portrait({ spriteKey, size, className = '' }: { spriteKey: string; size: number; className?: string }) {
  const f = FRAMES[idleFrame(spriteKey)];
  const [x, y, w, h] = f;
  // tall sprites (16x28 heroes): crop a w×w square starting a little below the top margin
  const side = Math.min(w, h);
  const oy = h > w * 1.25 ? Math.round((h - w) * 0.35) : Math.round((h - side) / 2);
  const s = size / side;
  return (
    <span
      aria-hidden
      className={`hud-sprite block shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${ATLAS})`,
        backgroundPosition: `${-x * s}px ${-(y + oy) * s}px`,
        backgroundSize: `${ATLAS_SIZE * s}px ${ATLAS_SIZE * s}px`,
      }}
    />
  );
}
