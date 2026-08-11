/**
 * The run: one night, held until dawn.
 *
 * All of the pacing lives here as plain numbers and pure functions, with no
 * renderer and no React, because pacing is the part of a survivor-like that has
 * to be retuned twenty times and judged by feel. Everything a playtest would
 * want to twist is a constant in NIGHTS.
 */

export const NIGHTS = {
  /** Seconds from full dark to dawn. Survive it and you have won the night. */
  runSeconds: 900,

  // --- the player ---
  maxHp: 100,
  /** Fast enough to escape a wall, slow enough that turning costs you. At 3.3x
   *  the walkers' speed you could kite forever without ever being touched, which
   *  is a treadmill rather than a game. Roughly 2x is the band where the crowd
   *  closes the moment you change your mind. */
  moveSpeed: 4.6,
  /** Seconds between shots. The gun fires itself; positioning is the skill.
   *  The opening has to out-kill the opening spawn rate by a wide margin, or the
   *  first minute is a death spiral before the player has any say in it. */
  fireInterval: 0.25,
  fireRange: 13,
  fireDamage: 1,
  /** Contact damage, and how often a walker can land it. */
  touchDamage: 6,
  touchInterval: 0.85,
  touchRange: 0.95,
  /** Seconds of mercy after a hit, so a crowd can't delete you in one frame. */
  invulnAfterHit: 0.45,

  // --- the lantern ---
  /**
   * How far you can see.
   *
   * The first pass had this at 14 with almost no ambient, and the result was a
   * black screen with a keyhole in it: sixty walkers alive and six of them
   * visible. The dark is supposed to be the EDGE of what you can see, the place
   * things loom out of. It is not supposed to be everything. The light has to
   * comfortably cover the ground you are fighting over.
   */
  lightRadius: 21,
  lightPerLevel: 0.55,

  // --- pickups ---
  /** Walk this close and motes come to you. */
  pickupRadius: 1.6,
  /** Wide on purpose. Motes were piling up in the wake of a kiting player and
   *  simply never being collected, which starved the level cadence that the
   *  whole dopamine loop runs on. */
  magnetRadius: 7,
  magnetSpeed: 14,

  // --- the arena ---
  /** Small enough that a crowd is a wall rather than a thing you jog around. */
  half: 26,
  /** Just past the lantern's reach. Any further and they spend their first
   *  seconds walking through empty dark off-screen, and the crowd never gets to
   *  be a crowd. */
  spawnRing: 17,
} as const;

/** XP needed to go from `level` to the next. Cheap early, then a long climb. */
export function xpForLevel(level: number): number {
  return Math.round(5 + level * 4 + level * level * 0.55);
}

export interface WaveSpec {
  /** Walkers per second arriving right now. */
  rate: number;
  /** Health each one spawns with. */
  hp: number;
  /** Metres per second. */
  speed: number;
}

/**
 * What the night is throwing at you `t` seconds in.
 *
 * The curve matters more than any single number: it has to start thin enough
 * that the first minute is quiet, and end thick enough that the last one is a
 * wall. Health rises much more slowly than count, because the fantasy is mowing
 * through a tide, not chipping at bullet sponges.
 */
export function waveSpec(t: number): WaveSpec {
  const m = t / 60;
  return {
    // Deliberately far steeper than the base gun can answer. An earlier curve
    // sat at roughly the starting kill rate, so the population hovered near
    // twenty and the screen never filled — which loses the entire point of the
    // genre, where the crowd IS the spectacle and the pressure. Spawning has to
    // outrun a lone starting weapon by a wide margin; closing that gap is what
    // the upgrade draft is FOR, and the run should end when you fail to.
    rate: 2.6 + m * 4.2 + m * m * 1.6,
    hp: 1 + Math.floor(m / 2),
    speed: 3.4 + Math.min(1.5, m * 0.08),
  };
}

export interface RunState {
  /** Seconds survived. */
  t: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpToNext: number;
  kills: number;
  /** Set when hp hits zero, or when the run reaches dawn. */
  over: boolean;
  won: boolean;
  /** Pending level-ups the UI still has to offer a draft for. */
  pendingLevels: number;
}

export function newRun(): RunState {
  return {
    t: 0,
    hp: NIGHTS.maxHp,
    maxHp: NIGHTS.maxHp,
    level: 1,
    xp: 0,
    xpToNext: xpForLevel(1),
    kills: 0,
    over: false,
    won: false,
    pendingLevels: 0,
  };
}

/** Award XP, rolling over as many levels as it covers. */
export function addXp(r: RunState, amount: number): void {
  if (r.over) return;
  r.xp += amount;
  while (r.xp >= r.xpToNext) {
    r.xp -= r.xpToNext;
    r.level++;
    r.pendingLevels++;
    r.xpToNext = xpForLevel(r.level);
  }
}

/** Apply damage. Returns true if this was the killing blow. */
export function hurt(r: RunState, amount: number): boolean {
  if (r.over) return false;
  r.hp = Math.max(0, r.hp - amount);
  if (r.hp <= 0) {
    r.over = true;
    r.won = false;
    return true;
  }
  return false;
}

/** Advance the clock. Reaching dawn ends the run as a win. */
export function tick(r: RunState, dt: number): void {
  if (r.over) return;
  r.t += dt;
  if (r.t >= NIGHTS.runSeconds) {
    r.t = NIGHTS.runSeconds;
    r.over = true;
    r.won = true;
  }
}

/** 0 at dusk, 1 at dawn. Drives the sky, which IS the progress bar. */
export function dawnProgress(r: RunState): number {
  return Math.min(1, r.t / NIGHTS.runSeconds);
}

/** mm:ss for the HUD. */
export function clock(t: number): string {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
