import { test, expect, type Page } from '@playwright/test';

type G = { __game: { start: () => void; ask: (q: string) => Promise<void>; update: (p: unknown) => void; view: { chat: unknown[]; phase: string; dmThinking: boolean } } };

const fake = () => {
  const g = (window as unknown as G).__game;
  g.update({
    chat: [...g.view.chat, {
      id: 999, role: 'dm', backend: 'sanity-context',
      text: 'The wolf’s jaws drag Elowen down. Prone [[condition.prone]] means attacks against her from adjacent foes have advantage [[rule.advantage]]. Rules changed: in 2014 [[condition.grappled.2014]] worked differently.',
      lookups: [
        { tool: 'groq_query', input: JSON.stringify({ query: '*[_type=="condition" && slug.current=="prone"]{name,effects}' }), ids: ['condition.prone'], via: 'sanity-context' },
        { tool: 'kb_knowledge_base_read', input: JSON.stringify({ query: 'grappled 2024 changes' }), ids: ['condition.grappled', 'condition.grappled.2014'], via: 'knowledge-base' },
      ],
    }],
  });
};

async function run(page: Page, tag: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as G).__game);
  await page.screenshot({ path: `e2e/out/dm-${tag}-0-empty.png` });
  await page.evaluate(() => (window as unknown as G).__game.start());
  await page.waitForTimeout(2500);
  await page.evaluate(() => void (window as unknown as G).__game.ask('What does Prone do?'));
  await page.waitForTimeout(150);
  await page.screenshot({ path: `e2e/out/dm-${tag}-1-pending.png` });
  await page.waitForFunction(() => !(window as unknown as G).__game.view.dmThinking, null, { timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `e2e/out/dm-${tag}-2-answer.png` });
  await page.evaluate(fake);
  await page.waitForTimeout(600);
  const dm = page.getByRole('log', { name: 'Dungeon Master chat' });
  await dm.getByRole('button', { name: /How the DM ruled/ }).last().click();
  await page.waitForTimeout(300);
  await dm.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await page.getByRole('button', { name: /Prone\. Open/ }).last().hover();
  await page.waitForTimeout(250);
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.screenshot({ path: `e2e/out/dm-${tag}-3-trace.png` });
  // crop of the panel for detail
  await page.locator('section[aria-label="Dungeon Master"]').screenshot({ path: `e2e/out/dm-${tag}-4-panel.png` });
  await page.getByRole('button', { name: /Prone\. Open/ }).last().click();
  const noScroll = tag === "390" || await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1);
  expect(noScroll).toBe(true);
  expect(errors.filter((e) => !/favicon|Failed to load resource/.test(e))).toEqual([]);
}

test('dm panel 1366', async ({ page }) => { await page.setViewportSize({ width: 1366, height: 768 }); await run(page, '1366'); });
test('dm panel 1920', async ({ page }) => { await page.setViewportSize({ width: 1920, height: 1080 }); await run(page, '1920'); });
test('dm panel 390', async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); await run(page, '390'); });
