'use client';
import type { CSSProperties } from 'react';
import { IDLE, STATIC } from './sprites';

const ATLAS = 512;

/** Pixel-art character cropped from the dungeon atlas, optionally playing its 4-frame idle loop. */
export function Sprite({ k, scale = 4, anim = true, flip = false, className = '', delay = 0 }: {
  k: string; scale?: number; anim?: boolean; flip?: boolean; className?: string; delay?: number;
}) {
  const isStatic = !IDLE[k];
  const f = IDLE[k] ?? STATIC[k];
  if (!f) return null;
  const [x, y, w, h] = f;
  const style = {
    width: w * scale,
    height: h * scale,
    backgroundImage: 'url(/assets/sprites/dungeon.png)',
    backgroundSize: `${ATLAS * scale}px ${ATLAS * scale}px`,
    backgroundPosition: `-${x * scale}px -${y * scale}px`,
    '--sx': `-${x * scale}px`,
    '--ex': `-${(x + 4 * w) * scale}px`,
    '--sy': `-${y * scale}px`,
    animationDelay: `${delay}ms`,
    transform: flip ? 'scaleX(-1)' : undefined,
  } as CSSProperties;
  return <span aria-hidden className={`sprite ${anim && !isStatic ? 'sprite-idle' : ''} ${className}`} style={style} />;
}
