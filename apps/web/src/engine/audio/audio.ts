/**
 * The game's audio bus — a tiny framework-free singleton. It owns the shared
 * AudioContext, a master → {sfx, ambient, music} gain graph, gesture-unlock
 * (browsers start the context suspended until a user interaction), the looping
 * ambient/music beds, and a persisted mute. Game code calls `audio.play(name)`;
 * per-frame drivers call the bed/duck helpers.
 */
import { AUDIO } from "@/engine/config/audio";
import { SFX, birdChirp, musicBar } from "./synth";

const MUTE_KEY = "foxglade.muted";

/**
 * Real CC0 recordings that override their synth recipe when the file is present
 * in public/audio/. Missing files fall back to synthesis silently, so dropping
 * a sample in is a zero-code swap. Combat cues get slight pitch variation so
 * rapid repeats don't sound machine-gun identical.
 */
const SAMPLE_URLS: Record<string, string> = {
  gunshot: "/audio/gunshot.mp3",
  enemyGun: "/audio/enemy_gun.mp3",
  blast: "/audio/blast.mp3",
  hurt: "/audio/hurt.mp3",
};
const PITCH_VARY = new Set(["gunshot", "enemyGun"]);
/** Per-sample loudness trims — freesound previews vary in recorded level. The
 *  pain grunt is recorded quiet, so it needs a boost to sit above gunfire. */
const SAMPLE_GAIN: Record<string, number> = { hurt: 2.2 };

type BusName = "sfx" | "ambient" | "music";

/**
 * How wet, and how bright, each place in the village is. `wet` is the level fed
 * into the convolver; `tone` is the low-pass on the tail (a small stone room
 * keeps more high end than a long street does).
 */
export const SPACES = {
  /** Between buildings — the default. A real slapback off the walls. */
  street: { wet: 0.3, tone: 3200 },
  /** Inside a house or the vault: shorter, brighter, more of it. */
  room: { wet: 0.46, tone: 4200 },
  /** Outside the ramparts — grass to the horizon, almost nothing comes back. */
  open: { wet: 0.09, tone: 2400 },
} as const;

class AudioBus {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses: Record<BusName, GainNode> = {} as never;
  private started = false; // beds running
  private samplesLoaded = false;
  private samples: Record<string, AudioBuffer> = {};
  private _muted = false;
  private windGain: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private reverbTone: BiquadFilterNode | null = null;
  private space: keyof typeof SPACES = "street";
  private birdTimer: number | null = null;
  private musicTimer: number | null = null;
  private listeners = new Set<(muted: boolean) => void>();

