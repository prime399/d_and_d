'use client';
import type { ReactNode } from 'react';
import { Sprite } from './Sprite';

const svg = (children: ReactNode, color: string, size: number) => (
  <svg aria-hidden viewBox="0 0 16 16" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" shapeRendering="geometricPrecision">
    {children}
  </svg>
);

export const BootIcon = ({ size = 18 }: { size?: number }) =>
  svg(<path d="M5 2v7l-2 2v2h10v-1.5L8 10V2z" fill="#7dd3fc33" />, '#7dd3fc', size);
export const ShieldIcon = ({ size = 18 }: { size?: number }) =>
  svg(<path d="M8 1.8 13 3.6v4c0 3-2.3 5.2-5 6.6C5.3 12.8 3 10.6 3 7.6v-4z" fill="#a7f3d033" />, '#6ee7b7', size);
export const HourglassIcon = ({ size = 18 }: { size?: number }) =>
  svg(<path d="M4 2h8M4 14h8M5 2c0 4 6 4 6 6s-6 2-6 6M11 2c0 4-6 4-6 6s6 2 6 6" />, '#ffe2b0', size);

const SPELL_COLORS: Record<string, string> = {
  fire: '#fb923c', frost: '#7dd3fc', holy: '#fde68a', arcane: '#c4b5fd', thunder: '#93c5fd',
  mind: '#f0abfc', sleep: '#a5b4fc', shield: '#6ee7b7', heal: '#86efac',
};

/** Small glyph per spell iconKey. */
export function SpellGlyph({ iconKey, size = 18 }: { iconKey?: string; size?: number }) {
  const k = iconKey ?? 'arcane';
  const c = SPELL_COLORS[k] ?? SPELL_COLORS.arcane;
  const paths: Record<string, ReactNode> = {
    fire: <path d="M8 14c-2.8 0-4.5-1.8-4.5-4.2C3.5 7 6 5.5 6.5 2c2 1.5 2.5 3 2.3 4.6C9.8 6 10.3 5 10.5 4c1.4 1.3 2 3.3 2 5.6C12.5 12.3 10.7 14 8 14z" fill={`${c}44`} />,
    frost: <path d="M8 1.5v13M2.4 4.8l11.2 6.4M2.4 11.2l11.2-6.4M6.5 2.8 8 4.2l1.5-1.4M6.5 13.2 8 11.8l1.5 1.4" />,
    holy: <><circle cx="8" cy="8" r="2.6" fill={`${c}55`} /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" /></>,
    arcane: <path d="m8 1.5 1.8 4.7 4.7 1.8-4.7 1.8L8 14.5l-1.8-4.7L1.5 8l4.7-1.8z" fill={`${c}44`} />,
    thunder: <path d="M9.5 1.5 4 9h3.5l-1 5.5L12 7H8.5z" fill={`${c}55`} />,
    mind: <><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" fill={c} /></>,
    sleep: <><path d="M10.5 2.2A5.8 5.8 0 1 0 13.8 10 4.6 4.6 0 0 1 10.5 2.2z" fill={`${c}44`} /></>,
    shield: <path d="M8 1.8 13 3.6v4c0 3-2.3 5.2-5 6.6C5.3 12.8 3 10.6 3 7.6v-4z" fill={`${c}33`} />,
    heal: <path d="M6 2h4v4h4v4h-4v4H6v-4H2V6h4z" fill={`${c}44`} />,
  };
  return svg(paths[k] ?? paths.arcane, c, size);
}

/** Pixel weapon icon picked from the attack name. */
export function WeaponIcon({ name, range, size = 22 }: { name: string; range: number; size?: number }) {
  const n = name.toLowerCase();
  const frame =
    n.includes('staff') ? 'weapon_red_magic_staff'
      : n.includes('mace') ? 'weapon_mace'
        : n.includes('javelin') || n.includes('spear') ? 'weapon_spear'
          : n.includes('bow') ? 'weapon_bow'
            : n.includes('axe') ? 'weapon_axe'
              : n.includes('hammer') ? 'weapon_hammer'
                : n.includes('dagger') || n.includes('knife') ? 'weapon_knife'
                  : n.includes('longsword') ? 'weapon_knight_sword'
                    : range > 1 ? 'weapon_bow' : 'weapon_regular_sword';
  return <Sprite frame={frame} size={size} className="hud-weapon" />;
}
