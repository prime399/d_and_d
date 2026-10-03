// Faceted, shaded SVG dice: one silhouette per die type, with lit and shadowed facets that read as 3D.
export type DieTone = 'bone' | 'hero' | 'enemy' | 'gold' | 'blood' | 'damage' | 'heal';

interface Geo {
  outline: string;
  /** facets as [points, shade]; shade < 0 darkens, > 0 lightens */
  facets: [string, number][];
  /** the face carrying the number */
  front: string;
  text: { y: number; size: number };
}

const GEO: Record<number, Geo> = {
  4: {
    outline: '50,6 95,88 5,88',
    facets: [['50,6 50,62 5,88', 0.18], ['50,6 95,88 50,62', -0.22], ['5,88 50,62 95,88', -0.4]],
    front: '50,6 50,62 5,88',
    text: { y: 66, size: 26 },
  },
  6: {
    outline: '50,4 92,26 92,76 50,98 8,76 8,26',
    facets: [['50,4 92,26 50,48 8,26', 0.25], ['8,26 50,48 50,98 8,76', 0], ['50,48 92,26 92,76 50,98', -0.3]],
    front: '8,26 50,48 50,98 8,76',
    text: { y: 66, size: 26 },
  },
  8: {
    outline: '50,3 94,50 50,97 6,50',
    facets: [['50,3 6,50 50,62', 0.2], ['50,3 50,62 94,50', -0.15], ['6,50 50,97 50,62', -0.3], ['50,62 50,97 94,50', -0.45]],
    front: '50,3 6,50 50,62 94,50',
    text: { y: 46, size: 30 },
  },
  10: {
    outline: '50,3 93,42 84,70 50,97 16,70 7,42',
    facets: [['50,3 7,42 26,60', 0.15], ['50,3 74,60 93,42', -0.2], ['7,42 26,60 50,97 16,70', -0.25], ['93,42 74,60 50,97 84,70', -0.4], ['50,3 26,60 50,97 74,60', 0.05]],
    front: '50,3 26,60 50,97 74,60',
    text: { y: 58, size: 28 },
  },
  12: {
    outline: '50,3 84,16 97,50 84,84 50,97 16,84 3,50 16,16',
    facets: [['50,3 84,16 75,34 50,24 25,34 16,16', 0.25], ['16,16 25,34 31,66 16,84 3,50', 0], ['84,16 97,50 84,84 69,66 75,34', -0.3], ['16,84 31,66 69,66 84,84 50,97', -0.4]],
    front: '50,24 75,34 69,66 31,66 25,34',
    text: { y: 50, size: 26 },
  },
  20: {
    outline: '50,3 92,27 92,73 50,97 8,73 8,27',
    facets: [
      ['50,3 8,27 50,22', 0.3], ['50,3 50,22 92,27', 0.1],
      ['8,27 24,66 50,22', 0.12], ['92,27 50,22 76,66', -0.2],
      ['8,27 8,73 24,66', -0.05], ['92,27 92,73 76,66', -0.38],
      ['8,73 50,97 24,66', -0.3], ['92,73 76,66 50,97', -0.48], ['24,66 76,66 50,97', -0.4],
    ],
    front: '50,22 76,66 24,66',
    text: { y: 52, size: 22 },
  },
};

// [light, mid, dark, ink]
const TONES: Record<DieTone, [string, string, string, string]> = {
  bone: ['#f6ecd6', '#d6c39c', '#7d6845', '#1b120a'],
  hero: ['#d9ecff', '#6ea8e0', '#1f4a7a', '#06121f'],
  enemy: ['#ffd6d6', '#d06464', '#6a1a1f', '#1d0507'],
  gold: ['#fff4c2', '#ffd27a', '#a8680c', '#2a1600'],
  blood: ['#ff9c8c', '#a3201c', '#3d0507', '#fff1ec'],
  damage: ['#ffe1d6', '#e0805f', '#7a2a17', '#1e0702'],
  heal: ['#dcfff0', '#5fd3a0', '#145a3e', '#03140c'],
};

export function geoFor(sides: number) {
  return GEO[sides] ?? GEO[20];
}

export function DieFace({ sides, value, tone, cracked, uid }: { sides: number; value: number | string; tone: DieTone; cracked?: boolean; uid: string }) {
  const g = geoFor(sides);
  const [light, mid, dark, ink] = TONES[tone];
  const gid = `dg-${uid}`;
  return (
    <svg viewBox="0 0 100 100" className="die-svg" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gid} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="0.5" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
      </defs>
      <polygon points={g.outline} fill={`url(#${gid})`} />
      {g.facets.map(([pts, shade], i) => (
        <polygon key={i} points={pts} fill={shade >= 0 ? '#fff' : '#000'} fillOpacity={Math.abs(shade)} stroke={dark} strokeOpacity={0.55} strokeWidth={1.2} strokeLinejoin="round" />
      ))}
      <polygon points={g.front} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={1} strokeLinejoin="round" />
      {cracked && (
        <path d="M30,18 L44,40 L36,52 L52,70 L46,90 M44,40 L60,34 M52,70 L68,76" fill="none" stroke="#120202" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      )}
      <polygon points={g.outline} fill="none" stroke="#120a05" strokeWidth={3.5} strokeLinejoin="round" />
      <text x="50" y={g.text.y} textAnchor="middle" dominantBaseline="central" fontSize={g.text.size} fontWeight={800} fill={ink} className="die-num">
        {value}
      </text>
    </svg>
  );
}
