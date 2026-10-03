import { test, expect, type Page } from '@playwright/test';

type G = {
  view: {
    phase: string; isPlayerTurn: boolean; busy: boolean;
    state: { combatants: { id: string; side: string; dead: boolean; pos: { x: number; y: number }; actedThisTurn?: boolean; attacks: { range: number }[] }[]; turnIndex: number; order: string[] } | null;
  };
  onTileClick(p: { x: number; y: number }): Promise<void>;
  endTurn(): Promise<void>;
  setMode(m: { kind: 'move' }): void;
};

const waitReady = (page: Page) =>
  page.waitForFunction(() => {
    const g = (window as unknown as { __game?: G }).__game;
    return !!g && ((g.view.isPlayerTurn && !g.view.busy) || g.view.phase !== 'playing');
  }, null, { timeout: 45_000 });

/** One hero turn: attack if something is in reach, else walk toward the nearest foe, attack, end turn. */
async function heroTurn(page: Page) {
  await page.evaluate(async () => {
    const g = (window as unknown as { __game: G }).__game;
    const idle = () => new Promise<void>((r) => { const t = setInterval(() => { if (!g.view.busy) { clearInterval(t); r(); } }, 50); });
    const s = g.view.state!;
    const me = s.combatants.find((c) => c.id === s.order[s.turnIndex])!;
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const foes = () => g.view.state!.combatants.filter((c) => c.side === 'monster' && !c.dead).sort((a, b) => dist(me.pos, a.pos) - dist(me.pos, b.pos));
    const tryAttack = async () => {
      const f = foes()[0];
      if (f && !me.actedThisTurn) { await g.onTileClick(f.pos); await idle(); }
    };
    await tryAttack();
    if (!me.actedThisTurn && foes()[0] && g.view.isPlayerTurn) {
      // step toward the foe: click a tile adjacent to it, nearest first, falling back to partial moves
      const f = foes()[0];
      const before = { ...me.pos };
      const cands: { x: number; y: number }[] = [];
      for (let r = 1; r <= 6; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r) cands.push({ x: f.pos.x + dx, y: f.pos.y + dy });
      }
      cands.sort((a, b) => dist(a, f.pos) - dist(b, f.pos) || dist(me.pos, a) - dist(me.pos, b));
      for (const c of cands) {
        if (!g.view.isPlayerTurn) break;
        await g.onTileClick(c);
        await idle();
        if (me.pos.x !== before.x || me.pos.y !== before.y) break;
      }
      if (g.view.isPlayerTurn) await tryAttack();
    }
    if (g.view.isPlayerTurn && g.view.phase === 'playing') await g.endTurn();
  });
}

/** Plays from the title screen until the room ends. Returns the final phase, or 'reloaded' if the page navigated. */
async function playRoom(page: Page, errors: string[]): Promise<string> {
  let navigated = false;
  const onNav = (f: { parentFrame(): unknown }) => { if (!f.parentFrame()) navigated = true; };
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter the dungeon' }).click();
  await page.screenshot({ path: 'e2e/out/01-title-click.png' });
  page.on('framenavigated', onNav);
  try {
    await waitReady(page);
    await page.screenshot({ path: 'e2e/out/02-first-turn.png' });
    let phase = 'playing';
    for (let i = 0; i < 60 && phase === 'playing'; i++) {
      await waitReady(page);
      phase = await page.evaluate(() => (window as unknown as { __game: G }).__game.view.phase);
      if (phase !== 'playing') break;
      await heroTurn(page);
    }
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'e2e/out/03-room-end.png' });
    return await page.evaluate(() => (window as unknown as { __game: G }).__game.view.phase);
  } catch (err) {
    // the shared dev server hot-reloads while other files change; retry instead of failing
    if (navigated || /context was destroyed|navigation/i.test(String(err))) return 'reloaded';
    throw err;
  } finally {
    page.off('framenavigated', onNav);
    if (navigated) errors.length = 0;
  }
}

test('play room 1 to victory', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  let phase = 'reloaded';
  for (let attempt = 0; attempt < 4 && phase === 'reloaded'; attempt++) phase = await playRoom(page, errors);
  expect(phase).toBe('room-cleared');
  expect(errors).toEqual([]);
});
