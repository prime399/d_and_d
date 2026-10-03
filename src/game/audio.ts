// Music + SFX via plain HTMLAudio/WebAudio. Unlocked on the first user gesture (title screen click).
export type Level = 1 | 2 | 3 | 4 | 5;
export type Track = 'title' | 'victory' | 'boss' | 'boss-intro' | `explore-${Level}` | `combat-${Level}`;

const LEVELS = [1, 2, 3, 4, 5] as const;
export const TRACKS: readonly Track[] = ['title', 'victory', 'boss', 'boss-intro', ...LEVELS.map((n) => `explore-${n}` as const), ...LEVELS.map((n) => `combat-${n}` as const)];
export const isTrack = (t: unknown): t is Track => typeof t === 'string' && (TRACKS as readonly string[]).includes(t);

/** Per-level explore/combat track; levels past 5 wrap around. */
export const levelTrack = (kind: 'explore' | 'combat', level: number): Track => `${kind}-${(((Math.max(1, level) - 1) % 5) + 1) as Level}`;

const CROSSFADE_IN = 800;
const CROSSFADE_OUT = 700;

class AudioManager {
  private current: HTMLAudioElement | null = null;
  private currentTrack: Track | null = null;
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  musicVolume = 0.35;
  sfxVolume = 0.8;
  muted = false;

  unlock() {
    try {
      if ((!this.ctx || this.ctx.state === 'closed') && typeof window !== 'undefined' && 'AudioContext' in window) {
        this.ctx = new AudioContext();
      }
      void this.ctx?.resume().catch(() => {});
    } catch {
      this.ctx = null; // no WebAudio (e.g. headless): sfx stay silent
    }
  }

  get track() {
    return this.currentTrack;
  }

  /**
   * Crossfades to `track` (loops). With `then`, the track plays once (a sting like boss-intro)
   * and crossfades into `then` on loop when it ends. Re-requesting the playing track is a no-op.
   */
  play(track: Track, opts: { then?: Track } = {}) {
    if (this.currentTrack === track) return;
    const prev = this.current;
    const next = new Audio(`/assets/music/${track}.mp3`);
    next.loop = !opts.then;
    next.volume = 0;
    this.current = next;
    this.currentTrack = track;
    if (opts.then) {
      const then = opts.then;
      // start the follow-up slightly before the sting ends so the crossfade overlaps
      const onTime = () => {
        if (this.current !== next) return next.removeEventListener('timeupdate', onTime);
        if (next.duration && next.currentTime >= next.duration - CROSSFADE_OUT / 1000) {
          next.removeEventListener('timeupdate', onTime);
          this.play(then);
        }
      };
      next.addEventListener('timeupdate', onTime);
      next.addEventListener('ended', () => { if (this.current === next) this.play(then); }, { once: true });
      next.addEventListener('error', () => { if (this.current === next) this.play(then); }, { once: true });
    }
    void next.play().catch(() => {});
    this.fade(next, () => this.musicVolume, CROSSFADE_IN);
    if (prev) this.fade(prev, () => 0, CROSSFADE_OUT, () => prev.pause());
  }

  /** Fades toward to(); re-evaluated each frame and forced to 0 while muted, so muting mid-fade sticks. */
  private fade(el: HTMLAudioElement, to: () => number, ms: number, done?: () => void) {
    const from = el.volume;
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const target = this.muted ? 0 : to();
      el.volume = this.muted ? 0 : Math.min(1, Math.max(0, from + (target - from) * k));
      if (k < 1) requestAnimationFrame(step);
      else done?.();
    };
    requestAnimationFrame(step);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.current) this.current.volume = m ? 0 : this.musicVolume;
  }

  /** Dice roll sound: picks a recorded clip matching die size and count. */
  dice(sides: number, count: number) {
    const s = [4, 6, 8, 10, 12, 20].includes(sides) ? sides : 20;
    const n = Math.min(3, Math.max(1, count));
    void this.sample(`/assets/sfx/roll_${n}d${s}.mp3`, 0.9);
  }

  private async sample(url: string, gain = 1) {
    if (this.muted || !this.ctx || this.ctx.state === 'closed') return;
    try {
      let buf = this.buffers.get(url);
      if (!buf) {
        const res = await fetch(url);
        buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(url, buf);
      }
      const src = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      g.gain.value = gain * this.sfxVolume;
      src.buffer = buf;
      src.connect(g).connect(this.ctx.destination);
      src.start();
    } catch {
      /* ignore */
    }
  }

  /** Synth blips (no asset needed): hit, crit, miss, heal, spell, step, death, ui. */
  blip(kind: 'hit' | 'crit' | 'miss' | 'heal' | 'spell' | 'death' | 'ui' | 'door' | 'chest' | 'gold' | 'ambush' | 'step') {
    if (this.muted || !this.ctx || this.ctx.state === 'closed') return;
    try {
      this.synth(kind);
    } catch {
      /* WebAudio unavailable (e.g. headless); sound is optional */
    }
  }

  private synth(kind: Parameters<AudioManager['blip']>[0]) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = this.sfxVolume * 0.25;
    out.connect(ctx.destination);
    const tone = (type: OscillatorType, f0: number, f1: number, dur: number, delay = 0, vol = 1) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, now + delay);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + delay + dur);
      g.gain.setValueAtTime(vol, now + delay);
      g.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      o.connect(g).connect(out);
      o.start(now + delay);
      o.stop(now + delay + dur + 0.02);
    };
    const noise = (dur: number, vol = 1, delay = 0) => {
      const len = Math.floor(ctx.sampleRate * dur);
      const b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = vol;
      s.buffer = b;
      s.connect(g).connect(out);
      s.start(now + delay);
    };
    switch (kind) {
      case 'hit': noise(0.12, 1.2); tone('square', 180, 60, 0.12, 0, 0.5); break;
      case 'crit': noise(0.2, 1.5); tone('sawtooth', 300, 50, 0.25, 0, 0.6); tone('square', 880, 1320, 0.15, 0.05, 0.3); break;
      case 'miss': tone('sine', 700, 300, 0.18, 0, 0.4); break;
      case 'heal': [523, 659, 784].forEach((f, i) => tone('sine', f, f * 1.01, 0.25, i * 0.07, 0.4)); break;
      case 'spell': tone('triangle', 300, 1200, 0.3, 0, 0.5); tone('sine', 1200, 600, 0.3, 0.1, 0.3); break;
      case 'death': tone('sawtooth', 220, 40, 0.6, 0, 0.5); break;
      case 'ui': tone('square', 660, 660, 0.04, 0, 0.25); break;
      case 'door': noise(0.4, 0.6); tone('sine', 90, 60, 0.5, 0, 0.6); break;
      case 'chest': [784, 988, 1175, 1568].forEach((f, i) => tone('square', f, f, 0.08, i * 0.06, 0.25)); break;
      case 'gold': [1319, 1760, 2093].forEach((f, i) => tone('triangle', f, f, 0.07, i * 0.045, 0.3)); break;
      case 'ambush': noise(0.25, 0.8); tone('sawtooth', 110, 220, 0.35, 0, 0.5); tone('square', 440, 330, 0.3, 0.12, 0.35); break;
      case 'step': noise(0.04, 0.15); break;
    }
  }
}

export const audio = new AudioManager();
