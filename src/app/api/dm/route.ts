// The Dungeon Master agent. Narrates engine events and answers rules questions.
// Facts come ONLY from Sanity Context MCP (GROQ mode for stats, Knowledge Base mode for rules prose).
// When Sanity Context isn't configured, equivalent local tools over the same content keep the game playable.
import { generateText, isStepCount, tool, type ToolSet } from 'ai';
import { createMCPClient } from '@ai-sdk/mcp';
import { z } from 'zod';
import { loadContent } from '@/game/content/loader';
import { rateLimit } from '@/lib/ratelimit';

export const maxDuration = 60;

const MODEL = process.env.DM_MODEL ?? 'anthropic/claude-haiku-4.5';

const Body = z.object({
  mode: z.enum(['narrate', 'ask']),
  /** compact log lines from the engine for this beat */
  events: z.array(z.string()).max(60).default([]),
  question: z.string().max(500).optional(),
  room: z.object({ name: z.string(), description: z.string() }).optional(),
  party: z.array(z.string()).max(6).default([]),
  foes: z.array(z.string()).max(12).default([]),
  /** doc ids the engine already relied on */
  cited: z.array(z.string()).max(30).default([]),
  srdVersion: z.enum(['2014', '2024']).default('2024'),
});

export interface DmLookup {
  tool: string;
  input: string;
  ids: string[];
  via: 'sanity-context' | 'knowledge-base' | 'local';
}

export interface DmResponse {
  text: string;
  lookups: DmLookup[];
  /** all doc ids touched (engine citations + agent lookups) */
  ids: string[];
  model: string | null;
  backend: 'sanity-context' | 'local' | 'offline';
}

const ID_RE = /\b(?:rule|condition|spell|monster|hero|room)\.[a-z0-9-]+(?:\.2014)?\b/g;

function extractIds(value: unknown): string[] {
  const s = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return [...new Set(s.match(ID_RE) ?? [])];
}

const SYSTEM = (srd: string) => `You are the Dungeon Master of "The Goblin Warren", a D&D 5e dungeon crawl played in a browser.

Hard rules:
- A deterministic game engine already resolved every roll, hit, damage and condition. NEVER invent or change numbers; only use numbers given in the event log or returned by tools.
- Every rules claim must come from a tool lookup in this conversation. Look up the relevant condition/rule/spell/monster documents before explaining a mechanic. If the tools don't contain it, say the rules tome is silent.
- The table plays SRD ${srd} rules. Documents with ids ending in ".2014" are the 2014 version. If a 2014 vs 2024 difference matters for what just happened, mention it in one short sentence starting with "Rules changed:".
- Cite rules inline as [[doc-id]] (for example [[condition.prone]]) right after the sentence that relies on them. Use the exact _id values from tool results.

Style: vivid, second person, dark-fantasy tavern storyteller. Narration beats: 2-4 sentences, max ~70 words. Rules answers: direct answer first, then the reasoning, max ~110 words. No markdown headers or lists.`;

function localTools(content: Awaited<ReturnType<typeof loadContent>>, lookups: DmLookup[]): ToolSet {

  const all = [
    ...content.rules.map((d) => ({ id: d._id, type: 'rule', title: d.title, text: `${d.section} ${d.body}`, doc: d })),
    ...content.conditions.map((d) => ({ id: d._id, type: 'condition', title: d.name, text: d.effects.join(' '), doc: d })),
    ...content.spells.map((d) => ({ id: d._id, type: 'spell', title: d.name, text: d.summary, doc: d })),
    ...content.monsters.map((d) => ({ id: d._id, type: 'monster', title: d.name, text: d.description ?? '', doc: d })),
  ];

  return {
    search_rules: tool({
      description: 'Keyword search over the rules knowledge base (rules, conditions, spells, monsters). Returns matching documents with their _id.',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
        const scored = all
          .map((d) => {
            const hay = `${d.title} ${d.text}`.toLowerCase();
            const title = d.title.toLowerCase();
            const score = terms.reduce((s, t) => s + (title.includes(t) ? 5 : 0) + (hay.includes(t) ? 1 : 0), 0);
            return { d, score };
          })
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(({ d }) => d.doc);
        lookups.push({ tool: 'search_rules', input: query, ids: scored.map((d) => d._id), via: 'local' });
        return scored;
      },
    }),
    get_documents: tool({
      description: 'Fetch documents by exact _id (e.g. "condition.prone", "condition.prone.2014", "rule.concentration").',
      inputSchema: z.object({ ids: z.array(z.string()).max(8) }),
      execute: async ({ ids }) => {
        const docs = all.filter((d) => ids.includes(d.id)).map((d) => d.doc);
        lookups.push({ tool: 'get_documents', input: ids.join(', '), ids: docs.map((d) => d._id), via: 'local' });
        return docs;
      },
    }),
  };
}

