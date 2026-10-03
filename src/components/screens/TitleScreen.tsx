'use client';
import { useEffect, useRef, useState } from 'react';
import type { GameController } from '@/game/controller';
import { audio } from '@/game/audio';
import { Sprite } from './Sprite';
import { Embers } from './Embers';
import { useFocusTrap } from './Modal';

const ROLE: Record<string, { tag: string; color: string; sig: string[] }> = {
  Fighter: { tag: 'Frontline', color: 'text-sky-200', sig: ['Longsword', 'Second Wind', 'Javelin'] },
  Wizard: { tag: 'Arcane artillery', color: 'text-violet-200', sig: ['Fire Bolt', 'Burning Hands', 'Sleep'] },
  Cleric: { tag: 'Healer', color: 'text-emerald-200', sig: ['Healing Word', 'Guiding Bolt', 'Bless'] },
};

const LURKERS: { k: string; scale: number; delay: number }[] = [
  { k: 'goblin', scale: 4, delay: 120 },
  { k: 'ogre', scale: 4, delay: 380 },
  { k: 'skelet', scale: 4, delay: 240 },
];

export function TitleScreen({ ctrl, onCredits }: { ctrl: GameController; onCredits: () => void }) {
  const heroes = ctrl.content.heroes;
  const spells = new Map(ctrl.content.spells.map((s) => [s.slug, s.name]));
  const [entering, setEntering] = useState(false);
  const musicOn = useRef(false);
  const ref = useFocusTrap<HTMLDivElement>();

  // Browsers block autoplay: start the title theme on the first gesture on this screen.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const kick = () => {
      if (musicOn.current) return;
      musicOn.current = true;
      audio.unlock();
      audio.play('title');
    };
    root.addEventListener('pointerdown', kick);
    root.addEventListener('keydown', kick);
    return () => {
      root.removeEventListener('pointerdown', kick);
      root.removeEventListener('keydown', kick);
    };
  }, [ref]);

  const enter = () => {
    if (entering) return;
    setEntering(true);
    void ctrl.start();
  };

  const sigFor = (h: (typeof heroes)[number]) => {
    const fromData = [...h.attacks.map((a) => a.name), ...h.spells.map((s) => spells.get(s) ?? s)];
    const pref = ROLE[h.className]?.sig ?? [];
    const picked = pref.filter((p) => fromData.includes(p));
    return (picked.length >= 2 ? picked : fromData).slice(0, 3);
  };

  return (
    <div ref={ref} className="scr-title fixed inset-0 z-50 overflow-x-hidden overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="title-heading">
      {/* Decorative layers overscan the viewport; clip them so they never create scrollbars. */}
      <div aria-hidden className="scr-decor">
        <div className="scr-backdrop" />
        <div className="scr-torch scr-torch-l" />
        <div className="scr-torch scr-torch-r" />
      </div>
      <div aria-hidden className="scr-fog" />
      <Embers />
      <div aria-hidden className="scr-vignette" />

      <div className="relative mx-auto flex min-h-full max-w-6xl flex-col items-center justify-center gap-[clamp(10px,2.2vh,22px)] px-4 py-6">
        <header className="scr-rise text-center">
          <p className="font-pixel text-[11px] tracking-[0.4em] text-amber-400/90">A D&amp;D 5E DUNGEON CRAWL</p>
          <h1 id="title-heading" className="scr-title-text mt-1 font-display text-[clamp(44px,8vh,84px)] leading-none">The Goblin Warren</h1>
          <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-snug text-[#ece3d0]/85">
            The Dungeon Master never invents a rule. <span className="text-amber-200">Every ruling is looked up in Sanity and cited.</span>
          </p>
        </header>

        {/* the standoff: party on the left, the warren on the right */}
        <div aria-hidden className="scr-stage scr-rise" style={{ animationDelay: '80ms' }}>
          <div className="flex items-end gap-3">
            {heroes.map((h, i) => <Sprite key={h.slug} k={h.spriteKey} scale={4} delay={i * 170} className="scr-shadow" />)}
          </div>
          <div className="font-display text-2xl text-amber-200/50">vs</div>
          <div className="flex items-end gap-3">
            {LURKERS.map((m) => <Sprite key={m.k} k={m.k} scale={m.scale} delay={m.delay} flip className="scr-shadow scr-lurk" />)}
          </div>
        </div>

        <ul className="grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Your party">
          {heroes.map((h, i) => {
            const role = ROLE[h.className];
            return (
              <li key={h.slug} className="scr-hero scr-rise" style={{ animationDelay: `${140 + i * 70}ms` }}>
                <div className="scr-portrait"><Sprite k={h.spriteKey} scale={3} anim={false} /></div>
                <div className="min-w-0">
                  <div className="font-display text-lg leading-tight text-amber-100">{h.name}</div>
                  <div className={`font-pixel text-[11px] ${role?.color ?? 'text-amber-300'}`}>Lv {h.level} {h.className} · {role?.tag}</div>
                  <div className="mt-1 flex gap-1.5 font-pixel text-[11px]">
                    <span className="scr-stat"><span className="text-white/55">AC</span> {h.ac}</span>
                    <span className="scr-stat"><span className="text-white/55">HP</span> {h.hp}</span>
                    <span className="scr-stat"><span className="text-white/55">SPD</span> {h.speed * 5}ft</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {sigFor(h).map((s) => <span key={s} className="scr-ability">{s}</span>)}
                  </div>
                  <p className="mt-1.5 text-[12px] leading-snug text-[#ece3d0]/70">{h.blurb}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="scr-rise flex flex-col items-center gap-3" style={{ animationDelay: '360ms' }}>
          <button className="scr-cta" onClick={enter} disabled={entering} data-autofocus>
            {entering ? 'Descending…' : 'Enter the Dungeon'}
          </button>
          <ul className="flex flex-wrap justify-center gap-2" aria-label="How to play">
            {['Click to explore', 'Wake lairs, win fights', 'Read lore stones', 'Ask the DM any rule'].map((t) => <li key={t} className="scr-chip">{t}</li>)}
          </ul>
          <button className="scr-link" onClick={onCredits}>Credits &amp; licenses</button>
        </div>
      </div>
    </div>
  );
}
