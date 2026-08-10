/**
 * Fox growth (DESIGN §2.5 / §11): the fox matures as you BANK loot — a persistent
 * raise-it loop that survives across runs. Growth is DERIVED from villeBanked (not
 * ticked), and it pays off in gameplay: a matured fox is visibly bigger AND its
 * sniff cooldown drops, so raising it is a real reason to bank treasure.
 *
 * When the on-chain PetNFT lands, its growth stage replaces villeBanked as the
 * source here — the rest of the game reads foxGrowthFor() unchanged.
 */
export interface FoxStage {
  stage: number; // 0..FOX_MAX_STAGE
  name: string;
  scale: number; // rendered size (1 = full adult)
  sniffCooldownMult: number; // multiplies SNIFF_COOLDOWN (lower = sniffs more often)
  /** Chance a scout goes to the WRONG nook — the fox's judgement, not its speed.
   *
   *  This is the growth curve that matters. A shorter cooldown is a number; a kit
   *  that trots off confidently to a decoy and digs at nothing is a character,
   *  and the run where you finally stop double-checking it is the payoff the
   *  whole raise-it loop was supposed to have. Familiarity with a nook cuts this
   *  further (see fox/foxMemory.ts) so growth is felt as "it knows this village"
   *  rather than as a percentage. */
  misreadChance: number;
}

const TABLE: {
  minBanked: number;
  name: string;
  scale: number;
  sniffCooldownMult: number;
  misreadChance: number;
}[] = [
  { minBanked: 0, name: "Kit", scale: 0.6, sniffCooldownMult: 1.0, misreadChance: 0.45 },
  { minBanked: 100, name: "Young", scale: 0.74, sniffCooldownMult: 0.82, misreadChance: 0.28 },
  { minBanked: 300, name: "Adult", scale: 0.87, sniffCooldownMult: 0.66, misreadChance: 0.12 },
  // Prime is never wrong. There has to be a top of this curve you can feel, and
  // "my fox is never wrong any more" is a better one than a slightly lower number.
  { minBanked: 600, name: "Prime", scale: 1.0, sniffCooldownMult: 0.5, misreadChance: 0 },
];

export const FOX_MAX_STAGE = TABLE.length - 1;

/**
 * Fox BEHAVIOUR (Phase 3). The fox used to be a lerp to a fixed point beside the
 * player — welded to a spot in space, never lagging, never leading, with a "sniff"
 * that just recoloured two HUD dots. It was a decoration on a leash.
 *
 * It's now a creature with its own brain: it keeps loose station rather than
 * perfect station, it can be SENT — to scout a treasure or to jump a threat — and
 * it can be hurt. That's what turns it from a cosmetic companion into the thing
 * you actually rely on, which is what the whole raise-it loop is for.
 */
export const FOX = {
  // --- Heel (following you) ---
  /** How far it can drift before it bothers catching up. Station-keeping with a
   *  radius, not a point: this is what lets it lag, cut corners and catch up. */
  followRadius: 2.6,
  /** Far enough away and it breaks into a run to close the gap. */
  sprintRadius: 7,
  /** Beyond this it has genuinely lost you — teleports back (a stuck fox is
   *  worse than a briefly-implausible one). */
  leashRadius: 34,
  walkSpeed: 3.2,
  runSpeed: 8.5,
  accel: 9,
  /** Metres to the side of the player it prefers to walk. Negative = the player's
   *  LEFT, deliberately opposite the camera's over-the-shoulder offset — on the
   *  same side it sat directly under the camera and was cropped off-screen. */
  sideOffset: -0.95,
  /** How far ahead it likes to be. It LEADS: a companion you follow reads as
   *  alive, one that trails behind you is furniture. */
  leadOffset: 1.6,
  /** …except where it watched you go down. Within this range of a remembered
   *  danger it stops leading and tucks in behind you instead. */
  waryRange: 9,
  waryLagOffset: 1.1,

  // --- Idle flavour (only when you're standing still) ---
  /** Seconds of you standing still before it wanders off to nose at something. */
  idleWanderAfter: 3.5,
  idleWanderRadius: 4.5,

  // --- Scout: sent to find the real treasure ---
  scoutSpeed: 9.5,
  /** How close it needs to get to call it found. */
  scoutArriveDist: 2.2,
  /** Seconds it waits at the treasure, barking, before heading back. */
  scoutHoldTime: 6,
  /** Give up and come home if a scout takes longer than this (bad path, etc). */
  scoutTimeout: 22,

  // --- Attack: sent at a threat ---
  attackSpeed: 11,
  /** Range from the player within which a threat can be assigned. */
  attackAcquireRange: 18,
  /** How close it must get to land the lunge. */
  attackReachDist: 1.5,
  /** Seconds a lunged blocker is staggered — it can't fire and its telegraph is
   *  cancelled. The fox buys you a window; it does not do your killing. */
  staggerBlocker: 2.6,
  /** Fraction of normal speed a lunged thief moves at, and for how long. The fox
   *  earning its keep against the clock. */
  slowThief: 0.35,
  slowThiefTime: 4,

  // --- Cost + risk ---
  /** Base seconds between commands (scout or attack). Scaled by the growth
   *  stage's sniffCooldownMult, so raising the fox really does buy you more of it. */
  commandCooldown: 16,
  /** Enemy fire can hit the fox. It never dies — it goes down, whimpering, and
   *  you lose it for this long. That's the stake. */
  hitRadius: 0.5,
  downTime: 18,
} as const;

/** The fox's current growth, derived from how much VILLE has been banked. */
export function foxGrowthFor(villeBanked: number): FoxStage {
  let idx = 0;
  for (let i = 0; i < TABLE.length; i++) if (villeBanked >= TABLE[i].minBanked) idx = i;
  const s = TABLE[idx];
  return {
    stage: idx,
    name: s.name,
    scale: s.scale,
    sniffCooldownMult: s.sniffCooldownMult,
    misreadChance: s.misreadChance,
  };
}

/** VILLE banked needed to reach the next stage (null if already at max). */
export function foxNextThreshold(villeBanked: number): number | null {
  for (const s of TABLE) if (villeBanked < s.minBanked) return s.minBanked;
  return null;
}
