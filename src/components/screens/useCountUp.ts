'use client';
import { useEffect, useState } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Animates 0 → target over `ms` (ease-out). Jumps straight to target with reduced motion. */
export function useCountUp(target: number, ms = 1100, delay = 0) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (t: number) => {
      if (reduced()) return setN(target);
      const p = Math.min(1, Math.max(0, (t - t0) / ms));
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, delay]);
  return n;
}
