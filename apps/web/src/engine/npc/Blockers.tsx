"use client";

import { Blocker } from "./Blocker";
import { useGame } from "@/engine/store";
import { CHAPTERS } from "@/engine/config/day";
import type { BlockerRole } from "@/engine/config/round";

/**
 * Blocker spawn points, placed in the chokepoints of the organic layout so
 * every route to a treasure is contested. Tuned against the village layout.
 */
const BLOCKER_SPAWNS: { at: [number, number, number]; role: BlockerRole }[] = [
  // Role is matched to the ground each one holds. A rusher wants a space it can
  // cross; a holder wants a sightline down a street, which is exactly what makes
  // the long approaches dangerous to walk in a straight line.
  { at: [3, 0, 10], role: "rusher" }, // past the gate corridor (deep enough not to camp the spawn)
  { at: [0, 0, -2], role: "holder" }, // central crossroads — long sightlines both ways
  { at: [-11, 0, 18], role: "rusher" }, // guards the market-gate approach (outside the safe walls)
  { at: [17.5, 0, -12], role: "holder" }, // shallow-treasure courtyard approach
  { at: [-7, 0, -25], role: "rusher" }, // deep corridor guarding the rare nook
];

/**
 * How many blockers are awake is a function of the CHAPTER, not a constant.
 * Chapter 1 has none at all: a new player gets to learn the map, the fox, the
 * bank and the market without being shot, which was impossible when all five
 * systems fired at once from the opening second.
 */
export function Blockers() {
  const chapter = useGame((s) => s.chapter);
  const count = CHAPTERS[chapter]?.blockers ?? BLOCKER_SPAWNS.length;
  return (
    <>
      {BLOCKER_SPAWNS.slice(0, count).map((s, i) => (
        <Blocker key={i} position={s.at} role={s.role} />
      ))}
    </>
  );
}
