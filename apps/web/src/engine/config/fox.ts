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
}

const TABLE: { minBanked: number; name: string; scale: number; sniffCooldownMult: number }[] = [
  { minBanked: 0, name: "Kit", scale: 0.6, sniffCooldownMult: 1.0 },
  { minBanked: 100, name: "Young", scale: 0.74, sniffCooldownMult: 0.82 },
  { minBanked: 300, name: "Adult", scale: 0.87, sniffCooldownMult: 0.66 },
  { minBanked: 600, name: "Prime", scale: 1.0, sniffCooldownMult: 0.5 },
];

export const FOX_MAX_STAGE = TABLE.length - 1;

/** The fox's current growth, derived from how much VILLE has been banked. */
export function foxGrowthFor(villeBanked: number): FoxStage {
  let idx = 0;
  for (let i = 0; i < TABLE.length; i++) if (villeBanked >= TABLE[i].minBanked) idx = i;
  const s = TABLE[idx];
  return { stage: idx, name: s.name, scale: s.scale, sniffCooldownMult: s.sniffCooldownMult };
}

/** VILLE banked needed to reach the next stage (null if already at max). */
export function foxNextThreshold(villeBanked: number): number | null {
  for (const s of TABLE) if (villeBanked < s.minBanked) return s.minBanked;
  return null;
}
