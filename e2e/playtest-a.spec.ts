// Playtest A: a first-time run through levels 1-3 with real mouse clicks on the canvas where practical.
import { test, expect, type Page } from '@playwright/test';
import { collectErrors, waitReady, type G } from './lib/core';

type P = { x: number; y: number };
type W = { __game: G & { scene: any; ask(q: string): Promise<void>; setMode(m: unknown): void; dodge(): Promise<void>; potion(): Promise<void>; view: any }; __tracks: string[] };
const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/out/pa-${name}.png` });
const notes: string[] = [];
const note = (s: string) => { notes.push(s); console.log(`[pa] ${s}`); };

/** Screen coordinates of a tile centre, through the Phaser camera. */
async function tileToScreen(page: Page, t: P) {
  return page.evaluate((t) => {
    const g = (window as unknown as W).__game;
    const cam = g.scene.cameras.main;
    const rect = (g.scene.game.canvas as HTMLCanvasElement).getBoundingClientRect();
    const wx = t.x * 16 + 8, wy = t.y * 16 + 8;
    return { x: rect.left + cam.x + (wx - cam.worldView.x) * cam.zoom, y: rect.top + cam.y + (wy - cam.worldView.y) * cam.zoom, rect: { l: rect.left, t: rect.top, r: rect.right, b: rect.bottom } };
  }, t);
}

/** Real mouse click on a tile if it is on screen (and not under the minimap); falls back to the controller. */
async function clickTile(page: Page, t: P) {
  const s = await tileToScreen(page, t);
  const mm = await page.evaluate(() => (window as unknown as W).__game.scene.minimap?.screenRect ?? null);
  const onScreen = s.x > s.rect.l + 4 && s.x < s.rect.r - 4 && s.y > s.rect.t + 4 && s.y < s.rect.b - 4;
  const underMm = mm && s.x - s.rect.l >= mm.x && s.x - s.rect.l <= mm.x + mm.w && s.y - s.rect.t >= mm.y && s.y - s.rect.t <= mm.y + mm.h;
  if (onScreen && !underMm) {
    await page.mouse.move(s.x, s.y);
    await page.mouse.click(s.x, s.y);
    return 'mouse';
  }
  await page.evaluate((t) => (window as unknown as W).__game.onTileClick(t), t);
  return 'api';
}

const view = (page: Page) => page.evaluate(() => {
  const v = (window as unknown as W).__game.view;
  return { phase: v.phase, playMode: v.playMode, busy: v.busy, isPlayerTurn: v.isPlayerTurn, objective: v.objective, roomIndex: v.roomIndex, leaderId: v.leaderId };
});

const leaderPos = (page: Page) => page.evaluate(() => {
  const g = (window as unknown as W).__game;
  return g.view.state.combatants.find((c: any) => c.id === g.view.leaderId)?.pos as P;
});

/** One hero turn played with real choices: heal, spell, attack, dodge, potion. */
async function heroTurn(page: Page, useUi: boolean) {
  if (useUi) {
    // drive the spellbook UI once per fight: Spells button -> first castable damaging spell -> click the foe on canvas
    const cur = await page.evaluate(() => {
      const g = (window as unknown as W).__game; const s = g.view.state;
      const me = s.combatants.find((c: any) => c.id === s.order[s.turnIndex]);
      const d = (a: P, b: P) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      const foe = s.combatants.filter((c: any) => c.side === 'monster' && !c.dead).sort((a: any, b: any) => d(me.pos, a.pos) - d(me.pos, b.pos))[0];
      return { spells: me.spells ?? [], foe: foe?.pos, dist: foe ? d(me.pos, foe.pos) : 99 };
    });
    if (cur.spells.length && cur.foe && cur.dist <= 10) {
      const btn = page.getByRole('button', { name: /^Spells/ });
      if (await btn.count()) {
        await btn.first().click();
        await page.waitForTimeout(250);
        await shot(page, 'spellbook');
        const pick = page.locator('.hud-spell:not([aria-disabled="true"])').filter({ hasText: /Fire Bolt|Sacred Flame|Ray of Frost|Guiding Bolt|Magic Missile/ }).first();
        if (await pick.count()) {
          await pick.click();
          await clickTile(page, cur.foe);
          await page.waitForTimeout(400);
          await shot(page, 'combat-dice');
          await page.waitForFunction(() => !(window as unknown as W).__game.view.busy, null, { timeout: 20000 });
        }
      }
    }
  }
  return page.evaluate(async () => {
    const g = (window as unknown as W).__game;
    const idle = () => new Promise<void>((r, j) => { const t0 = Date.now(); const t = setInterval(() => { if (!g.view.busy) { clearInterval(t); r(); } else if (Date.now() - t0 > 30000) { clearInterval(t); j(new Error('IDLE TIMEOUT ' + JSON.stringify({ busy: g.view.busy, ipt: g.view.isPlayerTurn, mode: g.view.mode, status: g.view.state?.status, cur: g.view.state?.order[g.view.state?.turnIndex], log: g.view.chat.slice(-5).map((m: any) => m.role + ':' + m.text.slice(0, 90)) }))); } }, 50); });
    const d = (a: P, b: P) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const s = () => g.view.state;
    const me = s().combatants.find((c: any) => c.id === s().order[s().turnIndex]);
    const log: string[] = [];
    const foes = () => s().combatants.filter((c: any) => c.side === 'monster' && !c.dead).sort((a: any, b: any) => d(me.pos, a.pos) - d(me.pos, b.pos));
    const allies = () => s().combatants.filter((c: any) => c.side === 'hero' && !c.dead);
    const cast = async (slug: string, target: P) => { g.setMode({ kind: 'spell', slug }); await g.onTileClick(target); await idle(); g.setMode({ kind: 'move' }); log.push(`${me.name} ${slug}`); };
    const tryAct = async () => {
      if (me.actedThisTurn || !g.view.isPlayerTurn || g.view.playMode !== 'combat') return;
      const f = foes()[0]; if (!f) return;
      const spells: string[] = me.spells ?? [];
      const slots = (lvl: number) => me.slots?.[lvl] ?? 0;
      const hurt = allies().filter((a: any) => a.hp < a.maxHp * 0.45).sort((a: any, b: any) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt && spells.includes('healing-word') && slots(1) > 0 && d(me.pos, hurt.pos) <= 12) return cast('healing-word', hurt.pos);
      if (me.hp < me.maxHp * 0.35 && (me.potions ?? 0) > 0) { await g.potion(); await idle(); log.push(`${me.name} potion`); return; }
      if (spells.length && d(me.pos, f.pos) <= 12) {
        const near = foes().filter((x: any) => d(x.pos, f.pos) <= 1).length;
        if (spells.includes('shatter') && slots(2) > 0 && near >= 2) return cast('shatter', f.pos);
        if (spells.includes('magic-missile') && slots(1) > 0 && Math.random() < 0.4) return cast('magic-missile', f.pos);
        if (spells.includes('guiding-bolt') && slots(1) > 0 && Math.random() < 0.3) return cast('guiding-bolt', f.pos);
        const cantrip = ['fire-bolt', 'sacred-flame', 'ray-of-frost'].find((x) => spells.includes(x));
        if (cantrip) { const before = me.actedThisTurn; await cast(cantrip, f.pos); if (me.actedThisTurn !== before) return; }
      }
      await g.onTileClick(f.pos); await idle();
      if (me.actedThisTurn) log.push(`${me.name} attacks`);
    };
    await tryAct();
    if (!me.actedThisTurn && g.view.isPlayerTurn && foes()[0]) {
      const f = foes()[0]; const before = { ...me.pos };
      const cands: P[] = [];
      for (let r = 1; r <= 7; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) cands.push({ x: f.pos.x + dx, y: f.pos.y + dy });
      cands.sort((a, b) => d(a, f.pos) - d(b, f.pos) || d(me.pos, a) - d(me.pos, b));
      for (const c of cands) {
        if (!g.view.isPlayerTurn) break;
        await g.onTileClick(c); await idle();
        if (me.pos.x !== before.x || me.pos.y !== before.y) { log.push(`${me.name} moves`); break; }
      }
      await tryAct();
    }
    if (!me.actedThisTurn && g.view.isPlayerTurn && g.view.playMode === 'combat') { await g.dodge(); await idle(); log.push(`${me.name} dodges`); }
    if (g.view.isPlayerTurn && g.view.phase === 'playing' && g.view.playMode === 'combat') await g.endTurn();
    return log;
  });
}

async function fight(page: Page, level: number, idx: number) {
  let turns = 0, uiUsed = false, shotMid = false;
  const monsterActs = await page.evaluate(() => {
    const g = (window as unknown as W).__game;
    return g.view.state.combatants.filter((c: any) => c.side === 'monster').map((c: any) => ({ id: c.id, pos: { ...c.pos }, hp: c.hp }));
  });
  for (; turns < 60; turns++) {
    try { await waitReady(page, 60_000); } catch (e) {
      const dump = await page.evaluate(() => { const g = (window as unknown as W).__game as any; const v = g.view; const s = v.state; const cur = s?.combatants.find((c: any) => c.id === s.order[s.turnIndex]);
        return { busy: v.busy, isPlayerTurn: v.isPlayerTurn, playMode: v.playMode, phase: v.phase, status: s?.status, cur: cur && { id: cur.id, side: cur.side, dead: cur.dead, pos: cur.pos, acted: cur.actedThisTurn }, order: s?.order, alive: s?.combatants.map((c: any) => `${c.id}:${c.hp}${c.dead ? 'X' : ''}@${c.pos.x},${c.pos.y}`), banner: v.turnBanner, dmThinking: v.dmThinking, walking: g.walking, transitioning: g.transitioning, lastLog: v.chat.slice(-6).map((m: any) => m.role + ':' + m.text.slice(0, 100)) }; });
      note(`STALL L${level} fight ${idx}: ${JSON.stringify(dump)}`);
      await shot(page, `l${level}-stall`);
      throw e;
    }
    const v = await view(page);
    if (v.phase !== 'playing') return v.phase;
    if (v.playMode === 'explore') break;
    if (turns >= 26) {
      note(`L${level} fight ${idx}: >25 turns, debug clearing`);
      // can't debugClearLair in combat; keep fighting a few more
    }
    const isSpellcaster = await page.evaluate(() => { const s = (window as unknown as W).__game.view.state; if (!s) return false; return (s.combatants.find((c: any) => c.id === s.order[s.turnIndex])?.spells ?? []).length > 0; });
    const useUi = isSpellcaster && !uiUsed;
    if (useUi) uiUsed = true;
    await heroTurn(page, useUi);
    if (!shotMid && turns >= 2) { shotMid = true; await shot(page, `l${level}-combat-${idx}`); }
  }
  // did the monsters ever act? (moved or the heroes lost hp)
  const after = await page.evaluate(() => (window as unknown as W).__game.view.state?.combatants.map((c: any) => ({ id: c.id, side: c.side, pos: c.pos, hp: c.hp, maxHp: c.maxHp })) ?? []);
  const moved = monsterActs.filter((m: { id: string; pos: P }) => { const a = after.find((x: any) => x.id === m.id); return a && (a.pos.x !== m.pos.x || a.pos.y !== m.pos.y); }).length;
  note(`L${level} fight ${idx}: ${turns} hero turns, ${moved}/${monsterActs.length} monsters moved, party hp ${after.filter((c: any) => c.side === 'hero').map((c: any) => `${c.hp}/${c.maxHp}`).join(' ')}`);
  return (await view(page)).playMode;
}

/** Explore targets: every gold, chest, lore stone, then each lair; nearest by path first. */
async function nextTarget(page: Page) {
  return page.evaluate(() => {
    const g = (window as unknown as W).__game as any;
    const a = g.arena; const L = g.view.state.combatants.find((c: any) => c.id === g.view.leaderId);
    const items: { kind: string; pos: P }[] = [];
    for (const p of a.gold ?? []) if (!g.goldTaken.has(`${p.x},${p.y}`)) items.push({ kind: 'gold', pos: p });
    for (const p of a.chests ?? []) if (!g.openedChests.has(`${p.x},${p.y}`)) items.push({ kind: 'chest', pos: p });
    for (const l of a.lore ?? []) if (!g.loreRead.has(`${l.pos.x},${l.pos.y}`)) items.push({ kind: 'lore', pos: l.pos });
    const d = (p: P) => Math.abs(p.x - L.pos.x) + Math.abs(p.y - L.pos.y);
    items.sort((x, y) => d(x.pos) - d(y.pos));
    if (items.length) return items[0];
    const lair = g.debugLairs().find((l: any) => !l.cleared);
    if (lair) return { kind: 'lair', pos: lair.monsters[0] ?? lair.spawns[0] };
    if (a.door && g.view.objective.doorOpen) return { kind: 'door', pos: a.door };
    return null;
  });
}

async function playLevel(page: Page, level: number, errors: string[], askDm: boolean) {
  await waitReady(page, 60_000);
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => {
    const g = (window as unknown as W).__game as any;
    const a = g.arena;
    return { title: a.title, w: a.width, h: a.height, gold: a.gold.length, chests: a.chests.length, lore: a.lore.length, lairs: a.lairs.length, room: g.view.room?.name };
  });
  note(`L${level} "${info.title}" (${info.room}) ${info.w}x${info.h}: gold ${info.gold}, chests ${info.chests}, lore ${info.lore}, lairs ${info.lairs}`);
  await shot(page, `l${level}-entry`);
  let fights = 0, mouseClicks = 0, apiClicks = 0, loreShot = false, stuck = 0, lastKey = '';
  for (let step = 0; step < 120; step++) {
    await waitReady(page, 60_000);
    let v = await view(page);
    if (v.phase !== 'playing') break;
    if (v.playMode === 'combat') {
      fights++;
      await shot(page, `l${level}-ambush-${fights}`);
      const r = await fight(page, level, fights);
      if (r !== 'explore' && r !== 'combat') { note(`L${level} fight ended with phase ${r}`); break; }
      continue;
    }
    const t = await nextTarget(page);
    if (!t) { note(`L${level}: nothing left and door closed?`); break; }
    const key = `${t.kind}:${t.pos.x},${t.pos.y}`;
    stuck = key === lastKey ? stuck + 1 : 0; lastKey = key;
    if (stuck > 6) { note(`L${level}: STUCK on ${key}`); await shot(page, `l${level}-stuck`); break; }
    // walk there with mouse clicks: click intermediate on-screen tiles toward the goal along the path
    const lp = await leaderPos(page);
    const waypoint = await page.evaluate(({ to }) => {
      const g = (window as unknown as W).__game as any;
      // choose the farthest path tile (toward an adjacent free tile of the goal) that is on screen
      const cam = g.scene.cameras.main; const wv = cam.worldView;
      const on = (p: P) => p.x * 16 >= wv.x + 16 && p.x * 16 <= wv.right - 32 && p.y * 16 >= wv.y + 16 && p.y * 16 <= wv.bottom - 32;
      return on(to) ? to : null;
    }, { to: t.pos });
    let how: string;
    if (waypoint) how = await clickTile(page, waypoint);
    else { await page.evaluate((p) => (window as unknown as W).__game.onTileClick(p), t.pos); how = 'api'; }
    if (how === 'mouse') mouseClicks++; else apiClicks++;
    await page.waitForTimeout(150);
    await waitReady(page, 60_000);
    await page.waitForFunction(() => !((window as unknown as W).__game as any).walking, null, { timeout: 60_000 });
    v = await view(page);
    const lp2 = await leaderPos(page);
    if (t.kind === 'lore' && !loreShot && v.objective.loreFound > 0) {
      loreShot = true;
      await page.waitForTimeout(2500);
      await shot(page, `l${level}-lore`);
    }
    if (lp && lp2 && lp.x === lp2.x && lp.y === lp2.y && v.playMode === 'explore' && t.kind !== 'door') note(`L${level}: leader did not move toward ${key} (${how})`);
    if (step === 3) await shot(page, `l${level}-explore-fog`);
    if (askDm && step === 5) {
      for (const q of ['How does the Dodge action work?', 'Can I cast a spell and attack in the same turn?']) {
        const input = page.getByPlaceholder('Ask the DM a rules question…');
        await input.fill(q);
        await input.press('Enter');
        await page.waitForTimeout(500);
        await page.waitForFunction(() => { const c = (window as unknown as W).__game.view.chat; const last = [...c].reverse().find((m: any) => m.role === 'dm'); return last && !last.pending && !(window as unknown as W).__game.view.dmThinking; }, null, { timeout: 60_000 }).catch(() => note('DM answer timed out'));
        const ans = await page.evaluate(() => { const c = (window as unknown as W).__game.view.chat; const i = c.findIndex((m: any) => m.role === 'player' && m.text.length); const msgs = c.slice(); return msgs.filter((m: any) => m.role === 'dm').slice(-1)[0]; });
        note(`DM Q "${q}" -> ${ans?.text?.length} chars, lookups ${ans?.lookups?.length}, backend ${ans?.backend}: ${String(ans?.text).slice(0, 220).replace(/\n/g, ' ')}`);
        await shot(page, `l${level}-dm-${q.slice(0, 8).replace(/\W/g, '')}`);
      }
    }
  }
  const v = await view(page);
  note(`L${level} done: phase ${v.phase}, lore ${v.objective.loreFound}/${v.objective.loreTotal}, gold ${v.objective.goldFound}, fights ${fights}, clicks mouse ${mouseClicks} api ${apiClicks}`);
  const tracks = await page.evaluate(() => (window as unknown as W).__tracks.slice(-6));
  note(`L${level} audio: ${tracks.join(' > ')}`);
  const scroll = await page.evaluate(() => ({ w: document.documentElement.scrollWidth > innerWidth, h: document.documentElement.scrollHeight > innerHeight }));
  if (scroll.w || scroll.h) note(`L${level}: PAGE SCROLL ${JSON.stringify(scroll)}`);
  if (errors.length) note(`L${level} errors: ${errors.slice(0, 5).join(' | ')}`);
  return v.phase;
}

test('playtest A: levels 1-3', async ({ page }) => {
  test.setTimeout(1_500_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => {
    const w = window as unknown as W; w.__tracks = [];
    const A = window.Audio;
    // record music tracks as they are requested
    (window as any).Audio = function (src?: string) { if (src && src.includes('/music/')) w.__tracks.push(src.split('/').pop()!.replace('.mp3', '')); return new A(src); } as any;
  });
  const errors = collectErrors(page);
  let navs = 0;
  page.on('framenavigated', (f) => { if (!f.parentFrame() && ++navs > 1) note('PAGE RELOADED (hot reload?)'); });
  await page.goto('/');
  await shot(page, 'title');
  await page.getByRole('button', { name: /Enter the dungeon/i }).click();
  await page.waitForFunction(() => (window as unknown as W).__game?.view.phase === 'playing' && !!(window as unknown as W).__game.view.state, null, { timeout: 30_000 });
  for (let level = 1; level <= 3; level++) {
    const phase = await playLevel(page, level, errors, level === 1);
    if (phase === 'room-cleared') {
      await page.waitForTimeout(800);
      await shot(page, `l${level}-cleared`);
      await page.getByRole('button', { name: /Descend deeper/ }).click();
      await page.waitForFunction((lv) => (window as unknown as W).__game.view.roomIndex === lv && (window as unknown as W).__game.view.phase === 'playing', level, { timeout: 30_000 });
    } else {
      note(`L${level} ended in ${phase}`);
      await shot(page, `l${level}-end-${phase}`);
      break;
    }
  }
  console.log('\n==== NOTES ====\n' + notes.join('\n'));
  expect(errors, errors.join('\n')).toEqual([]);
});
