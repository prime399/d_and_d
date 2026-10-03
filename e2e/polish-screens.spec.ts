import { waitReady, toPlayerTurn } from './lib/core';
import { test, expect, type Page } from '@playwright/test';

type G = { view: Record<string, unknown>; update: (p: Record<string, unknown>) => void; start: () => Promise<void> };
const game = (page: Page) => page.waitForFunction(() => !!(window as unknown as { __game?: G }).__game, null, { timeout: 30_000 });

for (const [w, h] of [[1366, 768], [1920, 1080]] as const) {
  test(`title ${w}x${h}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    await game(page);
    await expect(page.getByRole('button', { name: 'Enter the Dungeon' })).toBeVisible();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `e2e/out/screens-title-${w}.png` });
    const scroll = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight);
    expect(scroll).toBe(false);
    if (w === 1366) {
      await page.getByRole('button', { name: 'Credits & licenses' }).click();
      await expect(page.getByRole('dialog', { name: 'Credits' })).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'e2e/out/screens-credits.png' });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Credits' })).toBeHidden();
    }
    expect(errors.filter((e) => !/favicon|AudioContext|autoplay|status of 429/i.test(e))).toEqual([]);
  });
}

test('room cleared, victory, defeat, hover, toasts', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await game(page);
  await page.getByRole('button', { name: 'Enter the Dungeon' }).click();
  await waitReady(page);
  await toPlayerTurn(page);

  // hover card on a monster + stacked toasts
  await page.evaluate(() => {
    const g = (window as unknown as { __game: G & { toast: (s: string) => void } }).__game;
    const s = g.view.state as { combatants: { side: string; name: string; hp: number; maxHp: number; ac: number; refSlug: string; pos: unknown }[] };
    const m = s.combatants.find((c) => c.side === 'monster')!;
    g.update({ hover: { pos: m.pos, unit: { name: m.name, hp: m.hp - 3, maxHp: m.maxHp, ac: m.ac, conditions: ['prone', 'poisoned'], side: 'monster', refSlug: m.refSlug } } });
    g.toast('Goblin 1 is Prone!');
    setTimeout(() => g.toast('Goblin 2 is out of reach. Move closer first.'), 100);
    setTimeout(() => g.toast('Brakka Ironhide finds a Potion of Healing!'), 200);
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'e2e/out/screens-hover-toasts.png' });

  const fake = () => page.evaluate(() => {
    const g = (window as unknown as { __game: G }).__game;
    const rules = ['rule.attack-rolls', 'condition.prone', 'rule.opportunity-attacks', 'rule.critical-hits', 'rule.cover'];
    const rulings = Array.from({ length: 12 }, (_, i) => ({ key: 1000 + i, context: 'x', citation: { id: rules[i % 5 === 4 ? 0 : i % 5], title: ['Attack Rolls', 'Prone', 'Opportunity Attacks', 'Critical Hits', 'Cover'][i % 5 === 4 ? 0 : i % 5], source: 'SRD 5.2.1' } }));
    g.update({ rulings, stats: { rolls: 42, crits: 3, kills: 7, rulesCited: 17, lookups: 9 }, hover: null });
  });
  await fake();
  await page.evaluate(() => (window as unknown as { __game: G }).__game.update({ phase: 'room-cleared' }));
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'e2e/out/screens-room-cleared.png' });
  await expect(page.getByRole('button', { name: /Descend deeper/ })).toBeFocused();

  await page.evaluate(() => (window as unknown as { __game: G }).__game.update({ phase: 'victory' }));
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'e2e/out/screens-victory.png' });

  await page.evaluate(() => (window as unknown as { __game: G }).__game.update({ phase: 'defeat' }));
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'e2e/out/screens-defeat.png' });
  await expect(page.getByRole('button', { name: 'Retry room' })).toBeFocused();
});
