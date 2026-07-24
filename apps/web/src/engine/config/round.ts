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
 * start + pathLength / speed. With starts of 5/60/95 at 2.2 m/s the three
 * arrivals fall around 32s / 89s / 122s — pressure is on-screen almost
 * immediately but still escalates instead of swarming.
 */
export const THIEF = {
  health: 3, // player hits to kill — fast and fragile
  speed: 2.2, // m/s along its path
  /** Seconds after round start when each thief spawns and sets off. */
  starts: [5, 60, 95],
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
} as const;
