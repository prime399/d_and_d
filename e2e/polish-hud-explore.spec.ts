import { test, expect, type Page } from '@playwright/test';

/** Exploration HUD. If the controller doesn't expose explore fields yet, they're injected via the private update(). */
type G = { view: Record<string, unknown> & { phase: string; state: { combatants: { id: string; side: string }[] } | null }; start: () => Promise<void>; update: (p: Record<string, unknown>) => void };

async function boot(page: Page, vp: { width: number; height: number }) {
  await page.setViewportSize(vp);
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { __game?: G }).__game, null, { timeout: 30_000 });
  await page.evaluate(() => { void (window as unknown as { __game: G }).__game.start(); });
  await page.waitForFunction(() => (window as unknown as { __game: G }).__game.view.state, null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
}

async function forceExplore(page: Page) {
  await page.evaluate(() => {
    const g = (window as unknown as { __game: G }).__game;
    const v = g.view;
    if (v.objective && v.leaderId) return; // core already provides them
    const heroes = v.state!.combatants.filter((c) => c.side === 'hero');
    const patch: Record<string, unknown> = {
      leaderId: v.leaderId ?? heroes[1].id,
      objective: v.objective ?? { lairs: [{ id: 1, cleared: true, awake: false, monsters: 0 }, { id: 2, cleared: false, awake: false, monsters: 3 }, { id: 3, cleared: false, awake: false, monsters: 4 }], doorOpen: false, goldFound: 35, loreFound: 1, loreTotal: 3 },
      interactable: v.interactable ?? { kind: 'lore', label: 'Read lore stone' },
    };
    if (v.mode !== 'explore' && v.playMode !== 'explore') patch.playMode = 'explore';
    g.update(patch);
  });
}

for (const vp of [{ width: 1280, height: 650 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test(`explore hud ${vp.width}x${vp.height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await boot(page, vp);
    await forceExplore(page);
    await page.waitForTimeout(400);
    await expect(page.getByTestId('mode-chip')).toContainText('Exploring');
    await expect(page.getByTestId('objective')).toBeVisible();
    await expect(page.getByLabel('Initiative order')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Read lore stone/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^End turn/ })).toHaveCount(0);
    await page.screenshot({ path: `e2e/out/hud-explore-${vp.width}.png` });

    const scroll = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth }));
    expect(scroll.h).toBeLessThanOrEqual(vp.height);
    expect(scroll.w).toBeLessThanOrEqual(vp.width);

    // door open state
    await page.evaluate(() => {
      const g = (window as unknown as { __game: G }).__game;
      const o = g.view.objective as { lairs: { cleared: boolean }[] };
      g.update({ objective: { ...o, lairs: o.lairs.map((l) => ({ ...l, cleared: true })), doorOpen: true } });
    });
    await expect(page.getByTestId('objective')).toContainText('Find the exit');

    // flip to combat -> ambush banner + rail back
    await page.evaluate(() => {
      const g = (window as unknown as { __game: G }).__game;
      const k = g.view.playMode !== undefined ? 'playMode' : 'mode';
      g.update({ [k]: k === 'mode' ? { kind: 'move' } : 'combat' });
    });
    await expect(page.getByTestId('ambush-banner')).toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `e2e/out/hud-ambush-${vp.width}.png` });
    await page.waitForTimeout(1800);
    await expect(page.getByTestId('mode-chip')).toContainText('Combat');
    await expect(page.getByLabel('Initiative order')).toBeVisible();
    await page.screenshot({ path: `e2e/out/hud-combat-${vp.width}.png` });
    expect(errors).toEqual([]);
  });
}
