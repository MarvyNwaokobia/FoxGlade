"use client";

import { Blocker } from "./Blocker";
import { useGame } from "@/engine/store";
import type { BlockerRole } from "@/engine/config/round";

/**
 * Blocker spawn points, placed in the chokepoints of the organic layout so
 * every route to a treasure is contested. Each spot belongs to one CHAPTER
 * (day.ts) — a fixed roster per phase, not a pile that keeps growing on top
 * of the last phase's (Marvy's call, 2026-08-14: the old cumulative ramp
 * meant a day that ended mid-Afternoon — which most low-quota days did —
 * never showed you anything past Morning's five in practice).
 *
 * Raised across the board (Marvy's call, 2026-08-21): every phase, including
 * Dawn, now fields more guns than before — the village should feel contested
 * the moment you're moving, not just from Morning on.
 */
const BLOCKER_SPAWNS: { at: [number, number, number]; role: BlockerRole; chapter: number }[] = [
  // Role is matched to the ground each one holds. A rusher wants a space it can
  // cross; a holder wants a sightline down a street, which is exactly what makes
  // the long approaches dangerous to walk in a straight line.

  // Dawn (chapter 0) — a single early post, kept light so the tutorial bank
  // is still reachable, but the village is no longer a guaranteed breather.
  { at: [8, 0, 3], role: "holder", chapter: 0 }, // main street, well short of the vault

  // Morning (chapter 1) — the first real combat a player meets, close to the start.
  { at: [3, 0, 10], role: "rusher", chapter: 1 }, // past the gate corridor (deep enough not to camp the spawn)
  { at: [0, 0, -2], role: "holder", chapter: 1 }, // central crossroads — long sightlines both ways
  { at: [-4.5, 0, 16], role: "rusher", chapter: 1 }, // near the gate road — a second angle on the early approach

  // Afternoon (chapter 2) — the market and courtyard routes open up.
  { at: [-11, 0, 18], role: "rusher", chapter: 2 }, // guards the market-gate approach (outside the safe walls)
  { at: [17.5, 0, -12], role: "holder", chapter: 2 }, // shallow-treasure courtyard approach
  { at: [-8, 0, 20], role: "holder", chapter: 2 }, // reinforces the market-gate approach from a second angle
  { at: [14, 0, -9], role: "rusher", chapter: 2 }, // reinforces the courtyard approach

  // Dusk (chapter 3) — deeper, less-obvious routes as thieves join the hunt.
  { at: [18, 0, -3], role: "holder", chapter: 3 }, // gap between the central weave and the east courtyard
  { at: [-17, 0, -13], role: "rusher", chapter: 3 }, // west approach into the deep-north cluster, from the bank side
  { at: [14, 0, -1], role: "rusher", chapter: 3 }, // closes off the east courtyard from a second angle
  { at: [-13, 0, -9], role: "holder", chapter: 3 }, // closes off the west approach from a second angle

  // Night (chapter 4) — the hardest stretch, guarding every approach to the rare nook.
  { at: [-7, 0, -25], role: "rusher", chapter: 4 }, // deep corridor guarding the rare nook
  { at: [6, 0, -20], role: "holder", chapter: 4 }, // east-side approach to the rare nook — mirrors the west one above
  { at: [-2, 0, -22], role: "holder", chapter: 4 }, // closes the gap between the two rare-nook guards
  { at: [10, 0, -23], role: "rusher", chapter: 4 }, // extends the east-side coverage
  { at: [-11, 0, -20], role: "rusher", chapter: 4 }, // extends the west-side coverage
];

/**
 * Which blockers are awake is a straight match to the current CHAPTER — each
 * phase fields its own roster, not last phase's plus more piled on top.
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
