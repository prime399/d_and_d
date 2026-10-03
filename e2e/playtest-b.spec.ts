// Playtest B: levels 4-5, the boss, end screens and failure paths. Music is tracked by wrapping window.Audio.
import { test, expect, type Page } from '@playwright/test';
import { collectErrors, game, startGame, teleportNear, waitReady, walkIntoLair, withReloadRetry, type G } from './lib/core';

type P = { x: number; y: number };
type C = { id: string; side: string; name: string; dead: boolean; pos: P; hp: number; maxHp: number; potions?: number; slots?: Record<number, number>; spells?: string[]; actedThisTurn?: boolean; conditions: { slug: string }[] };
const OUT = 'e2e/out/playb';
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}-${name}.png` });

/** Records every music track created (src) and keeps the elements so tests can seek a sting to its end. */
async function trackAudio(page: Page) {
  await page.addInitScript(() => {
    const W = window as unknown as { __tracks: string[]; __els: HTMLAudioElement[]; Audio: typeof Audio };
    W.__tracks = [];
    W.__els = [];
    const Orig = window.Audio;
    W.Audio = function (src?: string) {
      const el = new Orig(src);
      if (src?.includes('/music/')) {
        W.__tracks.push(src.replace(/.*\/music\/|\.mp3$/g, ''));
        W.__els.push(el);
      }
      return el;
    } as unknown as typeof Audio;
  });
}
const tracks = (page: Page) => page.evaluate(() => (window as unknown as { __tracks: string[] }).__tracks.slice());
const lastTrack = async (page: Page) => (await tracks(page)).at(-1);

/** A smarter hero turn: heals, buffs, area spells on clusters, Hold Person, potions, dodge; falls back to attacks. */
async function smartTurn(page: Page, log: string[]) {
  const did = await page.evaluate(async () => {
    const g = (window as unknown as { __game: G & { setMode(m: unknown): void; potion(): Promise<void>; dodge(): Promise<void>; view: { state: { combatants: C[] } } } }).__game;
    const idle = () => new Promise<void>((r) => { const t = setInterval(() => { if (!g.view.busy) { clearInterval(t); r(); } }, 50); });
    const s = g.view.state!;
    const me = s.combatants.find((c) => c.id === s.order[s.turnIndex])! as unknown as C;
    const d = (a: P, b: P) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const foes = () => (g.view.state!.combatants as unknown as C[]).filter((c) => c.side === 'monster' && !c.dead).sort((a, b) => d(me.pos, a.pos) - d(me.pos, b.pos));
    const allies = () => (g.view.state!.combatants as unknown as C[]).filter((c) => c.side === 'hero' && !c.dead);
    const slot = (l: number) => (me.slots?.[l] ?? 0) > 0;
    const has = (sp: string) => me.spells?.includes(sp);
    const cast = async (slug: string, at: P) => {
      g.setMode({ kind: 'spell', slug });
      await g.onTileClick(at);
      await idle();
      g.setMode({ kind: 'move' });
      return !!me.actedThisTurn;
    };
    const cluster = (r: number, range: number) => {
      // tile with most foes in radius r and no allies, within range
      let best: { at: P; n: number } | null = null;
      for (const f of foes()) {
        if (d(me.pos, f.pos) > range) continue;
        const n = foes().filter((o) => d(o.pos, f.pos) <= r).length;
        const hurtAlly = allies().some((a) => d(a.pos, f.pos) <= r);
        if (!hurtAlly && (!best || n > best.n)) best = { at: f.pos, n };
      }
      return best;
    };
    const notes: string[] = [];
    if (me.hp <= me.maxHp * 0.3 && (me.potions ?? 0) > 0) { await g.potion(); await idle(); notes.push('potion'); }
    if (!me.actedThisTurn && me.name.startsWith('Tobin')) {
      const hurt = allies().filter((a) => a.hp < a.maxHp * 0.45).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt && slot(1) && (await cast('healing-word', hurt.pos))) notes.push(`healing-word→${hurt.name}`);
      else if ((g.view.state as unknown as { round: number }).round === 1 && slot(1) && has('bless')) {
        const b = allies().find((a) => a.name.startsWith('Brakka'))!;
        if (await cast('bless', b.pos)) notes.push('bless');
      }
      const f = foes()[0];
      if (!me.actedThisTurn && f && slot(2) && foes().some((x) => /hobgoblin|cultist|bugbear/.test(x.id)) && Math.random() < 0.3) {
        const h = foes().find((x) => /hobgoblin|cultist|bugbear/.test(x.id))!;
        if (await cast('hold-person', h.pos)) notes.push(`hold-person→${h.name}`);
      }
      if (!me.actedThisTurn && f && slot(1) && !me.conditions.some((c) => c.slug === 'shield-of-faith') && Math.random() < 0.2) {
        if (await cast('shield-of-faith', me.pos)) notes.push('shield-of-faith');
      }
      if (!me.actedThisTurn && f && (await cast('sacred-flame', f.pos))) notes.push('sacred-flame');
    }
    if (!me.actedThisTurn && me.name.startsWith('Elowen')) {
      const c = cluster(1, 12);
      const adj = foes().filter((f) => d(f.pos, me.pos) <= 1);
      if (adj.length && slot(1) && !allies().some((a) => a.id !== me.id && d(a.pos, me.pos) <= 1) && (await cast('thunderwave', me.pos))) notes.push('thunderwave');
      else if (c && c.n >= 2 && slot(2) && (await cast('shatter', c.at))) notes.push(`shatter x${c.n}`);
      else if (c && c.n >= 2 && slot(1) && d(me.pos, c.at) <= 3 && (await cast('burning-hands', c.at))) notes.push(`burning-hands x${c.n}`);
      else if (c && c.n >= 2 && slot(1) && (await cast('sleep', c.at))) notes.push(`sleep x${c.n}`);
      const f = foes()[0];
      if (!me.actedThisTurn && f && slot(1) && f.hp <= 9 && (await cast('magic-missile', f.pos))) notes.push('magic-missile');
      if (!me.actedThisTurn && f && (await cast('fire-bolt', f.pos))) notes.push('fire-bolt');
    }
    // attack / approach (Brakka, or casters with nothing in range)
    if (!me.actedThisTurn && g.view.isPlayerTurn) {
      const f = foes()[0];
      if (f) { await g.onTileClick(f.pos); await idle(); }
      if (!me.actedThisTurn && f && g.view.isPlayerTurn) {
        const before = { ...me.pos };
        const cands: P[] = [];
        for (let r = 1; r <= 6; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) cands.push({ x: f.pos.x + dx, y: f.pos.y + dy });
        cands.sort((a, b) => d(a, f.pos) - d(b, f.pos) || d(me.pos, a) - d(me.pos, b));
        for (const c of cands) {
          if (!g.view.isPlayerTurn) break;
          await g.onTileClick(c); await idle();
          if (me.pos.x !== before.x || me.pos.y !== before.y) break;
        }
        if (g.view.isPlayerTurn && foes()[0]) { await g.onTileClick(foes()[0].pos); await idle(); }
      }
      if (!me.actedThisTurn && g.view.isPlayerTurn && g.view.playMode === 'combat') { await g.dodge(); await idle(); notes.push('dodge'); }
      else notes.push('attack');
    }
    if (g.view.isPlayerTurn && g.view.phase === 'playing' && g.view.playMode === 'combat') await g.endTurn();
    return `${me.name.split(' ')[0]}: ${notes.join(',')}`;
  });
  log.push(did);
}

async function smartFight(page: Page, log: string[], max = 120) {
  for (let i = 0; i < max; i++) {
    await waitReady(page, 60_000);
    const v = await game(page).view();
    if (v.phase !== 'playing') return v.phase;
    if (v.playMode === 'explore') return 'explore';
    await smartTurn(page, log);
  }
  return 'timeout';
}

const party = (page: Page) => page.evaluate(() => (window as unknown as { __game: { view: { state: { combatants: C[] } } } }).__game.view.state.combatants.filter((c) => c.side === 'hero').map((c) => `${c.name.split(' ')[0]} ${c.hp}/${c.maxHp}${c.dead ? ' dead' : ''} pot${c.potions ?? 0} slots${JSON.stringify(c.slots ?? {})}`));

/** Picks up everything (gold, chests, lore) reachable without going near awake-able lairs; returns counts. */
async function loot(page: Page) {
  const items = await page.evaluate(() => {
    const g = (window as unknown as { __game: G & { arena: { chests: P[] } } }).__game;
    return [...(g.arena?.gold ?? []), ...(g.arena?.lore ?? []).map((l) => l.pos), ...g.arena!.chests];
  });
  for (const it of items) {
    await waitReady(page);
    const v = await game(page).view();
    if (v.playMode !== 'explore' || v.phase !== 'playing') break;
    await page.evaluate(async (p) => { await (window as unknown as { __game: G }).__game.onTileClick(p); }, it);
    await waitReady(page);
    // walking resolves asynchronously; give it a moment
    await page.waitForFunction(() => !(window as unknown as { __game: { walking: boolean } }).__game.walking, null, { timeout: 30_000 }).catch(() => {});
  }
}

async function enterLevel(page: Page, idx: number) {
  await page.evaluate(async (i) => { await (window as unknown as { __game: { enterRoom(i: number): Promise<void> } }).__game.enterRoom(i); }, idx);
  await waitReady(page);
}

for (const vp of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
  test.describe(`playtest-b ${vp.width}`, () => {
    test.use({ viewport: vp });

    test(`level 4 + 5 full run with boss @${vp.width}`, async ({ page, context }) => {
      test.setTimeout(900_000);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const errors = collectErrors(page);
      await trackAudio(page);
      await startGame(page);
      const log: string[] = [];

      for (const lvl of [3, 4]) {
        await enterLevel(page, lvl);
        await page.waitForTimeout(800);
        const v = await game(page).view();
        console.log(`[L${lvl + 1}] mode=${v.playMode} lairs=${JSON.stringify(v.objective.lairs)} track=${await lastTrack(page)}`);
        if (v.playMode === 'explore') expect(await lastTrack(page)).toBe(`explore-${lvl + 1}`);
        await shot(page, `${vp.width}-L${lvl + 1}-start`);
        let iter = 0;
        while (iter++ < 10) {
          const st = await game(page).view();
          if (st.phase !== 'playing') break;
          if (st.playMode === 'combat') {
            const r = await smartFight(page, log);
            console.log(`[L${lvl + 1}] fight → ${r}; party ${(await party(page).catch(() => [])).join(' | ')}`);
            if (r !== 'explore') break;
            continue;
          }
          await loot(page);
          const v2 = await game(page).view();
          if (v2.phase !== 'playing') break;
          if (v2.playMode === 'combat') continue;
          const next = v2.objective.lairs.find((l) => !l.cleared);
          if (!next) {
            // walk to the door
            const door = await page.evaluate(() => (window as unknown as { __game: G }).__game.arena!.door!);
            await page.evaluate(async (p) => { await (window as unknown as { __game: G }).__game.onTileClick({ x: p.x, y: p.y + 1 }); }, door);
            await page.waitForTimeout(3000);
            break;
          }
          const isThrone = lvl === 4 && next.id === v2.objective.lairs.at(-1)!.id;
          const pre = (await tracks(page)).length;
          const mode = await walkIntoLair(page, next.id);
          await page.waitForTimeout(400);
          const t = (await tracks(page)).slice(pre);
          console.log(`[L${lvl + 1}] woke lair ${next.id} throne=${isThrone} mode=${mode} new tracks=${t.join(',')}`);
          await shot(page, `${vp.width}-L${lvl + 1}-lair${next.id}`);
          if (mode === 'combat' && lvl === 4) {
            const woke = (await game(page).view()).objective.lairs.filter((l) => l.awake).map((l) => l.id);
            const throneAwake = woke.includes(v2.objective.lairs.at(-1)!.id);
            if (throneAwake) {
              expect(t[0]).toBe('boss-intro');
              // fast-forward the sting: it must hand off to the boss theme
              await page.evaluate(() => { const e = (window as unknown as { __els: HTMLAudioElement[] }).__els.at(-1)!; if (e.duration) e.currentTime = e.duration - 0.3; e.dispatchEvent(new Event('ended')); });
              await page.waitForTimeout(800);
              expect(await lastTrack(page)).toBe('boss');
            } else expect(t[0]).toBe('combat-5');
          }
        }
        const end = await game(page).view();
        console.log(`[L${lvl + 1}] end phase=${end.phase} gold=${end.objective.goldFound} lore=${end.objective.loreFound}/${end.objective.loreTotal}`);
        await shot(page, `${vp.width}-L${lvl + 1}-end`);
        if (end.phase === 'defeat') break;
        if (lvl === 3 && end.phase !== 'room-cleared') console.log('[L4] did not reach room-cleared');
      }
      const fin = await game(page).view();
      console.log(`[final] phase=${fin.phase} tracks=${(await tracks(page)).join(',')}`);
      console.log(log.join('\n'));
      if (fin.phase === 'victory') {
        expect(await lastTrack(page)).toBe('victory');
        await page.waitForTimeout(2500);
        await shot(page, `${vp.width}-victory`);
        await page.getByRole('button', { name: 'Share' }).click();
        await page.waitForTimeout(300);
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        console.log('[share]', clip);
        expect(clip).toMatch(/Goblin Warren/);
        await page.getByRole('button', { name: 'New run' }).click();
        await page.waitForTimeout(500);
        expect((await game(page).view()).phase).toBe('title');
        expect(await lastTrack(page)).toBe('title');
        await shot(page, `${vp.width}-after-newrun`);
      }
      console.log('[errors]', errors);
      expect(errors.filter((e) => !/Failed to load resource|favicon/.test(e))).toEqual([]);
    });
  });
}

test.describe('playtest-b failure paths', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('defeat, double-clicked retry, level-start state restored', async ({ page }) => {
    test.setTimeout(600_000);
    const errors = collectErrors(page);
    await trackAudio(page);
    await startGame(page);
    await enterLevel(page, 4);
    // take some gold first so roomStartGold vs after differs
    const startGold = (await game(page).view()).objective.goldFound;
    const startHp = await party(page);
    await walkIntoLair(page, 1);
    // never act: end every hero turn
    for (let i = 0; i < 200; i++) {
      await waitReady(page, 60_000);
      const v = await game(page).view();
      if (v.phase !== 'playing' || v.playMode !== 'combat') break;
      await page.evaluate(async () => { await (window as unknown as { __game: G }).__game.endTurn(); });
    }
    const v = await game(page).view();
    console.log('[defeat] phase', v.phase, 'mode', v.playMode);
    if (v.phase !== 'defeat') {
      // the lair may have been beaten by luck; wake the throne the same way
      await walkIntoLair(page, v.objective.lairs.at(-1)!.id);
      for (let i = 0; i < 200; i++) {
        await waitReady(page, 60_000);
        const w = await game(page).view();
        if (w.phase !== 'playing' || w.playMode !== 'combat') break;
        await page.evaluate(async () => { await (window as unknown as { __game: G }).__game.endTurn(); });
      }
    }
    expect((await game(page).view()).phase).toBe('defeat');
    await page.waitForTimeout(2000);
    await shot(page, 'defeat');
    const retry = page.getByRole('button', { name: 'Retry room' });
    await retry.dblclick();
    await page.waitForTimeout(3000);
    await waitReady(page);
    const r = await game(page).view();
    console.log('[retry] phase', r.phase, r.playMode, 'room', r.roomIndex, 'gold', r.objective.goldFound, 'lairs', JSON.stringify(r.objective.lairs));
    expect(r.phase).toBe('playing');
    expect(r.roomIndex).toBe(4);
    expect(r.objective.goldFound).toBe(startGold);
    expect(await party(page)).toEqual(startHp);
    expect(r.objective.lairs.every((l) => !l.cleared && !l.awake)).toBe(true);
    // no stale units: state holds exactly the 3 heroes; units map has no dead leftovers
    const units = await page.evaluate(() => {
      const g = (window as unknown as { __game: { view: { units: Record<string, { dead: boolean }> ; state: { combatants: unknown[] } } } }).__game;
      return { units: Object.keys(g.view.units), n: g.view.state.combatants.length };
    });
    console.log('[retry] units', units);
    expect(units.n).toBe(3);
    // no turn loop running in the background: view stays stable
    const snap = JSON.stringify((await game(page).view()).state);
    await page.waitForTimeout(3000);
    expect(JSON.stringify((await game(page).view()).state)).toBe(snap);
    expect(await lastTrack(page)).toBe('explore-5');
    await shot(page, 'after-retry');
    // second fight after retry still works
    await walkIntoLair(page, 1);
    await page.waitForTimeout(1500);
    await shot(page, 'after-retry-fight');
    console.log('[errors]', errors);
    expect(errors.filter((e) => !/Failed to load resource|favicon/.test(e))).toEqual([]);
  });

  test('edge cases: go deeper dblclick, mute in crossfade, SRD toggle, downed+stabilized', async ({ page }) => {
    test.setTimeout(600_000);
    const errors = collectErrors(page);
    await trackAudio(page);
    await startGame(page);
    await enterLevel(page, 3);
    // clear L4 via debug, walk out, dblclick Go deeper
    await page.evaluate(() => { const g = (window as unknown as { __game: G }).__game; for (const l of g.debugLairs()) g.debugClearLair(l.id); });
    const door = await page.evaluate(() => (window as unknown as { __game: G }).__game.arena!.door!);
    await teleportNear(page, { x: door.x, y: door.y + 2 });
    await page.evaluate(async (p) => { await (window as unknown as { __game: G }).__game.onTileClick(p); }, door);
    await page.waitForFunction(() => (window as unknown as { __game: G }).__game.view.phase === 'room-cleared', null, { timeout: 20_000 });
    await page.waitForTimeout(1200);
    await shot(page, 'room-cleared-L4');
    await page.getByRole('button', { name: /Descend deeper|Go deeper/ }).dblclick();
    await page.waitForTimeout(2500);
    await waitReady(page);
    const v = await game(page).view();
    console.log('[deeper] room', v.roomIndex, v.phase, 'tracks', (await tracks(page)).join(','));
    expect(v.roomIndex).toBe(4);

    // mute during crossfade: wake lair → combat-5 crossfade, mute immediately
    const mute = page.getByRole('button', { name: /Mute sound|Unmute sound/ });
    await walkIntoLair(page, 1);
    await mute.click();
    await page.waitForTimeout(1500);
    const vols = await page.evaluate(() => (window as unknown as { __els: HTMLAudioElement[] }).__els.slice(-3).map((e) => e.volume));
    console.log('[mute] volumes after mute mid-fade', vols);
    expect(vols.every((x) => x === 0)).toBe(true);
    await mute.click();
    await page.waitForTimeout(1200);
    const vols2 = await page.evaluate(() => (window as unknown as { __els: HTMLAudioElement[] }).__els.at(-1)!.volume);
    console.log('[mute] volume after unmute', vols2);
    expect(vols2).toBeGreaterThan(0);

    // SRD toggle mid-combat
    const toggle = page.getByRole('button', { name: /2014|2024/ }).first();
    if (await toggle.count()) { await toggle.click(); await page.waitForTimeout(500); }
    console.log('[srd]', (await game(page).view() as unknown as { srdVersion: string }).srdVersion);
    await shot(page, 'srd-toggle-combat');

    // fight on, report downed heroes being stabilised
    const log: string[] = [];
    const r = await smartFight(page, log);
    console.log('[edge fight]', r, (await party(page).catch(() => [])).join(' | '));
    await shot(page, 'after-edge-fight');
    console.log('[errors]', errors);
    expect(errors.filter((e) => !/Failed to load resource|favicon/.test(e))).toEqual([]);
  });
});

for (const vp of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
  test(`boss fight to victory, share, new run @${vp.width}`, async ({ page, context }) => {
    test.setTimeout(600_000);
    await page.setViewportSize(vp);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = collectErrors(page);
    let navs = 0;
    page.on('framenavigated', (f) => { if (!f.parentFrame()) navs++; });
    await trackAudio(page);
    await startGame(page);
    const nav0 = navs;
    await enterLevel(page, 4);
    expect(await lastTrack(page)).toBe('explore-5');
    const lairs = (await game(page).view()).objective.lairs;
    const throne = lairs.at(-1)!.id;
    // a real fight on a side lair first: must play combat-5, not the boss theme
    const pre = (await tracks(page)).length;
    await walkIntoLair(page, lairs[0].id);
    const side = (await tracks(page)).slice(pre);
    console.log('[side lair tracks]', side);
    expect(side[0]).toBe('combat-5');
    const log: string[] = [];
    console.log('[side fight]', await smartFight(page, log), (await party(page)).join(' | '));
    expect(await lastTrack(page)).toBe('explore-5');
    for (const l of lairs.slice(1, -1)) await page.evaluate((id) => (window as unknown as { __game: G }).__game.debugClearLair(id), l.id);
    const pre2 = (await tracks(page)).length;
    await walkIntoLair(page, throne);
    await shot(page, `boss-wake-${vp.width}`);
    const t = (await tracks(page)).slice(pre2);
    console.log('[throne tracks]', t);
    expect(t[0]).toBe('boss-intro');
    const r = await smartFight(page, log, 200);
    console.log('[boss fight]', r, (await party(page).catch(() => [])).join(' | '));
    console.log(log.join('; '));
    console.log('[tracks]', (await tracks(page)).join(','));
    if (r === 'victory') {
      expect(await lastTrack(page)).toBe('victory');
      expect((await tracks(page)).includes('boss')).toBe(true);
      await page.waitForTimeout(2500);
      await shot(page, `victory-${vp.width}`);
      await page.getByRole('button', { name: 'Share' }).click();
      await page.waitForTimeout(300);
      console.log('[share]', await page.evaluate(() => navigator.clipboard.readText()));
      await page.getByRole('button', { name: 'New run' }).click();
      await page.waitForTimeout(800);
      expect((await game(page).view()).phase).toBe('title');
      expect(await lastTrack(page)).toBe('title');
    } else await shot(page, `boss-${r}-${vp.width}`);
    console.log('[navs during test]', navs - nav0, '[errors]', errors.filter((e) => !/429/.test(e)));
  });
}

test('followers keep up through narrow corridors (L4, L5)', async ({ page }) => {
  test.setTimeout(240_000);
  await startGame(page);
  for (const [lvl, from, to] of [[3, { x: 20, y: 25 }, { x: 5, y: 4 }], [4, { x: 22, y: 25 }, { x: 4, y: 4 }]] as const) {
    await enterLevel(page, lvl);
    await page.evaluate(() => { const g = (window as unknown as { __game: G }).__game; for (const l of g.debugLairs()) if (l.id !== g.debugLairs().at(-1)!.id) g.debugClearLair(l.id); });
    await teleportNear(page, from);
    let worst = 0;
    const t = page.evaluate(async (p) => { await (window as unknown as { __game: G }).__game.onTileClick(p); }, to);
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(250);
      const spread = await page.evaluate(() => {
        const g = (window as unknown as { __game: G }).__game;
        const hs = g.view.state!.combatants.filter((c) => c.side === 'hero');
        const L = hs.find((h) => h.id === g.view.leaderId)!;
        return Math.max(...hs.map((h) => Math.max(Math.abs(h.pos.x - L.pos.x), Math.abs(h.pos.y - L.pos.y))));
      });
      worst = Math.max(worst, spread);
    }
    await t;
    await page.waitForTimeout(1500);
    const v = await game(page).view();
    console.log(`[corridor L${lvl + 1}] worst follower spread=${worst} mode=${v.playMode}`);
    await shot(page, `corridor-L${lvl + 1}`);
    expect(worst).toBeLessThanOrEqual(4);
  }
});

test('downed hero is stabilised after the fight; SRD 2014 toggle mid-combat', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = collectErrors(page);
  await withReloadRetry(page, errors, async () => {
  await startGame(page);
  await enterLevel(page, 3);
  // Elowen starts at 1 HP so the first hit drops her
  await page.evaluate(() => { const g = (window as unknown as { __game: { view: { state: { combatants: C[] } }; update(): void } }).__game; g.view.state.combatants.find((c) => c.name.startsWith('Elowen'))!.hp = 1; });
  await walkIntoLair(page, 1);
  await page.getByRole('button', { name: 'SRD 2014' }).click();
  await page.waitForTimeout(400);
  expect((await game(page).view() as unknown as { srdVersion: string }).srdVersion).toBe('2014');
  await shot(page, 'srd-2014-combat');
  let sawDown = false;
  const log: string[] = [];
  for (let i = 0; i < 120; i++) {
    await waitReady(page, 60_000);
    const v = await game(page).view();
    if (v.phase !== 'playing' || v.playMode === 'explore') break;
    const st = await party(page);
    if (st.some((s) => /^Elowen 0\//.test(s) || /Elowen.*dead/.test(s))) sawDown = true;
    await smartTurn(page, log);
  }
  const v = await game(page).view();
  const p = await party(page);
  console.log('[downed] sawDown', sawDown, 'phase', v.phase, v.playMode, p.join(' | '));
  await page.waitForTimeout(800);
  await shot(page, 'after-stabilise');
  if (v.playMode === 'explore' && v.phase === 'playing') {
    const el = await page.evaluate(() => (window as unknown as { __game: { view: { state: { combatants: C[] }; units: Record<string, { dead: boolean; hp: number }> } } }).__game.view);
    const e = el.state.combatants.find((c) => c.name.startsWith('Elowen'))!;
    console.log('[downed] Elowen', e.hp, e.dead, 'unit', JSON.stringify(el.units[e.id]));
    expect(e.dead).toBe(false);
    expect(e.hp).toBeGreaterThan(0);
    expect(el.units[e.id].dead).toBe(false);
  }
  });
  console.log('[errors]', errors.filter((x) => !/429/.test(x)));
  expect(errors.filter((x) => !/429|Failed to load resource/.test(x))).toEqual([]);
});
