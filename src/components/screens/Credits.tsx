'use client';
import { Modal } from './Modal';

const ROWS: { what: string; who: React.ReactNode; license: string }[] = [
  { what: 'Pixel art', who: <><a href="https://0x72.itch.io/dungeontileset-ii" target="_blank" rel="noreferrer">DungeonTileset II v1.7</a> by 0x72</>, license: 'CC0' },
  {
    what: 'Music',
    who: <><a href="https://tallbeard.itch.io/music-loop-bundle" target="_blank" rel="noreferrer">Music Loop Bundle</a> by Abstraction Music / Tallbeard Studios. Title: Troubadeck 37 &ldquo;Weight of the Crown&rdquo; · Explore: Dani Maccari &ldquo;Shadow Lurking&rdquo; · Combat: Troubadeck 52 &ldquo;The Firey Depths&rdquo; · Boss: &ldquo;Cloak of Darkness STAGE 3&rdquo; · Victory: Troubadeck 38 &ldquo;Lionheart&rdquo;</>,
    license: 'CC0',
  },
  { what: 'Dice SFX', who: <>&ldquo;SFX Pack - Rolling Dice&rdquo; by Halfwits &amp; Failed Crits, recorded by Jonathan Swenson</>, license: 'CC0' },
  { what: '3D dice', who: <><a href="https://github.com/3d-dice/dice-box" target="_blank" rel="noreferrer">@3d-dice/dice-box</a> by Frank Ali</>, license: 'MIT' },
  { what: 'Content', who: <>Rules, monsters and rooms are served from <a href="https://www.sanity.io" target="_blank" rel="noreferrer">Sanity</a> and looked up live by the DM</>, license: '' },
  { what: 'Fonts', who: <>MedievalSharp, Pixelify Sans, Inter via Google Fonts</>, license: 'SIL OFL' },
];

export function CreditsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal label="Credits" onEscape={onClose} fixed className="w-full max-w-xl p-6 text-left">
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-display text-3xl text-amber-200 title-glow">Credits</h2>
        <button className="btn px-3 py-1 text-sm" onClick={onClose} aria-label="Close credits" data-autofocus>✕</button>
      </div>
      <dl className="mt-4 space-y-3 text-sm">
        {ROWS.map((r) => (
          <div key={r.what} className="grid grid-cols-[88px_1fr] gap-3">
            <dt className="font-pixel text-xs uppercase tracking-wider text-amber-400">{r.what}</dt>
            <dd className="scr-prose text-[#ece3d0]/85">
              {r.who} {r.license && <span className="scr-license">{r.license}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 rounded-md bg-black/40 p-3 text-xs leading-relaxed text-[#ece3d0]/75 ring-1 ring-violet-400/20 scr-prose">
        This work includes material from the System Reference Document 5.2.1 (&ldquo;SRD 5.2.1&rdquo;) and System Reference Document 5.1
        by Wizards of the Coast LLC, available at{' '}
        <a href="https://www.dndbeyond.com/srd" target="_blank" rel="noreferrer">dndbeyond.com/srd</a>. The SRD is licensed under the{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noreferrer">Creative Commons Attribution 4.0 International License</a>.
        Rules data via <a href="https://github.com/5e-bits/5e-srd-api" target="_blank" rel="noreferrer">5e-bits/5e-srd-api</a>.
      </div>
      <p className="mt-4 text-center text-[11px] text-white/45">Built for the DEV.to × Sanity challenge. Rules are served from Sanity and cited on every ruling.</p>
    </Modal>
  );
}
