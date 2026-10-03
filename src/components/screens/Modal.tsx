'use client';
import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE = 'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Keeps Tab focus inside `ref` and calls onEscape on Escape. Restores focus on unmount. */
export function useFocusTrap<T extends HTMLElement>(onEscape?: () => void) {
  const ref = useRef<T>(null);
  const esc = useRef(onEscape);
  useEffect(() => {
    esc.current = onEscape;
  });
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = root.querySelector<HTMLElement>('[data-autofocus]') ?? root.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && esc.current) {
        e.stopPropagation();
        esc.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const a = items[0], z = items[items.length - 1];
      if (!root.contains(document.activeElement)) {
        e.preventDefault();
        a.focus();
      } else if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    root.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('keydown', onKey);
      if (prev && document.contains(prev)) prev.focus();
    };
  }, []);
  return ref;
}

export function Modal({ children, label, onEscape, className = '', fixed = false }: {
  children: ReactNode; label: string; onEscape?: () => void; className?: string; fixed?: boolean;
}) {
  const ref = useFocusTrap<HTMLDivElement>(onEscape);
  return (
    <div className={`${fixed ? 'fixed z-[60]' : 'absolute z-40'} inset-0 grid place-items-center overflow-y-auto bg-black/65 p-4 backdrop-blur-[2px] scr-fade`} onClick={onEscape ? (e) => e.target === e.currentTarget && onEscape() : undefined}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} className={`scr-card scr-rise ${className}`}>
        {children}
      </div>
    </div>
  );
}
