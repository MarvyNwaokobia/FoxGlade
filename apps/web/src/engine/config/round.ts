/**
 * Round/session tuning — the difficulty dials.
 *
 * Everything that decides how hard a round is lives here (feel.ts owns movement/
 * camera feel). Retune by editing numbers, not by spelunking the NPC code.
 */

/** Retired. The run is now paced by the DAY (config/day.ts) — banking a treasure
 *  pushes the sun along — rather than a countdown. Kept only so nothing that
 *  still imports it breaks; delete once nothing does. */
export const SESSION_SECONDS = 150;

/**
 * The player's rifle. Body hit = one "hit" (enemies have 2–3 health); a HEADSHOT
 * counts double, and damage falls off with range so closing the distance matters.
 */
export const GUN = {
  damage: 1, // body hit at close range
  headshotMult: 2, // a head hit counts double — rewards aim
  range: 70, // max hitscan reach (metres)
  falloffStart: 16, // full damage within this range
  falloffEnd: 46, // ...tapering to falloffMin by here
  falloffMin: 0.5, // fraction of damage at/beyond falloffEnd
} as const;

/**
 * Thieves hunt the real treasure: they locate it themselves and A* to it, so
 * arrival times depend on where the board reseeded rather than a fixed script.
 * Fast and fragile — three hits kills one, and killing a CARRIER drops the
 * treasure back on the board, so a courier is worth chasing.
 */
export const THIEF = {
  health: 3, // player hits to kill — fast and fragile
  speed: 3.1, // m/s cruising toward the treasure
  /** Speed multiplier while panicking (recently shot at). A racer that doesn't
   *  react to gunfire reads as scenery; this is what makes shooting at one and
   *  missing actually cost you something. */
  panicMult: 1.55,
  /** Seconds after round start when each thief spawns and sets off. */
  starts: [5, 10, 15],
  /** How many can be in the village at once. */
  maxLive: 3,
  /**
   * Seconds between reinforcements once the race is on.
   *
   * The race used to be a fifteen-second burst and then nothing: three thieves
   * launched at +5/+10/+15s from the moment Dusk began, and once each had died
   * or escaped they never came back — the components returned null and stayed
   * that way until the next run. Chapter 4 (Night) added no more, because the
   * same three instances simply persisted. So the entire thief content of a run
   * was over twenty seconds into Dusk, and everything after that was a quiet
   * walk. Now they keep coming for as long as there's light left to lose.
   */
  respawnDelay: 22,
  /** …and they arrive faster at Night, when the pressure should be at its worst. */
  respawnDelayNight: 14,
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
  /** Wind-up before the bomb actually leaves the hand — the throw clip cocks
   *  back, then releases at this point, so the lob (and its whoosh) sync to the
   *  arm's forward swing instead of firing at wind-up. Tune to the clip's release. */
  windup: 0.38,
} as const;

/**
 * Resting indoors (§14.2) — the SAFE ROOM.
 *
 * Stepping through a doorway stops the world for you: nothing can shoot you, the
 * round clock holds, and the thieves stop where they are. You're not punished for
 * taking a breather. In exchange you can't shoot or throw from in there either
 * (PlayerController enforces that half), so it's a rest stop, not a pillbox.
 *
 * What keeps this from being strictly dominant is that healing is a LIMITED
 * RESOURCE, not a free regen. You get `charges` restores per run; each one heals
 * you up to `healCap` and then it's gone. So the decision isn't "should I rest"
 * (obviously yes, it's free) — it's "is this worth one of my two restores, or do
 * I push on and save it". That's the trade, and it's a resource trade rather than
 * a time penalty, which suits a long-running session far better.
 *
 * Charges are per-run for now; the marketplace will sell refills (Phase 5), which
 * is what turns this into a real VILLE sink.
 */
