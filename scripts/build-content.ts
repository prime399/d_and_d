// Builds src/game/content/fallback.json from raw SRD JSON (data/srd) + hand-authored content.
// Run: pnpm content:build
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameContent } from '../src/game/content/types';
import { buildConditions } from './content/conditions';
import { buildMonsters } from './content/monsters';
import { HEROES, ROOMS } from './content/party';
import { buildRules } from './content/rules';
import { buildSpells } from './content/spells';

const content: GameContent = {
  monsters: buildMonsters(),
  spells: buildSpells(),
  conditions: buildConditions(),
  rules: buildRules(),
  heroes: HEROES,
  rooms: ROOMS,
  source: 'fallback',
};

// Fail fast on dangling references (the vitest suite checks this more thoroughly).
const ids = new Set<string>([
  ...content.monsters, ...content.spells, ...content.conditions, ...content.rules, ...content.heroes, ...content.rooms,
].map((d) => d._id));
const dangling = content.rules.flatMap((r) => (r.related ?? []).filter((id) => !ids.has(id)).map((id) => `${r._id} -> ${id}`));
if (dangling.length) {
  console.error('Dangling related ids:\n' + dangling.join('\n'));
  process.exit(1);
}

const out = join(__dirname, '..', 'src', 'game', 'content', 'fallback.json');
writeFileSync(out, JSON.stringify(content, null, 2) + '\n');
console.log(
  `wrote ${out}: ${content.monsters.length} monsters, ${content.spells.length} spells, ` +
  `${content.conditions.length} conditions, ${content.rules.length} rules, ${content.heroes.length} heroes, ${content.rooms.length} rooms`,
);
