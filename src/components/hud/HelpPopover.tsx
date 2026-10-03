'use client';
import { useEffect, useRef, useState } from 'react';
import { HOTKEYS } from '@/game/controller';

type Row = { keys: string[]; label: string };

const PRETTY: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Enter: 'Enter' };

/** "?" button with a small controls cheat-sheet. */
export function HelpPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const rows = helpRows();
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="hud-small-btn font-display text-base" aria-label="Controls help" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ?
      </button>
      {open && (
        <div role="dialog" aria-label="Controls" className="hud-pop right-0 top-[calc(100%+8px)] w-[300px] p-3">
          <div className="panel-title mb-2 text-sm">How to play</div>
          <ul className="mb-2.5 space-y-1 text-[12px] leading-snug text-white/75">
            <li>Each turn: <b className="text-amber-200">move</b>, then take <b className="text-amber-200">one action</b> (attack, spell, Dodge or potion).</li>
            <li>Click a lit tile to move or to target. Hover a unit to inspect it.</li>
            <li>Ask the Dungeon Master any rules question; it cites the SRD.</li>
          </ul>
          <div className="panel-title mb-1.5 text-xs">Keyboard</div>
          <table className="w-full text-[12px]">
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="whitespace-nowrap py-0.5 pr-3">
                    {r.keys.map((k) => <kbd key={k} className="hud-kbd mr-1">{k}</kbd>)}
                  </td>
                  <td className="py-0.5 text-white/75">{r.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Normalises HOTKEYS (a key -> label record, or a legacy [{keys,label}] list) into rows, merging keys that share a label. */
function helpRows(): Row[] {
  const src = HOTKEYS as unknown;
  const pairs: [string, string][] = Array.isArray(src)
    ? (src as { keys: readonly string[]; label: string }[]).flatMap((h) => h.keys.map((k) => [k, h.label] as [string, string]))
    : Object.entries((src ?? {}) as Record<string, string>);
  const rows: Row[] = [];
  for (const [k, label] of pairs) {
    const pretty = PRETTY[k] ?? (k.length === 1 ? k.toUpperCase() : k);
    const row = rows.find((r) => r.label === label);
    if (row) row.keys.push(pretty);
    else rows.push({ keys: [pretty], label });
  }
  return rows;
}
