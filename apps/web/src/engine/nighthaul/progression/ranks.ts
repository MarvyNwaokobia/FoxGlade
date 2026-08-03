/**
 * @module nighthaul/progression/ranks
 * @description Rank ladder and XP costs, ported from Valor.
 *
 * Valor keeps these in `lib/constants.ts` alongside its Celo chain addresses and
 * GoodDollar wiring. Only the progression half comes across: the ladder is
 * gameplay and ports cleanly, the chain layer is Valor's economy and Nighthaul's
 * is a different one (owned gear, raid scrip, wipe seasons — see the pivot note).
 *
 * The XP costs are PROGRESSIVE rather than flat, which was a deliberate fix in
 * Valor: at a flat cost, a full campaign played perfectly could not buy a single
 * rank. Early ranks stay cheap because they carry retention; the top stays
 * expensive because it carries prestige.
 *
 * The per-rank G$ payout table is deliberately NOT ported — that is Valor's
 * GoodDollar economy, and `gReward` in xp.ts is left keyed off rank so Nighthaul
 * can substitute its own currency without touching the ladder.
 */

export const RANKS = ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Emerald", "Diamond"] as const;
export type Rank = (typeof RANKS)[number];

/** XP to REACH each rank — the bar you fill while sitting at the rank below. */
export const RANK_STEP_XP: Record<Rank, number> = {
  Iron: 0, // the floor — never reached via a rank-up
  Bronze: 400,
  Silver: 900,
  Gold: 1300,
  Platinum: 2500,
  Emerald: 4500,
  Diamond: 8000,
};

/** Past the top rank every prestige costs this, forever (uncapped). */
export const PRESTIGE_STEP_XP = 8000;

/**
 * Currency paid for REACHING a rank, growing with the climb. Kept as a table so
 * the shape of Valor's reward curve survives the port; Nighthaul decides what
 * the unit actually is.
 */
export const RANK_REWARD: Record<Rank, number> = {
  Iron: 500, // unused (you start here)
  Bronze: 500,
  Silver: 1000,
  Gold: 1500,
  Platinum: 2000,
  Emerald: 2500,
  Diamond: 3000,
};

/** Size of the XP bar for a player currently AT `rank` — what they must fill to advance. */
export function xpForNextRank(rank: Rank): number {
  const next = RANKS[RANKS.indexOf(rank) + 1];
  return next ? RANK_STEP_XP[next] : PRESTIGE_STEP_XP;
}
