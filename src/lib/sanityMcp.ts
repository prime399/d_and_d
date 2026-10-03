// Direct, stateless JSON-RPC calls to the two Sanity Context MCP endpoints (no MCP handshake per request).
// GROQ mode: exact records (stats, dice, ids). Knowledge Base mode: rules prose with 2014 vs 2024 notes.
import fallbackJson from '@/game/content/fallback.json';
import type { GameContent } from '@/game/content/types';

const content = fallbackJson as unknown as GameContent;

export type Via = 'sanity-context' | 'knowledge-base';

/** Every doc id the game knows; citations outside this set are dropped. */
export const KNOWN_IDS = new Set<string>([
  ...content.rules.map((d) => d._id),
  ...content.conditions.map((d) => d._id),
  ...content.spells.map((d) => d._id),
  ...content.monsters.map((d) => d._id),
  ...content.heroes.map((d) => d._id),
]);

/** title (lowercase) -> ids, used to map KB "Sources" footnotes back to dataset documents */
const BY_TITLE = new Map<string, string[]>();
for (const d of [...content.rules.map((r) => ({ _id: r._id, t: r.title })), ...content.conditions.map((c) => ({ _id: c._id, t: c.name }))]) {
  const k = d.t.toLowerCase();
  BY_TITLE.set(k, [...(BY_TITLE.get(k) ?? []), d._id]);
}

const GROQ_TOOLS = ['groq_query', 'initial_context', 'schema_explorer', 'array_field_reader'];
const KB_TOOLS = ['initial_context', 'knowledge_base_search', 'knowledge_base_read'];
export const GROQ_SCOPE = '_type in ["rule","condition","spell","monster"]';

interface Endpoint {
  url: string;
  token: string;
}

function endpoint(via: Via): Endpoint | null {
  const raw = via === 'sanity-context' ? process.env.SANITY_CONTEXT_MCP_URL : process.env.SANITY_KB_MCP_URL;
  const token = via === 'sanity-context' ? process.env.SANITY_CONTEXT_TOKEN : (process.env.SANITY_KB_TOKEN ?? process.env.SANITY_CONTEXT_TOKEN);
  if (!raw || !token) return null;
  const u = new URL(raw);
  // the org token is only ever sent to Sanity's own API host
  if (u.protocol !== 'https:' || u.hostname !== 'api.sanity.io') throw new Error(`Refusing non-Sanity MCP host ${u.hostname}`);
  u.searchParams.set('tools', (via === 'sanity-context' ? GROQ_TOOLS : KB_TOOLS).join(','));
  if (via === 'sanity-context') u.searchParams.set('groqFilter', GROQ_SCOPE);
  return { url: u.toString(), token };
}

export const hasSanity = () => Boolean(endpoint('sanity-context') || endpoint('knowledge-base'));
export const hasKb = () => Boolean(endpoint('knowledge-base'));
export const hasGroq = () => Boolean(endpoint('sanity-context'));

let rpcId = 1;

/** Calls one MCP tool and returns the concatenated text content. Throws on transport or tool errors. */
export async function mcpCall(via: Via, name: string, args: Record<string, unknown>, timeoutMs = 8000): Promise<string> {
  const ep = endpoint(via);
  if (!ep) throw new Error(`${via} endpoint not configured`);
  const res = await fetch(ep.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ep.token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`MCP ${name} HTTP ${res.status}`);
  let raw = await res.text();
  // tolerate an SSE-framed reply
  if (raw.startsWith('event:') || raw.startsWith('data:')) raw = raw.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).join('');
  const j = JSON.parse(raw) as { result?: { content?: { type: string; text?: string }[]; isError?: boolean }; error?: { message: string } };
  if (j.error) throw new Error(`MCP ${name}: ${j.error.message}`);
  const text = (j.result?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
  if (j.result?.isError) throw new Error(`MCP ${name}: ${text.slice(0, 200)}`);
  return text;
}

// ---------------- Knowledge Base ----------------

export interface KbInfo {
  id: string;
  outline: string[];
}

let kbInfo: Promise<KbInfo> | null = null;

/** initial_context, cached per server instance: the KB id and its outline of entry paths. */
export function kbContext(): Promise<KbInfo> {
  if (!kbInfo) {
    kbInfo = mcpCall('knowledge-base', 'initial_context', {}).then((t) => {
      const id = t.match(/Knowledge base id:\s*`?(kb[A-Za-z0-9]+)`?/)?.[1];
      if (!id) throw new Error('No knowledge base id in initial_context');
      const outline = [...t.matchAll(/^([a-z0-9_]+(?:\/[a-z0-9_]+)*)(?: \[core\])?$/gm)].map((m) => m[1]).filter((p) => p.includes('/') || p.includes('_'));
      return { id, outline };
    });
    kbInfo.catch(() => (kbInfo = null)); // retry next request
  }
  return kbInfo;
}

export interface KbResult {
  /** entry text with footnotes rewritten to [[doc-id]] citations */
  text: string;
  ids: string[];
  /** "Edition difference" call-outs the KB wrote while indexing, e.g. "Grappled: The 2024 version adds …" */
  notes: string[];
  paths: string[];
}

/**
 * KB entries cite their dataset sources as numbered footnotes ("[1]" + "1. Grappled — Dataset").
 * Map each footnote to a document id (2014 vs 2024 decided by the line it first appears on)
 * and inline it as [[id]] so the model can cite exact ids.
 */
