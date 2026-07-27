/**
 * Procedural sound design. Each cue is scheduled from primitives (oscillators +
 * filtered noise + envelopes) against the shared AudioContext clock, so there
 * are no audio files to ship and no library dependency. Recipes are written to
 * be replaceable one-by-one with real CC0 samples later without touching the
 * call sites — the AudioBus just resolves a name to one of these functions.
 */

let _noise: AudioBuffer | null = null;
/** A 2s white-noise buffer, generated once and reused for every noisy cue. */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (_noise && _noise.sampleRate === ctx.sampleRate) return _noise;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  _noise = buf;
  return buf;
}

function noiseSource(ctx: AudioContext): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.loop = true;
  s.playbackRate.value = 0.9 + Math.random() * 0.2; // decorrelate repeats
  return s;
}

/** A quick percussive envelope: rise to `peak` in `atk`, exp-decay over `dec`. */
function env(ctx: AudioContext, t0: number, peak: number, atk: number, dec: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + atk + dec);
  return g;
}

/** A single pitched blip (osc → env). Returns when it ends. */
function blip(
  ctx: AudioContext,
  out: AudioNode,
  t0: number,
  freq: number,
  {
    type = "triangle",
    peak = 0.5,
    atk = 0.004,
    dec = 0.12,
    glideTo,
  }: { type?: OscillatorType; peak?: number; atk?: number; dec?: number; glideTo?: number } = {}
) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + atk + dec);
  const g = env(ctx, t0, peak, atk, dec);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + atk + dec + 0.02);
}

// A minor-ish scale (Hz) the musical cues draw from, for a medieval flavour.
const A3 = 220;
const semis = (n: number) => A3 * Math.pow(2, n / 12);

