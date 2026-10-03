'use client';
import type { ReactNode } from 'react';

/** CSS-only tooltip: shows on hover and on keyboard focus inside the wrapper. */
export function Tip({ tip, children, side = 'top', align = 'center', className = '' }: {
  tip: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'right';
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  return (
    <span className={`hud-tip-wrap ${className}`}>
      {children}
      <span role="tooltip" className={`hud-tip hud-tip-${side} hud-tip-${align}`}>{tip}</span>
    </span>
  );
}
