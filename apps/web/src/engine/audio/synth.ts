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


/**
 * A short speech-like utterance: a buzzing source shaped by two vowel formants,
 * gated into syllables with a pitch contour. Crude, but unmistakably "a person
 * said something", which is what the distractors need in order to lie out loud.
 */
function voiceLine(
  ctx: AudioContext,
  out: AudioNode,
  t0: number,
  vol: number,
  { syllables = 4, base = 150, rise = false }: { syllables?: number; base?: number; rise?: boolean } = {}
) {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  const gate = ctx.createGain();
  gate.gain.setValueAtTime(0, t0);

  // Two formants → a vowel-ish colour that shifts per syllable.
  const f1 = ctx.createBiquadFilter();
  f1.type = "bandpass";
  f1.Q.value = 6;
  const f2 = ctx.createBiquadFilter();
  f2.type = "bandpass";
  f2.Q.value = 8;
  const outGain = ctx.createGain();
  outGain.gain.value = vol * 0.5;

  osc.connect(gate).connect(f1).connect(f2).connect(outGain).connect(out);

  const SYL = 0.15;
  let t = t0;
  osc.frequency.setValueAtTime(base, t0);
  for (let i = 0; i < syllables; i++) {
    const open = t + 0.015;
    const close = t + SYL * 0.72;
    gate.gain.linearRampToValueAtTime(0.55, open);
    gate.gain.linearRampToValueAtTime(0.0, close);
    // Vowel wander: /a/-ish → /i/-ish → /o/-ish
    const v = i % 3;
    f1.frequency.setValueAtTime(v === 0 ? 700 : v === 1 ? 350 : 480, t);
    f2.frequency.setValueAtTime(v === 0 ? 1150 : v === 1 ? 2200 : 900, t);
    // Pitch contour — a hail rises, a statement settles.
    const p = base * (rise ? 1 + i * 0.09 : 1 - i * 0.035);
    osc.frequency.setValueAtTime(p, t);
    t += SYL;
  }
  osc.start(t0);
  osc.stop(t + 0.08);
}

/** Named one-shot recipes. `vol` is the pre-attenuated 0–1 loudness. */
/** Shared shape behind every footstep surface: a pitched body thump plus a
 *  filtered-noise scuff. Only the numbers change between surfaces. */
