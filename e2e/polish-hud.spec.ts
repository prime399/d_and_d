import { test, expect, type Page } from '@playwright/test';
import { startGame, toPlayerTurn } from './lib/core';

type G = { view: { isPlayerTurn: boolean; busy: boolean; phase: string; state: { combatants: { side: string; spells?: string[] }[] } | null; activeId: string | null }; start: () => Promise<void>; endTurn: () => Promise<void> };
const g = (p: Page) => p.evaluate(() => !!(window as unknown as { __game?: G }).__game);

async function heroTurn(page: Page) {
  await page.waitForFunction(() => {
    const x = (window as unknown as { __game?: G }).__game;
    return x && ((x.view.isPlayerTurn && !x.view.busy) || (x.view.phase !== 'playing' && x.view.phase !== 'title'));
  }, null, { timeout: 45_000 });
}

/** Ends turns until the active hero has spells (so the spellbook can open). */
async function toCaster(page: Page) {
  for (let i = 0; i < 6; i++) {
    await heroTurn(page);
    const caster = await page.evaluate(() => {
      const x = (window as unknown as { __game: G }).__game;
      const c = x.view.state?.combatants.find((c) => (c as unknown as { id: string }).id === x.view.activeId);
      return !!c?.spells?.length;
    });
    if (caster) return true;
    await page.evaluate(() => (window as unknown as { __game: G }).__game.endTurn());
  }
  return false;
}

for (const vp of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test(`hud ${vp.width}x${vp.height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.setViewportSize(vp);
    await startGame(page);
    expect(await g(page)).toBe(true);
    await toPlayerTurn(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `e2e/out/hud-${vp.width}-banner.png` });
    await heroTurn(page);
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `e2e/out/hud-${vp.width}-turn.png` });

    // no page scroll
    const scroll = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth }));
    expect(scroll.h).toBeLessThanOrEqual(vp.height);
    expect(scroll.w).toBeLessThanOrEqual(vp.width);

    if (await toCaster(page)) {
      await page.waitForTimeout(1300);
      await page.locator('.hud-act[aria-haspopup]').click();
      await expect(page.getByRole('dialog', { name: /spellbook/ })).toBeVisible();
      await page.screenshot({ path: `e2e/out/hud-${vp.width}-spells.png` });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: /spellbook/ })).toBeHidden();
    }
    // tooltip on an attack button
    await page.locator('.hud-act').nth(1).hover();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `e2e/out/hud-${vp.width}-tooltip.png` });
    // help popover
    await page.getByRole('button', { name: 'Controls help' }).click();
    await page.screenshot({ path: `e2e/out/hud-${vp.width}-help.png` });
    await page.keyboard.press('Escape');
    expect(errors.filter((e) => !/favicon|404|Failed to load resource/.test(e))).toEqual([]);
  });
}

test('hud narrow 390', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startGame(page);
  await toPlayerTurn(page);
  await heroTurn(page);
  await page.waitForTimeout(1300);
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'e2e/out/hud-390.png', fullPage: true });
});