async function sanityTools(lookups: DmLookup[]) {
  const clients: Awaited<ReturnType<typeof createMCPClient>>[] = [];
  const tools: ToolSet = {};
  const endpoints: { url?: string; token?: string; via: DmLookup['via']; prefix: string }[] = [
    { url: process.env.SANITY_CONTEXT_MCP_URL, token: process.env.SANITY_CONTEXT_TOKEN, via: 'sanity-context', prefix: '' },
    { url: process.env.SANITY_KB_MCP_URL, token: process.env.SANITY_KB_TOKEN ?? process.env.SANITY_CONTEXT_TOKEN, via: 'knowledge-base', prefix: 'kb_' },
  ];
  for (const ep of endpoints) {
    if (!ep.url || !ep.token) continue;
    let remote: ToolSet;
    try {
      const client = await createMCPClient({
        transport: { type: 'http', url: ep.url, headers: { Authorization: `Bearer ${ep.token}` } },
      });
      clients.push(client);
      remote = (await client.tools()) as ToolSet;
    } catch (err) {
      // don't leak already-open clients if a later endpoint fails
      await Promise.all(clients.map((c) => c.close().catch(() => {})));
      throw err;
    }
    for (const [name, t] of Object.entries(remote)) {
      if (name === 'initial_context' && ep.prefix) continue;
      const exec = t.execute;
      tools[ep.prefix + name] = {
        ...t,
        execute: async (input: unknown, opts: unknown) => {
          const out = await (exec as (i: unknown, o: unknown) => Promise<unknown>)(input, opts);
          lookups.push({ tool: ep.prefix + name, input: JSON.stringify(input).slice(0, 300), ids: extractIds(out), via: ep.via });
          return out;
        },
      } as typeof t;
    }
  }
  return { tools, close: () => Promise.all(clients.map((c) => c.close())) };
}

const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Phrase banks for the offline template narrator. {a} attacker, {t} target, {w} weapon, {n} amount. */
const BANK = {
  crit: [
    "{a}'s {w} finds the gap in {t}'s guard and bites deep for {n}.",
    'A perfect strike. {a} drives the {w} home and {t} reels from {n} damage.',
    'Steel sings. {a} lands a brutal blow on {t}, {n} damage in one savage arc.',
  ],
  hit: [
    "{a}'s {w} connects; {t} grunts, {n} damage the poorer.",
    '{a} presses in and the {w} draws blood from {t}.',
    '{t} is too slow. The {w} strikes true.',
  ],
  miss: [
    "{t} twists aside and {a}'s {w} rings off stone.",
    "{a}'s {w} whistles past {t}, finding only shadow.",
    '{t} sees it coming. The {w} glances off harmlessly.',
  ],
  slain: [
    '{t} crumples to the floor and does not rise.',
    'With a final rattling breath, {t} falls still.',
    '{t} collapses, the fight gone out of it for good.',
  ],
  heroDown: [
    '{t} drops to the flagstones, senseless.',
    'The light leaves {t}\'s eyes as they fall unconscious.',
  ],
  heal: [
    'Warm light knits {t}\'s wounds; {n} hit points return.',
    '{t} breathes easier as {n} hit points flow back.',
  ],
  spell: [
    'Arcane words crackle from {a}\'s lips: {w}.',
    '{a} shapes the air itself and unleashes {w}.',
  ],
  condition: [
    '{t} is now {w}.',
    'The magic takes hold. {t} is {w}.',
  ],
  saveOk: ['{t} shrugs off the effect.', '{t} grits their teeth and resists.'],
  enter: [
    'Torchlight spills into {w}. Shapes stir in the dark, and steel is drawn.',
    'You step into {w}. The air is thick with damp and the stink of goblin.',
  ],
  idle: ['The torches gutter. Something stirs in the dark.', 'Your footsteps echo. The warren waits.'],
};

const fill = (tpl: string, v: Record<string, string | number | undefined>) =>
  tpl.replace(/\{(\w)\}/g, (_, k: string) => String(v[k] ?? '')).replace(/\s+/g, ' ').trim();

