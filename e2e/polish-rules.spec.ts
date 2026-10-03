import { test, expect, type Page } from '@playwright/test';

type G = { focusDoc: (id: string) => void; clearFocus?: () => void; view: { focus: string | null; rulings: unknown[] } };

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { __game?: unknown }).__game, null, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Enter the dungeon' }).click();
  await page.waitForFunction(() => {
    const g = (window as unknown as { __game: { view: { isPlayerTurn: boolean; busy: boolean } } }).__game;
    return g.view.isPlayerTurn && !g.view.busy;
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(1500); // let the force layout settle and zoom-to-fit
}

async function lightPath(page: Page) {
  for (const id of ['condition.prone', 'rule.advantage', 'rule.attack-rolls', 'condition.grappled']) {
    await page.evaluate((x) => (window as unknown as { __game: G }).__game.focusDoc(x), id);
    await page.waitForTimeout(450);
  }
}

for (const vp of [
  { w: 1366, h: 768 },
  { w: 1920, h: 1080 },
]) {
  test(`rules tome ${vp.w}x${vp.h}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await boot(page);
    const panel = page.locator('section[aria-label="Rules Tome"]');
    await panel.screenshot({ path: `e2e/out/rules-idle-${vp.w}.png` });

    await lightPath(page);
    await page.waitForTimeout(300);
    await panel.screenshot({ path: `e2e/out/rules-card-${vp.w}.png` });
    await expect(panel.getByRole('navigation', { name: 'Last lookups' })).toContainText('Grappled');

    await panel.getByRole('button', { name: /Compare 2014/ }).click();
    await page.waitForTimeout(300);
    await panel.screenshot({ path: `e2e/out/rules-compare-${vp.w}.png` });

    // Escape leaves compare, then closes the card
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __game: G }).__game.view.focus)).toBeFalsy();
    await page.waitForTimeout(900);
    await panel.screenshot({ path: `e2e/out/rules-path-${vp.w}.png` });

    // search focuses a doc
    await panel.getByRole('combobox').fill('frigh');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __game: G }).__game.view.focus)).toBe('condition.frightened');
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __game: G }).__game.view.focus)).toBeFalsy();

    // play a little so rulings arrive
    for (let i = 0; i < 3; i++) {
      await page.waitForFunction(() => {
        const g = (window as unknown as { __game: { view: { isPlayerTurn: boolean; busy: boolean; phase: string } } }).__game;
        return (g.view.isPlayerTurn && !g.view.busy) || g.view.phase !== 'playing';
      }, null, { timeout: 30_000 });
      await page.getByRole('button', { name: /End turn/ }).click().catch(() => {});
    }
    await page.waitForTimeout(1500);
    await panel.getByRole('tab', { name: /Rulings/ }).click();
    await panel.screenshot({ path: `e2e/out/rules-rulings-${vp.w}.png` });
    await page.screenshot({ path: `e2e/out/rules-page-${vp.w}.png` });

    const scroll = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
    expect(scroll).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('rules tome stacked at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await lightPath(page);
  const panel = page.locator('section[aria-label="Rules Tome"]');
  await panel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'e2e/out/rules-390.png', fullPage: true });
  // the legend must stay inside the Rules Tome panel
  const pb = (await panel.boundingBox())!;
  const lb = (await panel.getByRole('group', { name: 'Filter by type' }).boundingBox())!;
  expect(lb.y).toBeGreaterThanOrEqual(pb.y);
  expect(lb.y + lb.height).toBeLessThanOrEqual(pb.y + pb.height + 1);
  const dm = page.locator('aside > section').first();
  const db = (await dm.boundingBox())!;
  expect(lb.y).toBeGreaterThanOrEqual(db.y + db.height);
});
