/**
 * Fox growth (DESIGN §2.5 / §11): a persistent raise-it loop that survives across
 * runs. It pays off in gameplay: a matured fox is visibly bigger AND its sniff
 * cooldown drops, so raising it is a real reason to keep playing.
 *
 * Growth used to be DERIVED from lifetime VILLE banked — automatic, no choice
 * involved. It's now something you deliberately BUY at the Shop (see
 * FOX_GROW_STAGES below, spent from `owned` via the "fox_*" ids), same as a
 * weapon or a bag: banking loot earns the VILLE, but growing the fox is its own
 * decision, and it's the fox's, not the wallet's.
 *
 * When the on-chain PetNFT lands, its growth stage replaces `owned` as the
 * source here — the rest of the game reads foxGrowthFor(stage) unchanged.
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

/** Kit (stage 0) is free — where every fox starts. Every stage past it is a
 *  Shop purchase, `id` matching a SHOP_ITEMS entry (config/shop.ts), gated on
 *  owning the stage before it (store.ts buyItem enforces `requires`). */
const TABLE: {
  id: string | null;
  growCost: number; // VILLE to buy INTO this stage from the one before it
  name: string;
  scale: number;
  sniffCooldownMult: number;
  misreadChance: number;
}[] = [
  { id: null, growCost: 0, name: "Kit", scale: 0.6, sniffCooldownMult: 1.0, misreadChance: 0.45 },
  { id: "fox_young", growCost: 100, name: "Young", scale: 0.74, sniffCooldownMult: 0.82, misreadChance: 0.28 },
  { id: "fox_adult", growCost: 200, name: "Adult", scale: 0.87, sniffCooldownMult: 0.66, misreadChance: 0.12 },
  // Prime is never wrong. There has to be a top of this curve you can feel, and
  // "my fox is never wrong any more" is a better one than a slightly lower number.
  { id: "fox_prime", growCost: 300, name: "Prime", scale: 1.0, sniffCooldownMult: 0.5, misreadChance: 0 },
];

export const FOX_MAX_STAGE = TABLE.length - 1;

/** The Shop-facing side of the table — what store.ts/shop.ts need to sell each
 *  stage, without either of them reaching into fox.ts's internal TABLE shape. */
export const FOX_GROW_STAGES: { id: string; name: string; price: number; requires: string | null }[] =
  TABLE.filter((s): s is typeof TABLE[number] & { id: string } => s.id !== null).map((s, i, arr) => ({
    id: s.id,
    name: s.name,
    price: s.growCost,
    requires: i === 0 ? null : arr[i - 1].id,
  }));

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
  // Slowed across the board (Marvy: "the fox moves too fast"). It used to RUN at
  // 8.5 — faster than the player's own sprint (FEEL.runSpeed 7.5) — so at any
  // pace below a full sprint it shot around you like a wind-up toy rather than
  // keeping you company.
  //
  // Everyday pace is now well under yours, which is what you actually watch for
  // most of a run. It can still close a real gap: past `sprintRadius` the trot
  // scales up with how far behind it is (chaseGain, capped at chaseSpeed), so
  // being slow at heel never turns into being permanently lost.
  walkSpeed: 2.3,
  runSpeed: 6.4,
  /** Extra speed per metre of gap beyond `sprintRadius`, while catching up. */
  chaseGain: 0.07,
  /** Ceiling on that catch-up. Above the player's sprint, so it can always get
   *  back to you, but only ever while it's genuinely behind. */
  chaseSpeed: 8.2,
  accel: 7,
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
  // Still the quickest it moves — it's on an errand, and you're meant to hurry
  // after it — but no longer a blur you can't follow.
  scoutSpeed: 7.2,
  /** How close it needs to get to call it found. */
  scoutArriveDist: 2.2,
  /** Seconds it waits at the treasure, barking, before heading back. */
  scoutHoldTime: 6,
  /** Give up and come home if a scout takes longer than this (bad path, etc). */
  scoutTimeout: 22,

  // --- Attack: sent at a threat ---
  // The lunge stays the fastest thing it does — it's a charge, and it should
  // read as one — just no longer teleport-fast.
  attackSpeed: 8.6,
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

/** The fox's growth at a given stage index (clamped into range). */
export function foxGrowthFor(stage: number): FoxStage {
  const idx = Math.max(0, Math.min(FOX_MAX_STAGE, stage));
  const s = TABLE[idx];
  return {
    stage: idx,
    name: s.name,
    scale: s.scale,
    sniffCooldownMult: s.sniffCooldownMult,
    misreadChance: s.misreadChance,
  };
}

/** The fox's current stage, derived from which "fox_*" Shop items are owned. */
export function foxStageOf(owned: string[]): number {
  let stage = 0;
  for (let i = 1; i < TABLE.length; i++) {
    const id = TABLE[i].id;
    if (id && owned.includes(id)) stage = i;
  }
  return stage;
}

/** The next stage up for sale — null once the fox is already Prime. */
export function foxNextGrow(owned: string[]): { id: string; name: string; price: number } | null {
  const stage = foxStageOf(owned);
  const next = TABLE[stage + 1];
  return next?.id ? { id: next.id, name: next.name, price: next.growCost } : null;
}
