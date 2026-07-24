"use client";

import { Blocker } from "./Blocker";

/**
 * Blocker spawn points, placed in the chokepoints of the organic layout so
 * every route to a treasure is contested. Tuned against the village layout.
 */
const BLOCKER_SPAWNS: [number, number, number][] = [
  [1.8, 0, 17], // mouth of the gate corridor
  [0, 0, -2], // central crossroads
  [-20, 0, 3], // market plaza lurker
  [17.5, 0, -12], // shallow-treasure courtyard approach
  [-7, 0, -25], // deep corridor guarding the rare nook
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
