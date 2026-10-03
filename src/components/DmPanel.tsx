'use client';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, GameController } from '@/game/controller';
import type { GameContent } from '@/game/content/types';
import { useView } from './useView';
import { RichText } from './RichText';
import { Consulting, ToolTrace, backendLabel } from './dm/ToolTrace';
import { suggestQuestions } from './dm/suggest';
import { useTypewriter } from './dm/useTypewriter';
import { plainText } from './dm/docs';

const MAX_Q = 500;

type Item =
  | { kind: 'msg'; msg: ChatMessage }
  | { kind: 'room'; msg: ChatMessage }
  | { kind: 'logs'; msgs: ChatMessage[] };

// Engine lines arrive as role 'system' (or 'log'); room/intro banners become dividers.
const isLog = (m: ChatMessage) => m.role === 'log' || m.role === 'system';
const isBanner = (m: ChatMessage) => m.role === 'system' && /^(Room \d+ of \d+:|Your party descends)/.test(m.text);

function group(chat: ChatMessage[]): Item[] {
  const out: Item[] = [];
  for (const m of chat) {
    if (isBanner(m)) out.push({ kind: 'room', msg: m });
    else if (isLog(m)) {
      const last = out[out.length - 1];
      if (last?.kind === 'logs') last.msgs.push(m);
      else out.push({ kind: 'logs', msgs: [m] });
    } else out.push({ kind: 'msg', msg: m });
  }
  return out;
}

