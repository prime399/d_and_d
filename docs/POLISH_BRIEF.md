# Polish brief (shared by all polish agents)

Game: "The Goblin Warren", a browser-based, turn-based D&D 5e dungeon crawl for the DEV.to × Sanity challenge.
- An AI Dungeon Master narrates and cites rules looked up through Sanity Context.
- Judges and players should be impressed within 30 seconds, with no instructions needed.
- Deadline is tomorrow: timebox your work to about 40 minutes, then report.

## Architecture (read before editing)
- `src/game/engine/*`: the deterministic rules engine. DO NOT EDIT. Its API is documented in `index.ts`.
- `src/game/content/*`: content types and `fallback.json`. DO NOT EDIT.
- `src/game/controller.ts`: orchestrates the engine, the Phaser scene, audio, dice and the DM. React reads `ctrl.view` through `useView(ctrl)` (useSyncExternalStore). Only the **core** agent edits this file. If you need a new field or method on it, SendMessage to `core` with the exact snippet, then keep working; core will add it.
- `src/game/scenes/DungeonScene.ts`: Phaser 4 scene, purely presentational. Phaser 4 API skill docs are in `node_modules/phaser/skills/`, and exact types in `node_modules/phaser/types/phaser.d.ts`.
- `src/components/*`: React 19 UI with Tailwind v4. Next.js 16 differs from your training data, so check `node_modules/next/dist/docs/` before using Next APIs.
- `src/app/globals.css`: shared tokens and the `.panel`, `.panel-title`, `.btn`, `.btn-active`, `.btn-primary` classes. DO NOT EDIT it. Put your CSS in your own `src/styles/<area>.css`, which is already imported.

## Visual language (keep it consistent)
- **Mood:** dark fantasy tavern / dungeon. Palette is deep plum-black backgrounds, amber/gold accents (#f2d48f, #ffd27a), parchment text (#ece3d0), rose for enemies and damage, sky blue for heroes, violet for "2014 rules", emerald for healing and success.
- **Fonts:** `font-display` (MedievalSharp) for titles, `font-pixel` (Pixelify Sans) for numbers and buttons, `font-body` (Inter) for prose.
- **Art:** pixel art from the 0x72 DungeonTileset II. The atlas is at `/assets/sprites/dungeon.png` + `.json`; frame names are listed in `/tmp/dd_x/0x72_DungeonTilesetII_v1.7/tile_list_v1.7`.
- **Motion:** short and purposeful, 150–400 ms. Respect `prefers-reduced-motion`.

## Hard requirements
- **Layout:** no page scroll at 1366×768 or 1920×1080. Usable when stacked at 390px wide.
- **Accessibility:** visible keyboard focus, aria labels on icon buttons, contrast ≥ 4.5:1 for text.
- **Errors:** no console errors and no new eslint errors in your files (`pnpm exec eslint <your files>`).
- **Types:** `pnpm exec tsc --noEmit` stays clean. If it fails because of another agent's file, ignore that error and mention it in your report.
- **Builds:** DO NOT run `pnpm build`, and DO NOT start a dev server. One is already running at **http://localhost:3000** with hot reload.

## How to see your work
- Write your own Playwright script at `e2e/polish-<area>.spec.ts`.
- Run it with `BASE_URL=http://localhost:3000 pnpm exec playwright test e2e/polish-<area>.spec.ts --reporter=line`.
- Save screenshots to `e2e/out/<area>-*.png`, then open them with the Read tool to check them visually.
- The controller is exposed as `window.__game`. You can drive it from `page.evaluate` (e.g. `__game.start()`, `__game.view`, `__game.setMode(...)`, `__game.onTileClick({x,y})`, `__game.endTurn()`, `__game.ask('...')`) to reach the states you need.
- Check 1366×768 and 1920×1080.

## Final report (concise)
What you changed (files), before/after in a sentence each, screenshots taken, anything you asked `core` for, and known issues left.
