/**
 * The village's weathering palette (DESIGN §14.10 slice 4) — pulled out of
 * Buildings3D.tsx (a "use client" R3F component, unimportable from a plain
 * node test) so the day-indexing math is unit-testable on its own.
 *
 * Subtle multipliers on top of the real PBR textures — variation, not
 * recolouring (neutral / whitewashed cream / cool grey stone / sandy timber /
 * mossy / dusty rose).
 */
export const TINTS = [0xffffff, 0xe9ddc4, 0xc7cad2, 0xdcc9a6, 0xc2c8b2, 0xd6c4bd];

/**
 * Per-day tint index. Every building's model `seed` gets this added before
 * landing on a TINTS entry, so the whole street's weathering — and, via the
 * same index, the ground/wall/roof/timber materials in VillageMesh's
 * `useVillageMaterials` — reshuffles day to day without moving a single wall.
 *
 * `day 1` resolves to index 0 (the neutral 0xffffff tint, i.e. today's
 * established baseline look) so the very first day is untouched; day 2 onward
 * is where it varies.
 */
export function dayTintIndex(day: number): number {
  return (((day - 1) % TINTS.length) + TINTS.length) % TINTS.length;
}
