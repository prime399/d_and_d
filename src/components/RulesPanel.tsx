'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameContent } from '@/game/content/types';
import type { GameController } from '@/game/controller';
import { useView } from './useView';
import { RulesGraph } from './RulesGraph';
import { buildGraph } from './rules/graphModel';
import { DocCard } from './rules/DocCard';
import { RulingsTimeline } from './rules/RulingsTimeline';

export function RulesPanel({ ctrl, content }: { ctrl: GameController; content: GameContent }) {
  const v = useView(ctrl);
  const [tab, setTab] = useState<'graph' | 'rulings'>('graph');
  const graph = useMemo(() => buildGraph(content), [content]);

  const select = useCallback((id: string) => ctrl.focusDoc(id), [ctrl]);
  const clear = useCallback(() => {
    const c = ctrl as GameController & { clearFocus?: () => void };
    if (typeof c.clearFocus === 'function') c.clearFocus();
    else ctrl.focusDoc('');
  }, [ctrl]);

  // bump the badge whenever new rulings arrive
  const count = v.rulings.length;
  const lastKey = v.rulings[0]?.key;
  const [bump, setBump] = useState(0);
  const prevKey = useRef(lastKey);
  useEffect(() => {
    if (lastKey !== undefined && lastKey !== prevKey.current) setBump((b) => b + 1);
    prevKey.current = lastKey;
  }, [lastKey]);

  return (
    <section className="panel rules-panel flex min-h-[420px] flex-col overflow-hidden lg:min-h-0" aria-label="Rules Tome">
      <div className="flex items-center justify-between gap-2 border-b border-amber-900/30 px-3 py-1.5">
        <h2 className="panel-title flex items-center gap-1.5 text-base">
          Rules Tome
          <span className="rg-src" title={`${graph.links.length} Sanity references · ${content.source === 'sanity' ? 'live from Sanity Content Lake' : 'bundled fallback content'}`}>
            {graph.nodes.length} docs
          </span>
        </h2>
        <div className="rg-tabs" role="tablist" aria-label="Rules Tome views">
          {(['graph', 'rulings'] as const).map((t) => (
            <button key={t} id={`rules-tab-${t}`} role="tab" type="button" aria-selected={tab === t} aria-controls="rules-tabpanel" className="rg-tab" onClick={() => setTab(t)}>
              {t === 'graph' ? 'Graph' : 'Rulings'}
              {t === 'rulings' && (
                <span key={bump} className={`rg-count ${bump ? 'rg-count-bump' : ''}`} aria-label={`${count} rulings`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div id="rules-tabpanel" role="tabpanel" aria-labelledby={`rules-tab-${tab}`} className="relative min-h-0 flex-1">
        {/* the graph stays mounted so its layout and camera survive tab switches */}
        <div className={tab === 'graph' ? 'h-full' : 'hidden'}>
          <RulesGraph graph={graph} lit={v.lit} focus={v.focus} onSelect={select} onClear={clear} />
        </div>
        {tab === 'rulings' && <RulingsTimeline rulings={v.rulings} graph={graph} focus={v.focus} onSelect={select} />}
        {v.focus && <DocCard key={v.focus} content={content} graph={graph} id={v.focus} onSelect={select} onClose={clear} />}
      </div>
    </section>
  );
}
