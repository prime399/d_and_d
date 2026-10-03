'use client';
// Animated dice tray. The engine has already rolled; this only shows the dice tumbling and landing on its faces.
import { useEffect, useState, type CSSProperties } from 'react';
import { DieFace, type DieTone } from './dice/DieFace';

export interface DiceShow {
  key: number;
  label: string;
  sides: number;
  faces: number[];
  modifier?: number;
  total: number;
  /** for d20 attack/save: the kept face */
  kept?: number;
  advantage?: 'adv' | 'dis';
  outcome?: 'crit' | 'fumble' | 'hit' | 'miss' | 'save' | 'fail' | 'none';
  /** target number the roll is compared against */
  vs?: { label: 'AC' | 'DC'; value: number };
  /** who rolled, used for tinting */
  side?: 'hero' | 'enemy';
  kind?: 'attack' | 'save' | 'damage' | 'heal' | 'check';
}

// land times leave the result plate up for >=300ms within core's holds (hero d20 1150, enemy d20 760, dmg 750/480)
const LAND_D20 = 620;
const LAND_OTHER = 420;
const LAND_D20_FAST = 420;
const LAND_OTHER_FAST = 180;
const VISIBLE_MS = 2000;

const OUTCOME: Record<string, { text: string; cls: string }> = {
  crit: { text: 'CRITICAL HIT', cls: 'dice-out-crit' },
  fumble: { text: 'FUMBLE', cls: 'dice-out-bad' },
  hit: { text: 'HIT', cls: 'dice-out-good' },
  miss: { text: 'MISS', cls: 'dice-out-bad' },
  save: { text: 'SAVED', cls: 'dice-out-good' },
  fail: { text: 'FAILED', cls: 'dice-out-bad' },
};

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Number flicker shown while a die tumbles (purely decorative). */
function useFlicker(active: boolean, sides: number, seed: number) {
  const [n, setN] = useState(() => 1 + ((seed * 7) % sides));
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN(1 + Math.floor(Math.random() * sides)), 70);
    return () => clearInterval(id);
  }, [active, sides]);
  return n;
}

function Die({ sides, value, landed, tone, cracked, dropped, index, uid, reduced }: {
  sides: number; value: number; landed: boolean; tone: DieTone; cracked: boolean; dropped: boolean; index: number; uid: string; reduced: boolean;
}) {
  const flicker = useFlicker(!landed && !reduced, sides, index + value);
  const style = { '--i': index, '--spin': `${(index % 2 ? -1 : 1) * (540 + index * 90)}deg` } as CSSProperties;
  return (
    <div className={`die3 die3-d${sides} ${landed ? 'die3-landed' : 'die3-rolling'} ${dropped && landed ? 'die3-dropped' : ''} tone-${tone}`} style={style}>
      <div className="die3-shadow" />
      <div className="die3-body">
        <DieFace sides={sides} value={landed || reduced ? value : flicker} tone={landed ? tone : 'bone'} cracked={landed && cracked} uid={uid} />
      </div>
    </div>
  );
}

function Burst() {
  return (
    <div className="dice-burst" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} style={{ '--a': `${(i / 14) * 360}deg`, '--d': `${60 + (i % 3) * 22}px` } as CSSProperties} />
      ))}
    </div>
  );
}

