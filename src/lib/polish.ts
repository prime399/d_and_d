// Post-processing for DM replies: strip markdown and leaked tool markup, keep only verifiable
// [[doc-id]] citations, and hold replies to the word caps by trimming at sentence boundaries.

export type DmMode = 'ask' | 'narrate';

/** Hard caps (citations don't count). Prompts aim a little lower. */
export const WORD_CAP: Record<DmMode, number> = { ask: 90, narrate: 55 };

/** Narration must never talk about the machinery behind it. */
const LEAK = /\b(look(?:ed|ing)?[ -]?ups?|quer(?:y|ies|ied)|tool[- ]?calls?|the tools|my tools|database|sanity|knowledge[- ]base|groq|citations?|documents?|the (?:rules )?tome is silent)\b/i;

const CITE = /\[\[[^\]]+\]\]/g;

/** Some open models leak their tool-call template as text when tools are disabled; drop it. */
export function cleanReply(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<｜?DSML｜?[\s\S]*$/u, '')
    .replace(/<[|｜][^>]*>[\s\S]*$/u, '')
    .trim();
}

export const wordCount = (s: string) => s.replace(CITE, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Splits into sentences without breaking dotted ids; citations that open a sentence join the previous one. */
export function sentences(t: string): string[] {
  const ids: string[] = [];
  const masked = t.replace(CITE, (m) => `\u0001${ids.push(m) - 1}\u0002`);
  const out: string[] = [];
  for (let p of masked.split(/(?<=[.!?]["”’)]?)\s+(?=\S)/)) {
    const lead = p.match(/^(?:\u0001\d+\u0002\s*)+/);
    if (lead && out.length) {
      out[out.length - 1] += ` ${lead[0].trim()}`;
      p = p.slice(lead[0].length).trim();
      if (!p) continue;
    }
    out.push(p.trim());
  }
  return out.filter(Boolean).map((s) => s.replace(/\u0001(\d+)\u0002/g, (_, i: string) => ids[Number(i)]));
}

const complete = (s: string) => /[.!?]["”’)]?(?:\s*\[\[[^\]]+\]\])*$/.test(s);

export function polishReply(raw: string, opts: { mode: DmMode; allowed: Set<string> }): string {
  let t = cleanReply(raw)
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*•+]|\d+[.)])\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1');
  // citations: normalise; bare "(condition.prone)" becomes a chip; anything unverifiable is dropped
  t = t
    .replace(/\(\s*((?:rule|condition|spell|monster)\.[a-z0-9.-]*[a-z0-9])\s*\)/g, (_, id: string) => (opts.allowed.has(id) ? ` [[${id}]]` : ''))
    .replace(/\[\[\s*([^\]]+?)\s*\]\]/g, (_, id: string) => (opts.allowed.has(id) ? ` [[${id}]]` : ''))
    .replace(/(\[\[[^\]]+\]\])(?:\s*\1)+/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .trim();

  let ss = sentences(t);
  if (opts.mode === 'narrate') ss = ss.filter((s) => !LEAK.test(s.replace(CITE, '')));
  // a reply cut off by maxOutputTokens: drop the dangling fragment
  if (ss.length > 1 && !complete(ss[ss.length - 1])) ss.pop();

  const cap = WORD_CAP[opts.mode];
  if (ss.reduce((n, s) => n + wordCount(s), 0) > cap) {
    const ci = ss.findIndex((s) => s.startsWith('Rules changed:'));
    const changed = ci >= 0 ? ss[ci] : null;
    const budget = cap - (changed && wordCount(changed) <= cap / 3 ? wordCount(changed) : 0);
    const out: string[] = [];
    let n = 0;
    for (let i = 0; i < ss.length; i++) {
      if (i === ci) continue;
      const w = wordCount(ss[i]);
      if (n + w > budget) break;
      out.push(ss[i]);
      n += w;
    }
    if (!out.length) out.push(clipWords(ss[0], budget));
    if (changed && n + wordCount(changed) <= cap) out.push(changed);
    ss = out;
  }
  let res = ss.join(' ').trim();
  if (res && !complete(res)) res = `${res.replace(/[,;:\s]+$/, '')}.`;
  return res;
}

/**
 * Edition-difference answers sometimes end "In 2014, ..." instead of the "Rules changed:" line the UI renders as a
 * 2014 → 2024 callout. Promote the first such sentence that cites a .2014 document; never adds one from nothing.
 */
export function promoteChange(text: string): string {
  if (/Rules changed:/.test(text)) return text;
  const ss = sentences(text);
  const i = ss.findIndex((s, k) => k > 0 && /\[\[[^\]]+\.2014\]\]/.test(s) && /^(?:In|Under)(?: the)? (?:2014|older|original|earlier)\b|^(?:The )?2014\b|^Previously\b|^Before 2024\b/i.test(s));
  if (i < 0) return text;
  const s = ss.splice(i, 1)[0].replace(/^(?:In|Under)(?: the)? (?:2014|older|original|earlier)(?: rules| SRD| version| edition)?,?\s*/i, 'In 2014 ');
  return [...ss, `Rules changed: ${s}`].join(' ');
}

function clipWords(s: string, n: number): string {
  const parts = s.split(/\s+/);
  const out: string[] = [];
  let w = 0;
  for (const p of parts) {
    const isWord = !/^\[\[/.test(p) && /[\p{L}\p{N}]/u.test(p);
    if (isWord && w >= n) break;
    out.push(p);
    if (isWord) w++;
  }
  return `${out.join(' ').replace(/[,;:]$/, '')}…`;
}
