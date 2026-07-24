"use client";

import { Thief } from "./Thief";

/**
 * Three thieves racing the real treasure from different directions, with
 * staggered starts so they trickle in as pressure rather than one instant swarm.
 * Paths thread the open streets to the treasure at (0, -28).
 */
const EAST: [number, number, number][] = [
  [5, 0, 30],
  [5, 0, 16],
  [5, 0, 4],
  [0, 0, -10],
  [0, 0, -22],
  [0, 0, -28],
];
const WEST: [number, number, number][] = [
  [-22, 0, 28],
  [-22, 0, 8],
  [-14, 0, -2],
  [-6, 0, -14],
  [0, 0, -22],
  [0, 0, -28],
];
const CENTER: [number, number, number][] = [
  [-2, 0, 31],
  [-4, 0, 12],
  [-4, 0, 0],
  [0, 0, -12],
  [0, 0, -22],
  [0, 0, -28],
];

export function Thieves() {
  return (
    <>
      <Thief path={EAST} startDelay={0} speed={2.1} />
      <Thief path={WEST} startDelay={6} speed={2.1} />
      <Thief path={CENTER} startDelay={12} speed={2.3} />
    </>
  );
}
