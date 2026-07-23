"use client";

import { Blocker } from "./Blocker";

/**
 * Blocker spawn points, placed in the chokepoints along the spawn→treasure path
 * so the route is actually contested. Tuned against the village layout.
 */
const BLOCKER_SPAWNS: [number, number, number][] = [
  [0, 0, 6], // central corridor, just past spawn
  [2, 0, -6], // mid gap between the two central blocks
  [-6, 0, -21], // guarding the treasure approach
  [7, 0, -21],
];

export function Blockers() {
  return (
    <>
      {BLOCKER_SPAWNS.map((p, i) => (
        <Blocker key={i} position={p} />
      ))}
    </>
  );
}
