"use client";

import { Blocker } from "./Blocker";
import { useGame } from "@/engine/store";
import { CHAPTERS } from "@/engine/config/day";

/**
 * Blocker spawn points, placed in the chokepoints of the organic layout so
 * every route to a treasure is contested. Tuned against the village layout.
 */
const BLOCKER_SPAWNS: [number, number, number][] = [
  [3, 0, 10], // past the gate corridor (deep enough not to camp the spawn)
  [0, 0, -2], // central crossroads
  [-11, 0, 18], // guards the market-gate approach (outside the safe walls)
  [17.5, 0, -12], // shallow-treasure courtyard approach
  [-7, 0, -25], // deep corridor guarding the rare nook
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
      {BLOCKER_SPAWNS.slice(0, count).map((p, i) => (
        <Blocker key={i} position={p} />
      ))}
    </>
  );
}