/** Named one-shot recipes. `vol` is the pre-attenuated 0–1 loudness. */
export const SFX: Record<string, (ctx: AudioContext, out: AudioNode, t0: number, vol: number) => void> = {
  // Player rifle: bright noise crack + a short low body thump.
  gunshot(ctx, out, t0, vol) {
    const n = noiseSource(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;
    const g = env(ctx, t0, 0.5 * vol, 0.001, 0.11);
    n.connect(hp).connect(g).connect(out);
    n.start(t0);
    n.stop(t0 + 0.16);
    blip(ctx, out, t0, 150, { type: "sine", peak: 0.4 * vol, atk: 0.001, dec: 0.09, glideTo: 60 });
  },

  // Enemy fire: duller, lower, quieter than the player's — reads as "incoming".
  enemyGun(ctx, out, t0, vol) {
    const n = noiseSource(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 700;
    bp.Q.value = 0.8;
    const g = env(ctx, t0, 0.4 * vol, 0.002, 0.13);
    n.connect(bp).connect(g).connect(out);
    n.start(t0);
    n.stop(t0 + 0.18);
    blip(ctx, out, t0, 110, { type: "sine", peak: 0.28 * vol, atk: 0.002, dec: 0.1, glideTo: 55 });
  },

  // A tiny hitmarker tick when a shot connects.
  hit(ctx, out, t0, vol) {
    blip(ctx, out, t0, 1400, { type: "square", peak: 0.18 * vol, atk: 0.001, dec: 0.04, glideTo: 900 });
  },

  // Bomb throw: a short airy upward whoosh.
  bombThrow(ctx, out, t0, vol) {
    const n = noiseSource(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(300, t0);
    bp.frequency.exponentialRampToValueAtTime(1400, t0 + 0.28);
    const g = env(ctx, t0, 0.3 * vol, 0.04, 0.26);
    n.connect(bp).connect(g).connect(out);
    n.start(t0);
    n.stop(t0 + 0.34);
  },

  // Bomb blast: deep sine sweep-down + a lowpassed noise roar + a crack transient.
  blast(ctx, out, t0, vol) {
    // Sub boom.
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(120, t0);
    o.frequency.exponentialRampToValueAtTime(32, t0 + 0.5);
    const og = env(ctx, t0, 0.9 * vol, 0.005, 0.6);
    o.connect(og).connect(out);
    o.start(t0);
    o.stop(t0 + 0.7);
    // Roar.
    const n = noiseSource(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1800, t0);
    lp.frequency.exponentialRampToValueAtTime(200, t0 + 0.55);
    const ng = env(ctx, t0, 0.6 * vol, 0.002, 0.55);
    n.connect(lp).connect(ng).connect(out);
    n.start(t0);
    n.stop(t0 + 0.6);
    // Initial crack.
    blip(ctx, out, t0, 220, { type: "sawtooth", peak: 0.35 * vol, atk: 0.001, dec: 0.05, glideTo: 80 });
  },

  // Treasure claimed: a bright, triumphant rising arpeggio.
  claim(ctx, out, t0, vol) {
    const notes = [semis(12), semis(16), semis(19), semis(24)]; // A–C#–E–A major-ish
    notes.forEach((f, i) => {
      const t = t0 + i * 0.1;
      blip(ctx, out, t, f, { type: "triangle", peak: 0.4 * vol, atk: 0.005, dec: 0.32 });
      blip(ctx, out, t, f * 2, { type: "sine", peak: 0.12 * vol, atk: 0.005, dec: 0.28 }); // shimmer
    });
  },

  // A cracked treasure: duller, only two notes, slightly sour.
  claimCracked(ctx, out, t0, vol) {
    blip(ctx, out, t0, semis(12), { type: "triangle", peak: 0.34 * vol, atk: 0.005, dec: 0.3 });
    blip(ctx, out, t0 + 0.14, semis(15), { type: "triangle", peak: 0.3 * vol, atk: 0.005, dec: 0.34 }); // minor 3rd
  },

  // Depositing loot at the vault: two quick bright coin blips.
  deposit(ctx, out, t0, vol) {
    blip(ctx, out, t0, semis(31), { type: "square", peak: 0.22 * vol, atk: 0.001, dec: 0.1 });
    blip(ctx, out, t0 + 0.08, semis(36), { type: "square", peak: 0.2 * vol, atk: 0.001, dec: 0.12 });
  },

  // Player takes damage: a vocal-ish "ugh" grunt — two detuned saws pitched down
  // through a sweeping formant band + a breath/impact noise. Loud enough to land.
  hurt(ctx, out, t0, vol) {
    for (const f0 of [148, 152]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f0 * 1.4, t0);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.75, t0 + 0.22);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(1100, t0);
      bp.frequency.exponentialRampToValueAtTime(480, t0 + 0.22);
      bp.Q.value = 4;
      const g = env(ctx, t0, 0.6 * vol, 0.004, 0.24);
      o.connect(bp).connect(g).connect(out);
      o.start(t0);
      o.stop(t0 + 0.28);
    }
    const n = noiseSource(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1200;
    const g = env(ctx, t0, 0.32 * vol, 0.001, 0.13);
    n.connect(lp).connect(g).connect(out);
    n.start(t0);
    n.stop(t0 + 0.15);
  },

  // Downed: a somber descending tone.
  death(ctx, out, t0, vol) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(semis(7), t0);
    o.frequency.exponentialRampToValueAtTime(semis(-8), t0 + 0.8);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 800;
    const g = env(ctx, t0, 0.4 * vol, 0.01, 0.85);
    o.connect(lp).connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + 0.9);
  },

  // Round lost (timeout / thieves): a heavy descending minor chord.
  lose(ctx, out, t0, vol) {
    [semis(0), semis(3), semis(7)].forEach((f) =>
      blip(ctx, out, t0, f, { type: "triangle", peak: 0.28 * vol, atk: 0.02, dec: 1.0, glideTo: f * 0.7 })
    );
  },

  // A treasure was stolen / cracked elsewhere: a short warning sting.
  alert(ctx, out, t0, vol) {
    blip(ctx, out, t0, semis(8), { type: "square", peak: 0.22 * vol, atk: 0.003, dec: 0.18 });
    blip(ctx, out, t0 + 0.12, semis(3), { type: "square", peak: 0.2 * vol, atk: 0.003, dec: 0.2 });
  },

  // Fox sniff (Q): a couple of airy noise puffs + a soft rising "yip".
  sniff(ctx, out, t0, vol) {
    for (let i = 0; i < 2; i++) {
      const t = t0 + i * 0.13;
      const n = noiseSource(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2600;
      bp.Q.value = 1.5;
      const g = env(ctx, t, 0.18 * vol, 0.01, 0.09);
      n.connect(bp).connect(g).connect(out);
      n.start(t);
      n.stop(t + 0.12);
    }
    blip(ctx, out, t0 + 0.26, 620, { type: "triangle", peak: 0.22 * vol, atk: 0.006, dec: 0.14, glideTo: 950 });
  },

  // Fox idle pant/huff — soft, occasional companion flavour.
  foxPant(ctx, out, t0, vol) {
    const n = noiseSource(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 1;
    const g = env(ctx, t0, 0.1 * vol, 0.02, 0.12);
    n.connect(bp).connect(g).connect(out);
    n.start(t0);
    n.stop(t0 + 0.16);
  },

  // Footfall: a short low thump + a dusty noise scuff. Quiet by design — it's a
  // texture under movement, not an event, so it never competes with gunfire.
  footstep(ctx, out, t0, vol) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(92, t0);
    o.frequency.exponentialRampToValueAtTime(52, t0 + 0.08);
    const og = env(ctx, t0, 0.28 * vol, 0.002, 0.07);
    o.connect(og).connect(out);
    o.start(t0);
    o.stop(t0 + 0.1);
    const n = noiseSource(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400 + Math.random() * 500; // slight scuff variation
    bp.Q.value = 0.8;
    const g = env(ctx, t0, 0.12 * vol, 0.001, 0.05);
    n.connect(bp).connect(g).connect(out);
    n.start(t0);
    n.stop(t0 + 0.07);
  },

  // UI click for the mute button.
  ui(ctx, out, t0, vol) {
    blip(ctx, out, t0, 660, { type: "square", peak: 0.16 * vol, atk: 0.001, dec: 0.05 });
  },
};

/** A single randomized distant bird chirp (2–3 quick high glides). */
export function birdChirp(ctx: AudioContext, out: AudioNode, t0: number, vol: number) {
  const n = 2 + Math.floor(Math.random() * 2);
  const base = 2200 + Math.random() * 1400;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * (0.06 + Math.random() * 0.05);
    const f = base * (0.9 + Math.random() * 0.3);
    blip(ctx, out, t, f, {
      type: "sine",
      peak: (0.05 + Math.random() * 0.05) * vol,
      atk: 0.006,
      dec: 0.05 + Math.random() * 0.04,
      glideTo: f * (1.1 + Math.random() * 0.3),
    });
  }
}

/**
 * One bar of the background loop — driving, not sleepy: a soft kick pulse on
 * every beat, a bass pluck on the strong beats, an eighth-note arpeggio of the
 * chord tones, and a quiet sustaining pad underneath for glue. Called once per
 * bar by the AudioBus scheduler.
 */
export function musicBar(ctx: AudioContext, out: AudioNode, t0: number, chord: number[], vol: number, barLen: number) {
  const beats = 4;
  const beat = barLen / beats;
  const root = chord[0] / 2;

  // Kick pulse each beat (accented on 1 and 3) — the pulse that was missing.
  for (let b = 0; b < beats; b++) {
    const t = t0 + b * beat;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = env(ctx, t, (b % 2 === 0 ? 0.5 : 0.26) * vol, 0.001, 0.14);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.18);
  }

  // Bass pluck on beats 1 and 3.
  [0, 2].forEach((b) =>
    blip(ctx, out, t0 + b * beat, root, { type: "sawtooth", peak: 0.24 * vol, atk: 0.004, dec: beat * 0.85 })
  );

  // Eighth-note arpeggio, rising into the upper octave through the bar.
  for (let i = 0; i < beats * 2; i++) {
    const f = chord[i % chord.length] * (i < beats ? 1 : 2);
    blip(ctx, out, t0 + i * (beat / 2), f, { type: "triangle", peak: 0.12 * vol, atk: 0.004, dec: beat * 0.5 });
  }

  // Quiet sustaining pad for glue.
  chord.forEach((f) => {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    o.detune.value = 4;
    const g = ctx.createGain();
    const peak = 0.05 * vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + barLen * 0.25);
    g.gain.linearRampToValueAtTime(0.0001, t0 + barLen);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + barLen + 0.05);
  });
}