  constructor() {
    if (typeof window !== "undefined") {
      this._muted = window.localStorage.getItem(MUTE_KEY) === "1";
    }
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === "undefined") return null;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : AUDIO.master;
    this.master.connect(ctx.destination);
    (["sfx", "ambient", "music"] as BusName[]).forEach((b) => {
      const g = ctx.createGain();
      g.gain.value = AUDIO[b];
      g.connect(this.master);
      this.buses[b] = g;
    });
    this.buildReverb(ctx);
    this.ctx = ctx;
    return ctx;
  }

  /**
   * A convolution reverb the SFX bus feeds in parallel.
   *
   * Everything in the game was bone dry. A rifle going off between two stone
   * houses sounded exactly like a rifle going off in an open field, which is why
   * the village never sounded like a physical place no matter how much ambience
   * was layered on top of it — reverb is the cue that tells you a space HAS
   * walls, and there wasn't any.
   *
   * The impulse response is synthesized rather than loaded: exponentially
   * decaying noise with a few discrete early reflections punched into the head
   * of it (the reflections are what make it read as a street rather than a
   * generic wash). Costs one buffer at startup and ships no audio files.
   */
  private buildReverb(ctx: AudioContext) {
    const seconds = 1.9;
    const len = Math.floor(ctx.sampleRate * seconds);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    // Early reflections: delay in seconds, amplitude. Roughly a 6–14 m street.
    const early: [number, number][] = [
      [0.011, 0.72], [0.019, 0.55], [0.027, 0.62], [0.041, 0.4],
      [0.053, 0.34], [0.071, 0.28], [0.089, 0.22],
    ];
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Late tail: noise under an exponential decay, with the first ~20 ms
        // rolled off so the tail arrives after the reflections, not with them.
        const decay = Math.pow(1 - t, 2.6);
        const onset = Math.min(1, i / (ctx.sampleRate * 0.02));
        d[i] = (Math.random() * 2 - 1) * decay * onset * 0.55;
      }
      for (const [delay, amp] of early) {
        // Decorrelate the two channels a touch so the space has width.
        const idx = Math.floor((delay + (c ? 0.0017 : 0)) * ctx.sampleRate);
        if (idx < len) d[idx] += amp * (c ? -1 : 1);
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = ir;
    // Roll the top off the tail — stone absorbs high frequencies, and an
    // unfiltered noise convolution hisses.
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 3200;

    const send = ctx.createGain();
    send.gain.value = SPACES.street.wet;
    const wet = ctx.createGain();
    wet.gain.value = 1;

    this.buses.sfx.connect(send);
    send.connect(convolver).connect(tone).connect(wet).connect(this.master);
    this.reverbSend = send;
    this.reverbTone = tone;
  }

  /**
   * Move the player between acoustic spaces. Called each frame by the driver —
   * a stone room should ring, the open ground outside the walls should not.
   */
  setSpace(space: keyof typeof SPACES) {
    const ctx = this.ctx;
    if (!ctx || !this.reverbSend || !this.reverbTone) return;
    const s = SPACES[space];
    if (space === this.space) return;
    this.space = space;
    // Crossfade, don't cut — a hard switch on a doorway is very audible.
    this.reverbSend.gain.setTargetAtTime(s.wet, ctx.currentTime, 0.35);
    this.reverbTone.frequency.setTargetAtTime(s.tone, ctx.currentTime, 0.35);
  }

  /** Resume the context and start the ambient beds. Safe to call repeatedly. */
  unlock() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    if (!this.started) {
      this.started = true;
      this.startWind();
      this.scheduleBirds();
      if (AUDIO.music_on) this.scheduleMusic();
    }
    void this.loadSamples();
  }

  /** Fetch + decode any real CC0 samples present; missing files stay on synth. */
  private async loadSamples() {
    if (this.samplesLoaded || !this.ctx) return;
    this.samplesLoaded = true;
    for (const [name, url] of Object.entries(SAMPLE_URLS)) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.samples[name] = buf;
      } catch {
        /* no file (or bad decode) → keep the synth fallback */
      }
    }
  }

  get muted() {
    return this._muted;
  }

  setMuted(m: boolean) {
    this._muted = m;
    if (typeof window !== "undefined") window.localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : AUDIO.master, this.ctx.currentTime, 0.02);
    this.listeners.forEach((fn) => fn(m));
  }

  toggleMute() {
    this.setMuted(!this._muted);
    this.play("ui");
    return this._muted;
  }

  onMuteChange(fn: (muted: boolean) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Play a named one-shot on the SFX bus. `vol` is a 0–1 loudness scalar. A
   *  loaded real sample takes precedence over the synth recipe of the same name. */
  play(name: keyof typeof SFX | string, vol = 1) {
    if (this._muted) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== "running") return;
    const v = Math.max(0, Math.min(1, vol));
    const sample = this.samples[name];
    if (sample) {
      const src = ctx.createBufferSource();
      src.buffer = sample;
      if (PITCH_VARY.has(name)) src.playbackRate.value = 0.93 + Math.random() * 0.14;
      const g = ctx.createGain();
      g.gain.value = v * (SAMPLE_GAIN[name] ?? 1);
      src.connect(g).connect(this.buses.sfx);
      src.start(ctx.currentTime + 0.001);
      return;
    }
    const recipe = SFX[name];
    if (recipe) recipe(ctx, this.buses.sfx, ctx.currentTime + 0.001, v);
  }

  /** Distance → volume falloff (near = full, far = silent), for positional cues. */
  distanceVolume(dist: number, near: number, far: number) {
    if (dist <= near) return 1;
    if (dist >= far) return 0;
    return 1 - (dist - near) / (far - near);
  }

  /** Point the 3D listener at the player each frame (position + facing) so
   *  positional cues (playAt) pan left/right and attenuate correctly. */
  setListener(x: number, y: number, z: number, yaw: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    if (l.positionX) {
      const t = ctx.currentTime;
      l.positionX.setValueAtTime(x, t);
      l.positionY.setValueAtTime(y, t);
      l.positionZ.setValueAtTime(z, t);
      l.forwardX.setValueAtTime(fx, t);
      l.forwardY.setValueAtTime(0, t);
      l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      // Deprecated API — still needed for Safari.
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition?.(x, y, z);
      (l as unknown as { setOrientation(...a: number[]): void }).setOrientation?.(fx, 0, fz, 0, 1, 0);
    }
  }

  /** Play a named cue at a WORLD position — panned left/right and distance-
   *  attenuated relative to the listener. `near`/`far` reproduce the old linear
   *  falloff (linear distance model), now with direction. Use for world events
   *  (enemy fire, blasts); the player's own cues stay centred via play(). */
  playAt(name: keyof typeof SFX | string, x: number, z: number, near: number, far: number, baseVol = 1) {
    if (this._muted) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== "running") return;
    const panner = ctx.createPanner();
    panner.panningModel = "equalpower"; // cheap L/R + distance (front/back read off the compass)
    panner.distanceModel = "linear";
    panner.refDistance = near;
    panner.maxDistance = far;
    panner.rolloffFactor = 1;
    const t = ctx.currentTime;
    if (panner.positionX) {
      panner.positionX.setValueAtTime(x, t);
      panner.positionY.setValueAtTime(1, t);
      panner.positionZ.setValueAtTime(z, t);
    } else {
      (panner as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition?.(x, 1, z);
    }
    panner.connect(this.buses.sfx);
    const v = Math.max(0, Math.min(1, baseVol));
    const sample = this.samples[name];
    if (sample) {
      const src = ctx.createBufferSource();
      src.buffer = sample;
      if (PITCH_VARY.has(name)) src.playbackRate.value = 0.93 + Math.random() * 0.14;
      const g = ctx.createGain();
      g.gain.value = v * (SAMPLE_GAIN[name] ?? 1);
      src.connect(g).connect(panner);
      src.start(t + 0.001);
      return;
    }
    const recipe = SFX[name];
    if (recipe) recipe(ctx, panner, t + 0.001, v);
  }

  /**
   * Duck ambient + music (e.g. muffled while indoors, world paused). `factor`
   * is a 0–1 multiplier applied to the bus's base volume.
   */
  duck(factor: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.buses.ambient.gain.setTargetAtTime(AUDIO.ambient * factor, t, 0.15);
    this.buses.music.gain.setTargetAtTime(AUDIO.music * factor, t, 0.15);
  }

  // --- Ambient beds ---------------------------------------------------------

  /** Continuous filtered-noise wind with a slow gain/cutoff wobble. */
  private startWind() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    // Reuse the synth's noise via a fresh looping source.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      // Brownish noise = smoother, more wind-like than white.
      last = (last + (Math.random() * 2 - 1) * 0.04) * 0.98;
      d[i] = last;
    }
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(lp).connect(g).connect(this.buses.ambient);
    src.start();
    g.gain.setTargetAtTime(0.9, ctx.currentTime, 2); // fade the wind in
    // Slow LFO on cutoff + level so it breathes.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
    this.windGain = g;
  }

  /** Randomly-timed distant bird chirps (daytime flavour). */
  private scheduleBirds() {
    const tick = () => {
      const ctx = this.ctx;
      if (ctx && ctx.state === "running" && !this._muted) {
        birdChirp(ctx, this.buses.ambient, ctx.currentTime + 0.02, 0.8);
      }
      this.birdTimer = window.setTimeout(tick, 1500 + Math.random() * 4000);
    };
    this.birdTimer = window.setTimeout(tick, 800);
  }

  /** A slow 4-chord loop, one bar at a time (medieval-ish minor). */
  private scheduleMusic() {
    // Am – F – C – G (in low triangle-pad register).
    const A = 220;
    const n = (semi: number) => A * Math.pow(2, semi / 12);
    const prog = [
      [n(0), n(3), n(7)], // Am
      [n(-4), n(0), n(5)], // F
      [n(3), n(7), n(10)], // C
      [n(-2), n(2), n(7)], // G
    ];
    const barLen = 2.4; // seconds per bar (was a sleepy 4s)
    let bar = 0;
    const tick = () => {
      const ctx = this.ctx;
      if (ctx && ctx.state === "running") {
        musicBar(ctx, this.buses.music, ctx.currentTime + 0.05, prog[bar % prog.length], 1, barLen);
      }
      bar++;
      this.musicTimer = window.setTimeout(tick, barLen * 1000);
    };
    this.musicTimer = window.setTimeout(tick, 200);
  }
}

export const audio = new AudioBus();