function Tray({ show }: { show: DiceShow }) {
  const [reduced] = useState(prefersReducedMotion);
  const isD20 = show.sides === 20;
  const [landed, setLanded] = useState(reduced);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const fast = show.side === 'enemy';
    const land = isD20 ? (fast ? LAND_D20_FAST : LAND_D20) : fast ? LAND_OTHER_FAST : LAND_OTHER;
    const t1 = setTimeout(() => setLanded(true), reduced ? 0 : land);
    const t2 = setTimeout(() => setGone(true), VISIBLE_MS + (reduced ? 0 : 200));
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isD20, reduced, show.side]);
  if (gone) return null;

  const kind = show.kind ?? (isD20 ? (show.vs?.label === 'DC' ? 'save' : 'attack') : /heal|cure/i.test(show.label) ? 'heal' : 'damage');
  const multiD20 = isD20 && show.faces.length > 1 && show.kept !== undefined;
  const keptIdx = multiD20 ? show.faces.indexOf(show.kept!) : 0;
  const keptFace = isD20 ? (show.kept ?? show.faces[0]) : undefined;
  const nat20 = isD20 && keptFace === 20;
  const nat1 = isD20 && keptFace === 1;
  const baseTone: DieTone = kind === 'damage' ? 'damage' : kind === 'heal' ? 'heal' : show.side === 'hero' ? 'hero' : show.side === 'enemy' ? 'enemy' : 'bone';
  const toneFor = (i: number): DieTone => {
    const isKept = !multiD20 || i === keptIdx;
    if (isD20 && isKept && nat20) return 'gold';
    if (isD20 && isKept && nat1) return 'blood';
    return baseTone;
  };

  const sumFaces = isD20 ? keptFace! : show.faces.reduce((a, b) => a + b, 0);
  const mod = show.modifier ?? show.total - sumFaces;
  const facesText = isD20 ? String(sumFaces) : show.faces.length > 1 ? show.faces.join(' + ') : String(sumFaces);
  const lhs = mod ? `${facesText} ${mod >= 0 ? '+' : '−'} ${Math.abs(mod)}` : show.faces.length > 1 && !isD20 ? facesText : '';
  const mathText = lhs ? `${lhs} = ${show.total}` : `${show.total}`;
  const out = show.outcome && show.outcome !== 'none' ? OUTCOME[show.outcome] : undefined;
  const kindLabel = kind === 'damage' ? 'DAMAGE' : kind === 'heal' ? 'HEALING' : kind === 'save' ? 'SAVING THROW' : kind === 'check' ? 'CHECK' : 'ATTACK';
  const dice = `${show.faces.length > 1 && !multiD20 ? show.faces.length : multiD20 ? 2 : 1}d${show.sides}`;
  const srText = `${show.label}: rolled ${multiD20 ? `${show.faces.join(' and ')}, kept ${keptFace}` : show.faces.join(', ')}. ${mathText}${show.vs ? ` versus ${show.vs.label} ${show.vs.value}` : ''}${out ? `. ${out.text}` : ''}`;

  return (
    <div style={{ '--land': `${show.side === 'enemy' ? (isD20 ? LAND_D20_FAST : LAND_OTHER_FAST) : isD20 ? LAND_D20 : LAND_OTHER}ms` } as CSSProperties} className={`dice-tray ${landed ? 'is-landed' : ''} ${nat20 && landed ? 'is-crit' : ''} ${nat1 && landed ? 'is-fumble' : ''} ${reduced ? 'is-reduced' : ''}`}>
      <div className="dice-head" aria-hidden="true">
        <span className={`dice-kind dice-kind-${kind}`}>{kindLabel}</span>
        <span className="dice-label">{show.label}</span>
        {show.advantage && <span className={show.advantage === 'adv' ? 'dice-adv' : 'dice-dis'}>{show.advantage === 'adv' ? 'ADVANTAGE' : 'DISADVANTAGE'}</span>}
      </div>
      <div className="dice-row" aria-hidden="true">
        {nat20 && landed && !reduced && <Burst />}
        {show.faces.slice(0, 8).map((f, i) => (
          <Die
            key={i} uid={`${show.key}-${i}`} index={i} sides={show.sides} value={f} landed={landed} reduced={reduced}
            tone={toneFor(i)} cracked={nat1 && (!multiD20 || i === keptIdx)} dropped={multiD20 && i !== keptIdx}
          />
        ))}
        {show.faces.length > 8 && <span className="dice-more">+{show.faces.length - 8}</span>}
      </div>
      <div className="dice-plate" aria-live="polite" aria-atomic="true">
        <span className="sr-only">{landed ? srText : ''}</span>
        {landed && (
          <div className="dice-plate-inner" aria-hidden="true">
            <span className="dice-notation">{dice}{mod ? (mod > 0 ? `+${mod}` : `${mod}`) : ''}</span>
            {lhs && <span className="dice-math">{lhs} =</span>}
            <span className={`dice-total ${kind === 'damage' ? 'dice-total-dmg' : kind === 'heal' ? 'dice-total-heal' : ''}`}>{show.total}</span>
            {show.vs && <span className="dice-vs">vs {show.vs.label} {show.vs.value}</span>}
            {out && <span className={`dice-out ${out.cls}`}>→ {out.text}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function DiceOverlay({ show }: { show: DiceShow | null }) {
  if (!show) return null;
  // Remount per roll so each roll restarts its own timeline (no state syncing in effects).
  return (
    <div className="pointer-events-none absolute inset-x-0 top-14 z-30 flex justify-center">
      <Tray key={show.key} show={show} />
    </div>
  );
}
