import { test, expect } from '@playwright/test';
import { collectErrors, fight, game, startGame, walkIntoLair, withReloadRetry } from './lib/core';

test('explore to the first lair, fight it and clear it', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = collectErrors(page);
  await withReloadRetry(page, errors, async () => {
    await startGame(page);
    const v0 = await game(page).view();
    expect(v0.playMode).toBe('explore');
    expect(v0.leaderId).toBeTruthy();
    await page.screenshot({ path: 'e2e/out/01-explore-start.png' });

    expect(await walkIntoLair(page, 1)).toBe('combat');
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'e2e/out/02-ambush.png' });

    const end = await fight(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'e2e/out/03-lair-cleared.png' });
    expect(end).toBe('explore');
    const v = await game(page).view();
    expect(v.objective.lairs.filter((l) => l.cleared).length).toBeGreaterThanOrEqual(1);
  });
  expect(errors).toEqual([]);
});
