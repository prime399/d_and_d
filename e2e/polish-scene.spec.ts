import { test, expect, type Page } from '@playwright/test';

// Drives the controller through window.__game to capture the large-level scene: fog, minimap, camera, combat.
type Pos = { x: number; y: number };
type Lair = { id: number; aggro: number; cleared: boolean; spawns: Pos[]; monsters: Pos[] };
type G = {
  view: { phase: string; playMode?: string; busy: boolean; isPlayerTurn: boolean; state?: { combatants: { id: string; side: string; pos: Pos; dead: boolean }[] } };
  enterRoom: (i: number) => Promise<void>;
  debugTeleport?: (p: Pos) => boolean;
  debugLairs?: () => Lair[];
  scene: Record<string, unknown> & { arena?: { width: number; height: number; walls: boolean[]; heroSpawns: Pos[]; lore: { pos: Pos }[]; gold: Pos[] } };
};

const ignorable = (e: string) => /favicon|DM|fetch|Sanity|api|Failed to load resource|429|500/i.test(e);

async function boot(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter the dungeon' }).click();
  await page.waitForFunction(() => (window as unknown as { __game?: G }).__game?.view.phase === 'playing', null, { timeout: 30_000 });
  await page.waitForTimeout(2600);
}

/** Free floor tile nearest `p` that is at least `minD` away from every lair spawn (so teleporting doesn't wake it). */
async function teleportNear(page: Page, p: Pos, minD = 0) {
  return page.evaluate(({ p, minD }) => {
    const g = (window as unknown as { __game: G }).__game;
    const a = g.scene.arena!;
    const spawns = (g.debugLairs?.() ?? []).filter((l) => !l.cleared).flatMap((l) => l.spawns);
    let best: Pos | null = null;
    let bd = Infinity;
    for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
      if (a.walls[y * a.width + x]) continue;
      if (spawns.some((s) => Math.max(Math.abs(s.x - x), Math.abs(s.y - y)) < minD)) continue;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (best) g.debugTeleport?.(best);
    return best;
  }, { p, minD });
}

for (const size of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test(`level visuals ${size.width}`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    await page.setViewportSize(size);
    await boot(page, errors);
    await page.screenshot({ path: `e2e/out/scene-l1-start-${size.width}.png` });

    // Wander: read a lore stone area, then walk across the level so fog has explored + visible regions.
    const lore = await page.evaluate(() => (window as unknown as { __game: G }).__game.scene.arena?.lore?.[0]?.pos ?? null);
    if (lore) {
      await teleportNear(page, { x: lore.x + 1, y: lore.y }, 6);
      await page.waitForTimeout(900);
      await page.screenshot({ path: `e2e/out/scene-l1-lore-${size.width}.png` });
      await page.evaluate((p) => ((window as unknown as { __game: G }).__game.scene.pickup as (p: Pos) => void)?.(p), lore);
      await page.waitForTimeout(250);
      await page.screenshot({ path: `e2e/out/scene-l1-lore-read-${size.width}.png` });
    }
    const gold = await page.evaluate(() => (window as unknown as { __game: G }).__game.scene.arena?.gold?.[0] ?? null);
    if (gold) {
      await teleportNear(page, gold, 6);
      await page.waitForTimeout(900);
      await page.screenshot({ path: `e2e/out/scene-l1-gold-${size.width}.png` });
    }

    // FPS sample while the camera glides and fog animates.
    const fps = await page.evaluate(async () => {
      let n = 0;
      const t0 = performance.now();
      await new Promise<void>((r) => { const f = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
      return (n * 1000) / (performance.now() - t0);
    });
    console.log(`fps@${size.width}: ${fps.toFixed(1)}`);

    // Approach the first lair to trigger combat.
    const lair = await page.evaluate(() => (window as unknown as { __game: G }).__game.debugLairs?.()[0] ?? null);
    if (lair) {
      const c = lair.spawns[0];
      // stand just outside aggro, then walk in so the lair wakes the normal way
      const from = await teleportNear(page, { x: c.x, y: c.y + lair.aggro + 2 }, lair.aggro + 1);
      if (from) await page.evaluate((p) => ((window as unknown as { __game: { onTileClick: (p: Pos) => void } }).__game.onTileClick(p)), lair.spawns[0]);
      await page.waitForFunction(() => (window as unknown as { __game: G }).__game.view.playMode === 'combat', null, { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `e2e/out/scene-l1-combat-${size.width}.png` });
      // attack moment: monster hits a hero, camera frames both
      await page.evaluate(() => {
        const g = (window as unknown as { __game: G }).__game;
        const cs = g.view.state!.combatants;
        const hero = cs.find((x) => x.side === 'hero' && !x.dead)!;
        const mon = cs.find((x) => x.side !== 'hero' && !x.dead)!;
        const s = g.scene as unknown as Record<string, (...a: unknown[]) => unknown>;
        void s.attackAnim(mon.id, hero.id, 'melee');
        setTimeout(() => s.hitFx(hero.id, 6, false, 'damage'), 160);
      });
      await page.waitForTimeout(450);
      await page.screenshot({ path: `e2e/out/scene-l1-attack-${size.width}.png` });
    }
    console.log('errors', errors);
    expect(errors.filter((e) => !ignorable(e))).toEqual([]);
  });
}

test('door opens after clearing all lairs', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  await page.setViewportSize({ width: 1366, height: 768 });
  await boot(page, errors);
  await page.evaluate(() => {
    const g = (window as unknown as { __game: G }).__game as unknown as { debugClearLair: (id: number) => boolean; debugLairs: () => Lair[] };
    g.debugLairs().forEach((l) => g.debugClearLair(l.id));
  });
  const door = await page.evaluate(() => ((window as unknown as { __game: G }).__game.scene.arena as unknown as { door?: Pos }).door ?? null);
  if (door) await teleportNear(page, { x: door.x, y: door.y + 2 });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: 'e2e/out/scene-l1-door.png' });
  expect(errors.filter((e) => !ignorable(e))).toEqual([]);
});
