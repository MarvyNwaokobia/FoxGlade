/**
 * Audio mix + cadence dials. Like feel.ts / round.ts, everything tunable about
 * how the game SOUNDS lives here — retune by editing numbers, not by spelunking
 * the synth code.
 *
 * v1 audio is procedural ("programmer audio"): the engine synthesizes every cue
 * with the Web Audio API (no files, no dependency, negligible cost). Organic
 * cues (birdsong, fox) are the ones a later slice swaps for real CC0 recordings.
 */
export const AUDIO = {
  /** Bus volumes (0–1). master scales everything; the three sub-buses balance. */
  master: 0.85,
  sfx: 0.9,
  ambient: 0.4,
  music: 0.32,

  /** Enemy gunfire attenuation: full volume within `nearDist`, silent past `farDist`. */
  enemyGunNear: 8,
  enemyGunFar: 55,
  /** Bomb blast attenuation (metres). */
  blastNear: 6,
  blastFar: 70,

  /** Indoors the world is paused — muffle ambient + music to this fraction. */
  indoorDuck: 0.35,

  /** Reaction delay before the pain grunt after a hit registers (seconds). The
   *  projectile's travel already separates the enemy's shot from the impact;
   *  this adds a human reaction beat on top so the grunt reads as a REACTION to
   *  being hit, never simultaneous with the muzzle report (and never masked by it). */
  hurtDelay: 0.13,

  /** Whether a light background music loop plays. */
  music_on: true,
} as const;
