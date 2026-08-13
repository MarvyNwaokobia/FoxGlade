"use client";

import { Blocker } from "./Blocker";
import { useGame } from "@/engine/store";
import { CHAPTERS, blockerBonusForDay } from "@/engine/config/day";
import type { BlockerRole } from "@/engine/config/round";

/**
 * Blocker spawn points, placed in the chokepoints of the organic layout so
 * every route to a treasure is contested. Tuned against the village layout.
 * The first five are the original chapter roster (Morning through Night);
 * the rest only ever appear on later days (see `count` below) — extra
 * coverage on routes the original five left open, not a denser version of
 * the same five spots.
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
  // Day-only extras (blockerBonusForDay in day.ts) — later days field these too.
  { at: [18, 0, -3], role: "holder" }, // gap between the central weave and the east courtyard
  { at: [-17, 0, -13], role: "rusher" }, // west approach into the deep-north cluster, from the bank side
  { at: [6, 0, -20], role: "holder" }, // east-side approach to the rare nook — mirrors the west one above
];

/**
 * How many blockers are awake is a function of the CHAPTER (which teaches one
 * system at a time within a day — chapter 1 has none at all, so a new player
 * learns the map, the fox, the bank and the market without being shot) AND,
 * layered on top, the DAY (blockerBonusForDay) — so a chapter that resets
 * every day still gets harder the more days you've played, the same way the
 * treasure quota does. Dawn always stays at 0 regardless of day: the one
 * guaranteed breather doesn't erode as the week goes on.
 */
export function Blockers() {
  const chapter = useGame((s) => s.chapter);
  const day = useGame((s) => s.day);
  const base = CHAPTERS[chapter]?.blockers ?? BLOCKER_SPAWNS.length;
  const count = base === 0 ? 0 : Math.min(BLOCKER_SPAWNS.length, base + blockerBonusForDay(day));
  return (
    <>
      {BLOCKER_SPAWNS.slice(0, count).map((s, i) => (
        <Blocker key={i} position={s.at} role={s.role} />
      ))}
    </>
  );
}