/** Turns engine log lines into 1–2 sentences of narration with [[doc-id]] citations. */
function narrateOffline(body: z.infer<typeof Body>): string {
  const cite = (id: string) => (body.cited.includes(id) ? ` [[${id}]]` : '');
  const out: string[] = [];
  const lines = body.events;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^The party enters (.+)\.$/))) out.push(fill(pick(BANK.enter), { w: m[1] }) + cite('rule.initiative'));
    else if ((m = l.match(/^(.+?) attacks (.+?) with (.+?): .*?(CRITICAL HIT|hit|miss)\.$/))) {
      const [, a, t, w, res] = m;
      const dmg = lines[i + 1]?.match(/takes (\d+)/)?.[1];
      if (res === 'CRITICAL HIT') out.push(fill(pick(BANK.crit), { a, t, w, n: dmg }) + cite('rule.critical-hits'));
      else if (res === 'hit') out.push(fill(pick(BANK.hit), { a, t, w, n: dmg }) + cite('rule.attack-rolls'));
      else out.push(fill(pick(BANK.miss), { a, t, w }));
    } else if ((m = l.match(/^(.+?) is slain\.$/))) out.push(fill(pick(BANK.slain), { t: m[1] }));
    else if ((m = l.match(/^(.+?) falls unconscious/))) out.push(fill(pick(BANK.heroDown), { t: m[1] }) + cite('rule.dropping-to-0'));
    else if ((m = l.match(/^(.+?) regains (\d+) HP/))) out.push(fill(pick(BANK.heal), { t: m[1], n: m[2] }) + cite('rule.healing'));
    else if ((m = l.match(/^(.+?) casts (.+?)(?: \(level \d+ slot\))?\.$/))) {
      const slug = body.cited.find((c) => c.startsWith('spell.') && m![2].toLowerCase().replace(/\s+/g, '-') === c.slice(6));
      out.push(fill(pick(BANK.spell), { a: m[1], w: m[2] }) + (slug ? ` [[${slug}]]` : ''));
    } else if ((m = l.match(/^(.+?) is now (.+?)\.$/))) {
      const slug = `condition.${m[2].toLowerCase().replace(/\s+/g, '-')}`;
      out.push(fill(pick(BANK.condition), { t: m[1], w: m[2] }) + cite(slug));
    } else if ((m = l.match(/^(.+?) makes a .* save: .*success\.$/))) out.push(fill(pick(BANK.saveOk), { t: m[1] }));
    else if (/takes the Dodge action/.test(l)) out.push(l + cite('rule.dodge'));
    else if (/^All foes in the room are defeated/.test(l)) out.push('Silence falls. The last of your foes lies still, and the way ahead opens.');
    else if (/^The whole party has fallen/.test(l)) out.push('Darkness closes in. The warren claims another band of heroes.');
  }
  if (!out.length) return body.room?.description ?? pick(BANK.idle);
  // keep the beat short: the most dramatic two sentences (crits, deaths, endings come last-weighted)
  const picked = out.length <= 2 ? out : [out.find((s) => s.includes('[[rule.critical-hits]]')) ?? out[out.length - 2], out[out.length - 1]];
  return [...new Set(picked)].join(' ');
}

function offlineText(body: z.infer<typeof Body>): string {
  if (body.mode === 'ask') return 'The Dungeon Master is resting (no AI key configured). Check the rules cards in the panel for what the engine applied.';
  return narrateOffline(body);
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (!rateLimit(ip)) return Response.json({ error: 'Too many requests. The DM needs a breather.' }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'Bad request' }, { status: 400 });
  const body = parsed.data;

  const hasModel = Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || req.headers.get('x-vercel-oidc-token'));
  if (!hasModel) {
    const res: DmResponse = { text: offlineText(body), lookups: [], ids: body.cited, model: null, backend: 'offline' };
    return Response.json(res);
  }

  const lookups: DmLookup[] = [];
  let close: () => Promise<unknown> = async () => {};
  let tools: ToolSet;
  let backend: DmResponse['backend'] = 'local';
  try {
    const remote = await sanityTools(lookups);
    close = remote.close;
    if (Object.keys(remote.tools).length) {
      tools = remote.tools;
      backend = 'sanity-context';
    } else {
      tools = localTools(await loadContent(), lookups);
    }
  } catch (err) {
    console.error('[dm] Sanity Context MCP unavailable, using local tools', err);
    tools = localTools(await loadContent(), lookups);
  }

  const context = [
    body.room && `Room: ${body.room.name}. ${body.room.description}`,
    body.party.length && `Party: ${body.party.join('; ')}`,
    body.foes.length && `Foes: ${body.foes.join('; ')}`,
    body.cited.length && `Rules the engine applied this beat (look these up if you explain them): ${body.cited.join(', ')}`,
    body.events.length && `Event log:\n${body.events.map((e) => `- ${e}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const prompt =
    body.mode === 'ask'
      ? `${context}\n\nThe player asks the DM a rules question: "${body.question}"\nLook up the relevant documents, then answer.`
      : `${context}\n\nNarrate this beat. If a condition or special rule was applied, look it up first and weave a one-clause explanation with a citation.`;

  try {
    const { text } = await generateText({
      model: MODEL,
      instructions: SYSTEM(body.srdVersion),
      prompt,
      tools,
      stopWhen: isStepCount(body.mode === 'ask' ? 6 : 4),
      maxOutputTokens: 600,
    });
    const ids = [...new Set([...body.cited, ...lookups.flatMap((l) => l.ids), ...extractIds(text)])];
    const res: DmResponse = { text: text.trim(), lookups, ids, model: MODEL, backend };
    return Response.json(res);
  } catch (err) {
    console.error('[dm] generation failed', err);
    const res: DmResponse = { text: offlineText(body), lookups, ids: body.cited, model: MODEL, backend: 'offline' };
    return Response.json(res);
  } finally {
    await close().catch(() => {});
  }
}
