import { test, expect, type Page } from '@playwright/test';

/** Exploration HUD against the real controller: explore chrome, leader select, walk to a lore stone, wake a lair. */
type P = { x: number; y: number };
type G = {
  view: Record<string, unknown> & { phase: string; playMode?: string; leaderId?: string; interactable?: unknown; state: { combatants: { id: string; side: string }[] } | null };
  start: () => Promise<void>;
  onTileClick: (p: P) => Promise<void>;
  arena: { lore: { pos: P }[]; lairs: { spawns: P[] }[]; walls: P[] | Set<string>; width: number; height: number };
};

async function boot(page: Page, vp: { width: number; height: number }) {
  await page.setViewportSize(vp);
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { __game?: G }).__game, null, { timeout: 30_000 });
  await page.evaluate(() => { void (window as unknown as { __game: G }).__game.start(); });
  await page.waitForFunction(() => { const v = (window as unknown as { __game: G }).__game.view; return v.phase === 'playing' && !!v.state && v.playMode === 'explore'; }, null, { timeout: 30_000 });
  await page.waitForTimeout(1200);
}

for (const vp of [{ width: 1280, height: 650 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test(`explore hud ${vp.width}x${vp.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await boot(page, vp);
    await expect(page.getByTestId('mode-chip')).toContainText('Exploring');
    await expect(page.getByTestId('objective')).toBeVisible();
    await expect(page.getByLabel('Initiative order')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^End turn/ })).toHaveCount(0);

    const scroll = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth }));
    expect(scroll.h).toBeLessThanOrEqual(vp.height);
    expect(scroll.w).toBeLessThanOrEqual(vp.width);

    // leader select via party card, and Tab cycling
    const ids = await page.evaluate(() => (window as unknown as { __game: G }).__game.view.state!.combatants.filter((c) => c.side === 'hero').map((c) => c.id));
    await page.getByRole('button', { name: /make leader/ }).first().click();
    const lead1 = await page.evaluate(() => (window as unknown as { __game: G }).__game.view.leaderId);
    expect(lead1).not.toBe(ids[0]);
    await page.locator('body').focus();
    await page.mouse.click(5, 5);
    await page.keyboard.press('Tab');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __game: G }).__game.view.leaderId)).not.toBe(lead1);

    // walk to the nearest lore stone: click the stone, controller paths to an adjacent tile and interacts
    const lore = await page.evaluate(() => (window as unknown as { __game: { arena: G['arena'] } }).__game.arena?.lore?.[0]?.pos ?? null);
    if (lore) {
      await page.evaluate((p) => { void (window as unknown as { __game: G }).__game.onTileClick(p); }, lore);
      await expect.poll(() => page.evaluate(() => ((window as unknown as { __game: G }).__game.view.objective as { loreFound: number } | null)?.loreFound ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: `e2e/out/hud-explore-${vp.width}.png` });

    // wake a lair: walk toward the first lair spawn until combat starts
    const spawn = await page.evaluate(() => (window as unknown as { __game: { arena: G['arena'] } }).__game.arena.lairs[0].spawns[0]);
    await page.evaluate((p) => { void (window as unknown as { __game: G }).__game.onTileClick(p); }, spawn);
    await page.waitForFunction(() => (window as unknown as { __game: G }).__game.view.playMode === 'combat', null, { timeout: 40_000 });
    await expect(page.getByTestId('ambush-banner')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `e2e/out/hud-ambush-${vp.width}.png` });
    await expect(page.getByTestId('mode-chip')).toContainText('Combat');
    await expect(page.getByLabel('Initiative order')).toBeVisible();
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `e2e/out/hud-combat-${vp.width}.png` });
    expect(errors).toEqual([]);
  });
}
