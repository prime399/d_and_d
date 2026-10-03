import { test, expect } from '@playwright/test';
import { startGame, toPlayerTurn } from './lib/core';

// On an ambush every enemy must be lit, shown and on screen so spells and attacks can be aimed.
test('ambushed enemies are visible and on screen', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await startGame(page);
  await toPlayerTurn(page);
  await page.waitForTimeout(1500);
  const foes = await page.evaluate(() => {
    const g = (window as any).__game;
    const sc = g.scene;
    const cam = sc.cameras.main.worldView;
    return g.view.state.combatants.filter((c: any) => c.side === 'monster' && !c.dead).map((c: any) => {
      const u = sc.units.get(c.id);
      const x = u.container.x, y = u.container.y;
      return { id: c.id, lit: sc.tileVisible(c.pos), shown: u.container.visible, onScreen: x >= cam.x && x <= cam.right && y >= cam.y && y <= cam.bottom };
    });
  });
  // monsters of lairs that haven't woken stay hidden in the fog
  const sleepers = await page.evaluate(() => {
    const g = (window as any).__game; const sc = g.scene;
    const inFight = new Set(g.view.state.combatants.map((c: any) => c.id));
    return [...sc.units.entries()].filter(([id, u]: any) => u.view.side === 'monster' && !inFight.has(id))
      .map(([id, u]: any) => ({ id, asleep: !!u.view.asleep, shown: u.container.visible, lit: sc.tileVisible(u.view.pos) }));
  });
  console.log('sleepers', JSON.stringify(sleepers));
  for (const z of sleepers) expect(z, z.id).toMatchObject({ asleep: true, shown: z.lit });
  expect(foes.length).toBeGreaterThan(0);
  for (const f of foes) expect(f, f.id).toMatchObject({ lit: true, shown: true, onScreen: true });
  await page.screenshot({ path: 'e2e/out/ambush-visibility.png' });

  // through the next enemy turns, the acting monster stays on screen
  await page.evaluate(() => {
    const w = window as any; w.__camLog = [];
    const tick = () => {
      const g = w.__game; const sc = g.scene; const v = sc.cameras.main.worldView; const s = g.view.state;
      const cur = s && s.combatants.find((c: any) => c.id === s.order[s.turnIndex]); const u = cur && sc.units.get(cur.id);
      if (u && cur.side === 'monster' && g.view.playMode === 'combat') w.__camLog.push(u.container.x > v.x && u.container.x < v.right && u.container.y > v.y && u.container.y < v.bottom);
      if (w.__camLog.length < 5000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  for (let k = 0; k < 3; k++) {
    await page.evaluate(() => (window as any).__game.endTurn());
    await page.waitForFunction(() => { const g = (window as any).__game; return (g.view.isPlayerTurn && !g.view.busy) || g.view.playMode !== 'combat'; }, null, { timeout: 40_000 });
  }
  const log: boolean[] = await page.evaluate(() => (window as any).__camLog);
  expect(log.length).toBeGreaterThan(0);
  expect(log.filter((on) => !on).length).toBe(0);
});
