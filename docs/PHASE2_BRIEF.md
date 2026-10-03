# Phase 2 brief: exploration dungeons, Knowledge Base, DM polish

Read docs/POLISH_BRIEF.md first. Its rules still apply: own files only, Phaser 4 skills in `node_modules/phaser/skills/`, Next 16 docs in `node_modules/next/dist/docs/`, dev server already on http://localhost:3000 (don't start another, don't run `pnpm build`), Playwright with `BASE_URL=http://localhost:3000`, `window.__game` for driving.

Commit often, own paths only: `/tmp/gc.sh "<type>(<area>): <summary>" <paths...>`. Never `git add .`, amend, push, or touch .env files.
Timebox: about 75 minutes, then send a final report to `main`. A playtest phase follows, so leave the game playable after every commit.

## Goal
Each of the 5 rooms becomes a large, hand-made dungeon level with several chambers, corridors and details to explore. Today each room is a single 20×12 arena.
- **Exploration:** the party explores freely, with no turns.
- **Combat:** a monster lair wakes up when a hero comes near it, and combat starts. When it ends, the party goes back to exploring.
- **Exit:** when every lair is cleared, the exit door opens.

The judges must see the Sanity-backed DM looking things up. Lore stones and room entry trigger DM narration.

## Contract A: ArenaMap (src/game/maps.ts, owned by `maps`)
ASCII legend. Keep the existing glyphs; new ones are marked NEW.
```
#  wall                     .  floor
P  pillar (blocks)          H  hero spawn (exactly 3, near the entrance)
D  exit door (in a top/side wall)
E  NEW entrance stairs (floor decor, where the party arrives)
1-6 NEW monster lair spawn tiles (digit = lair id); `M` = legacy, same as lair 1
C  chest (blocks; potion)   S  floor spikes (decor)
B  banner on wall face      F  fountain on wall face
T  NEW torch on wall face (light source)
K  NEW crate/barrel (blocks)  X  NEW bones/skull (floor decor)
R  NEW rubble (floor decor)   ~  NEW pit/hole (blocks; treated as wall by the engine)
G  NEW gold pile (pickup, floor)
L  NEW lore stone (blocks; interact from an adjacent tile)
```
Interface. Additive: keep every existing field so current code still compiles.
```ts
export interface Lair { id: number; spawns: Pos[]; aggro: number /* tiles, default 5 */ }
export interface LoreStone { pos: Pos; title: string; text: string /* 1-2 sentences, flavour only, no rules */ }
export interface ArenaMap {
  width; height; rows; walls; heroSpawns; monsterSpawns /* = all lair spawns flattened */; door?; chests; decor; // existing
  title: string;            // e.g. "The Collapsed Gate"
  entrance?: Pos;
  lairs: Lair[];            // 2-4 per level; the boss level's last lair is the throne
  torches: Pos[];           // wall tiles carrying a torch
  crates: Pos[]; bones: Pos[]; rubble: Pos[]; pits: Pos[]; gold: Pos[];
  lore: LoreStone[];
}
export function getArena(order: number): ArenaMap   // unchanged signature
```
- **Size:** 34–48 wide × 22–32 tall.
- **Lair spawns:** each lair has at least 4 spawn tiles.
- **Reachability:** every floor tile, lair, chest, gold, lore stone and the door must be reachable from the hero spawns. A unit test enforces this.

## Contract B: controller view and API (src/game/controller.ts, owned by `core`)
```ts
view.mode: 'explore' | 'combat'          // phase stays 'playing' in both
view.leaderId: string | null             // hero moved by clicks during exploration
view.objective: { lairs: { id: number; cleared: boolean; awake: boolean; monsters: number }[];
                  doorOpen: boolean; goldFound: number; loreFound: number; loreTotal: number }
ctrl.setLeader(heroId)                   // explore mode
```
- **Exploration:**
  - Clicking a floor tile walks the leader there along a path, and the other heroes follow in formation.
  - Clicking next to a chest, gold or lore stone interacts with it.
  - Lore narrates through the DM: events like `The party reads the lore stone "<title>": <text>`.
- **Waking a lair:** when a hero comes within `aggro` tiles of a lair spawn, with line of sight, combat starts with all heroes plus that lair's monsters. Any other lair within aggro joins too. The turn banner shows "Ambush!".
- **After combat:** victory returns to explore mode with HP kept. When every lair is cleared, the door opens. A hero stepping next to the open door brings up the room-cleared modal.
- **Distributing monsters:** expand `room.encounter` into individual monsters, then round-robin entry index → lair. On the boss level, encounter entry 0 (the boss) goes into the last lair.
- **Unchanged:** hotkeys, dice, the DM and the security code stay as they are.

## Contract C: scene additions (src/game/scenes/DungeonScene.ts, owned by `scene`)
Core calls these with optional chaining: `scene.follow?.(id)`, `scene.revealAround?.(positions: Pos[], radius: number)`, `scene.pickup?.(pos)`, `scene.setMode?.('explore'|'combat')`.
- **Rendering:** draw every glyph in Contract A.
- **Camera:** on large maps the camera follows the leader or the active unit (smooth lerp, clamped to bounds). Pick a readable zoom; most of the time keep about 22×14 tiles visible.
- **Fog of war:** unexplored tiles are black, explored but not visible tiles are dim, visible tiles are lit. Monsters outside current vision are hidden.
- **Minimap:** a small one in the top-right corner of the canvas.

## Contract D: HUD (owned by `hud`)
- **Mode banner:** an "Exploring" or "Combat" chip.
- **Objective tracker:** shows lairs cleared x/y, lore found and gold.
- **Leader selection:** click a party card in explore mode to make that hero the leader.
- **Action bar in explore mode:** only Move, Interact hints and Potion. Attack and spell buttons are hidden, and End turn is hidden.
- **Initiative rail:** hidden in explore mode.

## Contract E: DM (src/app/api/dm/route.ts, owned by `dm`)
Narrate mode has to handle exploration beats (room entry, lore and loot) as well as combat beats.
