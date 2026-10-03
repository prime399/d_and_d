// Reveals text in ~30-char chunks per frame; instant under reduced motion.
import { useEffect, useState } from 'react';

const CHUNK = 30;

export function useTypewriter(text: string, animate: boolean) {
  const [n, setN] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const id = requestAnimationFrame(() => setN(text.length));
      return () => cancelAnimationFrame(id);
    }
    let i = 0;
    let raf = 0;
    const step = () => {
      i = Math.min(text.length, i + CHUNK);
      setN(i);
      if (i < text.length) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, animate]);
  const done = !animate || n >= text.length;
  return { shown: done ? text : safeCut(text, n), done };
}

/** Never cut inside a [[citation]] so chips don't flash as raw text. */
function safeCut(text: string, n: number) {
  const s = text.slice(0, n);
  const open = s.lastIndexOf('[[');
  return open > s.lastIndexOf(']]') ? s.slice(0, open) : s;
}
