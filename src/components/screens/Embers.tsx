'use client';
// Deterministic CSS ember particles (no canvas, no randomness at render time).
const rnd = (i: number, s: number) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function Embers({ count = 28, tone = 'ember' }: { count?: number; tone?: 'ember' | 'gold' | 'blood' }) {
  return (
    <div aria-hidden className={`scr-embers scr-embers-${tone}`}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${rnd(i, 1) * 100}%`,
            width: 2 + Math.round(rnd(i, 2) * 3),
            height: 2 + Math.round(rnd(i, 2) * 3),
            animationDuration: `${6 + rnd(i, 3) * 8}s`,
            animationDelay: `-${rnd(i, 4) * 12}s`,
            ['--drift' as string]: `${(rnd(i, 5) - 0.5) * 120}px`,
          }}
        />
      ))}
    </div>
  );
}

export function Confetti({ count = 60 }: { count?: number }) {
  const colors = ['#ffd27a', '#f2d48f', '#7dd3fc', '#6ee7b7', '#fda4af', '#c4b5fd'];
  return (
    <div aria-hidden className="scr-confetti">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${rnd(i, 7) * 100}%`,
            background: colors[i % colors.length],
            animationDuration: `${2.6 + rnd(i, 8) * 2.4}s`,
            animationDelay: `${rnd(i, 9) * 1.6}s`,
            ['--spin' as string]: `${(rnd(i, 10) - 0.5) * 1440}deg`,
            ['--drift' as string]: `${(rnd(i, 11) - 0.5) * 200}px`,
          }}
        />
      ))}
    </div>
  );
}
