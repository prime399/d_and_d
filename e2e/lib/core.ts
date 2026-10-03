// Shared drivers for the exploration specs (smoke + explore). Everything goes through window.__game.
import type { Page } from '@playwright/test';

type P = { x: number; y: number };
export type G = {
  view: {
    phase: string; isPlayerTurn: boolean; busy: boolean; playMode: 'explore' | 'combat'; leaderId: string | null; roomIndex: number;
    objective: { lairs: { id: number; cleared: boolean; awake: boolean; monsters: number }[]; doorOpen: boolean; goldFound: number; loreFound: number; loreTotal: number };
    interactable: { kind: string; pos: P } | null;
    state: { combatants: { id: string; side: string; dead: boolean; pos: P; actedThisTurn?: boolean }[]; turnIndex: number; order: string[] } | null;
  };
  arena: { width: number; door?: P; gold?: P[]; lore?: { pos: P }[] } | null;
  grid: { width: number; height: number; walls: boolean[] };
  onTileClick(p: P): Promise<void>;
  endTurn(): Promise<void>;
  nextRoom(): Promise<void>;
  debugClearLair(id: number): boolean;
  debugTeleport(p: P): boolean;
  debugLairs(): { id: number; cleared: boolean; aggro: number; spawns: P[]; monsters: P[] }[];
};

export const game = (page: Page) => ({
  view: () => page.evaluate(() => (window as unknown as { __game: G }).__game.view),
});

/** Ready for input: our combat turn, idle exploration, or a phase change. */
export const waitReady = (page: Page, timeout = 45_000) =>
  page.waitForFunction(() => {
    const g = (window as unknown as { __game?: G }).__game;
    if (!g?.view.state) return false;
    return g.view.phase !== 'playing' || (!g.view.busy && (g.view.playMode === 'explore' || g.view.isPlayerTurn));
  }, null, { timeout });

export async function startGame(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter the dungeon' }).click();
  await page.waitForFunction(() => {
    const g = (window as unknown as { __game?: G }).__game;
    return g?.view.phase === 'playing' && !!g.view.state;
  }, null, { timeout: 30_000 });
  await waitReady(page);
}

/** Teleports the leader to the free floor tile nearest `near` (not on a sleeping monster), farther than `minDist` from `away`. */
export async function teleportNear(page: Page, near: P, away?: { pos: P; minDist: number }[]) {
  return page.evaluate(({ near, away }) => {
    const g = (window as unknown as { __game: G }).__game;
    const sleepers = new Set(g.debugLairs().filter((l) => !l.cleared).flatMap((l) => l.monsters.map((m) => `${m.x},${m.y}`)));
    const d = (a: P, b: P) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const p = { x: near.x + dx, y: near.y + dy };
      if (p.x < 0 || p.y < 0 || p.x >= g.grid.width || p.y >= g.grid.height) continue;
      if (g.grid.walls[p.y * g.grid.width + p.x] || sleepers.has(`${p.x},${p.y}`)) continue;
      if (away?.some((a) => d(a.pos, p) <= a.minDist)) continue;
      if (g.debugTeleport(p)) return p;
    }
    return null;
  }, { near, away });
}

/** One hero turn: attack if something is in reach, else walk toward the nearest foe, attack, end turn. */
export async function heroTurn(page: Page) {
  await page.evaluate(async () => {
    const g = (window as unknown as { __game: G }).__game;
    const idle = () => new Promise<void>((r) => { const t = setInterval(() => { if (!g.view.busy) { clearInterval(t); r(); } }, 50); });
    const s = g.view.state!;
    const me = s.combatants.find((c) => c.id === s.order[s.turnIndex])!;
    const dist = (a: P, b: P) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const foes = () => g.view.state!.combatants.filter((c) => c.side === 'monster' && !c.dead).sort((a, b) => dist(me.pos, a.pos) - dist(me.pos, b.pos));
    const tryAttack = async () => {
      const f = foes()[0];
      if (f && !me.actedThisTurn) { await g.onTileClick(f.pos); await idle(); }
    };
    await tryAttack();
    if (!me.actedThisTurn && foes()[0] && g.view.isPlayerTurn) {
      const f = foes()[0];
      const before = { ...me.pos };
      const cands: P[] = [];
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
    if (g.view.isPlayerTurn && g.view.phase === 'playing' && g.view.playMode === 'combat') await g.endTurn();
  });
}

/** Explores toward lair `id` (click-walking the leader) until it wakes. Returns the play mode reached. */
export async function walkIntoLair(page: Page, id: number) {
  for (let i = 0; i < 12; i++) {
    await waitReady(page);
    const mode = await page.evaluate(async (id) => {
      const g = (window as unknown as { __game: G }).__game;
      if (g.view.playMode !== 'explore' || g.view.phase !== 'playing') return g.view.playMode;
      const lair = g.debugLairs().find((l) => l.id === id)!;
      await g.onTileClick(lair.monsters[0] ?? lair.spawns[0]);
      return g.view.playMode;
    }, id);
    if (mode === 'combat') return mode;
  }
  return (await game(page).view()).playMode;
}

/** Plays combat turns until the party is back exploring (or the level ends). Returns 'explore' | phase. */
export async function fight(page: Page) {
  for (let i = 0; i < 80; i++) {
    await waitReady(page);
    const v = await game(page).view();
    if (v.phase !== 'playing') return v.phase;
    if (v.playMode === 'explore') return 'explore';
    await heroTurn(page);
  }
  return 'timeout';
}

/** Retries `fn` when the shared dev server hot-reloads mid-run. */
export async function withReloadRetry<T>(page: Page, errors: string[], fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    let navigated = false;
    const onNav = (f: { parentFrame(): unknown }) => { if (!f.parentFrame()) navigated = true; };
    page.on('framenavigated', onNav);
    try {
      return await fn();
    } catch (err) {
      if (attempt >= tries || !(navigated || /context was destroyed|navigation/i.test(String(err)))) throw err;
      errors.length = 0;
      console.log(`[e2e] page reloaded (hot reload), retrying (${attempt})`);
    } finally {
      page.off('framenavigated', onNav);
    }
  }
}

export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // 429s are the DM rate limit (all local tests share one IP); the game degrades gracefully, so they aren't failures
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 429/.test(m.text())) errors.push(m.text()); });
  return errors;
}

/** From explore mode: walks into the first uncleared lair and waits for an idle hero turn. */
export async function toPlayerTurn(page: Page, timeout = 75_000) {
  const id = await page.evaluate(() => (window as unknown as { __game: G }).__game.debugLairs().find((l) => !l.cleared)?.id ?? 1);
  await walkIntoLair(page, id);
  await page.waitForFunction(() => {
    const v = (window as unknown as { __game: G }).__game.view;
    return v.phase !== 'playing' || (v.playMode === 'combat' && v.isPlayerTurn && !v.busy);
  }, null, { timeout });
}
