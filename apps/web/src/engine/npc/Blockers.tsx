"use client";

import { Blocker } from "./Blocker";
import { useGame } from "@/engine/store";
import type { BlockerRole } from "@/engine/config/round";

/**
 * Blocker spawn points, placed in the chokepoints of the organic layout so
 * every route to a treasure is contested. Each spot belongs to one CHAPTER
 * (day.ts) — two per active combat phase (Morning, Afternoon, Dusk, Night;
 * Dawn stays empty) — so blockers are a fixed presence you actually meet
 * during that stretch of the day, not a pile that keeps growing on top of
 * the last phase's (Marvy's call, 2026-08-14: the old cumulative ramp meant
 * a day that ended mid-Afternoon — which most low-quota days did — never
 * showed you anything past Morning's five in practice).
 */
const BLOCKER_SPAWNS: { at: [number, number, number]; role: BlockerRole; chapter: number }[] = [
  // Role is matched to the ground each one holds. A rusher wants a space it can
  // cross; a holder wants a sightline down a street, which is exactly what makes
  // the long approaches dangerous to walk in a straight line.

  // Morning (chapter 1) — the first combat a player meets, close to the start.
  { at: [3, 0, 10], role: "rusher", chapter: 1 }, // past the gate corridor (deep enough not to camp the spawn)
  { at: [0, 0, -2], role: "holder", chapter: 1 }, // central crossroads — long sightlines both ways

  // Afternoon (chapter 2) — the market and courtyard routes open up.
  { at: [-11, 0, 18], role: "rusher", chapter: 2 }, // guards the market-gate approach (outside the safe walls)
  { at: [17.5, 0, -12], role: "holder", chapter: 2 }, // shallow-treasure courtyard approach

  // Dusk (chapter 3) — deeper, less-obvious routes as thieves join the hunt.
  { at: [18, 0, -3], role: "holder", chapter: 3 }, // gap between the central weave and the east courtyard
  { at: [-17, 0, -13], role: "rusher", chapter: 3 }, // west approach into the deep-north cluster, from the bank side

  // Night (chapter 4) — the two hardest posts, both guarding the rare nook.
  { at: [-7, 0, -25], role: "rusher", chapter: 4 }, // deep corridor guarding the rare nook
  { at: [6, 0, -20], role: "holder", chapter: 4 }, // east-side approach to the rare nook — mirrors the west one above
];

/**
 * Which blockers are awake is a straight match to the current CHAPTER — each
 * phase fields its own pair, not last phase's roster plus more piled on top.
 * Dawn (chapter 0) matches nothing, so it stays the one guaranteed breather.
 */
export function Blockers() {
  const chapter = useGame((s) => s.chapter);
  return (
    <>
      {BLOCKER_SPAWNS.filter((s) => s.chapter === chapter).map((s, i) => (
        <Blocker key={i} position={s.at} role={s.role} />
      ))}
    </>
  );
}