export function linkKbEntries(md: string, maxPerEntry = 4500): KbResult {
  const entries = md.split(/^(?=# )/m).filter((e) => e.startsWith('# '));
  const ids = new Set<string>();
  const notes: string[] = [];
  const out: string[] = [];
  for (const entry of entries) {
    const [body, sources = ''] = entry.split(/^## Sources\s*$/m);
    const map = new Map<string, string>();
    for (const m of sources.matchAll(/^(\d+)\.\s+(.+?)\s+—\s+\S.*$/gm)) {
      const [, n, title] = m;
      const cands = BY_TITLE.get(title.trim().toLowerCase());
      if (!cands?.length) continue;
      const line = body.split('\n').find((l) => l.includes(`[${n}]`)) ?? '';
      const legacy = /2014/.test(line);
      const id = cands.find((c) => c.endsWith('.2014') === legacy) ?? cands[0];
      map.set(n, id);
    }
    let section = '';
    for (const l of body.split('\n')) {
      const h = l.match(/^#{2,3}\s+(.+)$/);
      if (h) section = h[1].trim();
      const note = l.match(/^>\s*\*\*Edition difference:\*\*\s*(.+)$/);
      if (note) notes.push(`${section ? `${section}: ` : ''}${note[1].replace(/\s*\[\d+\]/g, '').trim()}`);
    }
    let text = body.replace(/\s*\[(\d+)\]/g, (s, n: string) => {
      const id = map.get(n);
      if (!id) return '';
      ids.add(id);
      return ` [[${id}]]`;
    });
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    out.push(text.length > maxPerEntry ? `${text.slice(0, maxPerEntry)}…` : text);
  }
  const paths = [...md.matchAll(/`([a-z0-9_]+(?:\/[a-z0-9_]+)+|[a-z_]+)`/g)].map((m) => m[1]);
  return { text: out.join('\n\n---\n\n'), ids: [...ids], notes: [...new Set(notes)], paths };
}

export async function kbSearch(query: string, limit = 2): Promise<KbResult> {
  const kb = await kbContext();
  const raw = await mcpCall('knowledge-base', 'knowledge_base_search', { knowledgeBase: kb.id, query, return: 'entries', limit });
  if (/^No entries matched/.test(raw.trim())) return { text: '', ids: [], notes: [], paths: [] };
  return linkKbEntries(raw);
}

export async function kbRead(paths: string[]): Promise<KbResult> {
  const kb = await kbContext();
  const raw = await mcpCall('knowledge-base', 'knowledge_base_read', { knowledgeBase: kb.id, paths: paths.slice(0, 4) });
  return linkKbEntries(raw);
}

const STOP = new Set(
  'a an and are as at be but by can do does did for from has have how i if in into is it its me my of on or so than that the their them then there these they this to was we what when where which while who why will with would you your work works working rule rules dm please tell explain about between happen happens get gets change changes changed versus vs 2014 2024 edition editions new old version versions'.split(' '),
);

/** BM25 matches exact words: keep content words from the question (+ obvious variants). */
export function kbKeywords(question: string): string {
  const words = question.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  const out = new Set<string>();
  for (const w of words) {
    out.add(w);
    if (w.endsWith('ing') && w.length > 6) out.add(w.slice(0, -3));
    if (w.endsWith('ed') && w.length > 5) out.add(w.slice(0, -2));
    if (w.endsWith('s') && w.length > 4) out.add(w.slice(0, -1));
  }
  return [...out].slice(0, 10).join(' ');
}

// ---------------- GROQ ----------------

export interface GroqResult {
  docs: Record<string, unknown>[];
  ids: string[];
}

/** Runs GROQ through the Context MCP (scoped by tools= + groqFilter=). */
export async function groq(query: string): Promise<GroqResult> {
  const text = await mcpCall('sanity-context', 'groq_query', { query });
  const parsed = JSON.parse(text) as { result?: unknown };
  const docs = Array.isArray(parsed.result) ? (parsed.result as Record<string, unknown>[]) : parsed.result ? [parsed.result as Record<string, unknown>] : [];
  const ids = [...new Set(text.match(ID_RE) ?? [])];
  return { docs, ids };
}

export const ID_RE = /\b(?:rule|condition|spell|monster|hero|room)\.[a-z0-9-]+(?:\.2014)?\b/g;

/** Hard guard on model-written GROQ, independent of the server-side filter. */
export function checkGroq(q: string): string | null {
  if (q.length > 2000) return 'Query too long.';
  if (!q.includes('_type') && !/_id\s*(==|in)/.test(q)) return 'Queries must filter by _type or _id (rule, condition, spell or monster).';
  if (/_id\s+in\s+path\(|drafts\./i.test(q)) return 'Draft and path queries are not allowed.';
  return null;
}

/** Docs whose name/title appears in the question: candidates for an exact GROQ fetch. */
export function guessIds(question: string): string[] {
  const q = ` ${question.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ')} `;
  const hit = (name: string) => {
    const n = name.toLowerCase();
    return q.includes(` ${n} `) || q.includes(` ${n}s `) || q.includes(` ${n}ed `) || q.includes(` ${n.replace(/ed$/, '')} `);
  };
  const ids: string[] = [];
  for (const m of content.monsters) if (hit(m.name)) ids.push(m._id);
  for (const s of content.spells) if (hit(s.name)) ids.push(s._id);
  for (const c of content.conditions) if (hit(c.name)) ids.push(c._id);
  for (const r of content.rules) if (r.title.split(' ').length <= 3 && hit(r.title)) ids.push(r._id);
  return [...new Set(ids)].slice(0, 6);
}

// The Context MCP condenses arrays of objects into an outline (names only), so attacks are
// projected as single indexed objects, which come back whole.
const ATK = (i: number) => `"attack${i + 1}": attacks[${i}]{name, toHit, damage, damageType}`;
export const STAT_PROJECTION = `{_id, _type, "title": coalesce(title, name), srdVersion, ac, hp, cr, speed, ${[0, 1, 2].map(ATK).join(', ')}, level, school, concentration, dice, damageType, save, range, summary, effects, body}`;
