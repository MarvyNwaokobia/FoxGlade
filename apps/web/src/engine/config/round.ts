/**
 * Round/session tuning — the difficulty dials.
 *
 * Everything that decides how hard a round is lives here (feel.ts owns movement/
 * camera feel). Retune by editing numbers, not by spelunking the NPC code.
 */

/** Hard timer (DESIGN §12: ~2-3 min run). */
export const SESSION_SECONDS = 150;

/**
 * Thieves race the real treasure along fixed paths (~59–63 m each). A thief
 * spawns the moment its start time hits, so arrivals land at roughly
 * start + pathLength / speed. With starts of 5/10/15 at 2.2 m/s the three
 * arrivals fall around 32s / 39s / 42s — the race is on from the opening
 * seconds and every thief must be dealt with.
 */
export const THIEF = {
  health: 3, // player hits to kill — fast and fragile
  speed: 2.2, // m/s along its path
  /** Seconds after round start when each thief spawns and sets off. */
  starts: [5, 10, 15],
} as const;

/**
 * Bombs (DESIGN §2.4): hold G to aim — a ground ring telegraphs exactly where
 * the blast lands — release to lob. Clears everything inside the radius, hurts
 * the player standing in it, and CRACKS the treasure (reduced rarity, §13.5)
 * rather than destroying the run.
 */
export const BOMB = {
  perRound: 2, // bombs carried per round (marketplace will sell more later, M4)
  throwSpeed: 16, // m/s launch speed (aim higher to lob farther, ~11m level)
  upBias: 0.45, // extra upward pitch mixed into the throw, so it arcs
  radius: 6, // blast radius (metres) — matches the telegraph ring
  enemyDamage: 3, // kills a full-health blocker or thief outright
  selfDamage: 35, // player health lost if caught inside the blast
  fuse: 3, // seconds before it detonates mid-air anyway (safety net)
} as const;

/**
 * Resting indoors (§14.2, revised by Marvy): stepping inside an enterable
 * house PAUSES the world — timer, thieves, blockers, projectiles all freeze.
 * Sit (X) to recover health, walk out to resume the hunt exactly where it was.
 */
export const REST = {
  regenPerSec: 7, // health recovered per second while sitting
} as const;

/** Placeholder loot values until VilleToken is live (per treasure rarity). */
export const LOOT = {
  rare: 300,
  common: 100,
  scrap: 25, // a cracked common
} as const;

/** Blockers: the armed NPCs contesting the route (DESIGN §2). */
export const BLOCKER = {
  health: 3, // player hits to kill
  moveSpeed: 2.4, // m/s when advancing/strafing
  aggroRange: 26, // starts pursuing within this distance
  engageRange: 20, // starts shooting within this distance
  rangeMax: 15, // farther than this → advance
  rangeMin: 7, // closer than this → back off (otherwise strafe)
  fireCooldown: 2.2, // seconds between shots
  projectileSpeed: 16, // m/s — slow enough to sidestep or break LOS
  shotDamage: 9, // player health lost per hit (player has 100)
  /** Aggro/engage ranges shrink to this fraction while the player is crouched. */
  crouchDetectionMult: 0.55,
} as const;
