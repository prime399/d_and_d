import { test, expect, type Page } from '@playwright/test';

type G = {
  view: { isPlayerTurn: boolean; busy: boolean; phase: string; state?: { combatants?: { id: string; side: string; pos: { x: number; y: number }; hp: number }[] } };
  enterRoom: (i: number) => Promise<void>;
  scene?: unknown;
};
const g = (page: Page) => page.evaluate.bind(page);

async function boot(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter the dungeon' }).click();
  await page.waitForFunction(() => (window as unknown as { __game?: G }).__game?.view.phase === 'playing', null, { timeout: 30_000 });
  await page.waitForTimeout(2600);
}

for (const size of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test(`room visuals ${size.width}`, async ({ page }) => {
    const errors: string[] = [];
    await page.setViewportSize(size);
    await boot(page, errors);
    await page.screenshot({ path: `e2e/out/scene-room1-${size.width}.png` });
    if (size.width === 1366) {
      // title card visible early in a room
      await g(page)(() => (window as unknown as { __game: G }).__game.enterRoom(1));
      await page.waitForTimeout(900);
      await page.screenshot({ path: `e2e/out/scene-room2-title.png` });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `e2e/out/scene-room2.png` });
      await g(page)(() => (window as unknown as { __game: G }).__game.enterRoom(2));
      await page.waitForTimeout(2600);
      await page.screenshot({ path: `e2e/out/scene-room3.png` });
      await g(page)(() => (window as unknown as { __game: G }).__game.enterRoom(3));
      await page.waitForTimeout(2600);
      await page.screenshot({ path: `e2e/out/scene-room4.png` });
    }
    expect(errors.filter((e) => !/favicon|DM|fetch|Sanity|api/i.test(e))).toEqual([]);
  });
}

test('combat fx', async ({ page }) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 1366, height: 768 });
  await boot(page, errors);
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  // Hover the middle of the canvas to show overlays and cursor.
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'e2e/out/scene-overlay.png' });
  // Drive the scene directly for FX shots.
  await page.evaluate(() => {
    const w = window as unknown as { __game: { scene: Record<string, (...a: unknown[]) => unknown>; view: { state: { combatants: { id: string; side: string }[] } } } };
    const s = w.__game.scene;
    const cs = w.__game.view.state.combatants;
    const hero = cs.find((c) => c.side === 'hero')!;
    const mon = cs.find((c) => c.side !== 'hero')!;
    void s.attackAnim(hero.id, mon.id, 'spell', 0x7cc4ff);
    setTimeout(() => s.hitFx(mon.id, 12, true, 'damage'), 300);
    setTimeout(() => s.burst({ x: 10, y: 4 }, 2, 0xff7a2a), 350);
    setTimeout(() => s.hitFx(hero.id, 5, false, 'heal'), 380);
    (s.focusUnit as ((id: string) => void) | undefined)?.(mon.id);
  });
  await page.waitForTimeout(520);
  await page.screenshot({ path: 'e2e/out/scene-fx.png' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const w = window as unknown as { __game: { scene: { highlightUnit?: (id: string | null) => void }; view: { state: { combatants: { id: string; side: string }[] } } } };
    w.__game.scene.highlightUnit?.(w.__game.view.state.combatants.find((c) => c.side !== 'hero')!.id);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'e2e/out/scene-highlight.png' });
  await page.evaluate(() => (window as unknown as { __game: { scene: { highlightUnit?: (id: string | null) => void } } }).__game.scene.highlightUnit?.(null));
  await page.waitForTimeout(1500);
  expect(errors.filter((e) => !/favicon|DM|fetch|Sanity|api/i.test(e))).toEqual([]);
});
