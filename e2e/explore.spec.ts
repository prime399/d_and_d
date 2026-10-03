import { test, expect, type Page } from '@playwright/test';
import { collectErrors, fight, game, startGame, teleportNear, waitReady, walkIntoLair, withReloadRetry, type G } from './lib/core';

type P = { x: number; y: number };
const lairsAway = (page: Page) => page.evaluate(() => {
  const g = (window as unknown as { __game: G }).__game;
  return g.debugLairs().filter((l) => !l.cleared).flatMap((l) => [...l.monsters, ...l.spawns].map((pos) => ({ pos, minDist: l.aggro + 1 })));
});

test('explore: walk, gold, lore, lair fight, door, next level', async ({ page }) => {
  test.setTimeout(480_000);
  const errors = collectErrors(page);
  await withReloadRetry(page, errors, async () => {
    await startGame(page);
    const start = await game(page).view();
    expect(start.playMode).toBe('explore');
    expect(start.objective.lairs.length).toBeGreaterThanOrEqual(2);

    // walk: one keyboard step and one click-walk
    const leaderPos = () => page.evaluate(() => {
      const g = (window as unknown as { __game: G }).__game;
      return g.view.state!.combatants.find((c) => c.id === g.view.leaderId)!.pos;
    });
    const p0 = await leaderPos();
    await page.evaluate(async (p) => {
      const g = (window as unknown as { __game: G }).__game;
      // nearest walkable tile 2 rows up, falling back sideways
      for (const d of [{ x: 0, y: -2 }, { x: -2, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }]) {
        const t = { x: p.x + d.x, y: p.y + d.y };
        if (!g.grid.walls[t.y * g.grid.width + t.x]) { await g.onTileClick(t); return; }
      }
    }, p0);
    await waitReady(page);
    const p1 = await leaderPos();
    expect(p1).not.toEqual(p0);

    // gold: stand next to a pile (far from lairs) and click it
    const { gold, lore } = await page.evaluate(() => {
      const g = (window as unknown as { __game: G }).__game;
      return { gold: g.arena?.gold ?? [], lore: (g.arena?.lore ?? []).map((l) => l.pos) };
    });
    const away = await lairsAway(page);
    const safe = (p: P) => !away.some((a) => Math.max(Math.abs(a.pos.x - p.x), Math.abs(a.pos.y - p.y)) <= a.minDist);
    const g1 = gold.find(safe) ?? gold[0];
    expect(g1, 'level has gold').toBeTruthy();
    expect(await teleportNear(page, g1, away)).toBeTruthy();
    await page.evaluate(async (p) => (window as unknown as { __game: G }).__game.onTileClick(p), g1);
    await waitReady(page);
    let v = await game(page).view();
    if (v.playMode === 'combat') await fight(page);
    v = await game(page).view();
    expect(v.objective.goldFound).toBeGreaterThan(0);

    // lore: stand next to a stone and click it (narrated via the DM)
    const l1 = lore.find(safe) ?? lore[0];
    expect(l1, 'level has a lore stone').toBeTruthy();
    expect(await teleportNear(page, l1, await lairsAway(page))).toBeTruthy();
    await page.evaluate(async (p) => (window as unknown as { __game: G }).__game.onTileClick(p), l1);
    await waitReady(page);
    v = await game(page).view();
    expect(v.objective.loreFound).toBe(1);
    await page.screenshot({ path: 'e2e/out/explore-lore.png' });

    // wake lair 1 and win
    const lair1 = start.objective.lairs[0].id;
    expect(await walkIntoLair(page, lair1)).toBe('combat');
    // the path may pass another lair first; whichever woke is the one we fight
    v = await game(page).view();
    const woke = v.objective.lairs.filter((l) => l.awake).map((l) => l.id);
    expect(woke.length).toBeGreaterThan(0);
    await page.screenshot({ path: 'e2e/out/explore-ambush.png' });
    expect(await fight(page)).toBe('explore');
    v = await game(page).view();
    for (const id of woke) expect(v.objective.lairs.find((l) => l.id === id)!.cleared).toBe(true);

    // clear the rest by debug; the door opens
    await page.evaluate(() => {
      const g = (window as unknown as { __game: G }).__game;
      g.view.objective.lairs.filter((l) => !l.cleared).forEach((l) => g.debugClearLair(l.id));
    });
    v = await game(page).view();
    expect(v.objective.doorOpen).toBe(true);
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'e2e/out/explore-door-open.png' });

    // walk to the open door: the room-cleared modal comes up
    const door = await page.evaluate(() => (window as unknown as { __game: G }).__game.arena!.door!);
    if ((await game(page).view()).phase === 'playing') {
      await teleportNear(page, { x: door.x, y: door.y + 4 });
      await page.evaluate(async (p) => (window as unknown as { __game: G }).__game.onTileClick(p), door);
    }
    await page.waitForFunction(() => (window as unknown as { __game: G }).__game.view.phase === 'room-cleared', null, { timeout: 15_000 });
    await page.screenshot({ path: 'e2e/out/explore-room-cleared.png' });

    // next level loads in explore mode
    await page.evaluate(() => void (window as unknown as { __game: G }).__game.nextRoom());
    await page.waitForFunction(() => {
      const g = (window as unknown as { __game: G }).__game;
      return g.view.roomIndex === 1 && g.view.phase === 'playing';
    }, null, { timeout: 20_000 });
    v = await game(page).view();
    expect(v.objective.lairs.every((l) => !l.cleared)).toBe(true);
    expect(v.objective.goldFound).toBeGreaterThan(0); // gold carries over
    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'e2e/out/explore-level2.png' });
  });
  expect(errors).toEqual([]);
});
