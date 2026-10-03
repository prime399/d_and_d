# Sanity setup

Checklist for wiring the game to Sanity: the content dataset, the Studio, and the two
Context MCP endpoints the AI Dungeon Master uses (GROQ mode + Knowledge Base mode).

Env var names are fixed; see `.env.example`.

## 1. Create the project and dataset

1. Go to https://www.sanity.io/manage and create a project. Copy its Project ID.
2. Under Datasets, create `production` with visibility Private.
   (Or reuse the default dataset and switch it to private.)

## 2. Add CORS origins

Project > API > CORS origins:

- `http://localhost:3000` (Next.js dev; no credentials needed)
- `http://localhost:3333` (Studio dev; allow credentials)
- `https://<your-app>.vercel.app` (and any custom domain)

## 3. Create tokens

Project > API > Tokens:

| Token | Role | Env var | Used by |
|---|---|---|---|
| seed | Editor | `SANITY_WRITE_TOKEN` | `pnpm sanity:seed` only. Never deploy it. |
| app | Viewer | `SANITY_READ_TOKEN` | server-side GROQ reads in the app |

Organization > Manage > API > Tokens (organization level):

| Token | Role | Env var | Used by |
|---|---|---|---|
| context | Context Viewer | `SANITY_CONTEXT_TOKEN`, `SANITY_KB_TOKEN` | both Context MCP endpoints |

Org-style Context MCP endpoints reject project tokens with
`403 Forbidden` / `contextGrantRequired`. A custom role needs the
`sanity.knowledge-base.read` grant. You can use one org token for both vars.

## 4. Deploy the Studio schema

```sh
cd studio
export SANITY_STUDIO_PROJECT_ID=<projectId> SANITY_STUDIO_DATASET=production
pnpm install
pnpm exec sanity login        # once
pnpm schema:deploy            # required for Context MCP GROQ mode (Studio v5.1+)
pnpm dev                      # optional: Studio at http://localhost:3333
pnpm deploy                   # optional: hosted Studio at <name>.sanity.studio
```

If the schema isn't deployed, GROQ-mode MCP calls fail with JSON-RPC error `-32004`.

## 5. Build and seed content

From the game root, with `SANITY_PROJECT_ID`, `SANITY_DATASET` and
`SANITY_WRITE_TOKEN` set in `.env.local`:

```sh
pnpm content:build              # writes src/game/content/fallback.json
pnpm sanity:seed -- --dry-run   # inspect converted docs
pnpm sanity:seed                # write to Sanity
```

The seed runs two idempotent passes. Pass 1 runs `createOrReplace` on every doc
without references. Pass 2 patches the references in. Re-running it is safe.
Document IDs are deterministic (`monster.<slug>`, `condition.<slug>`,
`condition.<slug>.2014`, `rule.<slug>.2014`, …).

## 6. Create the Knowledge Base

1. Organization settings > Labs: enable Knowledge Bases (beta; an org admin must do this).
2. Open the Context app in the Sanity Dashboard and create a Knowledge Base:
   - Source type: Dataset, `<projectId>.production`
   - Filter: `_type in ["rule", "condition"]`
3. Wait for indexing to finish. The KB generates an outline and entries from the source.

Size: the content scripts define roughly 45 rules (2024), most of them with a
`.2014` counterpart, and about 33 conditions (15 SRD conditions × 2 versions,
plus a few game-only ones). The current fallback.json has 87 rules + 33 conditions = 120 docs. Re-count with
`node -e 'const c=require("./src/game/content/fallback.json");console.log(c.rules.length+c.conditions.length)'`
once `fallback.json` exists. Keep it under the beta cap of about 150 indexed docs
(the cap is reported, not stated on the docs page). Dataset sources index published
documents only. The seed writes published docs, so this works as-is.

## 7. Create the Context MCP endpoints

In the Context app (Dashboard), create two MCP endpoints. The `name` is immutable:
lowercase letters, numbers and hyphens, 64 characters max.

GROQ mode (`dnd-groq`):
- Source: `{"type": "dataset", "id": "<projectId>.production"}`
- groqFilter (optional): `_type in ["monster","spell","condition","rule","hero","room"]`
- Instructions: e.g. "You are the rules oracle for a D&D 5e dungeon crawler. Always cite `_id`."
- Tools: `initial_context`, `schema_explorer`, `groq_query`, `array_field_reader`

Knowledge Base mode (`dnd-kb`):
- Source: `{"type": "knowledge-base", "id": "kb..."}` (the KB from step 6)
- Tools: `initial_context`, `knowledge_base_read`

The mode is inferred from the sources: a dataset source means GROQ mode, and
all-KB sources means KB mode. You can override it per request with `?mode=groq|knowledge_base`.
Other URL overrides: `tools=` (allowlist), `groqFilter=` (ANDed with the configured filter),
`perspective=`, `instructions=`.