export const REST = {
  regenPerSec: 22, // health recovered per second while restoring (paused world → fast)
  /** Restores available per run. The marketplace will sell more later. */
  charges: 2,
  /** A restore only brings you UP TO this fraction of max health — topping off to
   *  100% for free would make the charge count meaningless at high health. */
  healCap: 0.7,
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
  moveSpeed: 3.3, // m/s when advancing/strafing
  aggroRange: 26, // starts pursuing within this distance
  engageRange: 20, // starts shooting within this distance
  // The fighting band. Tightened from 4–9m: a 5m-wide band left them circling for
  // most of an engagement instead of pressuring you.
  rangeMax: 7, // farther than this → advance
  rangeMin: 5, // closer than this → back off (between the two: close, with lateral drift)
  fireCooldown: 2.2, // seconds between shots
  // Faster than the old 16 m/s. That was slow enough to sidestep the round in
  // flight, which is why it read as a drifting ball rather than gunfire — and it
  // isn't needed any more: the 0.45s telegraph before each shot IS the dodge
  // window now, so the round itself can move like a round.
  projectileSpeed: 34, // m/s
  shotDamage: 9, // player health lost per hit (player has 100)
  /** Aggro/engage ranges shrink to this fraction while the player is crouched. */
  crouchDetectionMult: 0.55,
  // --- Awareness (idle → alert → engaged) ---
  /** Gunfire within this range wakes an idle blocker even with no line of sight. */
  hearRange: 24,
  /** Reaction beat between spotting you (a bark + "!") and opening fire. */
  alertTime: 0.5,
  /** Seconds out of sight + beyond aggro before an engaged blocker gives up → idle. */
  loseSightTime: 3.5,
  /** Aim beat before each shot, with a visible beam drawn to the target. Without
   *  this, shots arrive with no warning from off-screen and dying feels arbitrary
   *  — this is the window you get to break line of sight, sidestep, or shoot first. */
  telegraphTime: 0.45,
  /** Minimum seconds before a blocker can fire again after being hit. Landing a
   *  shot staggers it and cancels a telegraphed shot, so shooting first pays. */
  hitStagger: 0.7,
  // --- Breaching (indoors is cover, not sanctuary) ---
  /** Seconds an engaged blocker will stand outside, having lost sight of a player
   *  it knows went indoors, before it routes in through the door.
   *
   *  This number IS the value of a house. Too short and ducking inside buys
   *  nothing; too long and it's the old pause button with a countdown on it.
   *  ~5s is enough to break a telegraph, reload, and decide — not enough to camp. */
  breachDelay: 5,
  /** Seconds between route recalculations while breaching. */
  breachRepath: 0.9,
  /** Beyond this it won't bother coming in after you — it lost you properly. */
  breachRange: 30,
  /** Does it stand still while lining up a shot? Overridden per role below. */
  holdsGround: false,
} as const;

/**
 * Blocker ROLES.
 *
 * Every blocker used to be the same man: same 26m aggro, same 5–7m band, same
 * 2.2s cadence, same 3 health. Fighting three was fighting one, three times —
 * no reason to prioritise a target, no formation, no shape to a group. The
 * difficulty curve was "more identical men", which is not a curve.
 *
 * These are overrides on BLOCKER, so the shared code above is unchanged and the
 * two roles are a table, not a second AI. They're built to demand opposite
 * things from the player:
 *
 *  · RUSHER — fast, fragile, short telegraph, closes to knife range and never
 *    stops moving. Punishes standing still and reloading. You back off, or you
 *    dodge through it, or you kill it before it arrives.
 *  · HOLDER — slow, tanky, hits hard, and posts up at 12–18m with a long,
 *    readable wind-up that it takes STANDING STILL. Trading shots with one in
 *    the open loses; the answer is to break line of sight or close the distance.
 *
 * Put both in a group and you finally have to choose who dies first — the
 * rusher in your face or the holder chipping you from down the street.
 */
export type BlockerRole = "rusher" | "holder";

/**
 * BLOCKER's stat shape with the literal types widened. `as const` above is what
 * makes the shared defaults readable at a glance, but it also types `health` as
 * exactly `3` — so a role saying `health: 2` is a type error rather than an
 * override. This mapping keeps the documentation value and allows the tuning.
 */
export type BlockerStats = {
  -readonly [K in keyof typeof BLOCKER]: (typeof BLOCKER)[K] extends boolean ? boolean : number;
};

export const BLOCKER_ROLES: Record<BlockerRole, Partial<BlockerStats>> = {
  rusher: {
    health: 2,
    moveSpeed: 4.2, // faster than your walk (3.4), slower than your sprint (7.5)
    aggroRange: 30,
    engageRange: 13,
    rangeMin: 2.2,
    rangeMax: 5,
    fireCooldown: 1.5,
    shotDamage: 7,
    telegraphTime: 0.32, // barely a beat — this one is a pressure source
    holdsGround: false,
  },
  holder: {
    health: 4,
    moveSpeed: 2.4,
    aggroRange: 34,
    engageRange: 26,
    rangeMin: 12,
    rangeMax: 18,
    fireCooldown: 2.9,
    shotDamage: 14, // a real bite: you cannot ignore one and keep walking
    telegraphTime: 0.62, // long and legible — this one you can read and beat
    holdsGround: true, // plants its feet to shoot, so it's killable while aiming
  },
};

/** The resolved stat block for a role: shared defaults, then its overrides. */
export function blockerStats(role: BlockerRole): BlockerStats {
  return { ...BLOCKER, ...BLOCKER_ROLES[role] } as BlockerStats;
}