function step(
  ctx: AudioContext,
  out: AudioNode,
  t0: number,
  vol: number,
  s: {
    thump: number;
    thumpTo: number;
    thumpPeak: number;
    scuffHz: number;
    scuffQ: number;
    scuffPeak: number;
    scuffDec: number;
  }
) {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(s.thump, t0);
  o.frequency.exponentialRampToValueAtTime(s.thumpTo, t0 + 0.08);
  const og = env(ctx, t0, s.thumpPeak * vol, 0.002, 0.07);
  o.connect(og).connect(out);
  o.start(t0);
  o.stop(t0 + 0.1);

  const n = noiseSource(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = s.scuffHz * (0.9 + Math.random() * 0.2); // no two steps identical
  bp.Q.value = s.scuffQ;
  const g = env(ctx, t0, s.scuffPeak * vol, 0.001, s.scuffDec);
  n.connect(bp).connect(g).connect(out);
  n.start(t0);
  n.stop(t0 + s.scuffDec + 0.03);
}

export const SFX: Record<string, (ctx: AudioContext, out: AudioNode, t0: number, vol: number) => void> = {
  // Player rifle: a sharp high crack (the supersonic snap), a bright noise
  // body underneath it, and a short low thump. Real gunfire reads as
  // snap-THEN-boom — the crack used to be the same 900Hz-highpass layer as
  // the body, so there was only the boom; this adds the snap ahead of it.
  gunshot(ctx, out, t0, vol) {
    const crack = noiseSource(ctx);
    const chp = ctx.createBiquadFilter();
    chp.type = "highpass";
    chp.frequency.value = 3200;
    const cg = env(ctx, t0, 0.6 * vol, 0.0004, 0.018);
    crack.connect(chp).connect(cg).connect(out);
    crack.start(t0);
    crack.stop(t0 + 0.03);

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

  // A brighter, higher double-tick for a headshot — reads as "clean hit".
  headshot(ctx, out, t0, vol) {
    blip(ctx, out, t0, 1900, { type: "square", peak: 0.2 * vol, atk: 0.001, dec: 0.04, glideTo: 1400 });
    blip(ctx, out, t0 + 0.05, 2600, { type: "sine", peak: 0.16 * vol, atk: 0.001, dec: 0.06 });
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

  // Fox growl — a low rumbling warning when a threat is near (early-warning bark).
  // Placeholder for a real fox sample later (override by name, like the gun cues).
  foxGrowl(ctx, out, t0, vol) {
    const dur = 0.45;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(68, t0);
    o.frequency.linearRampToValueAtTime(52, t0 + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    lp.Q.value = 4;
    const g = env(ctx, t0, 0.42 * vol, 0.04, dur);
    o.connect(lp).connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    // breathy rasp on top
    const n = noiseSource(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 520;
    bp.Q.value = 1;
    const ng = env(ctx, t0, 0.12 * vol, 0.03, dur * 0.8);
    n.connect(bp).connect(ng).connect(out);
    n.start(t0);
    n.stop(t0 + dur);
  },

  // Fox whine/whimper — a plaintive descending yelp when the player is hurt.
  foxWhine(ctx, out, t0, vol) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(900, t0);
    o.frequency.exponentialRampToValueAtTime(500, t0 + 0.3);
    const g = env(ctx, t0, 0.22 * vol, 0.02, 0.3);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + 0.34);
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.setValueAtTime(1350, t0);
    o2.frequency.exponentialRampToValueAtTime(760, t0 + 0.3);
    const g2 = env(ctx, t0, 0.1 * vol, 0.02, 0.28);
    o2.connect(g2).connect(out);
    o2.start(t0);
    o2.stop(t0 + 0.32);
  },

  // Fox grew a stage — a bright, happy little rising double-yip.
  foxYip(ctx, out, t0, vol) {
    blip(ctx, out, t0, 720, { type: "triangle", peak: 0.26 * vol, atk: 0.005, dec: 0.12, glideTo: 1080 });
    blip(ctx, out, t0 + 0.12, 900, { type: "triangle", peak: 0.24 * vol, atk: 0.005, dec: 0.16, glideTo: 1500 });
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
  // Footsteps, per surface.
  //
  // There used to be exactly one step sound, so cobblestone, a wooden floor and
  // open grass all landed identically — and the surface under your feet is one of
  // the cheapest, strongest signals a game has for "you have moved somewhere
  // else". Each recipe is the same two-part shape (a body thump plus a scuff)
  // with the weight, pitch and brightness moved: stone is hard and bright, wood
  // is hollow and boxy, grass is soft and almost all scuff.
  footstep(ctx, out, t0, vol) {
    step(ctx, out, t0, vol, { thump: 92, thumpTo: 52, thumpPeak: 0.28, scuffHz: 2400, scuffQ: 0.8, scuffPeak: 0.12, scuffDec: 0.05 });
  },
  footstepStone(ctx, out, t0, vol) {
    step(ctx, out, t0, vol, { thump: 104, thumpTo: 58, thumpPeak: 0.26, scuffHz: 3100, scuffQ: 1.1, scuffPeak: 0.16, scuffDec: 0.045 });
  },
  footstepWood(ctx, out, t0, vol) {
    // A boxy resonance instead of a bright scuff — a floorboard, not a flagstone.
    step(ctx, out, t0, vol, { thump: 128, thumpTo: 74, thumpPeak: 0.32, scuffHz: 620, scuffQ: 3.4, scuffPeak: 0.14, scuffDec: 0.09 });
  },
  footstepGrass(ctx, out, t0, vol) {
    step(ctx, out, t0, vol, { thump: 74, thumpTo: 46, thumpPeak: 0.11, scuffHz: 1750, scuffQ: 0.5, scuffPeak: 0.17, scuffDec: 0.085 });
  },

  // Enemy spots you — a short vocal-ish shout ("hey!"): two detuned saws swept up
  // through a moving formant band. A placeholder for a real voice bark later (the
  // AudioBus will override it with a sample of the same name, like the gun cues).
  spot(ctx, out, t0, vol) {
    for (const f0 of [172, 178]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f0 * 0.82, t0);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.35, t0 + 0.13);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(650, t0);
      bp.frequency.exponentialRampToValueAtTime(1600, t0 + 0.13);
      bp.Q.value = 5;
      const g = env(ctx, t0, 0.5 * vol, 0.006, 0.17);
      o.connect(bp).connect(g).connect(out);
      o.start(t0);
      o.stop(t0 + 0.24);
    }
  },

  // ── The thief race ────────────────────────────────────────────────────────
  //
  // The most dramatic system in the game was happening off-screen: a thief walked
  // in from a wall, pathed to a nook you might be nowhere near, and either got
  // away or didn't. The only feedback was a compass blip and a toast. These two
  // cues are what turn it into an event you can hear coming and act on.

  // A thief has reached the treasure and started its GRAB — a scrape of stone and
  // a rising scrabble. This is the 1.1s window in which you can still stop it,
  // and a window you can't perceive isn't counterplay, it's a dice roll.
  thiefGrab(ctx, out, t0, vol) {
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(420, t0);
    bp.frequency.exponentialRampToValueAtTime(2100, t0 + 0.42);
    bp.Q.value = 3.5;
    const g = env(ctx, t0, 0.55 * vol, 0.01, 0.44);
    noise.connect(bp).connect(g).connect(out);
    noise.start(t0);
    noise.stop(t0 + 0.5);
  },

  // It has the prize and it is RUNNING — a jeering two-note whistle. Deliberately
  // the most piercing thing in the mix: this is your last chance to chase, and
  // "I just lost a rare treasure" should never be indistinguishable from silence.
  thiefFlee(ctx, out, t0, vol) {
    const notes: [number, number, number][] = [
      [880, 0, 0.16],
      [1320, 0.14, 0.3],
    ];
    for (const [f, at, dur] of notes) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(f * 0.94, t0 + at);
      o.frequency.exponentialRampToValueAtTime(f, t0 + at + 0.05);
      const g = env(ctx, t0 + at, 0.42 * vol, 0.008, dur);
      o.connect(g).connect(out);
      o.start(t0 + at);
      o.stop(t0 + at + dur + 0.05);
    }
  },

  // UI click for the mute button.

  // ── Village voices ────────────────────────────────────────────────────────
  //
  // The distractors' whole mechanic is that they LIE to you, and until now they
  // did it in silent CSS text — the deception was the quietest thing in the game.
  // These are "programmer voice": a couple of bandpass formants over a buzzing
  // saw, gated into syllables, with a pitch contour. It is not language, but the
  // ear reads it as a person calling out, which is all it has to do until real
  // recordings land.
  villagerHail(ctx, out, t0, vol) {
    voiceLine(ctx, out, t0, vol, { syllables: 2, base: 165, rise: true });
  },
  villagerLine(ctx, out, t0, vol) {
    voiceLine(ctx, out, t0, vol, { syllables: 4 + Math.floor(Math.random() * 3), base: 150 });
  },
  merchantGreet(ctx, out, t0, vol) {
    voiceLine(ctx, out, t0, vol, { syllables: 3, base: 120, rise: true });
  },

  // ── Village life: it should sound inhabited, not abandoned ────────────────
  hammer(ctx, out, t0, vol) {
    for (let i = 0; i < 3; i++) {
      const t = t0 + i * 0.42;
      const n = noiseSource(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2400;
      bp.Q.value = 2;
      const g = env(ctx, t, 0.32 * vol, 0.001, 0.07);
      n.connect(bp).connect(g).connect(out);
      n.start(t);
      n.stop(t + 0.1);
      blip(ctx, out, t, 320, { type: "triangle", peak: 0.16 * vol, atk: 0.001, dec: 0.06, glideTo: 180 });
    }
  },
  dogBark(ctx, out, t0, vol) {
    for (let i = 0; i < 2; i++) {
      const t = t0 + i * 0.28;
      blip(ctx, out, t, 300, { type: "sawtooth", peak: 0.3 * vol, atk: 0.004, dec: 0.14, glideTo: 150 });
      const n = noiseSource(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900;
      const g = env(ctx, t, 0.18 * vol, 0.004, 0.12);
      n.connect(bp).connect(g).connect(out);
      n.start(t);
      n.stop(t + 0.18);
    }
  },
  chatter(ctx, out, t0, vol) {
    // Two voices overlapping at low level — the murmur of a street you can't see.
    voiceLine(ctx, out, t0, vol * 0.5, { syllables: 5, base: 140 });
    voiceLine(ctx, out, t0 + 0.35, vol * 0.4, { syllables: 4, base: 190 });
  },
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