Endpoint URL (both modes):

```
https://api.sanity.io/v1/context/organizations/<orgId>/mcp/<endpointName>
```

The `@sanity/context` Studio plugin ("Context documents") is deprecated. Configuration
now lives in the Context app, so this Studio does not install it.

## 8. Fill `.env.local`

```sh
cp .env.example .env.local
```

```
SANITY_PROJECT_ID=<projectId>
SANITY_DATASET=production
SANITY_READ_TOKEN=<viewer token>
SANITY_WRITE_TOKEN=<editor token>          # local only
SANITY_CONTEXT_MCP_URL=https://api.sanity.io/v1/context/organizations/<orgId>/mcp/dnd-groq
SANITY_CONTEXT_TOKEN=<org Context Viewer token>
SANITY_KB_MCP_URL=https://api.sanity.io/v1/context/organizations/<orgId>/mcp/dnd-kb
SANITY_KB_TOKEN=<org Context Viewer token>
AI_GATEWAY_API_KEY=<vercel ai gateway key>
DM_MODEL=anthropic/claude-haiku-4.5
SANITY_STUDIO_PROJECT_ID=<projectId>
SANITY_STUDIO_DATASET=production
```

Mirror these (except `SANITY_WRITE_TOKEN`) in Vercel project env vars.

## 9. Verify

```sh
set -a; . ./.env.local; set +a

# List tools (GROQ mode): expect initial_context, schema_explorer, groq_query, array_field_reader
curl -sS "$SANITY_CONTEXT_MCP_URL" \
  -H "Authorization: Bearer $SANITY_CONTEXT_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# KB mode: expect initial_context, knowledge_base_read
curl -sS "$SANITY_KB_MCP_URL" \
  -H "Authorization: Bearer $SANITY_KB_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Run a GROQ query through the MCP
curl -sS "$SANITY_CONTEXT_MCP_URL" \
  -H "Authorization: Bearer $SANITY_CONTEXT_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"groq_query","arguments":{"query":"*[_type==\"condition\" && slug.current==\"exhaustion\"]{_id,name,srdVersion}"}}}'

# Plain dataset check with the read token
curl -sS -H "Authorization: Bearer $SANITY_READ_TOKEN" \
  "https://$SANITY_PROJECT_ID.api.sanity.io/v2025-02-19/data/query/$SANITY_DATASET?query=count(*%5B_type%3D%3D%22rule%22%5D)"
```

If the server requires an MCP session, run `initialize` first and send the returned
`Mcp-Session-Id` header with later calls. MCP clients such as `@ai-sdk/mcp` handle this.

Common errors:
- `403 contextGrantRequired`: you used a project token; use the org Context Viewer token.
- JSON-RPC `-32004`: Studio schema isn't deployed (step 4).
- JSON-RPC `-32005`: the KB endpoint is empty (indexing isn't done, or the filter matched nothing).
- JSON-RPC `-32602`: invalid `groqFilter` URL param.

## Note on dotted document IDs

IDs that contain a `.` (e.g. `condition.exhaustion.2014`) are "path" IDs. Sanity
hides them from unauthenticated reads. That doesn't matter here: the dataset is
private and every reader (app, MCP, KB) authenticates. The Context docs don't
document any restriction on dotted IDs. If KB indexing or `groq_query` ever skips
them, check `count(*[_type=="rule"])` through the MCP against the direct API count above.

## Security

- All tokens are server-only. They are read in `src/app/api/dm/route.ts` and never reach the browser, and the
  route only sends the Sanity MCP endpoints on `https://api.sanity.io`.
- Use a read-only **Viewer** project token for `SANITY_READ_TOKEN` (GROQ reads). `SANITY_WRITE_TOKEN` stays local.
- The org token (`SANITY_CONTEXT_TOKEN` / `SANITY_KB_TOKEN`) needs the **Context Viewer** role only, nothing broader.
- Keep the dataset **private**.
- The DM route allowlists MCP tools (`groq_query`, `schema_explorer`, `array_field_reader`, `initial_context`,
  `knowledge_base_read`), scopes GROQ with `tools=` and `groqFilter=_type in ["rule","condition","spell","monster"]`,
  rejects GROQ without `_type` or touching `drafts.` / `_id in path(`, and treats all browser text as data-only blocks.
- Built-in limits are per instance and best-effort (20 req/min and 300/day per IP, 120 req/min globally,
  4 concurrent generations, 16 KB bodies, 25 s timeout). In production also add a **Vercel Firewall rate-limit rule**
  on `/api/dm` (e.g. 20 requests / 60 s per IP).