function logIcon(t: string) {
  const s = t.toLowerCase();
  if (/\b(dies|died|slain|falls|down|killed|unconscious|defeated)\b|\(0 hp/.test(s)) return { i: '☠', c: 'text-rose-300/80' };
  if (/\b(heal|heals|healed|regains|potion)\b/.test(s)) return { i: '✚', c: 'text-emerald-300/80' };
  if (/\b(cast|casts|spell|concentrat|save|saving)\b/.test(s)) return { i: '✦', c: 'text-violet-300/80' };
  if (/\b(hit|hits|miss|misses|attack|attacks|damage|crit)/.test(s)) return { i: '⚔', c: 'text-amber-300/80' };
  if (/\b(move|moves|dash|disengage|dodge)/.test(s)) return { i: '➜', c: 'text-sky-300/80' };
  return { i: '•', c: 'text-white/40' };
}

export function DmPanel({ ctrl }: { ctrl: GameController }) {
  const v = useView(ctrl);
  const [q, setQ] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // only DM messages that arrive after mount get the typewriter
  const [mountMax] = useState(() => ctrl.view.chat.reduce((a, m) => Math.max(a, m.id), 0));
  const onCite = useCallback((id: string) => ctrl.focusDoc(id), [ctrl]);
  const items = useMemo(() => group(v.chat), [v.chat]);
  const suggestions = useMemo(() => suggestQuestions(v), [v]);

  const lastBackend = useMemo(() => [...v.chat].reverse().find((m) => m.role === 'dm' && !m.pending && m.backend)?.backend, [v.chat]);
  const lastDone = useMemo(() => [...v.chat].reverse().find((m) => m.role === 'dm' && !m.pending && m.text), [v.chat]);

  const toBottom = useCallback(() => {
    const el = list.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight });
    stick.current = true;
  }, []);

  // follow growth (new messages, typewriter, expanded traces) only when pinned to the bottom
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    let prevH = el.offsetHeight;
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight;
      const grew = h > prevH;
      prevH = h;
      if (!grew) return;
      if (stick.current) list.current?.scrollTo({ top: list.current.scrollHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Any new message (or a pending DM reply resolving) always jumps into view and re-pins the
  // list, so the typewriter that follows keeps it visible too.
  const last = v.chat[v.chat.length - 1];
  const lastKey = last ? `${last.id}:${last.pending ? 1 : 0}` : '';
  useEffect(() => {
    if (lastKey) toBottom();
  }, [lastKey, toBottom]);

  const onScroll = () => {
    const el = list.current;
    if (!el) return;
    const at = el.scrollHeight - el.scrollTop - el.clientHeight < 28;
    stick.current = at;
  };

  const send = (text: string) => {
    const t = text.trim();
    if (!t || v.dmThinking) return;
    stick.current = true;
    void ctrl.ask(t);
    setQ('');
  };

  const status = v.dmThinking ? 'thinking' : lastBackend === 'sanity-context' ? 'sanity' : lastBackend ? 'offline' : 'idle';

  return (
    <section className="panel dm-panel flex min-h-0 flex-col" aria-label="Dungeon Master">
      <div className="flex items-center justify-between gap-2 border-b border-amber-900/30 px-3 py-2">
        <h2 className="panel-title text-base">Dungeon Master</h2>
        <span className={`dm-status dm-status-${status}`} aria-live="polite">
          <span className="dm-dot" aria-hidden />
          {status === 'thinking' ? 'thinking…' : status === 'sanity' ? 'Connected to Sanity Context' : status === 'offline' ? backendLabel(lastBackend) : 'Rules from Sanity'}
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={list} onScroll={onScroll} className="scroll-thin h-full overflow-y-auto px-3 py-2" role="log" aria-live="off" aria-label="Dungeon Master chat">
          <div ref={inner} className="space-y-2">
            {v.chat.length === 0 && <Intro />}
            {items.map((it) =>
              it.kind === 'room' ? (
                <RoomDivider key={it.msg.id} text={it.msg.text} />
              ) : it.kind === 'logs' ? (
                <LogGroup key={it.msgs[0].id} msgs={it.msgs} />
              ) : it.msg.role === 'player' ? (
                <div key={it.msg.id} className="dm-player-row fade-in">
                  <div className="dm-player">
                    <span className="dm-player-label">You ask</span>
                    {it.msg.text}
                  </div>
                </div>
              ) : (
                <DmBubble key={it.msg.id} msg={it.msg} animate={it.msg.id > mountMax} titles={ctrl.titleMap} content={ctrl.content} onCite={onCite} />
              ),
            )}
          </div>
        </div>
        {/* Screen readers hear only finished DM messages, once, without chip noise. */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {lastDone ? `Dungeon Master: ${plainText(lastDone.text, ctrl.titleMap)}` : ''}
        </div>
      </div>

      <form
        className="border-t border-amber-900/30 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(q);
        }}
      >
        <div className="mb-1.5 flex flex-wrap gap-1" aria-label="Suggested questions">
          {suggestions.map((s) => (
            <button key={s} type="button" className="dm-suggest" disabled={v.dmThinking} onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <label htmlFor="dm-q" className="sr-only">Ask the Dungeon Master</label>
          <div className="relative min-w-0 flex-1">
            <input
              id="dm-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={v.dmThinking ? 'The DM is consulting the tome…' : 'Ask the DM a rules question…'}
              maxLength={MAX_Q}
              enterKeyHint="send"
              aria-describedby={q.length > MAX_Q - 100 ? 'dm-q-count' : undefined}
              className="dm-input w-full"
            />
            {q.length > MAX_Q - 100 && (
              <span id="dm-q-count" className={`dm-count ${q.length >= MAX_Q ? 'text-rose-300' : 'text-amber-200/70'}`}>
                {q.length}/{MAX_Q}
              </span>
            )}
          </div>
          <button className="btn text-xs" disabled={!q.trim() || v.dmThinking} aria-busy={v.dmThinking}>
            {v.dmThinking ? '…' : 'Ask'}
          </button>
        </div>
      </form>
    </section>
  );
}

function Intro() {
  return (
    <div className="dm-intro fade-in">
      <div className="font-display text-[15px] text-amber-100">Your Dungeon Master</div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[#e8dcc0]/80">
        I narrate the fight and rule on every roll. Each ruling is looked up live in the <b className="text-amber-200">Sanity</b> rules
        content lake, and I cite the exact document. Click a citation to open it in the Rules Tome, or expand{' '}
        <i>How the DM ruled</i> to see my queries.
      </p>
      <p className="mt-1 text-[11.5px] text-white/45">Ask anything below, like what Prone does or what changed in 2024.</p>
    </div>
  );
}

function RoomDivider({ text }: { text: string }) {
  const m = text.match(/^Room (\d+) of (\d+):\s*(.*)$/);
  return (
    <div className="dm-room fade-in" role="separator" aria-label={text}>
      <span className="dm-room-line" aria-hidden />
      <span className="dm-room-text">
        {m ? (
          <>
            <span className="dm-room-num">Room {m[1]}/{m[2]}</span>
            {m[3]}
          </>
        ) : (
          text
        )}
      </span>
      <span className="dm-room-line" aria-hidden />
    </div>
  );
}

function LogLine({ m }: { m: ChatMessage }) {
  const { i, c } = logIcon(m.text);
  return (
    <li className="dm-log">
      <span aria-hidden className={`dm-log-i ${c}`}>{i}</span>
      <span>{m.text}</span>
    </li>
  );
}

function LogGroup({ msgs }: { msgs: ChatMessage[] }) {
  const [open, setOpen] = useState(false);
  if (msgs.length <= 2) {
    return (
      <ul className="fade-in">
        {msgs.map((m) => <LogLine key={m.id} m={m} />)}
      </ul>
    );
  }
  const last = msgs[msgs.length - 1];
  return (
    <div className="fade-in">
      <button type="button" className="dm-log-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden className={`dm-caret ${open ? 'dm-caret-open' : ''}`}>▸</span>
        {msgs.length} events
        {!open && <span className="truncate text-white/35">· {last.text}</span>}
      </button>
      {open ? (
        <ul>{msgs.map((m) => <LogLine key={m.id} m={m} />)}</ul>
      ) : null}
    </div>
  );
}

const DmBubble = memo(function DmBubble({ msg, animate, titles, content, onCite }: { msg: ChatMessage; animate: boolean; titles: Record<string, string>; content: GameContent; onCite: (id: string) => void }) {
  const { shown, done } = useTypewriter(msg.text, animate && !msg.pending);
  return (
    <article className="dm-bubble fade-in" aria-label="Dungeon Master">
      <div className="dm-speaker">
        <span aria-hidden>🜲</span> The Dungeon Master
      </div>
      {msg.pending ? (
        <Consulting />
      ) : (
        <div className={`dm-text ${done ? '' : 'typing'}`}>
          <RichText text={shown} titles={titles} onCite={onCite} content={content} />
        </div>
      )}
      {!msg.pending && done && <ToolTrace msg={msg} titles={titles} onCite={onCite} content={content} />}
    </article>
  );
});
