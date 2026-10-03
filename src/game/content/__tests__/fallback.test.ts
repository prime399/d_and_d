import { describe, expect, it } from 'vitest';
import { parseDice } from '../../engine/dice';
import { CONTENT_QUERY, fallbackContent as c, indexContent } from '../loader';

const SPRITES = ['goblin', 'masked_orc', 'orc_warrior', 'orc_shaman', 'skelet', 'zombie', 'ogre', 'imp', 'tiny_zombie',
  'big_zombie', 'lizard_m', 'chort', 'big_demon', 'necromancer', 'swampy', 'muddy', 'wogol', 'slug', 'ice_zombie'];
const REQUIRED_RULES = ['attack-rolls', 'critical-hits', 'advantage', 'concentration', 'dropping-to-0', 'initiative'];
const REQUIRED_CONDITIONS = ['blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible',
  'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious', 'exhaustion'];

const all = [...c.monsters, ...c.spells, ...c.conditions, ...c.rules, ...c.heroes, ...c.rooms];
const ids = new Set(all.map((d) => d._id));
const conditionSlugs = new Set(c.conditions.filter((x) => x.srdVersion === '2024').map((x) => x.slug));
const byId = new Map(all.map((d) => [d._id, d]));

describe('fallback content integrity', () => {
  it('is a fallback GameContent with unique ids', () => {
    expect(c.source).toBe('fallback');
    expect(ids.size).toBe(all.length);
    for (const key of ['monsters', 'spells', 'conditions', 'rules', 'heroes', 'rooms'] as const) expect(c[key].length).toBeGreaterThan(0);
  });

  it('uses the id conventions', () => {
    for (const m of c.monsters) expect(m._id).toBe(`monster.${m.slug}`);
    for (const s of c.spells) expect(s._id).toBe(`spell.${s.slug}`);
    for (const h of c.heroes) expect(h._id).toBe(`hero.${h.slug}`);
    for (const r of c.rooms) expect(r._id).toBe(`room.${r.slug}`);
    for (const x of c.conditions) expect(x._id).toBe(x.srdVersion === '2014' ? `condition.${x.slug}.2014` : `condition.${x.slug}`);
    for (const r of c.rules) expect([`rule.${r.slug}`, `rule.${r.slug}.2014`]).toContain(r._id);
  });

  it('has all required rules and conditions (both versions)', () => {
    for (const s of REQUIRED_RULES) expect(ids.has(`rule.${s}`), s).toBe(true);
    for (const s of REQUIRED_CONDITIONS) {
      expect(ids.has(`condition.${s}`), s).toBe(true);
      expect(ids.has(`condition.${s}.2014`), `${s}.2014`).toBe(true);
    }
    for (const s of ['blessed', 'dodging', 'shield-of-faith']) expect(byId.get(`condition.${s}`)).toMatchObject({ srdVersion: '2024' });
  });

  it('links condition counterparts both ways', () => {
    for (const x of c.conditions) {
      if (!x.counterpartId) continue;
      const other = byId.get(x.counterpartId) as typeof x | undefined;
      expect(other, x._id).toBeDefined();
      expect(other!.counterpartId).toBe(x._id);
      expect(other!.slug).toBe(x.slug);
      expect(other!.srdVersion).not.toBe(x.srdVersion);
    }
  });

  it('resolves every rule.related id', () => {
    for (const r of c.rules) for (const id of r.related ?? []) expect(ids.has(id), `${r._id} -> ${id}`).toBe(true);
  });

  it('resolves inflicted conditions on attacks and spells', () => {
    const attacks = [...c.monsters, ...c.heroes].flatMap((x) => x.attacks.map((a) => [x._id, a] as const));
    for (const [owner, a] of attacks) {
      expect(() => parseDice(a.damage), `${owner} ${a.name}`).not.toThrow();
      expect(a.range).toBeGreaterThanOrEqual(1);
      if (a.inflicts) {
        expect(conditionSlugs.has(a.inflicts), `${owner} ${a.name} -> ${a.inflicts}`).toBe(true);
        expect(a.inflictsSave).toBeDefined();
      }
    }
    for (const s of c.spells) {
      if (s.inflicts) expect(conditionSlugs.has(s.inflicts), `${s._id} -> ${s.inflicts}`).toBe(true);
      if (s.dice) expect(() => parseDice(s.dice!)).not.toThrow();
      if (s.kind === 'save') expect(s.save, s._id).toBeDefined();
      expect(s.range).toBeLessThanOrEqual(12);
    }
  });

  it('keeps the engine-specific spell contracts', () => {
    const idx = indexContent(c);
    expect(idx.spells.get('bless')).toMatchObject({ kind: 'buff', inflicts: 'blessed', concentration: true });
    const sof = idx.spells.get('shield-of-faith');
    expect(sof).toMatchObject({ kind: 'buff', concentration: true });
    expect(sof!.inflicts).toBeUndefined();
    expect(idx.spells.get('thunderwave')!.range).toBe(0);
  });

  it('heroes reference existing spells', () => {
    const spellSlugs = new Set(c.spells.map((s) => s.slug));
    for (const h of c.heroes) {
      for (const s of h.spells) expect(spellSlugs.has(s), `${h._id} -> ${s}`).toBe(true);
      if (h.spells.length) expect(h.spellDc).toBeDefined();
    }
  });

  it('monsters use known sprites and sane stats', () => {
    for (const m of c.monsters) {
      expect(SPRITES, m._id).toContain(m.spriteKey);
      expect(m.cr).toBeLessThanOrEqual(3);
      expect(m.speed).toBeGreaterThan(0);
      expect(m.speed).toBeLessThanOrEqual(8);
      expect(m.attacks.length).toBeGreaterThan(0);
    }
  });

  it('rooms reference existing monsters, hold at most 6, and are ordered 1..n', () => {
    const monsterSlugs = new Set(c.monsters.map((m) => m.slug));
    for (const r of c.rooms) {
      for (const g of r.encounter) expect(monsterSlugs.has(g.monster), `${r._id} -> ${g.monster}`).toBe(true);
      expect(r.encounter.reduce((n, g) => n + g.count, 0)).toBeLessThanOrEqual(6);
    }
    expect(c.rooms.map((r) => r.order)).toEqual(c.rooms.map((_, i) => i + 1));
    expect(c.rooms.filter((r) => r.isBoss)).toHaveLength(1);
  });

  it('indexes conditions by slug and slug.2014', () => {
    const idx = indexContent(c);
    expect(idx.conditions.get('prone')?._id).toBe('condition.prone');
    expect(idx.conditions.get('prone.2014')?._id).toBe('condition.prone.2014');
    expect(idx.rules.get('initiative')?._id).toBe('rule.initiative');
  });

  it('exports a single GROQ query covering every collection', () => {
    for (const k of ['monsters', 'spells', 'conditions', 'rules', 'heroes', 'rooms']) expect(CONTENT_QUERY).toContain(`"${k}"`);
  });
});
