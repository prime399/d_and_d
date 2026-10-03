// Context-aware question chips computed from the current combat state.
import type { View } from '@/game/controller';

const DEFAULTS = ['What changed about Grappled in 2024?', 'How does concentration work?'];

export function suggestQuestions(v: View): string[] {
  const s = v.state;
  const out: string[] = [];
  if (s) {
    const living = s.combatants.filter((c) => !c.dead);
    const active = living.find((c) => c.id === v.activeId);
    const foes = living.filter((c) => c.side === 'monster');
    const names = (slug: string) => s.conditionNames[slug] ?? slug.replace(/-/g, ' ').replace(/^\w/, (x) => x.toUpperCase());
    // conditions on the active hero first, then on anyone
    const conds = [...(active?.conditions ?? []), ...living.flatMap((c) => c.conditions)]
      .map((c) => c.slug)
      .filter((c) => !['dodging', 'blessed', 'shield-of-faith'].includes(c));
    for (const c of [...new Set(conds)].slice(0, 2)) out.push(`What does ${names(c)} do?`);
    if (active?.side === 'hero' && foes.length) {
      const foe = foes[0].name.replace(/\s*\d+$/, '').toLowerCase();
      const spell = active.spells?.map((x) => s.spells[x]).find((sp) => sp && sp.level > 0 && (sp.inflicts || sp.kind === 'save'));
      if (spell) out.push(`Can I cast ${spell.name} on the ${foe}?`);
      else out.push(`Do I provoke an opportunity attack moving away from the ${foe}?`);
    }
    if (active?.concentratingOn) out.push('What breaks my concentration?');
  }
  // contextual chips first (max 2), then the defaults, which are always kept
  return [...new Set([...out.slice(0, 2), ...DEFAULTS])];
}
