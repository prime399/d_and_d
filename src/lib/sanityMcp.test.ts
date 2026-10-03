import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { guessIds, kbKeywords, linkKbEntries } from './sanityMcp';

const sample = fs.readFileSync(path.join(import.meta.dirname, '__fixtures__/kb-grappled.md'), 'utf8');

describe('linkKbEntries', () => {
  const r = linkKbEntries(sample);
  it('maps KB footnotes to edition-specific dataset ids', () => {
    expect(r.ids).toContain('condition.grappled');
    expect(r.ids).toContain('condition.grappled.2014');
    expect(r.ids).toContain('condition.prone');
    expect(r.text).toMatch(/Speed is reduced to 0 and cannot increase \[\[condition\.grappled\]\]/);
    expect(r.text).not.toMatch(/\[\d+\]/);
  });
  it('collects the KB edition-difference notes', () => {
    expect(r.notes.some((n) => n.startsWith('Grappled:') && n.includes('2024'))).toBe(true);
  });
});

describe('question helpers', () => {
  it('keeps content words for BM25', () => {
    expect(kbKeywords('How does grappling work in 2024?')).toContain('grappl');
  });
  it('guesses exact docs by name', () => {
    expect(guessIds("What is the goblin's AC?")).toContain('monster.goblin');
  });
});
