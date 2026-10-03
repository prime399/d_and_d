import { describe, expect, it } from 'vitest';
import { polishReply, sentences, wordCount, WORD_CAP } from './polish';

const allowed = new Set(['condition.prone', 'condition.prone.2014', 'rule.advantage']);

describe('sentences', () => {
  it('keeps dotted ids intact and attaches leading citations to the previous sentence', () => {
    expect(sentences('You fall. [[condition.prone.2014]] Then you rise.')).toEqual(['You fall. [[condition.prone.2014]]', 'Then you rise.']);
  });
});

describe('polishReply', () => {
  it('strips markdown and keeps known citations', () => {
    const r = polishReply('## Prone\n- **Prone** creatures crawl [[condition.prone]].\n- Attacks get *advantage* [[rule.advantage]].', { mode: 'ask', allowed });
    expect(r).toBe('Prone Prone creatures crawl [[condition.prone]]. Attacks get advantage [[rule.advantage]].');
  });
  it('drops citations that were never looked up', () => {
    expect(polishReply('You crawl [[condition.prone]] [[condition.made-up]].', { mode: 'ask', allowed })).toBe('You crawl [[condition.prone]].');
  });
  it('removes leaked tool markup and machinery talk from narration', () => {
    const r = polishReply('Steel rings off stone. I looked up the rule in the database. The goblin falls.<｜DSML｜tool_calls>', { mode: 'narrate', allowed });
    expect(r).toBe('Steel rings off stone. The goblin falls.');
  });
  it('trims to the cap at a sentence boundary but keeps the Rules changed line', () => {
    const long = Array.from({ length: 12 }, (_, i) => `Sentence ${i} has exactly seven words here.`).join(' ');
    const r = polishReply(`${long} Rules changed: 2014 differed [[condition.prone.2014]].`, { mode: 'ask', allowed });
    expect(wordCount(r)).toBeLessThanOrEqual(WORD_CAP.ask);
    expect(r.endsWith('Rules changed: 2014 differed [[condition.prone.2014]].')).toBe(true);
  });
  it('drops a sentence cut off mid-way', () => {
    expect(polishReply('You stand tall. The goblin snarls and', { mode: 'narrate', allowed })).toBe('You stand tall.');
  });
});
