// Word-level diff (LCS) between two editions' text, good enough for short SRD paragraphs.
export type Seg = { t: string; op: 'same' | 'add' | 'del' };

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, '');

export function diffWords(a: string, b: string): { left: Seg[]; right: Seg[] } {
  const A = a.split(/(\s+)/).filter(Boolean);
  const B = b.split(/(\s+)/).filter(Boolean);
  const n = A.length;
  const m = B.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = norm(A[i]) === norm(B[j]) && norm(A[i]) !== '' ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const left: Seg[] = [];
  const right: Seg[] = [];
  const push = (arr: Seg[], t: string, op: Seg['op']) => {
    const last = arr[arr.length - 1];
    // whitespace inherits the surrounding op so highlights read as phrases
    if (last && (last.op === op || /^\s+$/.test(t))) last.t += t;
    else arr.push({ t, op });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (norm(A[i]) === norm(B[j]) && norm(A[i]) !== '') {
      push(left, A[i++], 'same');
      push(right, B[j++], 'same');
    } else if (/^\s+$/.test(A[i]) && /^\s+$/.test(B[j])) {
      push(left, A[i++], 'same');
      push(right, B[j++], 'same');
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push(left, A[i++], 'del');
    else push(right, B[j++], 'add');
  }
  while (i < n) push(left, A[i++], 'del');
  while (j < m) push(right, B[j++], 'add');
  return { left, right };
}

/** similarity 0..1 by shared words, used to pair up effect lines between editions */
export function similarity(a: string, b: string) {
  const wa = new Set(a.split(/\s+/).map(norm).filter((w) => w.length > 2));
  const wb = new Set(b.split(/\s+/).map(norm).filter((w) => w.length > 2));
  if (!wa.size || !wb.size) return 0;
  let s = 0;
  wa.forEach((w) => wb.has(w) && s++);
  return s / Math.min(wa.size, wb.size);
}

export interface Row {
  old?: string;
  neu?: string;
}

/** align two lists of effect lines: greedy best-match pairing, unmatched lines become pure add/remove rows */
export function alignLines(olds: string[], news: string[]): Row[] {
  const used = new Set<number>();
  const pairOf = new Map<number, number>();
  news.forEach((nl, ni) => {
    let best = -1;
    let bs = 0.28;
    olds.forEach((ol, oi) => {
      if (used.has(oi)) return;
      const s = similarity(ol, nl);
      if (s > bs) {
        bs = s;
        best = oi;
      }
    });
    if (best >= 0) {
      used.add(best);
      pairOf.set(ni, best);
    }
  });
  const rows: Row[] = [];
  const emitted = new Set<number>();
  news.forEach((nl, ni) => {
    const oi = pairOf.get(ni);
    if (oi === undefined) {
      rows.push({ neu: nl });
      return;
    }
    // removed lines that sit before this pairing in the old list
    for (let k = 0; k < oi; k++) {
      if (!used.has(k) && !emitted.has(k)) {
        emitted.add(k);
        rows.push({ old: olds[k] });
      }
    }
    emitted.add(oi);
    rows.push({ old: olds[oi], neu: nl });
  });
  olds.forEach((ol, oi) => !emitted.has(oi) && rows.push({ old: ol }));
  return rows;
}
