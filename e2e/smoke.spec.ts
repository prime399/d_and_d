import { test, expect } from '@playwright/test';

// Boots the game, enters the first room, plays a few player turns and captures screenshots.
test('enter the dungeon and fight', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter the dungeon' }).click();
  await page.screenshot({ path: 'e2e/out/01-title-click.png' });

  // wait for a hero turn
  await expect(page.getByText(/'s turn$/)).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'e2e/out/02-first-turn.png' });

  for (let i = 0; i < 6; i++) {
    await page.waitForFunction(() => {
      const g = (window as unknown as { __game?: { view: { isPlayerTurn: boolean; busy: boolean; phase: string } } }).__game;
      return g && ((g.view.isPlayerTurn && !g.view.busy) || g.view.phase !== 'playing');
    }, null, { timeout: 30_000 });
    const phase = await page.evaluate(() => (window as unknown as { __game: { view: { phase: string } } }).__game.view.phase);
    if (phase !== 'playing') break;
    await page.getByRole('button', { name: /End turn/ }).click();
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/out/03-after-turns.png' });
  expect(errors).toEqual([]);
});
