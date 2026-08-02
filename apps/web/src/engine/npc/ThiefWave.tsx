"use client";

import { Thief } from "./Thief";
import { THIEF } from "@/engine/config/round";
import { useGame } from "@/engine/store";
import { CHAPTERS } from "@/engine/config/day";

/**
 * The thieves that contest the treasure with you.
 *
 * These used to be handed hardcoded waypoint lists ending at the old fixed hint
 * coordinates — which Phase 5's reseeding board silently invalidated, so they'd
 * been racing to empty ground. They now only need to be told WHERE THEY COME IN;
 * each one finds the real treasure and routes to it on its own.
 *
 * Entries are spread around the wall so the threat doesn't always arrive from
 * the same direction, and each gets a different stagger — the first blip on your
 * compass is the alarm, and the later ones are the punishment for dawdling.
 */
// Verified clear of every building footprint — one of these was previously
// sitting INSIDE the deep-north building, so that thief spawned in a wall and
// stood there for the whole chapter.
const ENTRIES: [number, number][] = [
  [33, 30], // south-east, by the gate road
  [-33, 26], // south-west corner
  [-13, -34], // over the north wall, behind you
  [34, -6], // east lane
];

export function Thieves() {
  const chapter = useGame((s) => s.chapter);
  // Thieves are the last system to arrive — the race only starts once you know
  // the map well enough for losing a treasure to feel like a loss.
  if (!CHAPTERS[chapter]?.thieves) return null;
  return (
    <>
      {THIEF.starts.map((start, i) => (
        <Thief key={i} entry={ENTRIES[i % ENTRIES.length]} startDelay={start} />
      ))}
    </>
  );
}
