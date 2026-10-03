import { test } from '@playwright/test';
import { startGame, teleportNear, heroTurn, type G } from './lib/core';

const dump = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const g = (window as unknown as { __game: G & { view: any } }).__game; const v = g.view; const s = v.state;
  const cur = s ? s.combatants.find((c: any) => c.id === s.order[s.turnIndex]) : null;
  return JSON.stringify({ phase: v.phase, playMode: v.playMode, busy: v.busy, isPlayerTurn: v.isPlayerTurn, status: s?.status,
    cur: cur && { id: cur.id, side: cur.side, dead: cur.dead, hp: cur.hp, conds: cur.conditions.map((c: any) => c.slug), acted: cur.actedThisTurn, moved: cur.movedThisTurn },
    alive: s?.combatants.filter((c: any) => !c.dead).map((c: any) => c.id), lastLog: s?.log.slice(-6) });
});

for (let run = 0; run < 3; run++) {
  test(`two fights in a row #${run}`, async ({ page }) => {
    test.setTimeout(420_000);
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && /\[game\]/.test(m.text())) errs.push(m.text()); });
    await page.setViewportSize({ width: 1366, height: 768 });
    await startGame(page);
    for (const lairId of [1, 2]) {
      const lair = await page.evaluate((id) => (window as any).__game.debugLairs().find((l: any) => l.id === id), lairId);
      await teleportNear(page, lair.monsters[0] ?? lair.spawns[0]);
      // take real steps toward the lair so the normal post-move wake check runs
      for (let k = 0; k < 6; k++) {
        const pm = await page.evaluate(async (t) => { const g = (window as any).__game; if (g.view.playMode !== 'explore') return g.view.playMode; await g.onTileClick(t); await new Promise((r) => setTimeout(r, 900)); return g.view.playMode; }, lair.monsters[0] ?? lair.spawns[0]);
        if (pm === 'combat') break;
      }
      let turns = 0, idleSince = Date.now();
      while (turns < 60) {
        const v = await page.evaluate(() => { const v = (window as any).__game.view; return { pm: v.playMode, ph: v.phase, busy: v.busy, my: v.isPlayerTurn }; });
        if (v.ph !== 'playing' || (v.pm === 'explore' && !v.busy && turns > 0)) break;
        if (v.pm === 'combat' && v.my && !v.busy) { await heroTurn(page); turns++; idleSince = Date.now(); continue; }
        if (Date.now() - idleSince > 30_000) { console.log(`STALL run${run} lair${lairId} turns=${turns}`, await dump(page)); throw new Error('stall'); }
        await page.waitForTimeout(250);
      }
      console.log(`run${run} lair${lairId}: ${turns} hero turns ->`, await dump(page).then((d) => JSON.parse(d).playMode));
    }
    console.log(`run${run} errors`, JSON.stringify(errs));
  });
}
